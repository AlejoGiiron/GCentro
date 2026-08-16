/**
 * Zod en el borde (§7). Lo que vuelve de PostgREST se valida antes de entrar
 * a la app: un embed que cambia de forma —porque alguien tocó una FK o
 * renombró una columna— tiene que fallar acá, con un mensaje que dice qué
 * campo, y no tres componentes más abajo con un `undefined is not an object`.
 */
import { z } from 'zod'
import { NIVELES } from '@/lib/bandera'

export const ESTADOS_COMERCIALES = ['activa', 'gracia', 'suspendida', 'cancelada'] as const

/**
 * Una suscripción con todo lo que la lista necesita.
 *
 * Los embeds son `!inner`, así que PostgREST devuelve OBJETO y no array.
 * Si alguno pasara a ser opcional, el schema falla y eso es lo correcto: una
 * suscripción sin cliente no es una fila incompleta, es un bug de datos.
 */
export const suscripcionListaSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(ESTADOS_COMERCIALES),
  sedes_adicionales: z.number().int(),
  precio_base_mensual: z.number().int(),
  precio_sede_adicional: z.number().int(),
  descuento_pct: z.number().int(),
  periodo_actual_inicio: z.string(),
  periodo_actual_fin: z.string(),
  organizacion_externa_id: z.string().uuid().nullable(),
  clientes: z.object({
    id: z.string().uuid(),
    nombre_comercial: z.string(),
    es_prueba: z.boolean(),
  }),
  productos: z.object({
    codigo: z.string(),
    nombre: z.string(),
    // No se muestra. Se usa para saber si esta suscripción PUEDE sincronizarse:
    // sin puente configurado, la bandera nunca va a poder confirmarse y decir
    // "sin confirmar" a secas haría pensar que es un problema transitorio.
    url_aplicar_estado: z.string().nullable(),
  }),
  planes: z.object({ codigo: z.string(), nombre: z.string() }),
  terminos: z.object({ codigo: z.string(), meses: z.number().int() }),
})

export type SuscripcionLista = z.infer<typeof suscripcionListaSchema>

export const banderaSchema = z.object({
  id: z.string().uuid(),
  suscripcion_id: z.string().uuid(),
  valor_deseado: z.enum(NIVELES),
  intentos: z.number().int(),
  ultimo_error: z.string().nullable(),
  bandera_error_codigo: z.string().nullable(),
  // Nullable de verdad: las filas anteriores a la migración 009 no lo tienen,
  // y el null significa "no sabemos", no "no cambió".
  cambio_efectivo: z.boolean().nullable(),
  confirmado_en: z.string().nullable(),
  creado_en: z.string(),
  // ⚠️ Declarado aunque la pantalla 1 todavía no lo muestre. Zod DESCARTA en
  // silencio lo que no está en el schema, y comprobado contra el payload vivo
  // (14/08) esta clave se estaba perdiendo: la migración 010 existe justamente
  // para que "¿quién hizo esto?" tenga respuesta, y un schema que la tira la
  // deja sin respuesta en la UI sin que nadie se entere. La cola (pantalla 3)
  // la necesita.
  //
  // NULL = fila anterior a 010, o escrita desde el SQL Editor.
  admin_id: z.string().uuid().nullable(),
})

export type Bandera = z.infer<typeof banderaSchema>

/**
 * Fila de la vista `bandera_ultima_confirmada` (migración 011): la última
 * bandera que el producto confirmó, una por suscripción.
 *
 * Es un schema aparte y más chico a propósito. La vista no trae `ultimo_error`
 * ni `intentos` porque en una fila confirmada no significan nada —el error se
 * limpió y los intentos ya se consumieron—, y declararlos acá invitaría a
 * mostrarlos como si fueran el estado actual.
 */
export const ultimaConfirmadaSchema = z.object({
  suscripcion_id: z.string().uuid(),
  id: z.string().uuid(),
  valor_deseado: z.enum(NIVELES),
  cambio_efectivo: z.boolean().nullable(),
  // En la vista nunca es null: la definición filtra `confirmado_en is not null`.
  confirmado_en: z.string(),
  admin_id: z.string().uuid().nullable(),
})

export type UltimaConfirmada = z.infer<typeof ultimaConfirmadaSchema>

/**
 * Fila de la vista `suscripcion_cobertura` (migración 012): hasta cuándo
 * llega la plata de cada contrato.
 *
 * `cubierto_hasta` es el MÁXIMO `cubre_hasta`, no el del último pago. Puede
 * ser null si todos los pagos fueron ajustes o implementación — un pago sin
 * cobertura cuenta en `pagos_registrados` pero no adelanta la fecha.
 */
export const coberturaSchema = z.object({
  suscripcion_id: z.string().uuid(),
  cubierto_hasta: z.string().nullable(),
  proximo_cobro: z.string().nullable(),
  ultimo_pago: z.string().nullable(),
  // PostgREST devuelve `count(*)` como number.
  pagos_registrados: z.number().int(),
})

export type CoberturaFila = z.infer<typeof coberturaSchema>
