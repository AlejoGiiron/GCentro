import { LogOut, ShieldAlert, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useIsAdmin } from '@/hooks/useIsAdmin'

/**
 * Placeholder del Bloque 1: no hay pantallas de producto todavía (clientes,
 * suscripciones, pagos llegan en bloques posteriores). Esto solo confirma
 * que aal2 se alcanzó y que RLS deja pasar (o no) según `admins`.
 */
export function HomePlaceholder() {
  const { data: isAdmin, isLoading } = useIsAdmin()

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {isLoading && <p className="text-slate-400 text-sm">Verificando acceso…</p>}

        {!isLoading && isAdmin && (
          <>
            <ShieldCheck size={40} className="text-emerald-500 mx-auto mb-3" />
            <h1 className="text-xl font-semibold text-white mb-1">Cimientos listos</h1>
            <p className="text-sm text-slate-400">
              Sesión con TOTP verificado y acceso confirmado contra <code>admins</code>. El
              catálogo, clientes y suscripciones llegan en los próximos bloques.
            </p>
          </>
        )}

        {!isLoading && isAdmin === false && (
          <>
            <ShieldAlert size={40} className="text-amber-500 mx-auto mb-3" />
            <h1 className="text-xl font-semibold text-white mb-1">Cuenta sin autorizar</h1>
            <p className="text-sm text-slate-400">
              Tu sesión es válida pero no tenés fila en <code>admins</code>. RLS está
              bloqueando todo — pedile a un admin que te agregue.
            </p>
          </>
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
