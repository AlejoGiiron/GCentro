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
 */
export function ErrorFallback({ eventId }: ErrorFallbackProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#f8fafc',
        display: 'grid', placeItems: 'center', padding: 24,
        fontFamily: 'Inter, sans-serif', zIndex: 9999,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%', background: '#fef3c7',
            display: 'grid', placeItems: 'center', margin: '0 auto 20px',
          }}
        >
          <AlertTriangle size={28} color="#d97706" />
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>
          Algo falló en la aplicación
        </h1>

        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
          El error ya se reportó al equipo. Recargá la página para seguir trabajando.
        </p>

        <button
          onClick={() => window.location.reload()}
          data-testid="error-boundary-reload"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#10b981', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px 28px',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16,185,129,.35)',
          }}
        >
          <RotateCw size={17} />
          Recargar
        </button>

        {eventId && (
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '20px 0 0' }}>
            Código del error:{' '}
            <span
              style={{ fontFamily: 'monospace', color: '#64748b' }}
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
