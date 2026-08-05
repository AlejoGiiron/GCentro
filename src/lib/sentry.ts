/**
 * Sentry — reporte de errores (v1: SOLO errores), configurado igual que en G-Vento.
 *
 * NO se activa performance monitoring, session replay ni profiling: consumen
 * cuota y agregan ruido. Este módulo hace tres cosas:
 *   1. Inicializa Sentry solo en producción real (ver `sentryEnabled`).
 *   2. LIMPIA el payload de PII antes de enviarlo (ver `scrubEvent`).
 *   3. Expone helpers para el contexto de admin y el reporte explícito.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRIVACIDAD — G-Centro va a manejar PII de los clientes de G-Vento (nombre
 * comercial, NIT, contacto) y montos de pagos. Nada de eso puede salir del
 * navegador. La política está implementada, no solo documentada:
 *   · `sendDefaultPii: false` → sin IP del usuario ni cookies/headers.
 *   · Del admin propio se envía SOLO su UUID. NUNCA su email (por eso no se
 *     usa `Sentry.setUser({ email })`).
 *   · `scrubEvent` recorre el evento entero redactando valores sensibles.
 *   · `beforeBreadcrumb` corta el query string de las peticiones a Supabase.
 * ─────────────────────────────────────────────────────────────────────────
 */
import * as Sentry from '@sentry/react'

/**
 * Áreas funcionales — el tag que permite priorizar qué se rompe primero.
 * Se amplía a medida que el producto crece (suscripciones, pagos, bandera).
 */
export type SentryArea = 'auth' | 'catalogo' | 'config'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

/**
 * Sentry se activa SOLO si:
 *   · el build es de producción (`import.meta.env.PROD`) → nunca en `pnpm dev`;
 *   · hay DSN configurado;
 *   · el navegador no está automatizado.
 *
 * ⚠️ OJO con CI: NO se puede apagar Sentry con `process.env.CI` en tiempo de
 * build, porque los proveedores de hosting suelen setear `CI=1` en sus builds
 * de producción — eso lo dejaría desactivado justamente donde se necesita.
 */
export const sentryEnabled =
  import.meta.env.PROD &&
  !!DSN &&
  !(typeof navigator !== 'undefined' && navigator.webdriver)

// ── Redacción de PII ──────────────────────────────────────────────────────

/**
 * Claves cuyo VALOR se redacta siempre, sin mirar el contenido.
 * Cubre los campos PII del dominio (cliente, contacto) y todo el texto
 * libre: `notas`, `motivo`, `nota` los escribe un admin y puede meter ahí
 * cualquier cosa ("Juan de G-10, 3001234567").
 */
const CLAVE_SENSIBLE =
  /(nombre|name|phone|telefono|tel|email|correo|address|direccion|customer|cliente|contacto|note|nota|reason|motivo|comment|coment|password|token|apikey|authorization)/i

/**
 * Ramas del evento que NO se tocan: son diagnóstico puro, sin PII, y
 * redactarlas rompería el stack trace o el ordenamiento de Sentry.
 */
const CLAVE_INTOCABLE = new Set([
  'stacktrace', 'frames', 'filename', 'abs_path', 'function', 'module',
  'lineno', 'colno', 'in_app', 'event_id', 'timestamp', 'release', 'dist',
  'environment', 'platform', 'sdk', 'level', 'logger', 'fingerprint',
  'mechanism', 'transaction', 'type',
  // `tags` y `user` los construimos nosotros y ya están curados (ver
  // setSentryUserContext): redactarlos borraría el contexto del admin.
  'tags', 'user',
])

const REDACTADO = '[Filtrado]'

/**
 * Claves cuyo valor NUMÉRICO pasa sin redactar. Deliberadamente NO cubre
 * strings: si alguien mete texto libre bajo una de estas claves, se redacta
 * igual — solo se confía en la FORMA (number), no en el nombre de la clave.
 */
const IDENTIFICADOR_NUMERICO = new Set([
  'page', 'pageSize', 'count', 'status', 'statusCode',
])

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g
/** Detalle de Postgres en violación de constraint: `Key (email)=(...)`. */
const RE_PG_KEY = /Key\s*\(([^)]*)\)\s*=\s*\(([^)]*)\)/gi
/** Montos con separador de miles: `$ 79.000`, `1,250,000`. */
const RE_MONTO_FMT = /\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?/g
/** Enteros de 4+ dígitos: montos en COP sin formato y teléfonos. */
const RE_NUM_LARGO = /\b\d{4,}\b/g

const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const RE_ISO = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g

/**
 * Teléfono móvil colombiano (10 dígitos empezando en 3). Se redacta SIEMPRE:
 * es PII, no un identificador interno.
 */
const RE_MOVIL_CO = /\b3\d{9}\b/g

