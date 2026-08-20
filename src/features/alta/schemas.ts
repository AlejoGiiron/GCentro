/**
 * Zod en el borde del alta (§7).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ACÁ EL BORDE VA EN LAS DOS DIRECCIONES, y es la primera pantalla donde eso
 * pasa. Lo que vuelve del catálogo se valida al entrar, como en el resto del
 * panel; pero además **lo que el operador escribe se valida antes de salir**,
 * porque de acá para adelante ese número queda congelado en un contrato.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod'

// ── Lo que entra: el catálogo ─────────────────────────────────────────────

export const productoSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  nombre: z.string(),
})

export const planSchema = z.object({
  id: z.string().uuid(),
  producto_id: z.string().uuid(),
  codigo: z.string(),
  nombre: z.string(),
  // ⚠️ NULLABLE a propósito, aunque la columna sea NOT NULL: el plan del
  // contador todavía no tiene precio cargado y va a entrar al catálogo con
  // una fila incompleta. El formulario tiene que poder decir «este plan no
  // tiene precio de lista» en vez de comparar contra un cero inventado.
  precio_mensual: z.number().int().nullable(),
  precio_sede_adicional: z.number().int().nullable(),
})

export const terminoSchema = z.object({
  codigo: z.string(),
  meses: z.number().int().positive(),
  descuento_pct: z.number().int(),
})

export const clienteOpcionSchema = z.object({
  id: z.string().uuid(),
  nombre_comercial: z.string(),
  es_prueba: z.boolean(),
})

export type Producto = z.infer<typeof productoSchema>
export type Plan = z.infer<typeof planSchema>
export type Termino = z.infer<typeof terminoSchema>
export type ClienteOpcion = z.infer<typeof clienteOpcionSchema>

// ── Lo que sale: el formulario ────────────────────────────────────────────

/** Un peso colombiano entero y no negativo (§2). Sin decimales, nunca. */
const pesos = z
  .number({ invalid_type_error: 'Escribí un monto.' })
  .int('Los pesos van sin decimales.')
  .min(0, 'No puede ser negativo.')

export const formularioAltaSchema = z
  .object({
    // Cliente: o se elige uno, o se escribe el nombre de uno nuevo. Nunca las
    // dos cosas, y nunca ninguna — lo resuelve el `superRefine` de abajo.
    cliente_id: z.string().uuid().nullable(),
    cliente_nuevo: z.string().trim().max(120).default(''),
    /**
     * ⚠️ DEFAULT `false`, y por el mismo motivo que la columna (§3): el modo
     * de fallo tiene que ser «aparece aunque no debería», nunca «no aparece y
     * nadie lo nota». Un cliente que nace invisible para la cobranza por un
     * olvido no se descubre — deja de facturarse y ya.
     *
     * Sólo aplica al cliente NUEVO. Marcar como prueba a un cliente existente
     * es otra operación, sobre datos que ya existen, y no entra por acá.
     */
    cliente_nuevo_es_prueba: z.boolean().default(false),

    producto_id: z.string().uuid({ message: 'Elegí un producto.' }),
    plan_id: z.string().uuid({ message: 'Elegí un plan.' }),
    termino: z.string().min(1, 'Elegí un término.'),

    sedes_adicionales: z.number().int().min(0, 'No puede ser negativo.').max(50),
    precio_base_mensual: pesos,
    precio_sede_adicional: pesos,
    monto_implementacion: pesos,
    descuento_pct: z.number().int().min(0).max(100),

    fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),

    /**
     * Por qué el precio se apartó de la lista. Obligatorio cuando se apartó
     * —lo decide `exigeJustificacion`, no este schema, porque depende del
     * catálogo— y viaja al evento `CREADA` como `motivo`.
     */
    motivo: z.string().trim().max(280).default(''),
  })
  .superRefine((v, ctx) => {
    // ⚠️ Un alta sin cliente no es un formulario incompleto, es un contrato
    // sin contraparte. Se chequea acá y no en la pantalla para que no dependa
    // de que un componente se acuerde.
    const eligio = v.cliente_id !== null
    const escribio = v.cliente_nuevo.trim() !== ''
    if (!eligio && !escribio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cliente_id'],
        message: 'Elegí un cliente existente o escribí el nombre de uno nuevo.',
      })
    }
    if (eligio && escribio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cliente_nuevo'],
        message: 'Elegiste un cliente y además escribiste uno nuevo. Es uno de los dos.',
      })
    }
  })

export type FormularioAlta = z.infer<typeof formularioAltaSchema>
