/**
 * El armazón del panel: barra superior, verificación de admin, contenido.
 *
 * Las rutas viven en `rutas.tsx`. Acá queda sólo la compuerta de acceso, que
 * es anterior a cualquier ruta: sin fila en `admins` no hay nada que navegar.
 */
import { LogOut, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { FOCO } from '@/lib/tokens'
import { HashRouter } from 'react-router-dom'
import { Rutas } from './rutas'

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-lienzo-base">
      <header className="border-b border-lienzo-borde bg-lienzo-panel">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-2.5">
          <a
            href="#/"
            className={`rounded text-titulo tracking-tight text-tinta-fuerte ${FOCO}`}
          >
            G-Centro
          </a>
          <button
            onClick={() => void supabase.auth.signOut()}
            className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-micro text-tinta-media hover:text-tinta-fuerte ${FOCO}`}
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
        <p className="text-dato text-tinta-media">Verificando acceso…</p>
      </Marco>
    )
  }

  // Sin fila en `admins` no se lee nada (§8). La sesión es válida; la
  // autorización no. Se dice cuál de las dos falta, porque el que lo lee
  // tiene que saber a quién pedirle qué.
  //
  // ⚠️ Esta comprobación va ANTES del router y no como una ruta: si fuera una
  // ruta, un enlace profundo montaría la pantalla y recién después
  // descubriría que no hay permiso. Acá no se monta nada.
  if (!esAdmin) {
    return (
      <Marco>
        <div className="max-w-md">
          <ShieldAlert size={28} className="mb-2 text-senal-alerta" />
          <h1 className="mb-1 text-titulo text-tinta-fuerte">Cuenta sin autorizar</h1>
          <p className="text-dato text-tinta-media">
            Tu sesión es válida pero no tenés fila en <code className="text-tinta-media">admins</code>.
            RLS está bloqueando todo. Pedile a un admin que te agregue.
          </p>
        </div>
      </Marco>
    )
  }

  return (
    <HashRouter>
      <Marco>
        <Rutas />
      </Marco>
    </HashRouter>
  )
}
