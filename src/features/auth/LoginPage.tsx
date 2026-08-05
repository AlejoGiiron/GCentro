import { useState, type FormEvent } from 'react'
import { LogIn } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { loginSchema } from './schemas'
import { captureError } from '@/lib/sentry'

/**
 * Sin link de "crear cuenta" a propósito: el registro público se desactiva
 * desde el dashboard de Supabase (§8 del diseño). Esta pantalla es la única
 * puerta y asume que la cuenta ya existe.
 */
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data)
    setLoading(false)

    if (signInError) {
      setError('Correo o contraseña incorrectos.')
      captureError(signInError, 'auth', { etapa: 'signInWithPassword' })
      return
    }
    // El cambio de sesión lo recoge onAuthStateChange en App.tsx.
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-white mb-1">G-Centro</h1>
        <p className="text-sm text-slate-400 mb-8">Panel de control de suscripciones</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-slate-300 mb-1">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="admin@gcentro.co"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-slate-300 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium py-2.5 transition-colors"
          >
            <LogIn size={18} />
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="text-xs text-slate-500 mt-6">
          Acceso solo para administradores registrados. Sin cuenta, no hay registro
          público: pedile a otro admin que te agregue.
        </p>
      </div>
    </div>
  )
}
