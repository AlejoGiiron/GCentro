// @vitest-environment jsdom
/**
 * Que cada ruta se pueda MONTAR por el camino real.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SE RENDERIZA `Panel`, NO EL COMPONENTE SUELTO.
 *
 * Montar `ColaBanderas` envuelto en un `MemoryRouter` de test probaría que
 * funciona con *un* router — que no es la pregunta. El bug del 16/08 no fue
 * un componente roto: fue **el cableado**, un `NavLink` que en producción
 * quedaba fuera del `Router`.
 *
 * Así que se monta la cadena que efectivamente ships —`Panel` →
 * `HashRouter` → `Rutas` → la pantalla— moviendo el hash como lo haría un
 * enlace. Si mañana alguien saca el Router de su lugar, estos tests caen
 * con el mismo error que veía el usuario.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Panel } from './Panel'

vi.mock('@/hooks/useIsAdmin', () => ({
  useIsAdmin: () => ({ data: true, isLoading: false }),
}))

function montarEn(hash: string) {
  window.location.hash = hash
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    <QueryClientProvider client={qc}>
      <Panel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.location.hash = ''
})

describe('las rutas se montan por el camino real', () => {
  it('/ → la lista', () => {
    const html = montarEn('#/')
    expect(html).toContain('Suscripciones')
    // La tabla no está: la consulta arranca pendiente. Lo que importa es que
    // el primer render no tire.
    expect(html).toContain('Cargando')
  })

  it('/cola → la cola de banderas', () => {
    // `ColaBanderas` usa `<Link>`, que necesita contexto de Router. Es el
    // mismo tipo de dependencia que rompió el 16/08, y hasta hoy ningún test
    // lo montaba.
    const html = montarEn('#/cola')
    expect(html).toContain('Cola de banderas')
    expect(html).toContain('una fila por llamada')
  })

  it('/suscripcion/:id → el detalle', () => {
    // `Detalle` usa `useParams` y `useNavigate`: los dos exigen Router.
    const html = montarEn('#/suscripcion/ebb49249-7546-4e57-9a37-33d8ba0dbd79')
    expect(html).toContain('Cargando')
  })

  it('/alta → el formulario de firma', () => {
    // `Alta` usa `useNavigate`, y el formulario llama a `crypto.randomUUID()`
    // en el primer render para fijar el id del contrato. Las dos cosas son
    // dependencias del entorno que sólo se ven montando.
    const html = montarEn('#/alta')
    expect(html).toContain('Cargando el catálogo')
  })

  it('una ruta inventada redirige a la lista sin tirar', () => {
    expect(() => montarEn('#/no-existe')).not.toThrow()
  })

  it('ninguna ruta tira en el primer render', () => {
    for (const h of ['#/', '#/cola', '#/alta', '#/suscripcion/x', '#/no-existe', '']) {
      expect(() => montarEn(h), `ruta ${h || '(vacía)'}`).not.toThrow()
    }
  })
})
