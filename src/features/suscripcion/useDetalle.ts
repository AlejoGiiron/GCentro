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
import { interpretar, type ResultadoPuente } from '@/lib/puente'
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
          // ⚠️ El orden entre eventos de la MISMA transacción no está
          // definido: `creado_en` usa `now()`, que es el instante de la
          // transacción y no el de la sentencia, así que dos eventos escritos
          // juntos tienen el mismo timestamp al microsegundo. Hoy no pasa
          // —cada request de supabase-js es su propia transacción y ninguna
          // RPC escribe dos eventos—, pero el día que una lo haga, el
          // historial los va a mostrar en cualquier orden. Lo destapó el
          // bloque de verificación de la `016`.
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

export function useConfirmarBandera(suscripcionId: string) {
  const invalidar = useInvalidar(suscripcionId)
  return useMutation({
    meta: { area: 'bandera' },
    mutationKey: ['confirmar-bandera'],
    mutationFn: async (v: { nivel: Nivel; mensaje: string | null }): Promise<ResultadoPuente> => {
      const { data, error } = await supabase.functions.invoke('sincronizar-bandera', {
        body: {
          suscripcion_id: suscripcionId,
          valor_deseado: v.nivel,
          mensaje: v.mensaje,
        },
      })
      // ⚠️ NO se tira ante `error`. `functions.invoke` tira ante CUALQUIER
      // no-2xx, así que hacerlo convertía el 502 —llegó, no se aplicó, con
      // código conocido— en "no se pudo llegar al puente". `interpretar`
      // distingue las cinco respuestas y valida la forma (ver lib/puente.ts).
      return interpretar(data, error)
    },
    onSuccess: invalidar,
  })
}

/**
 * Vincular la organización de G-Vento, y corregir un vínculo ya hecho.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SON DOS OPERACIONES DISTINTAS A PROPÓSITO, y la base lo obliga (`017`).
 *
 * Vincular desde vacío no pisa nada. Corregir apunta un contrato a OTRA
 * organización: la próxima bandera le pone —o le saca— el banner de cobranza
 * a quien no era, en vivo. Por eso exige motivo, queda auditado, y el trigger
 * bloquea el update directo aunque alguien intente saltearse la pantalla.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function useVincular(suscripcionId: string) {
  const invalidar = useInvalidar(suscripcionId)
  return useMutation({
    meta: { area: 'clientes' },
    mutationKey: ['vincular-organizacion'],
    mutationFn: async (v: { organizacion: string; nombre: string }) => {
      const { error } = await supabase.rpc('vincular_organizacion', {
        p_suscripcion_id: suscripcionId,
        p_organizacion: v.organizacion.trim(),
        // Se manda lo que el operador ESCRIBIÓ, sin normalizar: es el registro
        // de qué leyó. La normalización es sólo para comparar.
        p_nombre: v.nombre.trim(),
      })
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useCorregirVinculo(suscripcionId: string) {
  const invalidar = useInvalidar(suscripcionId)
  return useMutation({
    meta: { area: 'clientes' },
    mutationKey: ['corregir-vinculo'],
    mutationFn: async (v: { organizacion: string; nombre: string; motivo: string }) => {
      const { error } = await supabase.rpc('corregir_organizacion_externa', {
        p_suscripcion_id: suscripcionId,
        p_organizacion: v.organizacion.trim(),
        p_nombre: v.nombre.trim(),
        p_motivo: v.motivo.trim(),
      })
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

/**
 * Exonerar la implementación al cumplirse el aniversario (§9.9).
 *
 * El botón sólo aparece cuando la fila está en `IMPLEMENTACION_POR_EXONERAR`,
 * pero la guarda de verdad está en la RPC: valida el estado de origen y los
 * doce meses. Una pantalla no puede ser la única guarda de algo que cambia
 * plata — cualquiera puede llamar a la función sin pasar por acá.
 */
export function useExonerar(suscripcionId: string) {
  const invalidar = useInvalidar(suscripcionId)
  return useMutation({
    meta: { area: 'clientes' },
    mutationKey: ['exonerar-implementacion'],
    mutationFn: async (v: { motivo?: string }) => {
      const { error } = await supabase.rpc('exonerar_implementacion', {
        p_suscripcion_id: suscripcionId,
        p_motivo: v.motivo?.trim() || undefined,
      })
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}
