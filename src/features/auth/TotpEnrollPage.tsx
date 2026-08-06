import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { totpCodeSchema } from './schemas'
import { captureError } from '@/lib/sentry'

/**
 * TOTP es obligatorio (§8): esta pantalla no tiene forma de "saltar". Se
 * muestra apenas hay sesión y no hay un factor verificado todavía.
 */
export function TotpEnrollPage() {
  const refresh = useAuthStore((s) => s.refresh)

  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function enroll() {
      // Cada `enroll` crea un factor NUEVO en estado `unverified`. Sin esta
      // limpieza se acumulan: uno por cada recarga de esta pantalla, más otro
      // por el doble montaje de StrictMode en dev. Supabase tiene un tope de
      // factores por usuario, así que a la larga el enrolamiento empieza a
      // fallar solo. Se barren los abandonados antes de pedir uno limpio.
      //
      // `listFactors().totp` trae SOLO los verificados; los pendientes están
      // en `.all`, que es de donde hay que filtrarlos.
      const { data: existentes } = await supabase.auth.mfa.listFactors()
      if (cancelled) return

      for (const factor of existentes?.all ?? []) {
        if (factor.factor_type === 'totp' && factor.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: factor.id })
        }
      }
      if (cancelled) return

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (cancelled) return

      if (enrollError) {
        setError('No se pudo iniciar el registro de TOTP. Recargá la página.')
        captureError(enrollError, 'auth', { etapa: 'mfa.enroll' })
        setEnrolling(false)
        return
      }

      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setEnrolling(false)
    }

    void enroll()
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
      setError('Código incorrecto. Verificá la hora de tu teléfono e intentá de nuevo.')
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
          <h1 className="text-xl font-semibold text-white">Activar autenticación en dos pasos</h1>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Obligatorio para todas las cuentas de G-Centro. Escaneá el código con tu app de
          autenticación (Google Authenticator, 1Password, Authy) y confirmá con el código de 6
          dígitos.
        </p>

        {enrolling && <p className="text-sm text-slate-400">Generando código…</p>}

        {qrCode && (
          <div className="bg-white rounded-lg p-4 mb-4 flex justify-center">
            <img src={qrCode} alt="Código QR para TOTP" width={180} height={180} />
          </div>
        )}

        {secret && (
          <p className="text-xs text-slate-500 mb-6 break-all">
            ¿No podés escanear? Ingresá esta clave manualmente:{' '}
            <span className="font-mono text-slate-300">{secret}</span>
          </p>
        )}

        {factorId && (
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
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white tracking-[0.3em] text-center text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="000000"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium py-2.5 transition-colors"
            >
              {loading ? 'Verificando…' : 'Confirmar y activar'}
            </button>
          </form>
        )}

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
