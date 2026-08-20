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
import { interpretar, type ResultadoPuente } from '@/lib/puente'
import { MENSAJE_MAX } from '@/lib/bandera'
import { filaColaSchema, type FilaCola } from './schemas'

const SELECT = `
  id, suscripcion_id, valor_deseado, intentos, ultimo_error,
  bandera_error_codigo, cambio_efectivo, confirmado_en, creado_en, admin_id, mensaje,
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
    mutationFn: async (f: FilaCola): Promise<ResultadoPuente> => {
      // ⚠️ FILAS ANTERIORES AL LÍMITE DE 140 (19/08/2026). Los mensajes ya
      // guardados no se truncan ni se borran, pero un reintento vuelve a pasar
      // por la validación del borde y el borde ahora corta en 140. Se detecta
      // acá para no gastar una llamada —y una fila más en la cola, que crece
      // por llamada (§5)— en algo que se sabe que va a rebotar.
      //
      // El texto dice qué hacer, porque la salida existe: el mensaje se
      // reescribe desde el detalle de la suscripción.
      const largo = f.mensaje?.trim().length ?? 0
      if (largo > MENSAJE_MAX) {
        return {
          estado: 'rechazado',
          mensaje:
            `El mensaje guardado tiene ${largo} caracteres y el límite bajó a ${MENSAJE_MAX}. ` +
            'Reenviá desde el detalle de la suscripción con el texto recortado.',
        }
      }

      const { data, error } = await supabase.functions.invoke('sincronizar-bandera', {
        body: {
          suscripcion_id: f.suscripcion_id,
          valor_deseado: f.valor_deseado,
          // ⚠️ SE REENVÍA EL MENSAJE ORIGINAL (014). Antes iba `null` porque
          // el texto no se guardaba, y eso BORRABA el banner del producto: un
          // reintento exitoso dejaba al cliente con el nivel correcto y sin la
          // explicación. Un reintento repite la intención COMPLETA.
          mensaje: f.mensaje,
        },
      })
      return interpretar(data, error)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cola'] })
      void qc.invalidateQueries({ queryKey: ['suscripciones'] })
    },
  })
}
