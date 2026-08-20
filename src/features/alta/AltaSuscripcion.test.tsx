// @vitest-environment jsdom
/**
 * Modos de fallo que atrapa, nombrados antes de escribirlo:
 *
 * · El formulario revienta en el PRIMER render, con el catálogo ya resuelto y
 *   nada elegido todavía. Es el estado en el que se abre siempre, y es donde
 *   `plan` es `null` mientras algo intenta leerle un precio.
 * · Un default que decide plata: plan o término preseleccionados eligen el
 *   descuento y el estado de la implementación por omisión de alguien que no
 *   eligió.
 * · La confirmación aparece sola. Si el resumen se ve sin haber pedido
 *   revisar, deja de ser una segunda lectura y pasa a ser decoración — el
 *   mismo defecto que tuvo el aviso de idempotencia en el detalle.
 *
 * ⚠️ NO cubre el paso de firmar: `renderToString` no corre efectos ni
 * eventos, así que nada de lo que pasa después de un clic se ejercita acá.
 * Eso se verifica por el camino real, en el navegador, contra LAB.
 */
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AltaSuscripcion } from './AltaSuscripcion'
import { formularioAltaSchema } from './schemas'
import type { Catalogo } from './useAlta'

const CATALOGO: Catalogo = {
  productos: [{ id: 'aa000000-0000-4000-8000-000000000001', codigo: 'g-vento', nombre: 'G-Vento' }],
  planes: [
    {
      id: 'bb000000-0000-4000-8000-000000000001',
      producto_id: 'aa000000-0000-4000-8000-000000000001',
      codigo: 'esencial',
      nombre: 'Esencial',
      precio_mensual: 80000,
      precio_sede_adicional: 60000,
    },
    {
      // El plan del contador: existe en el catálogo y NO tiene precio.
      id: 'bb000000-0000-4000-8000-000000000002',
      producto_id: 'aa000000-0000-4000-8000-000000000001',
      codigo: 'contador',
      nombre: 'Contador',
      precio_mensual: null,
      precio_sede_adicional: null,
    },
  ],
  terminos: [
    { codigo: 'mensual', meses: 1, descuento_pct: 0 },
    { codigo: 'anual', meses: 12, descuento_pct: 30 },
  ],
  clientes: [{ id: 'cc000000-0000-4000-8000-000000000001', nombre_comercial: 'LAB', es_prueba: true }],
}

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // El catálogo se siembra en la caché para que el componente lo reciba
  // resuelto: sin esto sólo se renderizaría "Cargando", que no prueba nada
  // del formulario.
  qc.setQueryData(['catalogo'], CATALOGO)
  return renderToString(
    <QueryClientProvider client={qc}>
      <AltaSuscripcion volver={() => {}} alFirmar={() => {}} />
    </QueryClientProvider>,
  )
}

describe('el formulario de alta se abre sin decidir nada', () => {
  it('renderiza con el catálogo resuelto y nada elegido', () => {
    const html = montar()
    expect(html).toContain('Firmar una suscripción')
    expect(html).toContain('G-Vento')
    expect(html).toContain('mensual')
  })

  it('los planes no se ofrecen hasta que haya producto', () => {
    // No es cosmético: los planes son POR producto, así que un select de
    // planes abierto sin producto elegido ofrecería planes de cualquiera.
    // Por eso arranca deshabilitado y sin opciones — «Esencial» no está.
    const html = montar()
    expect(html).not.toContain('Esencial')
    expect(html).toMatch(/id="plan"[^>]*disabled/)
  })

  it('ningún default elige plan ni término', () => {
    // Los dos selects arrancan en la opción vacía. Si alguien preselecciona
    // "mensual" por comodidad, este test cae.
    const html = montar()
    expect(html.match(/— Elegí —/g)?.length).toBe(3)
  })

  it('la confirmación NO se muestra hasta pedirla', () => {
    const html = montar()
    expect(html).not.toContain('Antes de firmar')
    expect(html).toContain('Revisar antes de firmar')
  })

  it('dice que los precios se congelan, antes de que se escriban', () => {
    expect(montar()).toContain('se congelan al firmar')
  })
})

describe('un contrato sin contraparte no se puede armar', () => {
  const base = {
    cliente_id: null,
    cliente_nuevo: '',
    producto_id: 'aa000000-0000-4000-8000-000000000001',
    plan_id: 'bb000000-0000-4000-8000-000000000001',
    termino: 'mensual',
    sedes_adicionales: 0,
    precio_base_mensual: 80000,
    precio_sede_adicional: 60000,
    monto_implementacion: 250000,
    descuento_pct: 0,
    fecha_inicio: '2026-08-20',
    motivo: '',
  }

  it('sin cliente elegido ni nombre nuevo, no valida', () => {
    const r = formularioAltaSchema.safeParse(base)
    expect(r.success).toBe(false)
  })

  it('con las dos cosas a la vez, tampoco', () => {
    // Es ambiguo a propósito: ¿se firma para el elegido o para el nuevo? La
    // respuesta silenciosa sería crear un cliente duplicado.
    const r = formularioAltaSchema.safeParse({
      ...base,
      cliente_id: 'cc000000-0000-4000-8000-000000000001',
      cliente_nuevo: 'Otro',
    })
    expect(r.success).toBe(false)
  })

  it('con uno de los dos, valida', () => {
    expect(formularioAltaSchema.safeParse({ ...base, cliente_nuevo: 'Nuevo' }).success).toBe(true)
    expect(
      formularioAltaSchema.safeParse({
        ...base,
        cliente_id: 'cc000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true)
  })

  it('un precio con decimales no entra: los pesos son enteros (§2)', () => {
    const r = formularioAltaSchema.safeParse({
      ...base,
      cliente_nuevo: 'Nuevo',
      precio_base_mensual: 79999.5,
    })
    expect(r.success).toBe(false)
  })
})
