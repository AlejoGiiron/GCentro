// @vitest-environment jsdom
/**
 * Que el armazón se pueda MONTAR.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * El 16/08/2026 la aplicación reventaba al cargar, el 100% de las veces:
 * `NavLink` quedó fuera del `HashRouter` en las dos ramas de compuerta, y
 * `NavLink` tira si no tiene contexto de Router.
 *
 * **Había 513 tests, y typecheck, lint y build pasaban.** Ninguno lo vio
 * porque ninguno RENDERIZA un componente: se probaba la lógica pura y se
 * daba por buena la capa que la usa. Es la lección del 14/08 otra vez —
 * testear la unidad equivocada es indistinguible de no testear— corrida
 * a la UI.
 *
 * `renderToString` sobre `jsdom`: `HashRouter` lee `document` al construirse,
 * asi que un DOM hace falta. El entorno se activa SOLO en este archivo — el
 * resto de la suite sigue en `node`, que es mas rapido.
 *
 * Lo que este test NO cubre: efectos, eventos, y todo lo que pase después
 * del primer render. Para eso haría falta un DOM. Cubre el modo de fallo
 * que ya ocurrió.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Panel } from './Panel'

/**
 * La compuerta se simula porque el caso que hay que ejercitar es el de
 * ADMIN: es el único donde se renderiza `NavLink`, y `NavLink` es lo que
 * tiraba. Sin esto el test sería vacuo — pasaría con y sin el arreglo,
 * porque las pantallas de compuerta no tienen navegación.
 */
const esAdmin = { data: true as boolean | undefined, isLoading: false }
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => esAdmin }))

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    <QueryClientProvider client={qc}>
      <Panel />
    </QueryClientProvider>,
  )
}

describe('Panel', () => {
  it('el armazón con navegación se monta sin tirar', () => {
    // LA REGRESIÓN CONCRETA: si el `HashRouter` dejara de envolver a
    // `Marco`, `NavLink` se quedaría sin contexto y esto tiraría
    // "useContext must be used within a Router".
    esAdmin.data = true
    esAdmin.isLoading = false
    expect(() => montar()).not.toThrow()
  })

  it('con permiso, la navegación está', () => {
    esAdmin.data = true
    esAdmin.isLoading = false
    expect(montar()).toContain('Cola de banderas')
  })

  it('mientras verifica el acceso no tira, y no ofrece navegación', () => {
    esAdmin.isLoading = true
    const html = montar()
    expect(html).toContain('Verificando acceso')
    expect(html).not.toContain('Cola de banderas')
  })

  it('sin permiso no se ofrece navegación a pantallas inalcanzables', () => {
    // Un enlace a una pantalla que no se va a poder ver es un callejón sin
    // salida. La barra muestra el nombre y el botón de salir, nada más.
    esAdmin.data = false
    esAdmin.isLoading = false
    const html = montar()
    expect(html).toContain('Cuenta sin autorizar')
    expect(html).not.toContain('Cola de banderas')
  })
})
