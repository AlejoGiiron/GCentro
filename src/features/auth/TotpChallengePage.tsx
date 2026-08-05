import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { totpCodeSchema } from './schemas'
import { captureError } from '@/lib/sentry'

/** Se muestra cuando ya existe un factor TOTP verificado y esta sesión sigue en aal1. */
export function TotpChallengePage() {
  const refresh = useAuthStore((s) => s.refresh)

  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadFactor() {
      const { data, error: listError } = await supabase.auth.mfa.listFactors()
      if (cancelled) return

      if (listError || !data.totp[0]) {
        setError('No se encontró un factor TOTP verificado. Cerrá sesión y contactá a un admin.')
        if (listError) captureError(listError, 'auth', { etapa: 'mfa.listFactors' })
        return
      }
      setFactorId(data.totp[0].id)
    }

    void loadFactor()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = totpCodeSchema.safeParse({ code })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    if (!factorId) return

    setLoading(true)
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    })
    if (challengeError) {
      setLoading(false)
      setError('No se pudo generar el desafío. Intentá de nuevo.')
      captureError(challengeError, 'auth', { etapa: 'mfa.challenge' })
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: parsed.data.code,
    })
    setLoading(false)

    if (verifyError) {
      setError('Código incorrecto.')
      captureError(verifyError, 'auth', { etapa: 'mfa.verify' })
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    await refresh(sessionData.session)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={22} className="text-emerald-500" />
          <h1 className="text-xl font-semibold text-white">Verificación en dos pasos</h1>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Ingresá el código de 6 dígitos de tu app de autenticación.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="totp-code" className="block text-sm text-slate-300 mb-1">
              Código de 6 dígitos
            </label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white tracking-[0.3em] text-center text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="000000"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !factorId}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium py-2.5 transition-colors"
          >
            {loading ? 'Verificando…' : 'Verificar'}
          </button>
        </form>

        <button
          onClick={handleLogout}
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
