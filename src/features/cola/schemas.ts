/**
 * Zod en el borde (§7) para la cola de banderas.
 */
import { z } from 'zod'
import { NIVELES } from '@/lib/bandera'

export const filaColaSchema = z.object({
  id: z.string().uuid(),
  suscripcion_id: z.string().uuid(),
  valor_deseado: z.enum(NIVELES),
  intentos: z.number().int(),
  /** Texto crudo. Se mira acá y NUNCA viaja a Sentry (§3). */
  ultimo_error: z.string().nullable(),
  bandera_error_codigo: z.string().nullable(),
  /**
   * `false` = ya estaba así. **`null` = sin dato**, no "no cambió": la
   * columna es de la migración `009` y las filas del 13/08 son anteriores.
   * La UI las muestra distinto porque significan cosas distintas.
   */
  cambio_efectivo: z.boolean().nullable(),
  confirmado_en: z.string().nullable(),
  creado_en: z.string(),
  /**
   * El texto que se envió (014).
   *
   * ⚠️ El `null` es AMBIGUO en las filas anteriores a la migración —«no se
   * sabe»— y unívoco en las nuevas —«se envió sin mensaje»—. La UI las separa
   * por `creado_en`; fusionarlas diría que a alguien no se le dijo nada
   * cuando en realidad no quedó registro.
   */
  mensaje: z.string().nullable(),
  /** `null` = sin autor registrado (anterior a `010`, o SQL Editor). */
  admin_id: z.string().uuid().nullable(),
  admins: z.object({ email: z.string() }).nullable(),
  suscripciones: z.object({
    clientes: z.object({
      nombre_comercial: z.string(),
      es_prueba: z.boolean(),
    }),
  }),
})

export type FilaCola = z.infer<typeof filaColaSchema>
