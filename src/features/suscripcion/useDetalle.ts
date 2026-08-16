/**
 * Consultas y acciones del detalle de una suscripción.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS TRES ACCIONES ESCRIBEN EN LUGARES DISTINTOS Y ESO IMPORTA
 *
 *   · Cambiar estado  → RPC `cambiar_estado_suscripcion` (013). Deja evento
 *                       con motivo y autor. NO toca el producto.
 *   · Registrar pago  → INSERT en `pagos`. Opcionalmente encadena un cambio
 *                       de estado, que es el hueco que cierra §5-bis.
 *   · Confirmar bandera → Edge Function. Es lo ÚNICO que escribe en la base
 *                       del cliente, y por eso es lo único que pide un clic
 *                       explícito (§4: nada escala solo).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { Nivel } from '@/lib/bandera'
import { eventoSchema, pagoSchema, type FormularioPago } from './schemas'
import type { EstadoComercial } from '@/lib/bandera'

const SELECT_EVENTOS = `
  id, tipo, estado_anterior, estado_nuevo, motivo, datos, efectivo_desde,
  creado_en, admin_id, admins ( email )
`
const SELECT_PAGOS = `
  id, concepto, monto, fecha_pago, metodo, referencia, nota,
  cubre_desde, cubre_hasta, registrado_en, admins ( email )
`

export function useHistorial(suscripcionId: string) {
  return useQuery({
    queryKey: ['historial', suscripcionId],
    queryFn: async () => {
      const [eventos, pagos] = await Promise.all([
        supabase
          .from('suscripcion_eventos')
          .select(SELECT_EVENTOS)
          .eq('suscripcion_id', suscripcionId)
          .order('creado_en', { ascending: false })
          // Acotado: el historial completo de un contrato viejo puede ser
          // largo y la pantalla muestra lo reciente. Si hace falta el resto,
          // es una pantalla de auditoría, no ésta.
          .limit(50),
        supabase
          .from('pagos')
          .select(SELECT_PAGOS)
          .eq('suscripcion_id', suscripcionId)
          .order('fecha_pago', { ascending: false })
          .limit(50),
      ])
      if (eventos.error) throw eventos.error
      if (pagos.error) throw pagos.error
      return {
        eventos: eventoSchema.array().parse(eventos.data),
        pagos: pagoSchema.array().parse(pagos.data),
      }
    },
  })
}

/** Todo lo que toca una suscripción invalida la lista: el criterio de atención depende de esto. */
function useInvalidar(suscripcionId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['suscripciones'] })
    void qc.invalidateQueries({ queryKey: ['historial', suscripcionId] })
  }
}

export function useCambiarEstado(suscripcionId: string) {
  const invalidar = useInvalidar(suscripcionId)
  return useMutation({
    meta: { area: 'clientes' },
    mutationKey: ['cambiar-estado'],
    mutationFn: async (v: { estado: EstadoComercial; motivo?: string }) => {
      // `undefined` y no `null`: los tipos generados declaran `p_motivo`
      // opcional, y omitirlo deja que Postgres use su `default null`.
      const { error } = await supabase.rpc('cambiar_estado_suscripcion', {
        p_suscripcion_id: suscripcionId,
        p_estado: v.estado,
        p_motivo: v.motivo?.trim() || undefined,
      })
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useRegistrarPago(suscripcionId: string, clienteId: string) {
  const invalidar = useInvalidar(suscripcionId)
  return useMutation({
    meta: { area: 'clientes' },
    mutationKey: ['registrar-pago'],
    mutationFn: async (v: { pago: FormularioPago; reactivar: boolean }) => {
      // ⚠️ EL PAGO PRIMERO, SIEMPRE. Si la reactivación falla, quedó
      // registrada la plata que entró —que es el hecho— y la anomalía
      // "pagó y sigue restringido" aparece en la lista para que alguien la
      // termine. Al revés sería peor: un estado activo sin el pago que lo
      // justifique es un dato que nadie puede reconstruir después.
      const { error } = await supabase.from('pagos').insert({
        cliente_id: clienteId,
        suscripcion_id: suscripcionId,
        concepto: v.pago.concepto,
        monto: v.pago.monto,
        // §9.1: Giiron no es responsable de IVA, así que la base gravable es
        // el total y la tasa es 0. Se escriben igual, por fila, para que un
        // pago viejo siga explicándose el día que eso cambie.
        monto_base: v.pago.monto,
        iva_pct: 0,
        fecha_pago: v.pago.fecha_pago,
        metodo: v.pago.metodo || null,
        referencia: v.pago.referencia?.trim() || null,
        nota: v.pago.nota?.trim() || null,
        cubre_desde: v.pago.cubre_desde || null,
        cubre_hasta: v.pago.cubre_hasta || null,
      })
      if (error) throw error

      if (v.reactivar) {
        const { error: e2 } = await supabase.rpc('cambiar_estado_suscripcion', {
          p_suscripcion_id: suscripcionId,
          p_estado: 'activa',
          p_motivo: `Reactivada al registrar el pago del ${v.pago.fecha_pago}.`,
        })
        if (e2) throw e2
      }
    },
    onSuccess: invalidar,
  })
}

export interface ResultadoBandera {
  ok: boolean
  changed?: boolean
  bandera_error_codigo?: string
  error?: string
}

export function useConfirmarBandera(suscripcionId: string) {
  const invalidar = useInvalidar(suscripcionId)
  return useMutation({
    meta: { area: 'bandera' },
    mutationKey: ['confirmar-bandera'],
    mutationFn: async (v: { nivel: Nivel; mensaje: string | null }): Promise<ResultadoBandera> => {
      const { data, error } = await supabase.functions.invoke('sincronizar-bandera', {
        body: {
          suscripcion_id: suscripcionId,
          valor_deseado: v.nivel,
          mensaje: v.mensaje,
        },
      })
      // `functions.invoke` sólo tira en fallo de transporte; un 4xx/5xx viene
      // en `data`. Los dos casos terminan igual acá: no se aplicó.
      if (error) throw error
      return data as ResultadoBandera
    },
    onSuccess: invalidar,
  })
}
