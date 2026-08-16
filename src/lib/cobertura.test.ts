/**
 * El hueco entre registrar un pago y reactivar.
 *
 * Es una regla de producto, no de UI, y la consecuencia de que falle es un
 * cliente al día con un banner de cobranza en la pantalla de venta. Va con
 * tests por la misma razón que el criterio de atención de la lista.
 */
import { describe, it, expect } from 'vitest'
import {
  estaCubierto,
  pagoSinReactivar,
  sugerirReactivacion,
  SIN_COBERTURA,
  type Cobertura,
} from './cobertura'
import type { EstadoComercial } from './bandera'

const HOY = '2026-08-16'
const cob = (hasta: string | null): Cobertura => ({
  cubierto_hasta: hasta,
  ultimo_pago: '2026-08-01',
  pagos_registrados: 1,
})

describe('estaCubierto', () => {
  it('el día exacto de cubre_hasta CUENTA como cubierto', () => {
    // Igual que `periodo_actual_fin` en §4: es el último día pago, no el
    // primero impago. Cortar un día antes dispara un banner que no
    // correspondía, y ese día es justo el del vencimiento.
    expect(estaCubierto(cob(HOY), HOY)).toBe(true)
  })

  it('un día después ya no', () => {
    expect(estaCubierto(cob('2026-08-15'), HOY)).toBe(false)
  })

  it('una fecha futura sí', () => {
    expect(estaCubierto(cob('2026-12-31'), HOY)).toBe(true)
  })

  it('sin pagos no está cubierto — y eso no es lo mismo que pagar 0', () => {
    expect(estaCubierto(SIN_COBERTURA, HOY)).toBe(false)
  })

  it('un pago sin cubre_hasta (un ajuste) no cubre nada', () => {
    expect(estaCubierto(cob(null), HOY)).toBe(false)
  })

  it('cruzar el fin de mes no corre el borde', () => {
    expect(estaCubierto(cob('2026-08-31'), '2026-08-31')).toBe(true)
    expect(estaCubierto(cob('2026-08-31'), '2026-09-01')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LA ANOMALÍA: PAGÓ Y SIGUE RESTRINGIDO
// ═══════════════════════════════════════════════════════════════════════════
describe('pagoSinReactivar', () => {
  it('gracia con la plata al día ES anomalía', () => {
    expect(pagoSinReactivar('gracia', cob('2026-09-30'), HOY)).toBe(true)
  })

  it('suspendida con la plata al día ES anomalía', () => {
    expect(pagoSinReactivar('suspendida', cob('2026-09-30'), HOY)).toBe(true)
  })

  it('activa nunca es anomalía, esté como esté la plata', () => {
    expect(pagoSinReactivar('activa', cob('2026-09-30'), HOY)).toBe(false)
    expect(pagoSinReactivar('activa', SIN_COBERTURA, HOY)).toBe(false)
  })

  it('CANCELADA con cobertura vigente NO es anomalía', () => {
    // Un contrato cancelado con plata sin consumir es §9.3: el cliente se fue
    // antes de gastarla, y eso ni se le cobra ni se le devuelve. Reactivarlo
    // sería revivir un contrato que alguien terminó a propósito.
    expect(pagoSinReactivar('cancelada', cob('2026-12-31'), HOY)).toBe(false)
  })

  it('gracia SIN pago no es anomalía: es un moroso, que es el caso normal', () => {
    expect(pagoSinReactivar('gracia', SIN_COBERTURA, HOY)).toBe(false)
    expect(pagoSinReactivar('gracia', cob('2026-07-31'), HOY)).toBe(false)
  })

  it('el borde: cubierto justo hasta hoy sigue siendo anomalía', () => {
    expect(pagoSinReactivar('gracia', cob(HOY), HOY)).toBe(true)
    expect(pagoSinReactivar('gracia', cob('2026-08-15'), HOY)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LA OFERTA EN EL MOMENTO DE REGISTRAR
// ═══════════════════════════════════════════════════════════════════════════
describe('sugerirReactivacion', () => {
  it('desde gracia, con un pago que llega hasta hoy o más: ofrece y viene MARCADA', () => {
    const r = sugerirReactivacion('gracia', '2026-09-30', HOY)
    expect(r).toEqual({ ofrecer: true, marcada: true, motivo: 'CUBIERTO_Y_RESTRINGIDO' })
  })

  it('desde suspendida, igual', () => {
    expect(sugerirReactivacion('suspendida', '2026-09-30', HOY).marcada).toBe(true)
  })

  it('si el pago no alcanza a cubrir hasta hoy, NO se ofrece', () => {
    // Un pago parcial que cubre hasta el mes pasado no reactiva nada. Ofrecerlo
    // marcado convertiría "registré lo que entró" en "lo puse al día".
    const r = sugerirReactivacion('gracia', '2026-07-31', HOY)
    expect(r).toEqual({ ofrecer: false, marcada: false, motivo: 'NO_ALCANZA' })
  })

  it('un pago sin cubre_hasta no ofrece nada', () => {
    expect(sugerirReactivacion('gracia', null, HOY).ofrecer).toBe(false)
  })

  it('si ya está activa no hay nada que ofrecer', () => {
    expect(sugerirReactivacion('activa', '2026-12-31', HOY).motivo).toBe('YA_ACTIVA')
  })

  it('cancelada no se reactiva de paso', () => {
    expect(sugerirReactivacion('cancelada', '2026-12-31', HOY)).toEqual({
      ofrecer: false,
      marcada: false,
      motivo: 'CANCELADA',
    })
  })

  it('NUNCA devuelve marcada sin ofrecer: sería un cambio invisible', () => {
    // La casilla marcada es la que aplica el cambio. Marcada + no ofrecida
    // sería un `activa` viajando al producto sin que nadie lo viera, que es
    // exactamente lo que §4 prohíbe.
    const estados: EstadoComercial[] = ['activa', 'gracia', 'suspendida', 'cancelada']
    const fechas = [null, '2026-01-01', '2026-08-15', HOY, '2026-12-31']
    for (const e of estados) {
      for (const f of fechas) {
        const r = sugerirReactivacion(e, f, HOY)
        if (r.marcada) expect(r.ofrecer).toBe(true)
      }
    }
  })

  it('la oferta y la anomalía usan el MISMO criterio', () => {
    // Si divergieran, la pantalla 2 podría no ofrecer reactivar y la lista
    // marcar la fila como anomalía acto seguido — o al revés, que es peor.
    const estados: EstadoComercial[] = ['gracia', 'suspendida']
    for (const e of estados) {
      for (const f of ['2026-08-15', HOY, '2026-12-31']) {
        const ofrece = sugerirReactivacion(e, f, HOY).ofrecer
        const anomalia = pagoSinReactivar(e, cob(f), HOY)
        expect(ofrece).toBe(anomalia)
      }
    }
  })
})
