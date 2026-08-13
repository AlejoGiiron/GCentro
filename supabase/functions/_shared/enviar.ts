/**
 * El envío hacia `aplicar-estado`, con reintentos acotados.
 *
 * Todo lo del mundo exterior —`fetch`, el reloj, el sleep— entra por
 * parámetro. No es purismo: es lo que permite que un test corra el camino
 * completo contra un verificador que recalcula el HMAC como lo hace G-Vento,
 * en vez de comprobar por inspección que la firma "se ve bien".
 */
import {
  codigoDeEstadoHttp,
  codigoDeExcepcion,
  construirCuerpo,
  esReintentable,
  type BanderaErrorCodigo,
} from './contrato.ts'
import { firmarPeticion } from './firma.ts'

/**
 * Tres intentos. La ventana del HMAC es de 300s y cada intento se re-firma con
 * su propio timestamp, así que el límite no lo pone la ventana sino la
 * paciencia de quien apretó el botón: es una acción de panel, no un job.
 */
export const MAX_INTENTOS = 3

/** Por intento. Un `aplicar-estado` que tarda más de 10s está caído. */
export const TIMEOUT_MS = 10_000

/** Backoff entre intentos. El índice es el número de intento ya consumido. */
const ESPERA_MS = [500, 1_500]

export interface DepsEnvio {
  fetch: typeof fetch
  /** Epoch en SEGUNDOS. Se vuelve a pedir en cada intento. */
  ahora: () => number
  esperar: (ms: number) => Promise<void>
}

export interface ParametrosEnvio {
  url: string
  secreto: string
  organizacionExternaId: string | null
  nivel: string
  mensaje: unknown
}

export interface ResultadoEnvio {
  ok: boolean
  /** Intentos consumidos. Va a `banderas_pendientes.intentos`. */
  intentos: number
  /** Del 200: `false` si el estado ya estaba aplicado. */
  changed?: boolean
  /** Del 200: cuándo CAMBIÓ el estado del otro lado, no cuándo se llamó. */
  subscription_updated_at?: string | null
  codigo?: BanderaErrorCodigo
  /**
   * Texto crudo del error, para `banderas_pendientes.ultimo_error`.
   * ⚠️ NUNCA a Sentry: puede traer el mensaje del otro lado, que es prosa.
   */
  error?: string
  http?: number
}

/**
 * Recorta el error del otro lado antes de guardarlo.
 *
 * Un 500 con una página de HTML entera adentro convierte la columna en un
 * volcado ilegible que nadie vuelve a mirar. Los primeros 500 caracteres
 * alcanzan para reconocer de qué se trata.
 */
function recortar(texto: string): string {
  return texto.length > 500 ? `${texto.slice(0, 500)}…` : texto
}

/**
 * Manda la bandera. Un intento por vuelta, re-firmando cada vez.
 *
 * ⚠️ El cuerpo se construye UNA sola vez, fuera del loop, y se firma adentro.
 * Construirlo adentro no cambiaría nada hoy, pero abre la puerta a que dos
 * intentos manden cuerpos distintos y a que "el segundo intento funcionó" sea
 * un misterio. El cuerpo es la intención; el timestamp es del intento.
 *
 * Si el cuerpo no se puede construir —nivel desconocido, mensaje largo, uuid
 * de organización inválido— tira `ErrorDeContrato` ANTES de tocar la red. Eso
 * es a propósito: no es algo que reintentar, y no debería llegar a escribirse
 * como una bandera pendiente.
 */
export async function enviarBandera(
  p: ParametrosEnvio,
  deps: DepsEnvio,
): Promise<ResultadoEnvio> {
  const cuerpo = construirCuerpo(p.organizacionExternaId, p.nivel, p.mensaje)

  let ultimo: ResultadoEnvio = { ok: false, intentos: 0, codigo: 'DESCONOCIDO' }

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    ultimo = await unIntento(p, cuerpo, deps, intento)

    if (ultimo.ok) return ultimo
    if (!esReintentable(ultimo.codigo ?? 'DESCONOCIDO')) return ultimo
    if (intento < MAX_INTENTOS) await deps.esperar(ESPERA_MS[intento - 1] ?? 1_500)
  }

  return ultimo
}

async function unIntento(
  p: ParametrosEnvio,
  cuerpo: string,
  deps: DepsEnvio,
  intento: number,
): Promise<ResultadoEnvio> {
  try {
    const firmada = await firmarPeticion(cuerpo, p.secreto, deps.ahora())

    const respuesta = await deps.fetch(p.url, {
      method: 'POST',
      headers: firmada.headers,
      // El MISMO string que se firmó. Sin re-serializar, sin `JSON.stringify`
      // de un objeto equivalente: eso es lo que rompe el HMAC.
      body: firmada.cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (respuesta.ok) {
      // El cuerpo del 200 es informativo. Que venga mal formado no invalida
      // el hecho de que el otro lado aceptó y aplicó el estado.
      let changed: boolean | undefined
      let actualizado: string | null | undefined
      try {
        const json = (await respuesta.json()) as {
          changed?: boolean
          subscription_updated_at?: string | null
        }
        changed = json.changed
        actualizado = json.subscription_updated_at
      } catch {
        changed = undefined
      }
      return {
        ok: true,
        intentos: intento,
        changed,
        subscription_updated_at: actualizado,
        http: respuesta.status,
      }
    }

    const texto = await respuesta.text().catch(() => '')
    return {
      ok: false,
      intentos: intento,
      codigo: codigoDeEstadoHttp(respuesta.status),
      error: recortar(`HTTP ${respuesta.status}: ${texto}`),
      http: respuesta.status,
    }
  } catch (e) {
    return {
      ok: false,
      intentos: intento,
      codigo: codigoDeExcepcion(e),
      error: recortar(e instanceof Error ? `${e.name}: ${e.message}` : String(e)),
    }
  }
}
