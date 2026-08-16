import { AlertTriangle, RotateCw } from 'lucide-react'

interface ErrorFallbackProps {
  /** ID del evento en Sentry, para reportarlo por si hace falta. */
  eventId: string | null
}

/**
 * Pantalla de recuperación del ErrorBoundary.
 *
 * Sin esto, un error de render desmonta el árbol y deja la PANTALLA EN BLANCO,
 * sin ninguna pista de qué pasó ni qué hacer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ ESTILOS EN LÍNEA A PROPÓSITO, Y NO ES DEUDA.
 *
 * Es la única pantalla que tiene que verse cuando algo YA falló. Si el
 * problema fue la hoja de estilos —no cargó, el build de Tailwind salió mal,
 * el CDN se cayó— una pantalla con clases se renderiza sin estilo alguno,
 * justo cuando alguien necesita leerla. Los valores en línea no dependen de
 * nada más que del HTML.
 *
 * Lo que sí se corrige: los valores. Estaban en una paleta clara heredada
 * del scaffold, así que la pantalla de error se veía **de otro producto** —
 * y parecer otro producto es lo último que ayuda cuando algo se rompió.
 * Ahora son los mismos hex de `tailwind.config.js`, copiados a mano porque
 * acá no se puede importar el tema.
 *
 * Si la paleta cambia, esto se actualiza a mano. Es el precio de que la
 * pantalla de error no dependa de la cadena de build.
 * ─────────────────────────────────────────────────────────────────────────
 */
const LIENZO_BASE = '#0B0F16'
const LIENZO_REALCE = '#161E2E'
const LIENZO_DIVISOR = '#5B6F91'
const TINTA_FUERTE = '#E8EDF5'
const TINTA_MEDIA = '#A8B4C6'
const TINTA_DEBIL = '#7C8CA3'
const SENAL_ALERTA = '#F5C451'

export function ErrorFallback({ eventId }: ErrorFallbackProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: LIENZO_BASE,
        display: 'grid', placeItems: 'center', padding: 24,
        // Sin familia propia: la del sistema siempre está. Pedir una fuente
        // que quizá no cargó es el mismo error que pedir una hoja de estilos.
        zIndex: 9999,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: LIENZO_REALCE, border: `1px solid ${LIENZO_DIVISOR}`,
            display: 'grid', placeItems: 'center', margin: '0 auto 20px',
          }}
        >
          <AlertTriangle size={28} color={SENAL_ALERTA} aria-hidden="true" />
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 600, color: TINTA_FUERTE, margin: '0 0 8px' }}>
          Algo falló en la aplicación
        </h1>

        <p style={{ fontSize: 14, color: TINTA_MEDIA, lineHeight: 1.6, margin: '0 0 24px' }}>
          El error ya se reportó al equipo. Recargá la página para seguir trabajando.
        </p>

        <button
          onClick={() => window.location.reload()}
          data-testid="error-boundary-reload"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: LIENZO_REALCE, color: TINTA_FUERTE,
            border: `1px solid ${LIENZO_DIVISOR}`,
            borderRadius: 6, padding: '10px 24px',
            fontSize: 15, fontWeight: 500, cursor: 'pointer',
            // Sin sombra de color: §7 no lleva efectos decorativos, y menos
            // acá. `outline` NO se toca — es el único indicador de foco que
            // esta pantalla puede tener sin una hoja de estilos.
          }}
        >
          <RotateCw size={17} aria-hidden="true" />
          Recargar
        </button>

        {eventId && (
          <p style={{ fontSize: 12, color: TINTA_DEBIL, margin: '20px 0 0' }}>
            Código del error:{' '}
            <span
              style={{ fontFamily: 'monospace', color: TINTA_MEDIA }}
              data-testid="error-boundary-event-id"
            >
              {eventId.slice(0, 8)}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
