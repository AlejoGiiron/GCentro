/**
 * Qué contestó el puente. Zod en el borde (§7).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ERA UN CAST, Y ESCONDÍA UNA RAMA ENTERA
 *
 * El código hacía `data as ResultadoBandera`. Dos problemas, y el segundo
 * no lo vimos hasta escribir esto:
 *
 * 1. Sin validar: si la Edge Function devolviera otra forma, la UI leería
 *    `r.ok` de lo que sea y podría mostrar «aplicado» sobre una respuesta
 *    que no lo dice.
 *
 * 2. **`functions.invoke` TIRA ante cualquier respuesta no-2xx** — así está
 *    escrito en `FunctionsClient`: `if (!response.ok) throw`. O sea que el
 *    **502** —el puente respondió, la bandera no se aplicó, y sabemos el
 *    código de error— caía en el `catch` y se mostraba como «no se pudo
 *    llegar al puente». Mentira, y encima se perdía el
 *    `bandera_error_codigo`, que es lo único que dice si el problema es el
 *    secreto, la red o el otro lado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS CINCO RESPUESTAS SON CINCO COSAS DISTINTAS
 *
 * Y la distinción que más importa es la última: **«no se aplicó» no es lo
 * mismo que «no entendimos la respuesta»**. Lo primero se reintenta; lo
 * segundo es que el contrato cambió y nadie avisó, que es un bug nuestro y
 * se arregla en otro lado.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod'

const esquemaAplicado = z.object({
  ok: z.literal(true),
  bandera_id: z.string().uuid(),
  /** `false` = el producto ya estaba así. `undefined` = 200 con cuerpo ilegible. */
  changed: z.boolean().optional(),
  subscription_updated_at: z.string().nullable().optional(),
  intentos: z.number().int(),
})

const esquemaNoAplicado = z.object({
  ok: z.literal(false),
  bandera_id: z.string().uuid(),
  bandera_error_codigo: z.string(),
  intentos: z.number().int(),
})

/** Los 4xx del handler: entrada inválida, sin permiso, sin puente. */
const esquemaRechazo = z.object({
  error: z.string(),
  bandera_id: z.string().uuid().optional(),
})

export type ResultadoPuente =
  /** 200. El producto tiene el nivel pedido. */
  | { estado: 'aplicado'; cambio: boolean | null; desde: string | null; banderaId: string }
  /** 502. Llegó, no se aplicó, y sabemos por qué. Se reintenta. */
  | { estado: 'no_aplicado'; codigo: string; banderaId: string; intentos: number }
  /** 4xx del handler. El dato o el permiso están mal; reintentar no ayuda. */
  | { estado: 'rechazado'; mensaje: string }
  /** No se pudo hablar con la función. */
  | { estado: 'sin_alcanzar' }
  /** Contestó algo que no entendemos. **Es un bug, no una falla.** */
  | { estado: 'ilegible' }

/** Lo mínimo que hace falta de un `FunctionsHttpError` para leer su cuerpo. */
export interface ErrorConCuerpo {
  context?: { json?: () => Promise<unknown> }
}

/**
 * Traduce el par `{ data, error }` de `functions.invoke` a una de las cinco.
 *
 * ⚠️ Nunca tira. Un error acá sería un error dentro del manejo de errores,
 * y la pantalla se quedaría sin nada que mostrar justo cuando algo falló.
 */
export async function interpretar(data: unknown, error: unknown): Promise<ResultadoPuente> {
  if (!error) {
    const ok = esquemaAplicado.safeParse(data)
    if (ok.success) {
      return {
        estado: 'aplicado',
        cambio: ok.data.changed ?? null,
        desde: ok.data.subscription_updated_at ?? null,
        banderaId: ok.data.bandera_id,
      }
    }
    return { estado: 'ilegible' }
  }

  // Hay error: puede ser un no-2xx CON cuerpo útil, o un fallo de transporte.
  const cuerpo = await leerCuerpo(error)
  if (cuerpo === null) return { estado: 'sin_alcanzar' }

  const no = esquemaNoAplicado.safeParse(cuerpo)
  if (no.success) {
    return {
      estado: 'no_aplicado',
      codigo: no.data.bandera_error_codigo,
      banderaId: no.data.bandera_id,
      intentos: no.data.intentos,
    }
  }

  const rechazo = esquemaRechazo.safeParse(cuerpo)
  if (rechazo.success) return { estado: 'rechazado', mensaje: rechazo.data.error }

  return { estado: 'ilegible' }
}

/** `null` si no hay cuerpo que leer — o sea, si nunca se habló con nadie. */
async function leerCuerpo(error: unknown): Promise<unknown | null> {
  const ctx = (error as ErrorConCuerpo)?.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    return await ctx.json()
  } catch {
    // Respondió algo que no es JSON. Se habló con alguien, pero no se
    // entiende qué dijo: eso es `ilegible`, no `sin_alcanzar`.
    return {}
  }
}
