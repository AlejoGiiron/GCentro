import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { ErrorFallback } from '@/components/ErrorFallback'
import { captureError, type SentryArea } from '@/lib/sentry'
import { LoginPage } from '@/features/auth/LoginPage'
import { TotpEnrollPage } from '@/features/auth/TotpEnrollPage'
import { TotpChallengePage } from '@/features/auth/TotpChallengePage'
import { HomePlaceholder } from '@/features/home/HomePlaceholder'

function App() {
  const status = useAuthStore((s) => s.status)
  const refresh = useAuthStore((s) => s.refresh)

  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            const area = (mutation.options.meta?.area as SentryArea) ?? 'config'
            captureError(error, area, { mutationKey: mutation.options.mutationKey })
          },
        }),
      }),
  )

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void refresh(session)
    })
    return () => subscription.subscription.unsubscribe()
  }, [refresh])

  return (
    <QueryClientProvider client={queryClient}>
      {status === 'loading' && (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <p className="text-sm text-slate-500">Cargando…</p>
        </div>
      )}
      {status === 'signed_out' && <LoginPage />}
      {status === 'needs_enroll' && <TotpEnrollPage />}
      {status === 'needs_challenge' && <TotpChallengePage />}
      {status === 'ready' && <HomePlaceholder />}
    </QueryClientProvider>
  )
}

/**
 * ErrorBoundary de Sentry envolviendo la app entera, igual que en G-Vento:
 * va POR FUERA de App para seguir en pie si lo que revienta es un provider.
 */
export default Sentry.withErrorBoundary(App, {
  fallback: ({ eventId }) => <ErrorFallback eventId={eventId ?? null} />,
})
