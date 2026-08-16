/**
 * Zod en el borde (§7) para el detalle de una suscripción.
 */
import { z } from 'zod'
import { ESTADOS_COMERCIALES } from '@/features/clientes/schemas'

/**
 * Un evento del historial, con el autor cuando exista.
 *
 * `admins` puede venir en `null` por dos razones distintas que la UI **no
 * puede fusionar**: la fila es anterior a la migración `010`, o se escribió
 * desde el SQL Editor. Las dos significan "sin autor registrado", que no es lo
 * mismo que un vacío — el vacío sugiere que falta cargar algo, y acá no hay
 * nada que cargar porque el dato no existe y no se puede reconstruir.
 */
export const eventoSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  estado_anterior: z.string().nullable(),
  estado_nuevo: z.string().nullable(),
  motivo: z.string().nullable(),
  datos: z.unknown().nullable(),
  efectivo_desde: z.string().nullable(),
  creado_en: z.string(),
  admin_id: z.string().uuid().nullable(),
  admins: z.object({ email: z.string() }).nullable(),
})

export type Evento = z.infer<typeof eventoSchema>

export const pagoSchema = z.object({
  id: z.string().uuid(),
  concepto: z.string(),
  monto: z.number().int(),
  fecha_pago: z.string(),
  metodo: z.string().nullable(),
  referencia: z.string().nullable(),
  nota: z.string().nullable(),
  cubre_desde: z.string().nullable(),
  cubre_hasta: z.string().nullable(),
  registrado_en: z.string(),
  admins: z.object({ email: z.string() }).nullable(),
})

export type Pago = z.infer<typeof pagoSchema>

export const CONCEPTOS = ['suscripcion', 'implementacion', 'ajuste', 'otro'] as const
export const METODOS = ['transferencia', 'nequi', 'daviplata', 'efectivo', 'otro'] as const

/**
 * El formulario de pago.
 *
 * ⚠️ `monto` en PESOS ENTEROS (§2). El `int()` no es cosmética: un monto con
 * decimales sugeriría una precisión de centavos que ni la base ni el negocio
 * tienen, y `integer` en Postgres lo rechazaría con un error feo.
 */
export const formularioPagoSchema = z
  .object({
    concepto: z.enum(CONCEPTOS),
    monto: z
      .number({ invalid_type_error: 'Ingresá un monto' })
      .int('El monto va en pesos enteros, sin centavos')
      .positive('El monto tiene que ser mayor a cero'),
    fecha_pago: z.string().min(1, 'Falta la fecha del pago'),
    metodo: z.string().optional(),
    referencia: z.string().max(120).optional(),
    nota: z.string().max(500).optional(),
    cubre_desde: z.string().optional(),
    cubre_hasta: z.string().optional(),
  })
  .refine((f) => !f.cubre_desde || !f.cubre_hasta || f.cubre_desde <= f.cubre_hasta, {
    message: 'El período cubierto termina antes de empezar',
    path: ['cubre_hasta'],
  })

export type FormularioPago = z.infer<typeof formularioPagoSchema>

export const formularioEstadoSchema = z.object({
  estado: z.enum(ESTADOS_COMERCIALES),
  // El motivo NO es obligatorio a propósito: exigirlo produce "s/n" y "-",
  // que es peor que un NULL honesto. Pero se pide, y se pide primero.
  motivo: z.string().max(500).optional(),
})
