/**
 * El armazón del panel: barra superior, verificación de admin, contenido.
 *
 * La navegación entre pantallas llega con la pantalla 2. Hoy hay una sola y
 * meter un router para una ruta sería infraestructura sin usuario.
 */
import { LogOut, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { ListaClientes } from '@/features/clientes/ListaClientes'

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/50">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-2.5">
          <span className="text-sm font-semibold tracking-tight text-slate-200">G-Centro</span>
          <button
            onClick={() => void supabase.auth.signOut()}
            className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
          >
            <LogOut size={13} aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-5">{children}</main>
    </div>
  )
}

export function Panel() {
  const { data: esAdmin, isLoading } = useIsAdmin()

  if (isLoading) {
    return (
      <Marco>
        <p className="text-sm text-slate-400">Verificando acceso…</p>
      </Marco>
    )
  }

  // Sin fila en `admins` no se lee nada (§8). La sesión es válida; la
  // autorización no. Se dice cuál de las dos falta, porque el que lo lee
  // tiene que saber a quién pedirle qué.
  if (!esAdmin) {
    return (
      <Marco>
        <div className="max-w-md">
          <ShieldAlert size={28} className="mb-2 text-amber-500" />
          <h1 className="mb-1 text-base font-semibold text-slate-100">Cuenta sin autorizar</h1>
          <p className="text-sm text-slate-400">
            Tu sesión es válida pero no tenés fila en <code className="text-slate-300">admins</code>.
            RLS está bloqueando todo. Pedile a un admin que te agregue.
          </p>
        </div>
      </Marco>
    )
  }

  return (
    <Marco>
      <ListaClientes />
    </Marco>
  )
}
