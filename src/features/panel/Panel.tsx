/**
 * El armazón del panel: barra superior, verificación de admin, contenido.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ EL ROUTER ENVUELVE TODO, INCLUIDAS LAS PANTALLAS DE COMPUERTA.
 *
 * `NavLink` exige contexto de Router y **tira si no lo tiene**. La versión
 * anterior ponía el `HashRouter` sólo alrededor de las rutas y dejaba las dos
 * ramas de compuerta —«Verificando acceso…» y «Cuenta sin autorizar»— fuera.
 * Como `isLoading` es verdadero en el primer render SIEMPRE, la aplicación
 * reventaba al cargar, todas las veces (16/08/2026).
 *
 * La compuerta sigue haciendo lo suyo: `<Rutas />` no se monta sin permiso, y
 * un enlace profundo no llega a montar una pantalla. Lo que cambia es que el
 * PROVEEDOR de contexto está siempre, que es lo que `NavLink` necesita.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { LogOut, ShieldAlert } from 'lucide-react'
import { HashRouter, NavLink } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { RUTAS } from '@/lib/rutas'
import { FOCO } from '@/lib/tokens'
import { Rutas } from './rutas'

const NAVEGACION = [
  { a: RUTAS.lista, texto: 'Suscripciones' },
  { a: RUTAS.cola, texto: 'Cola de banderas' },
  // Va en la navegación y no como botón dentro de la lista: firmar no es una
  // acción SOBRE un contrato existente, y colgarla de la pantalla que los
  // lista la haría parecer una.
  { a: RUTAS.alta, texto: 'Firmar' },
]

/**
 * `conNav` apagado en las pantallas de compuerta: ofrecerle a alguien sin
 * permiso un enlace a una pantalla que no va a poder ver es una invitación a
 * un callejón sin salida.
 */
function Marco({ children, conNav = false }: { children: React.ReactNode; conNav?: boolean }) {
  return (
    <div className="min-h-screen bg-lienzo-base">
      <header className="border-b border-lienzo-borde bg-lienzo-panel">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-2.5">
          <div className="flex items-baseline gap-5">
            <span className="text-titulo tracking-tight text-tinta-fuerte">G-Centro</span>
            {conNav && (
              <nav className="flex items-baseline gap-3">
                {NAVEGACION.map((r) => (
                  <NavLink
                    key={r.a}
                    to={r.a}
                    end
                    className={({ isActive }) =>
                      `rounded px-1 py-0.5 text-micro ${FOCO} ${
                        isActive
                          ? 'font-medium text-tinta-fuerte'
                          : 'text-tinta-media hover:text-tinta-fuerte'
                      }`
                    }
                  >
                    {r.texto}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
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

function Compuerta() {
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
  // `<Rutas />` no se monta: un enlace profundo no llega a montar ninguna
  // pantalla, que es la propiedad que importa.
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
    <Marco conNav>
      <Rutas />
    </Marco>
  )
}

export function Panel() {
  return (
    <HashRouter>
      <Compuerta />
    </HashRouter>
  )
}
