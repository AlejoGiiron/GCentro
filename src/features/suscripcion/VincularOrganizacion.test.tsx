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
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Implementacion, VincularOrganizacion } from './VincularOrganizacion'
import type { FilaLista } from '@/features/clientes/vista'
import type { Atencion } from '@/features/clientes/vista'

const LABCENTRO = '266d4b37-a630-4782-9cc9-8cb054494211'

// El borde se falsea acá y no se toca la red: lo que se prueba es la PANTALLA
// —qué hace cuando la RPC contesta bien—, no la RPC, que ya la prueba el
// bloque de verificación de la `017` contra la base.
const rpc = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

function filaCon(o: {
  organizacion?: string | null
  nombre?: string | null
  implementacion?: string
  inicio?: string
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
      fecha_inicio: o.inicio ?? '2025-08-01',
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

  it('sin cumplir el año: NO ofrece el botón, y dice CUÁNDO lo cumple', () => {
    // Decir la fecha en vez de «todavía no» convierte un no en una respuesta:
    // el operador sabe si volver mañana o el año que viene.
    const html = montar(
      <Implementacion
        fila={filaCon({ implementacion: 'exonerada_condicional', inicio: '2026-08-01' })}
      />,
    )
    expect(html).toContain('Perdonada condicionalmente')
    expect(html).toContain('Cumple los doce meses el')
    expect(html).toContain('2027')
    expect(html).not.toContain('Exonerar')
  })

  it('con el año cumplido: aparece el botón', () => {
    const html = montar(
      <Implementacion
        fila={filaCon({ implementacion: 'exonerada_condicional', inicio: '2025-08-01' })}
      />,
    )
    expect(html).toContain('Exonerar: cumplió el año')
  })

  it('el botón NO depende de la atención de la lista', () => {
    // `atencion` es la prioridad en la lista: una sola por fila, la peor que
    // haya. Un contrato que cumplió el año y además está sin puente o sin
    // pagos tiene que poder exonerarse igual — la exoneración no depende de
    // ninguna de esas dos cosas.
    const html = montar(
      <Implementacion
        fila={filaCon({
          implementacion: 'exonerada_condicional',
          inicio: '2025-08-01',
          atencion: 'SIN_HISTORIAL',
        })}
      />,
    )
    expect(html).toContain('Exonerar: cumplió el año')
  })
})

describe('el camino de corregir, apretando de verdad', () => {
  /**
   * ⚠️ ESTOS TESTS SÍ HACEN CLIC, y son los primeros del repo que lo hacen.
   *
   * Se escribieron después de un reporte —«el botón corregir el vínculo no
   * hace nada»— que ninguno de los `renderToString` de arriba podía atrapar:
   * todos miran el PRIMER render, y el defecto vivía en el segundo.
   *
   * Lo que estaba mal no era el clic: era que el botón que ABRE el formulario
   * y el que GUARDA se llamaban igual, y el de guardar quedaba deshabilitado
   * sin decir qué faltaba. Las dos cosas juntas se leen como «no hace nada».
   */
  function montarVivo(fila: FilaLista) {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    act(() => {
      createRoot(div).render(
        <QueryClientProvider client={qc}>
          <VincularOrganizacion fila={fila} />
        </QueryClientProvider>,
      )
    })
    const clic = (texto: string) => {
      const b = [...div.querySelectorAll('button')].find((x) => x.textContent?.includes(texto))
      if (!b) throw new Error(`no hay boton "${texto}" — hay: ${[...div.querySelectorAll('button')].map((x) => x.textContent).join(' | ')}`)
      act(() => {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }
    return { div, clic }
  }

  const vinculada = () => filaCon({ organizacion: LABCENTRO, nombre: 'Mal Copiado' })

  it('el clic abre el formulario', () => {
    const { div, clic } = montarVivo(vinculada())
    expect(div.querySelector('#org_uuid')).toBeNull()
    clic('Corregir el vínculo')
    expect(div.querySelector('#org_uuid')).not.toBeNull()
    expect(div.querySelector('#org_motivo')).not.toBeNull()
  })

  it('los dos botones NO se llaman igual', () => {
    // Con la misma etiqueta, un reporte de «el botón no anda» es imposible de
    // ubicar, y quien lo aprieta cree que apretó el que abre.
    const { div, clic } = montarVivo(vinculada())
    clic('Corregir el vínculo')
    const etiquetas = [...div.querySelectorAll('button')].map((b) => b.textContent)
    expect(new Set(etiquetas).size).toBe(etiquetas.length)
    expect(etiquetas).toContain('Guardar la corrección')
  })

  it('el botón de guardar dice qué le falta en vez de quedarse mudo', () => {
    const { div, clic } = montarVivo(vinculada())
    clic('Corregir el vínculo')
    const guardar = [...div.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Guardar'),
    ) as HTMLButtonElement
    expect(guardar.disabled).toBe(true)
    expect(div.textContent).toContain('Falta el UUID')
  })
})

describe('cuando la corrección sale bien, la pantalla lo dice', () => {
  /**
   * ⚠️ EL MODO DE FALLO QUE REPORTÓ EL OPERADOR (20/08/2026):
   *
   * «Corrigió, pero como que no se actualizaba: seguía en la pantallita de
   * poner el UUID, el nombre y la observación.»
   *
   * La corrección SÍ se había guardado. Lo que faltaba era que el formulario
   * se cerrara y que algo dijera que terminó — con los mismos valores todavía
   * en los campos, la única lectura posible es que no pasó nada, y lo
   * siguiente que hace cualquiera es volver a apretar.
   *
   * Ninguno de los `renderToString` podía atraparlo: todos miran el primer
   * render, y esto vive tres renders después.
   */
  function escribir(input: HTMLInputElement, valor: string) {
    // React escucha el evento nativo sobre el value setter del prototipo; sin
    // esto, asignar `.value` no dispara el onChange.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(input, valor)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('cierra el formulario, lo limpia y avisa', async () => {
    rpc.mockClear()
    const div = document.createElement('div')
    document.body.appendChild(div)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    act(() => {
      createRoot(div).render(
        <QueryClientProvider client={qc}>
          <VincularOrganizacion fila={filaCon({ organizacion: LABCENTRO, nombre: 'Mal Copiado' })} />
        </QueryClientProvider>,
      )
    })

    const clic = (texto: string) => {
      const b = [...div.querySelectorAll('button')].find((x) => x.textContent?.includes(texto))!
      act(() => {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }

    clic('Corregir el vínculo')
    escribir(div.querySelector('#org_uuid') as HTMLInputElement, LABCENTRO)
    escribir(div.querySelector('#org_nombre') as HTMLInputElement, 'LabCentro')
    escribir(div.querySelector('#org_motivo') as HTMLInputElement, 'el UUID era de otra')

    await act(async () => {
      const b = [...div.querySelectorAll('button')].find((x) =>
        x.textContent?.includes('Guardar'),
      )!
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rpc).toHaveBeenCalledWith(
      'corregir_organizacion_externa',
      expect.objectContaining({ p_nombre: 'LabCentro', p_motivo: 'el UUID era de otra' }),
    )
    // Lo que faltaba: cerrarse, limpiarse y decirlo.
    expect(div.querySelector('#org_uuid'), 'el formulario quedó abierto').toBeNull()
    expect(div.textContent).toContain('Vínculo guardado')
  })
})
