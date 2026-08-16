/**
 * Las rutas del panel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ HASHROUTER Y NO BROWSERROUTER
 *
 * El motivo de tener rutas es que «mirá a G-10» sea un enlace y que F5 no
 * devuelva a la lista. `BrowserRouter` da URLs más limpias pero **exige que
 * el servidor reescriba cualquier ruta al index**: sin esa regla, un enlace
 * compartido y un F5 devuelven 404 — que es exactamente el problema que se
 * viene a resolver, reintroducido por configuración de despliegue.
 *
 * `HashRouter` no puede fallar así en ningún hosting estático. El `#` es
 * cosmético en una herramienta interna, y el día que el despliegue esté
 * definido y tenga la reescritura, cambiar a `BrowserRouter` es una línea.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ListaClientes } from '@/features/clientes/ListaClientes'
import { useSuscripciones } from '@/features/clientes/useSuscripciones'
import { ColaBanderas } from '@/features/cola/ColaBanderas'
import { DetalleSuscripcion } from '@/features/suscripcion/DetalleSuscripcion'
import { RUTAS } from '@/lib/rutas'
import { SENAL } from '@/lib/tokens'

function Lista() {
  const navegar = useNavigate()
  return <ListaClientes abrir={(f) => navegar(RUTAS.suscripcion(f.suscripcion.id))} />
}

/**
 * El detalle se resuelve contra la MISMA consulta de la lista.
 *
 * No hay una consulta aparte por suscripción: son pocas y ya vienen todas en
 * una sola. Y tiene una consecuencia buena — el detalle se refresca solo
 * cuando una acción invalida la lista, en vez de mostrar datos congelados.
 */
function Detalle() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { data, isPending, error } = useSuscripciones()
  const fila = data?.find((f) => f.suscripcion.id === id)

  if (isPending) return <p className="text-dato text-tinta-media">Cargando…</p>

  if (error) {
    return (
      <p role="alert" className={`text-dato ${SENAL.critico}`}>
        No se pudo leer la suscripción.
      </p>
    )
  }

  // Un enlace compartido puede apuntar a algo que ya no está. Se dice qué
  // pasó en vez de redirigir en silencio: una redirección haría pensar que
  // el enlace estaba mal escrito.
  if (!fila) {
    return (
      <div>
        <p className="mb-2 text-dato text-tinta-fuerte">Esa suscripción no existe.</p>
        <p className="mb-3 text-micro text-tinta-media">
          El enlace puede ser viejo, o la suscripción pertenece a un tenant de prueba y
          está oculta.
        </p>
        <button
          onClick={() => navegar(RUTAS.lista)}
          className="text-micro text-tinta-media underline underline-offset-2 hover:text-tinta-fuerte"
        >
          Volver a la lista
        </button>
      </div>
    )
  }

  return <DetalleSuscripcion fila={fila} volver={() => navegar(RUTAS.lista)} />
}

export function Rutas() {
  return (
    <Routes>
      <Route path={RUTAS.lista} element={<Lista />} />
      <Route path="/suscripcion/:id" element={<Detalle />} />
      <Route path={RUTAS.cola} element={<ColaBanderas />} />
      {/* Cualquier otra cosa vuelve a la lista, sin dejar la ruta rota en el
          historial: `replace` evita que «atrás» reintente la ruta inválida. */}
      <Route path="*" element={<Navigate to={RUTAS.lista} replace />} />
    </Routes>
  )
}