/**
 * Redacta PII dentro de un string conservando lo que sirve para depurar.
 *
 * Los UUID y las fechas ISO se enmascaran ANTES de la pasada numérica y se
 * restauran después: sin eso, `2026-08-05` saldría como `[monto]-08-05`.
 */
function scrubString(input: string): string {
  if (!input) return input

  const guardados: string[] = []
  const guardar = (m: string) => ` ${guardados.push(m) - 1} `

  let s = input.replace(RE_MOVIL_CO, REDACTADO)

  s = s.replace(RE_UUID, guardar).replace(RE_ISO, guardar)

  s = s
    .replace(RE_EMAIL, REDACTADO)
    // El nombre de la columna se conserva (dice QUÉ constraint falló); el valor no.
    .replace(RE_PG_KEY, (_m, col: string) => `Key (${col})=(${REDACTADO})`)
    .replace(RE_MONTO_FMT, '[monto]')
    .replace(RE_NUM_LARGO, '[monto]')

  return s.replace(/ (\d+) /g, (_m, i: string) => guardados[Number(i)])
}

/**
 * Recorre el evento redactando en profundidad. Corta a 8 niveles por seguridad.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTADO
  if (typeof value === 'string') return scrubString(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value
  }
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CLAVE_INTOCABLE.has(k)) out[k] = v
      // La clave sensible gana SIEMPRE sobre el allowlist numérico: si una
      // clave estuviera en ambos conjuntos, se redacta (fail-closed).
      else if (CLAVE_SENSIBLE.test(k)) out[k] = REDACTADO
      // Allowlist FAIL-CLOSED: pasa solo si la forma es la esperada (number).
      else if (IDENTIFICADOR_NUMERICO.has(k)) {
        out[k] = typeof v === 'number' ? v : REDACTADO
      }
      else out[k] = scrubValue(v, depth + 1)
    }
    return out
  }
  return REDACTADO
}

// ── Filtros de ruido ──────────────────────────────────────────────────────

const RUIDO = [
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
  /Network request failed/i,
  /Load failed/i,
  /The Internet connection appears to be offline/i,
  /AbortError/i,
  /TypeError: cancelled/i,
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured with value: undefined/i,
  /^chrome-extension:/i,
  /^moz-extension:/i,
  /Extension context invalidated/i,
]

const URLS_IGNORADAS = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-(web-)?extension:\/\//i,
  /^chrome:\/\//i,
]

// ── Init ──────────────────────────────────────────────────────────────────

export function initSentry(): void {
  if (!sentryEnabled) return

  Sentry.init({
    dsn: DSN,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) ?? 'production',
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,

    // v1 = SOLO errores. Sin performance, sin replay, sin profiling.
    tracesSampleRate: 0,

    // NUNCA true: adjuntaría la IP del usuario, cookies y headers.
    sendDefaultPii: false,

    ignoreErrors: RUIDO,
    denyUrls: URLS_IGNORADAS,

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
        const url = breadcrumb.data?.url
        if (typeof url === 'string') {
          // El endpoint de auth mueve tokens y credenciales: se descarta entero.
          if (url.includes('/auth/v1/')) return null
          try {
            const u = new URL(url, window.location.origin)
            breadcrumb.data = { ...breadcrumb.data, url: `${u.origin}${u.pathname}` }
          } catch {
            breadcrumb.data = { ...breadcrumb.data, url: REDACTADO }
          }
        }
        if (breadcrumb.data) {
          delete breadcrumb.data.body
          delete breadcrumb.data.input
        }
      }
      return breadcrumb
    },

    beforeSend(event) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return null
      }
      return scrubValue(event) as typeof event
    },
  })
}

// ── Contexto del admin ────────────────────────────────────────────────────

export interface SentryUserContext {
  /** UUID de auth. Es lo ÚNICO que identifica al admin en Sentry. */
  userId: string
}

/** Del admin va SOLO el id. Su email NO se envía nunca. */
export function setSentryUserContext(ctx: SentryUserContext): void {
  if (!sentryEnabled) return
  Sentry.setUser({ id: ctx.userId })
}

/** Limpia el contexto al cerrar sesión. */
export function clearSentryUserContext(): void {
  if (!sentryEnabled) return
  Sentry.setUser(null)
}

// ── Reporte explícito ─────────────────────────────────────────────────────

/**
 * Reporta un error que la app YA manejó (mostró un mensaje, degradó, siguió).
 * `contexto` admite datos EXTRA que igual pasan por el redactor de
 * `beforeSend`, así que no hace falta pre-limpiarlos.
 */
export function captureError(
  error: unknown,
  area: SentryArea,
  contexto?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return
  Sentry.captureException(error, {
    tags: { area },
    extra: contexto,
  })
}

/** Reporta una condición anómala que no lanzó excepción. */
export function captureIssue(
  mensaje: string,
  area: SentryArea,
  contexto?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return
  Sentry.captureMessage(mensaje, {
    level: 'error',
    tags: { area },
    extra: contexto,
  })
}
