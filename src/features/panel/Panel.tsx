/**
 * El armazón del panel: barra superior, verificación de admin, contenido.
 *
 * La navegación entre pantallas llega con la pantalla 2. Hoy hay una sola y
 * meter un router para una ruta sería infraestructura sin usuario.
 */
import { LogOut, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { FOCO } from '@/lib/tokens'
import { useState } from 'react'
import { ListaClientes } from '@/features/clientes/ListaClientes'
import { DetalleSuscripcion } from '@/features/suscripcion/DetalleSuscripcion'
import { useSuscripciones } from '@/features/clientes/useSuscripciones'

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-lienzo-base">
      <header className="border-b border-lienzo-borde bg-lienzo-panel">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-2.5">
          <span className="text-titulo tracking-tight text-tinta-fuerte">G-Centro</span>
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

  return <Contenido />
}

/**
 * Navegación entre las dos pantallas.
 *
 * ⚠️ Es estado local, NO una ruta: no hay router en el proyecto y agregarlo
 * sería una dependencia para una pantalla. La consecuencia es real y está
 * anotada — **no se puede compartir el enlace de un cliente**, y con varios
 * operadores "mirá a G-10" va a querer ser un link. Cuando aparezca la tercera
 * pantalla, entra el router.
 */
function Contenido() {
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const { data } = useSuscripciones()
  // La fila se relee de la consulta y no se guarda en el estado: así el
  // detalle se actualiza solo cuando una acción invalida la lista, en vez de
  // mostrar los datos congelados del momento en que se abrió.
  const fila = data?.find((f) => f.suscripcion.id === seleccion)

  if (seleccion && fila) {
    return (
      <Marco>
        <DetalleSuscripcion fila={fila} volver={() => setSeleccion(null)} />
      </Marco>
    )
  }

  return (
    <Marco>
      <ListaClientes abrir={(f) => setSeleccion(f.suscripcion.id)} />
    </Marco>
  )
}
