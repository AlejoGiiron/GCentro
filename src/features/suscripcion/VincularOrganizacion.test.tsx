// @vitest-environment jsdom
/**
 * Modos de fallo que atrapa, nombrados antes de escribirlos:
 *
 * · **Que el formulario de vincular siga abierto sobre un contrato ya
 *   vinculado.** Ahí el campo deja de ser «completá esto» y pasa a ser «pisá
 *   esto», que es la operación que le pone el banner de cobranza al cliente
 *   equivocado. Tiene que estar detrás de «corregir», con motivo.
 * · **Que el botón de exonerar aparezca antes del año.** Exonerar temprano
 *   regala la implementación de un contrato que todavía puede bajar de
 *   término y volverla exigible (§9.3).
 * · **Que la sección de implementación aparezca cuando no hay nada pendiente.**
 *   Los tres estados restantes no se mueven ante ningún evento: mostrarlos
 *   ofrecería una acción que no existe.
 *
 * ⚠️ NO cubre lo que pasa DESPUÉS de un clic: `renderToString` no corre
 * eventos. Que el vínculo se guarde, que la corrección deje el par viejo y
 * nuevo, y que exonerar mueva el estado se verifican por el camino real —y el
 * bloque de verificación de la `017` los prueba contra la base.
 */
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Implementacion, VincularOrganizacion } from './VincularOrganizacion'
import type { FilaLista } from '@/features/clientes/vista'
import type { Atencion } from '@/features/clientes/vista'

const LABCENTRO = '266d4b37-a630-4782-9cc9-8cb054494211'

function filaCon(o: {
  organizacion?: string | null
  nombre?: string | null
  implementacion?: string
  atencion?: Atencion
}): FilaLista {
  return {
    suscripcion: {
      id: '11111111-1111-4111-8111-111111111111',
      estado: 'activa',
      sedes_adicionales: 0,
      precio_base_mensual: 80000,
      precio_sede_adicional: 60000,
      descuento_pct: 30,
      estado_implementacion: o.implementacion ?? 'cobrada',
      monto_implementacion: 250000,
      fecha_inicio: '2025-08-01',
      organizacion_externa_nombre: o.nombre ?? null,
      periodo_actual_inicio: '2025-08-01',
      periodo_actual_fin: '2026-07-31',
      organizacion_externa_id: o.organizacion ?? null,
      clientes: { id: 'c', nombre_comercial: 'LabCentro', es_prueba: true },
      productos: { codigo: 'g-vento', nombre: 'G-Vento', url_aplicar_estado: 'https://x' },
      planes: { codigo: 'esencial', nombre: 'Esencial' },
      terminos: { codigo: 'anual', meses: 12, descuento_pct: 30 },
    },
    montoCiclo: 672000,
    mensual: 56000,
    sugerencia: { nivel: 'activa', dias_para_cobro: null, regla: 'SIN_HISTORIAL' },
    bandera: { clase: 'sin_puente', sinConfirmar: 0 },
    cobertura: {
      cubierto_hasta: null,
      ultimo_pago: null,
      pagos_registrados: 0,
      proximo_cobro: null,
    },
    proximo_cobro: null,
    atencion: o.atencion ?? 'AL_DIA',
  } as FilaLista
}

function montar(nodo: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(<QueryClientProvider client={qc}>{nodo}</QueryClientProvider>)
}

describe('vincular una organización', () => {
  it('sin vincular: ofrece los dos campos y dice que el nombre se escribe', () => {
    const html = montar(<VincularOrganizacion fila={filaCon({})} />)
    expect(html).toContain('UUID de la organización')
    expect(html).toContain('Nombre, como figura en G-Vento')
    expect(html).toContain('escribí el nombre')
    expect(html).not.toContain('Corregir el vínculo')
  })

  it('ya vinculada: muestra a quién, y el formulario queda detrás de «corregir»', () => {
    const html = montar(
      <VincularOrganizacion fila={filaCon({ organizacion: LABCENTRO, nombre: 'LabCentro' })} />,
    )
    expect(html).toContain('LabCentro')
    expect(html).toContain(LABCENTRO)
    expect(html).toContain('Corregir el vínculo')
    // Lo que importa: el campo no está a la vista para pisarlo de un tipeo.
    expect(html).not.toContain('UUID de la organización')
  })

  it('ya vinculada sin nombre: lo dice en vez de mostrar un vacío', () => {
    // Pasa con las filas creadas antes de la `017`. Un espacio en blanco ahí
    // se lee como «no tiene organización», que es otra cosa.
    const html = montar(<VincularOrganizacion fila={filaCon({ organizacion: LABCENTRO })} />)
    expect(html).toContain('sin nombre registrado')
  })
})

describe('la implementación del aniversario', () => {
  it('no existe cuando no hay nada pendiente', () => {
    for (const e of ['pendiente', 'cobrada', 'exonerada']) {
      const html = montar(<Implementacion fila={filaCon({ implementacion: e })} />)
      expect(html, e).toBe('')
    }
  })

  it('condicional y sin cumplir el año: lo dice y NO ofrece el botón', () => {
    const html = montar(
      <Implementacion fila={filaCon({ implementacion: 'exonerada_condicional' })} />,
    )
    expect(html).toContain('Perdonada condicionalmente')
    expect(html).toContain('Todavía no cumplió el año')
    expect(html).not.toContain('Exonerar')
  })

  it('con el año cumplido: aparece el botón', () => {
    const html = montar(
      <Implementacion
        fila={filaCon({
          implementacion: 'exonerada_condicional',
          atencion: 'IMPLEMENTACION_POR_EXONERAR',
        })}
      />,
    )
    expect(html).toContain('Exonerar: cumplió el año')
  })
})
