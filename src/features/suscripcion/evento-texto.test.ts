/**
 * Modos de fallo que atrapa:
 *
 * · **Que dos eventos distintos se vean iguales.** Es el que se vio en vivo:
 *   cinco `ORGANIZACION_VINCULADA` seguidos, indistinguibles, sobre la única
 *   operación que puede mandarle la bandera al cliente equivocado.
 * · **Que un evento con forma desconocida se muestre como si no tuviera
 *   nada.** Esconder lo que no se entiende deja el historial diciendo «no
 *   pasó nada» sobre algo que sí pasó.
 * · **Que un valor ausente se lea como un valor.** Un nombre anterior en
 *   `null` es «no había», no un nombre vacío.
 */
import { describe, it, expect } from 'vitest'
import { detalleDeEvento } from './evento-texto'
// `pesos` mete un espacio DURO entre el signo y el número, así que las
// expectativas se arman con la misma función en vez de tipear el espacio.
import { pesos } from '@/lib/formato'

const junto = (tipo: string, datos: unknown) =>
  detalleDeEvento(tipo, datos)
    .map((r) => r.texto)
    .join(' | ')

describe('vincular una organización', () => {
  it('la primera vez dice que antes no había', () => {
    expect(
      junto('ORGANIZACION_VINCULADA', {
        anterior: null,
        nueva: '266d4b37-a630-4782-9cc9-8cb054494211',
        nombre_anterior: null,
        nombre_nueva: 'LabCentro',
      }),
    ).toBe('— → LabCentro | — → 266d4b37-a630-4782-9cc9-8cb054494211')
  })

  it('una corrección muestra los dos nombres Y los dos UUID', () => {
    // Los dos, no uno: la pregunta del día malo es qué creía quien vinculó Y
    // qué creía quien corrigió.
    const r = junto('ORGANIZACION_VINCULADA', {
      anterior: '11111111-1111-4111-8111-111111111111',
      nueva: '266d4b37-a630-4782-9cc9-8cb054494211',
      nombre_anterior: 'Mal Copiado',
      nombre_nueva: 'LabCentro',
    })
    expect(r).toContain('Mal Copiado → LabCentro')
    expect(r).toContain('11111111-1111-4111-8111-111111111111')
    expect(r).toContain('266d4b37-a630-4782-9cc9-8cb054494211')
  })

  it('el UUID va completo: abreviar convierte la auditoría en un parecido', () => {
    const r = detalleDeEvento('ORGANIZACION_VINCULADA', {
      anterior: null,
      nueva: '266d4b37-a630-4782-9cc9-8cb054494211',
      nombre_anterior: null,
      nombre_nueva: 'LabCentro',
    })
    expect(r[1].texto).toContain('266d4b37-a630-4782-9cc9-8cb054494211')
    expect(r[1].mono).toBe(true)
  })
})

describe('la implementación', () => {
  it('dice de dónde a dónde y de cuánto', () => {
    expect(
      junto('IMPLEMENTACION_ACTUALIZADA', {
        anterior: 'exonerada_condicional',
        nuevo: 'exonerada',
        monto: 250000,
      }),
    ).toBe(`exonerada_condicional → exonerada · ${pesos(250000)}`)
  })

  it('sin monto, igual dice el cambio', () => {
    expect(
      junto('IMPLEMENTACION_ACTUALIZADA', { anterior: 'pendiente', nuevo: 'cobrada' }),
    ).toBe('pendiente → cobrada')
  })
})

describe('la firma', () => {
  const foto = {
    plan_id: 'bb000000-0000-4000-8000-000000000001',
    termino: 'anual',
    sedes_adicionales: 0,
    precio_base_mensual: 80000,
    precio_sede_adicional: 60000,
    descuento_pct: 30,
    monto_implementacion: 250000,
    fecha_inicio: '2025-08-01',
    estado_implementacion: 'exonerada_condicional',
  }

  it('muestra lo que quedó congelado', () => {
    const r = junto('CREADA', foto)
    expect(r).toContain('anual')
    expect(r).toContain(`${pesos(80000)}/mes`)
    expect(r).toContain('30% de descuento')
    expect(r).toContain(`implementación ${pesos(250000)}`)
  })

  it('no muestra el plan_id: un UUID ahí es ruido', () => {
    // El plan está en el encabezado de la pantalla. Lo que este renglón tiene
    // que contestar es «cuánta plata se congeló».
    expect(junto('CREADA', foto)).not.toContain('bb000000')
  })

  it('lo que vale cero no ocupa lugar', () => {
    const r = junto('CREADA', { ...foto, sedes_adicionales: 0, descuento_pct: 0 })
    expect(r).not.toContain('0 sede')
    expect(r).not.toContain('0% de descuento')
  })

  it('las sedes se muestran con su precio cuando las hay', () => {
    expect(junto('CREADA', { ...foto, sedes_adicionales: 2 })).toContain(
      `2 sedes a ${pesos(60000)}`,
    )
  })
})

describe('lo que no se entiende NO se esconde', () => {
  it('un tipo desconocido con datos muestra el JSON crudo', () => {
    const r = detalleDeEvento('CAMBIO_PLAN', { saldo_a_favor: 12345 })
    expect(r[0].texto).toContain('saldo_a_favor')
    expect(r[0].mono).toBe(true)
  })

  it('sin datos no inventa un renglón vacío', () => {
    expect(detalleDeEvento('A_GRACIA', null)).toEqual([])
    expect(detalleDeEvento('CREADA', 'no soy un objeto')).toEqual([])
  })
})
