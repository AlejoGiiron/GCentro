/**
 * La cola de banderas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA COLA CRECE POR LLAMADA, NO POR CAMBIO DE ESTADO (§5)
 *
 * Cada invocación deja su fila, aplique o no aplique algo. **Dos filas
 * seguidas con el mismo `valor_deseado` no son un error: son dos clics.**
 *
 * Eso tiene dos consecuencias para esta consulta:
 *
 *   · **Nunca se trae entera.** Crece sin techo con el uso, no con el
 *     tamaño del negocio. Por eso hay página, y por eso lo pendiente —que
 *     está acotado por diseño— se cuenta aparte del historial.
 *
 *   · **Lo pendiente y lo confirmado se piden por separado.** No es
 *     optimización: son dos preguntas distintas. "¿Qué falta aplicar?"
 *     tiene que responderse completa; "¿qué pasó?" se hojea.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { filaColaSchema, type FilaCola } from './schemas'

const SELECT = `
  id, suscripcion_id, valor_deseado, intentos, ultimo_error,
  bandera_error_codigo, cambio_efectivo, confirmado_en, creado_en, admin_id,
  admins ( email ),
  suscripciones!inner ( clientes!inner ( nombre_comercial, es_prueba ) )
`

/** Filas por página del historial. La cola pendiente no se pagina. */
export const POR_PAGINA = 25

export interface Cola {
  /** Todo lo que falta aplicar. Sin paginar: acotado por diseño (§5). */
  pendientes: FilaCola[]
  /** Página del historial confirmado. */
  confirmadas: FilaCola[]
  /** Total de confirmadas en la base, para saber si hay más páginas. */
  totalConfirmadas: number
}

export function useCola(pagina: number, mostrarPrueba: boolean) {
  return useQuery({
    queryKey: ['cola', pagina, mostrarPrueba],
    queryFn: async (): Promise<Cola> => {
      const desde = pagina * POR_PAGINA

      const [pendientes, confirmadas] = await Promise.all([
        supabase
          .from('banderas_pendientes')
          .select(SELECT)
          .is('confirmado_en', null)
          .order('creado_en', { ascending: false }),
        supabase
          .from('banderas_pendientes')
          .select(SELECT, { count: 'exact' })
          .not('confirmado_en', 'is', null)
          .order('confirmado_en', { ascending: false })
          .range(desde, desde + POR_PAGINA - 1),
      ])

      if (pendientes.error) throw pendientes.error
      if (confirmadas.error) throw confirmadas.error

      // El filtro de tenants de prueba se aplica al mostrar, no en la
      // consulta: igual que en la lista, un conteo sobre datos ya filtrados
      // afirmaría sobre un conjunto que no miró.
      const visible = (f: FilaCola) =>
        mostrarPrueba || !f.suscripciones.clientes.es_prueba

      return {
        pendientes: filaColaSchema.array().parse(pendientes.data).filter(visible),
        confirmadas: filaColaSchema.array().parse(confirmadas.data).filter(visible),
        totalConfirmadas: confirmadas.count ?? 0,
      }
    },
    placeholderData: (anterior) => anterior,
  })
}

/**
 * Reintentar una fila sin confirmar.
 *
 * ⚠️ NO reintenta la fila: **manda una bandera nueva**. La Edge Function
 * escribe siempre una fila propia (§5), así que un reintento deja otra
 * entrada en la cola — que es correcto y es justamente lo que la pantalla
 * tiene que hacer entendible. La fila vieja no se toca: es el registro de
 * que ese intento falló, y borrarlo sería perder la única evidencia.
 */
export function useReintentar() {
  const qc = useQueryClient()
  return useMutation({
    meta: { area: 'bandera' },
    mutationKey: ['reintentar-bandera'],
    mutationFn: async (f: FilaCola) => {
      const { data, error } = await supabase.functions.invoke('sincronizar-bandera', {
        body: {
          suscripcion_id: f.suscripcion_id,
          valor_deseado: f.valor_deseado,
          // El mensaje del banner NO se reintenta: no quedó guardado en la
          // fila (§3 no lo persiste) y reenviar `null` lo borraría del
          // producto. Reintentar aplica el NIVEL, que es lo que falló.
          mensaje: null,
        },
      })
      if (error) throw error
      return data as { ok: boolean; bandera_error_codigo?: string }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cola'] })
      void qc.invalidateQueries({ queryKey: ['suscripciones'] })
    },
  })
}
