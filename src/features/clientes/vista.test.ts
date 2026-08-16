/**
 * El criterio de atención y las dos vistas.
 *
 * Esto es decisión de producto, no de UI: qué significa "necesita atención" y
 * en qué prioridad. Vive en un módulo puro justamente para poder fijarlo acá
 * — la lección del 14/08 es que una regla metida en un archivo que no corre
 * en un test es una regla que nadie verifica.
 */
import { describe, it, expect } from 'vitest'
import {
  aplicarVista,
  ATENCION_DE_VISTA,
  clasificar,
  contarAtencion,
  ORDEN_ATENCION,
  SEVERIDAD,
  type Atencion,
  type EstadoBandera,
  type FilaLista,
} from './vista'
import { NIVELES, type EstadoComercial, type Nivel } from '@/lib/bandera'
import { SIN_COBERTURA, type Cobertura } from '@/lib/cobertura'

const HOY = '2026-08-16'

/** `clasificar` con el contexto que no cambia en la mayoría de los casos. */
const clasif = (
  sugerido: Nivel,
  b: EstadoBandera,
  estado: EstadoComercial = 'activa',
  cobertura: Cobertura = SIN_COBERTURA,
) => clasificar(sugerido, b, estado, cobertura, HOY)

// ── Constructores mínimos ─────────────────────────────────────────────────

const confirmada = (nivel: Nivel, sinConfirmar = 0): EstadoBandera => ({
  clase: 'confirmada',
  nivel,
  desde: '2026-08-14T00:00:00Z',
  cambioEfectivo: true,
  sinConfirmar,
})
const nunca = (sinConfirmar = 0): EstadoBandera => ({ clase: 'nunca', sinConfirmar })
const sinPuente = (): EstadoBandera => ({ clase: 'sin_puente', sinConfirmar: 0 })

