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
  proximo_cobro: z.string(),
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
})

export type Bandera = z.infer<typeof banderaSchema>