let n = 0
function fila(o: {
  nombre?: string
  producto?: string
  estado?: string
  cobro?: string
  atencion: Atencion
}): FilaLista {
  n++
  return {
    suscripcion: {
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      estado: (o.estado ?? 'activa') as 'activa',
      sedes_adicionales: 0,
      precio_base_mensual: 80000,
      precio_sede_adicional: 60000,
      descuento_pct: 0,
      proximo_cobro: o.cobro ?? '2026-09-01',
      periodo_actual_inicio: '2026-08-01',
      periodo_actual_fin: '2026-08-31',
      organizacion_externa_id: '12b53bae-a4f7-4076-80f9-8f9288bd0567',
      clientes: { id: '11111111-1111-4111-8111-111111111111', nombre_comercial: o.nombre ?? 'Cliente', es_prueba: false },
      productos: { codigo: o.producto ?? 'g-vento', nombre: 'G-Vento', url_aplicar_estado: 'https://x' },
      planes: { codigo: 'esencial', nombre: 'Plan Esencial' },
      terminos: { codigo: 'mensual', meses: 1 },
    },
    montoCiclo: 80000,
    mensual: 80000,
    sugerencia: { nivel: 'activa', dias_para_cobro: 30, regla: 'ACTIVA_CON_MARGEN' },
    bandera: nunca(),
    cobertura: SIN_COBERTURA,
    atencion: o.atencion,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PRIORIDAD: COSTO DE NO MIRAR
// ═══════════════════════════════════════════════════════════════════════════
describe('clasificar', () => {
  it('lo aplicado MÁS restrictivo que lo decidido → REGRESION_APLICADA', () => {
    // El caso que importa: el cliente pagó, se lo devolvió a `activa`, y el
    // producto sigue en `restringida`. Está bloqueado y ya cumplió.
    expect(clasif('activa', confirmada('restringida'))).toBe('REGRESION_APLICADA')
    expect(clasif('gracia', confirmada('suspendida'))).toBe('REGRESION_APLICADA')
    expect(clasif('por_vencer', confirmada('gracia'))).toBe('REGRESION_APLICADA')
  })

  it('la regresión GANA sobre los intentos fallidos', () => {
    // Una fila puede estar restringiendo de más Y tener intentos que fallaron.
    // Lo que duele es lo primero: hay un cliente bloqueado ahora mismo.
    expect(clasif('activa', confirmada('suspendida', 3))).toBe('REGRESION_APLICADA')
  })

  it('intentos sin confirmar → SIN_CONFIRMAR', () => {
    expect(clasif('activa', confirmada('activa', 1))).toBe('SIN_CONFIRMAR')
    expect(clasif('gracia', nunca(2))).toBe('SIN_CONFIRMAR')
  })

  it('sin puente → SIN_PUENTE, aunque no haya nada pendiente', () => {
    expect(clasif('activa', sinPuente())).toBe('SIN_PUENTE')
    // Y no se disfraza de "falta escalar": no es que no se hizo, es que no
    // se puede hacer. Son problemas distintos con soluciones distintas.
    expect(clasif('suspendida', sinPuente())).toBe('SIN_PUENTE')
  })

  it('habría que escalar y no se escaló → FALTA_ESCALAR', () => {
    expect(clasif('gracia', confirmada('activa'))).toBe('FALTA_ESCALAR')
    expect(clasif('suspendida', confirmada('gracia'))).toBe('FALTA_ESCALAR')
  })

  it('una suscripción que NUNCA se sincronizó y debería estar activa NO grita', () => {
    // El producto arranca en su default, que es `active` (§6). Tratarla como
    // desconocida haría que todo cliente nuevo apareciera como problema.
    expect(clasif('activa', nunca())).toBe('AL_DIA')
  })

  it('pero si nunca se sincronizó y debería estar restringida, SÍ grita', () => {
    expect(clasif('restringida', nunca())).toBe('FALTA_ESCALAR')
  })

  it('por_vencer sin nada pendiente → POR_VENCER', () => {
    expect(clasif('por_vencer', confirmada('por_vencer'))).toBe('POR_VENCER')
  })

  it('todo en su lugar → AL_DIA', () => {
    expect(clasif('activa', confirmada('activa'))).toBe('AL_DIA')
    expect(clasif('gracia', confirmada('gracia'))).toBe('AL_DIA')
    expect(clasif('suspendida', confirmada('suspendida'))).toBe('AL_DIA')
  })

  it('devuelve siempre una categoría conocida, para toda combinación', () => {
    const banderas = [
      ...NIVELES.map((nv) => confirmada(nv)),
      ...NIVELES.map((nv) => confirmada(nv, 2)),
      nunca(),
      nunca(1),
      sinPuente(),
    ]
    for (const sugerido of NIVELES) {
      for (const b of banderas) {
        expect(ORDEN_ATENCION).toContain(clasif(sugerido, b))
      }
    }
  })

  it('las siete categorías son alcanzables: ninguna es código muerto', () => {
    const vistas = new Set<Atencion>()
    const banderas = [
      ...NIVELES.map((nv) => confirmada(nv)),
      ...NIVELES.map((nv) => confirmada(nv, 1)),
      nunca(),
      sinPuente(),
    ]
    const estados: EstadoComercial[] = ['activa', 'gracia', 'suspendida', 'cancelada']
    const cobs: Cobertura[] = [
      SIN_COBERTURA,
      { cubierto_hasta: '2026-12-31', ultimo_pago: '2026-08-01', pagos_registrados: 1 },
    ]
    for (const sugerido of NIVELES)
      for (const b of banderas)
        for (const e of estados)
          for (const c of cobs) vistas.add(clasificar(sugerido, b, e, c, HOY))
    expect(vistas.size).toBe(ORDEN_ATENCION.length)
  })

  it('PAGO_SIN_REACTIVAR gana sobre TODO lo demás', () => {
    // Es la única categoría cuya evidencia está entera de nuestro lado: el
    // pago está en nuestra base. Aunque además la bandera esté sin confirmar
    // o restringiendo de más, lo que hay que arreglar primero es esto —
    // y se arregla en un clic, sin depender del otro sistema.
    const pago: Cobertura = {
      cubierto_hasta: '2026-12-31',
      ultimo_pago: '2026-08-01',
      pagos_registrados: 1,
    }
    for (const b of [confirmada('suspendida'), confirmada('activa', 3), nunca(2), sinPuente()]) {
      expect(clasificar('activa', b, 'gracia', pago, HOY)).toBe('PAGO_SIN_REACTIVAR')
    }
  })

  it('sin pago que cubra, el estado gracia no cambia nada', () => {
    expect(clasificar('gracia', confirmada('gracia'), 'gracia', SIN_COBERTURA, HOY)).toBe('AL_DIA')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LA DECISIÓN DISCUTIBLE, FIJADA
// ═══════════════════════════════════════════════════════════════════════════
describe('perjudicar a quien pagó pesa más que no cobrarle a quien debe', () => {
  it('REGRESION_APLICADA va antes que FALTA_ESCALAR', () => {
    // Es la parte contraintuitiva del criterio: cobrar es la razón de existir
    // del panel, y aun así "un cliente que pagó sigue bloqueado" gana sobre
    // "un moroso no está restringido". Si alguien invierte esto, este test
    // tiene que fallar y obligar a discutirlo.
    expect(ORDEN_ATENCION.indexOf('REGRESION_APLICADA')).toBeLessThan(
      ORDEN_ATENCION.indexOf('FALTA_ESCALAR'),
    )
  })

  it('el orden completo es el aprobado', () => {
    expect(ORDEN_ATENCION).toEqual([
      'PAGO_SIN_REACTIVAR',
      'REGRESION_APLICADA',
      'SIN_CONFIRMAR',
      'SIN_PUENTE',
      'FALTA_ESCALAR',
      'POR_VENCER',
      'AL_DIA',
    ])
  })

  it('la severidad de los niveles es la escalera de §4', () => {
    expect(SEVERIDAD.activa).toBeLessThan(SEVERIDAD.por_vencer)
    expect(SEVERIDAD.por_vencer).toBeLessThan(SEVERIDAD.gracia)
    expect(SEVERIDAD.gracia).toBeLessThan(SEVERIDAD.restringida)
    expect(SEVERIDAD.restringida).toBeLessThan(SEVERIDAD.suspendida)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LAS DOS VISTAS
// ═══════════════════════════════════════════════════════════════════════════
describe('aplicarVista', () => {
  const todas = (): FilaLista[] => [
    fila({ nombre: 'AlDia', atencion: 'AL_DIA' }),
    fila({ nombre: 'Vence', atencion: 'POR_VENCER', cobro: '2026-08-20' }),
    fila({ nombre: 'Escalar', atencion: 'FALTA_ESCALAR', cobro: '2026-08-16' }),
    fila({ nombre: 'SinPuente', atencion: 'SIN_PUENTE' }),
    fila({ nombre: 'Pendiente', atencion: 'SIN_CONFIRMAR' }),
    fila({ nombre: 'Regresion', atencion: 'REGRESION_APLICADA' }),
  ]
  const base = { busqueda: '', estado: '', mostrarPrueba: true }
  const nombres = (f: FilaLista[]) => f.map((x) => x.suscripcion.clientes.nombre_comercial)

  it('«hoy» muestra sólo las tres primeras categorías, lo peor arriba', () => {
    expect(nombres(aplicarVista(todas(), { ...base, vista: 'hoy' }))).toEqual([
      'Regresion',
      'Pendiente',
      'SinPuente',
    ])
  })

  it('«facturación» muestra las dos de cobranza, ORDENADAS POR FECHA', () => {
    // No por gravedad: la tarea es recorrer todo lo que vence sin saltearse
    // ninguno, y reordenar por prioridad rompe el recorrido.
    const r = aplicarVista(todas(), { ...base, vista: 'facturacion' })
    expect(nombres(r)).toEqual(['Escalar', 'Vence'])
    expect(r[0].suscripcion.proximo_cobro < r[1].suscripcion.proximo_cobro).toBe(true)
  })

  it('«facturación» NO reordena por prioridad aunque una sea más grave', () => {
    // `FALTA_ESCALAR` es más grave que `POR_VENCER`, pero si vence después,
    // va después.
    const filas = [
      fila({ nombre: 'GraveTarde', atencion: 'FALTA_ESCALAR', cobro: '2026-12-01' }),
      fila({ nombre: 'LeveTemprano', atencion: 'POR_VENCER', cobro: '2026-08-15' }),
    ]
    expect(nombres(aplicarVista(filas, { ...base, vista: 'facturacion' }))).toEqual([
      'LeveTemprano',
      'GraveTarde',
    ])
  })

  it('«todas» no filtra nada y ordena por prioridad', () => {
    const r = aplicarVista(todas(), { ...base, vista: 'todas' })
    expect(r).toHaveLength(6)
    expect(nombres(r)[0]).toBe('Regresion')
    expect(nombres(r)[5]).toBe('AlDia')
  })

  it('las dos vistas de trabajo no se solapan y cubren todo', () => {
    const hoy = ATENCION_DE_VISTA.hoy!
    const fact = ATENCION_DE_VISTA.facturacion!
    expect(hoy.filter((a) => fact.includes(a))).toEqual([])
    expect([...hoy, ...fact, 'AL_DIA' as Atencion].sort()).toEqual([...ORDEN_ATENCION].sort())
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// BÚSQUEDA
// ═══════════════════════════════════════════════════════════════════════════
describe('búsqueda', () => {
  const filas = [
    fila({ nombre: 'Salchimeló', atencion: 'AL_DIA' }),
    fila({ nombre: 'G-10', atencion: 'REGRESION_APLICADA' }),
    fila({ nombre: 'Otro', producto: 'g-mura', atencion: 'AL_DIA' }),
  ]
  const nombres = (f: FilaLista[]) => f.map((x) => x.suscripcion.clientes.nombre_comercial)

  it('IGNORA la vista: encuentra algo al día desde «hoy»', () => {
    // Si respetara la vista, la caja devolvería vacío por una razón que no se
    // ve en pantalla — y el usuario concluiría que el cliente no existe.
    expect(nombres(aplicarVista(filas, { vista: 'hoy', busqueda: 'salchi', estado: '', mostrarPrueba: true }))).toEqual([
      'Salchimeló',
    ])
  })

  it('ignora tildes y mayúsculas', () => {
    for (const q of ['SALCHIMELO', 'salchimeló', 'Salchimelo']) {
      expect(aplicarVista(filas, { vista: 'todas', busqueda: q, estado: '', mostrarPrueba: true })).toHaveLength(1)
    }
  })

  it('también busca por producto', () => {
    expect(nombres(aplicarVista(filas, { vista: 'todas', busqueda: 'g-mura', estado: '', mostrarPrueba: true }))).toEqual([
      'Otro',
    ])
  })

  it('sin coincidencias devuelve vacío, no todo', () => {
    expect(aplicarVista(filas, { vista: 'todas', busqueda: 'zzz', estado: '', mostrarPrueba: true })).toHaveLength(0)
  })

  it('el filtro de estado se aplica junto con la búsqueda', () => {
    const r = aplicarVista(filas, { vista: 'todas', busqueda: '', estado: 'gracia', mostrarPrueba: true })
    expect(r).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EL CONTADOR NO PUEDE AFIRMAR SOBRE LO QUE NO MIRÓ
// ═══════════════════════════════════════════════════════════════════════════
describe('los tenants de prueba se ocultan sin desaparecer del conteo', () => {
  const conLab = (): FilaLista[] => {
    const normal = fila({ nombre: 'G-10', atencion: 'AL_DIA' })
    const lab = fila({ nombre: 'LAB', atencion: 'REGRESION_APLICADA' })
    lab.suscripcion.clientes.es_prueba = true
    return [normal, lab]
  }

  it('con el interruptor apagado LAB no se lista', () => {
    const r = aplicarVista(conLab(), {
      vista: 'todas',
      busqueda: '',
      estado: '',
      mostrarPrueba: false,
    })
    expect(r.map((x) => x.suscripcion.clientes.nombre_comercial)).toEqual(['G-10'])
  })

  it('pero el contador lo reporta como OCULTO, no como inexistente', () => {
    // El bug de la auditoría del 16/08: con LAB roto y el interruptor apagado,
    // la pantalla decía "nada que atender". Afirmaba sobre un conjunto que no
    // había mirado — el modo de fallo silencioso que el proyecto evita.
    expect(contarAtencion(conLab(), false)).toEqual({ visibles: 0, ocultos: 1 })
  })

  it('con el interruptor encendido pasa a visible y no queda oculto nada', () => {
    expect(contarAtencion(conLab(), true)).toEqual({ visibles: 1, ocultos: 0 })
  })

  it('un tenant de prueba SIN problemas no se anuncia como oculto', () => {
    const lab = fila({ nombre: 'LAB', atencion: 'AL_DIA' })
    lab.suscripcion.clientes.es_prueba = true
    expect(contarAtencion([lab], false)).toEqual({ visibles: 0, ocultos: 0 })
  })

  it('la búsqueda tampoco resucita un tenant de prueba oculto', () => {
    // Si no, el interruptor sería una sugerencia y no un filtro.
    const r = aplicarVista(conLab(), {
      vista: 'todas',
      busqueda: 'LAB',
      estado: '',
      mostrarPrueba: false,
    })
    expect(r).toHaveLength(0)
  })
})

describe('contarAtencion', () => {
  it('cuenta sólo lo de la vista «hoy», sin importar la vista activa', () => {
    const filas = [
      fila({ atencion: 'REGRESION_APLICADA' }),
      fila({ atencion: 'SIN_CONFIRMAR' }),
      fila({ atencion: 'SIN_PUENTE' }),
      fila({ atencion: 'FALTA_ESCALAR' }),
      fila({ atencion: 'POR_VENCER' }),
      fila({ atencion: 'AL_DIA' }),
    ]
    expect(contarAtencion(filas, true)).toEqual({ visibles: 3, ocultos: 0 })
  })

  it('cero cuando no hay nada que atender', () => {
    expect(contarAtencion([fila({ atencion: 'AL_DIA' })], true)).toEqual({ visibles: 0, ocultos: 0 })
  })
})
