import { describe, it, expect } from 'vitest'
import {
  mensualEfectivo,
  diasDelPeriodo,
  diasRestantes,
  calcularCambioDePlan,
  datosDelEvento,
  implementacionAlFirmar,
  transicionImplementacion,
  type TarifaSuscripcion,
} from './cobro'

/**
 * El principio que verifican estos tests: LA PLATA PAGADA CONSERVA SU VALOR.
 *
 * No alcanza con que las cuentas den. Lo que se verifica es que ningún camino
 * le haga perder plata al cliente ni se la regale a la casa por un borde de
 * calendario — que es donde estos modelos se rompen.
 */

// ── Catálogo vigente (004-seed-planes.sql) ────────────────────────────────
const ESENCIAL = { base: 80000, sede: 60000 }
const PROFESIONAL = { base: 130000, sede: 90000 }
const TERMINOS = { mensual: { meses: 1, desc: 0 }, semestral: { meses: 6, desc: 10 }, anual: { meses: 12, desc: 30 } }

const tarifa = (
  base: number,
  sede: number,
  sedes: number,
  t: { meses: number; desc: number },
): TarifaSuscripcion => ({
  precio_base_mensual: base,
  precio_sede_adicional: sede,
  sedes_adicionales: sedes,
  descuento_pct: t.desc,
  termino_meses: t.meses,
})

describe('mensualEfectivo — la tabla de precios del catálogo', () => {
  const casos: [string, number, number, number][] = [
    // [etiqueta, base, descuento_pct, esperado]  — valores dados en el Bloque 2
    ['Esencial mensual', ESENCIAL.base, 0, 80000],
    ['Esencial semestral', ESENCIAL.base, 10, 72000],
    ['Esencial anual', ESENCIAL.base, 30, 56000],
    ['Profesional mensual', PROFESIONAL.base, 0, 130000],
    ['Profesional semestral', PROFESIONAL.base, 10, 117000],
    ['Profesional anual', PROFESIONAL.base, 30, 91000],
  ]

  for (const [etiqueta, base, desc, esperado] of casos) {
    it(etiqueta, () => {
      expect(mensualEfectivo(tarifa(base, 0, 0, { meses: 1, desc }))).toBe(esperado)
    })
  }

  const casosSede: [string, number, number, number][] = [
    ['Sede Esencial mensual', ESENCIAL.sede, 0, 60000],
    ['Sede Esencial semestral', ESENCIAL.sede, 10, 54000],
    ['Sede Esencial anual', ESENCIAL.sede, 30, 42000],
    ['Sede Profesional mensual', PROFESIONAL.sede, 0, 90000],
    ['Sede Profesional semestral', PROFESIONAL.sede, 10, 81000],
    ['Sede Profesional anual', PROFESIONAL.sede, 30, 63000],
  ]

  for (const [etiqueta, sede, desc, esperado] of casosSede) {
    it(etiqueta, () => {
      // Una sede sola: base 0, una unidad de sede.
      expect(mensualEfectivo(tarifa(0, sede, 1, { meses: 1, desc }))).toBe(esperado)
    })
  }

  it('el descuento se aplica sobre el TOTAL, no solo sobre el plan', () => {
    // Esencial anual + 2 sedes: (80.000 + 120.000) × 0,70
    expect(mensualEfectivo(tarifa(ESENCIAL.base, ESENCIAL.sede, 2, TERMINOS.anual))).toBe(140000)
  })

  it('el catálogo NO necesita regla de redondeo', () => {
    // La afirmación que justifica que no haya política de redondeo escrita.
    // Si un precio de lista futuro rompe esto, se cae acá y no en una factura.
    const bases = [ESENCIAL.base, ESENCIAL.sede, PROFESIONAL.base, PROFESIONAL.sede]
    for (const base of bases) {
      for (const t of Object.values(TERMINOS)) {
        const exacto = (base * (100 - t.desc)) / 100
        expect(Number.isInteger(exacto)).toBe(true)
      }
    }
  })
})

describe('días — el período es cerrado en ambos extremos', () => {
  it('agosto completo son 31 días, no 30', () => {
    expect(diasDelPeriodo('2026-08-01', '2026-08-31')).toBe(31)
  })

  it('un cambio el día 1 conserva el período entero', () => {
    expect(diasRestantes('2026-08-01', '2026-08-31')).toBe(31)
  })

  it('un cambio el ÚLTIMO día conserva 1 día, no 0', () => {
    // Sin el borde inclusivo el cliente perdería el día que ya pagó.
    expect(diasRestantes('2026-08-31', '2026-08-31')).toBe(1)
  })

  it('un año bisiesto cuenta 366 días', () => {
    expect(diasDelPeriodo('2028-01-01', '2028-12-31')).toBe(366)
  })
})

// ── Escenario base del Bloque 2: anual, cambio en el mes 5 ────────────────
// Período anual real: 2026-01-01 → 2026-12-31 (365 días).
// Cambio el 2026-06-01 → quedan 214 días (junio a diciembre, inclusive).
const PERIODO_ANUAL = { periodo_actual_inicio: '2026-01-01', periodo_actual_fin: '2026-12-31' }
const CAMBIO = '2026-06-01'

describe('upgrade — se paga la diferencia, la fecha no se mueve', () => {
  const esencialAnual = tarifa(ESENCIAL.base, ESENCIAL.sede, 0, TERMINOS.anual)
  const profesionalAnual = tarifa(PROFESIONAL.base, PROFESIONAL.sede, 0, TERMINOS.anual)

  it('cobra solo la diferencia por los días que quedan', () => {
    const r = calcularCambioDePlan(esencialAnual, profesionalAnual, PERIODO_ANUAL, CAMBIO)

    expect(r.tipo).toBe('upgrade')
    expect(r.mensual_anterior).toBe(56000)
    expect(r.mensual_nuevo).toBe(91000)
    expect(r.dias_restantes).toBe(214)

    // (91.000 − 56.000) × 12 / 365 × 214 días
    expect(r.monto_a_cobrar).toBe(246247)
  })

  it('NO mueve la fecha de vencimiento', () => {
    const r = calcularCambioDePlan(esencialAnual, profesionalAnual, PERIODO_ANUAL, CAMBIO)
    expect(r.periodo_actual_fin).toBe('2026-12-31')
    expect(r.proximo_cobro).toBe('2027-01-01')
  })

  it('un upgrade el último día cobra un solo día de diferencia', () => {
    const r = calcularCambioDePlan(esencialAnual, profesionalAnual, PERIODO_ANUAL, '2026-12-31')
    expect(r.dias_restantes).toBe(1)
    expect(r.monto_a_cobrar).toBe(Math.round(((91000 - 56000) * 12) / 365))
    expect(r.periodo_actual_fin).toBe('2026-12-31')
  })

  it('un upgrade el día 1 cobra la diferencia del período entero', () => {
    const r = calcularCambioDePlan(esencialAnual, profesionalAnual, PERIODO_ANUAL, '2026-01-01')
    expect(r.dias_restantes).toBe(365)
    // El período entero al precio nuevo menos el período entero al viejo.
    expect(r.monto_a_cobrar).toBe((91000 - 56000) * 12)
  })

  it('respeta el precio CONGELADO, no el de lista (cliente con precio especial)', () => {
    // G-10 paga 75.000 donde la lista dice 80.000. Si sube a Profesional con
    // un precio especial negociado de 120.000, la cuenta usa 120.000 — no el
    // 130.000 del catálogo. Por eso el precio nuevo entra por parámetro.
    const g10Mensual = tarifa(75000, 60000, 0, TERMINOS.mensual)
    const g10Sube = tarifa(120000, 90000, 0, TERMINOS.mensual)
    const periodoMes = { periodo_actual_inicio: '2026-08-01', periodo_actual_fin: '2026-08-31' }

    const r = calcularCambioDePlan(g10Mensual, g10Sube, periodoMes, '2026-08-16')

    expect(r.mensual_anterior).toBe(75000)
    expect(r.mensual_nuevo).toBe(120000)
    expect(r.dias_restantes).toBe(16)
    // (120.000 − 75.000) / 31 × 16
    expect(r.monto_a_cobrar).toBe(Math.round(((120000 - 75000) / 31) * 16))
  })
})

describe('downgrade — el saldo se convierte, la fecha se extiende', () => {
  const esencialAnual = tarifa(ESENCIAL.base, ESENCIAL.sede, 0, TERMINOS.anual)
  const profesionalAnual = tarifa(PROFESIONAL.base, PROFESIONAL.sede, 0, TERMINOS.anual)

  it('convierte el saldo en más días del plan barato', () => {
    const r = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, CAMBIO)

    expect(r.tipo).toBe('downgrade')
    expect(r.dias_restantes).toBe(214)
    // 91.000 × 12 / 365 × 214
    expect(r.saldo_a_favor).toBe(640241)
    // Nunca se devuelve plata.
    expect(r.monto_a_cobrar).toBe(0)
  })

  it('la fecha se corre hacia adelante, nunca hacia atrás', () => {
    const r = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, CAMBIO)
    // El saldo compra más días porque el plan nuevo es más barato.
    expect(r.periodo_actual_fin > '2026-12-31').toBe(true)
    expect(r.proximo_cobro > r.periodo_actual_fin).toBe(true)
  })

  it('los días nuevos salen de dividir el saldo por la tarifa nueva', () => {
    const r = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, CAMBIO)
    const tarifaNueva = (56000 * 12) / 365
    const diasEsperados = Math.floor(r.saldo_a_favor / tarifaNueva)
    // Desde el día del cambio, inclusive.
    expect(diasDelPeriodo(CAMBIO, r.periodo_actual_fin)).toBe(diasEsperados)
  })

  it('downgrade CON sedes: el saldo sale del total, no solo del plan', () => {
    // Profesional anual + 2 sedes → Esencial anual + 2 sedes.
    const conSedesCaro = tarifa(PROFESIONAL.base, PROFESIONAL.sede, 2, TERMINOS.anual)
    const conSedesBarato = tarifa(ESENCIAL.base, ESENCIAL.sede, 2, TERMINOS.anual)

    expect(mensualEfectivo(conSedesCaro)).toBe(217000) // (130.000 + 180.000) × 0,7
    expect(mensualEfectivo(conSedesBarato)).toBe(140000) // (80.000 + 120.000) × 0,7

    const r = calcularCambioDePlan(conSedesCaro, conSedesBarato, PERIODO_ANUAL, CAMBIO)

    expect(r.tipo).toBe('downgrade')
    // Lo que el test afirma: el saldo sale del TOTAL mensual (plan + sedes),
    // no solo del plan. Con sedes el saldo es mucho mayor.
    expect(r.saldo_a_favor).toBe(Math.round(((217000 * 12) / 365) * 214))
    const soloPlan = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, CAMBIO)
    expect(r.saldo_a_favor).toBeGreaterThan(soloPlan.saldo_a_favor)

    // Y la extensión también sale del total: los días nuevos se compran a la
    // tarifa nueva CON sedes.
    const tarifaNuevaConSedes = (140000 * 12) / 365
    expect(diasDelPeriodo(CAMBIO, r.periodo_actual_fin)).toBe(
      Math.floor(r.saldo_a_favor / tarifaNuevaConSedes),
    )
  })

  it('la extensión depende del RATIO viejo/nuevo, no del saldo absoluto', () => {
    // Contraintuitivo y por eso está escrito: sumar sedes a AMBOS lados sube
    // el saldo pero acerca el ratio a 1 (217/140 = 1,55 contra 91/56 = 1,625),
    // así que la extensión es MENOR. Un saldo más grande no compra más tiempo
    // si lo que se compra también subió de precio.
    const conSedesCaro = tarifa(PROFESIONAL.base, PROFESIONAL.sede, 2, TERMINOS.anual)
    const conSedesBarato = tarifa(ESENCIAL.base, ESENCIAL.sede, 2, TERMINOS.anual)

    const conSedes = calcularCambioDePlan(conSedesCaro, conSedesBarato, PERIODO_ANUAL, CAMBIO)
    const sinSedes = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, CAMBIO)

    expect(conSedes.saldo_a_favor).toBeGreaterThan(sinSedes.saldo_a_favor)
    expect(conSedes.periodo_actual_fin < sinSedes.periodo_actual_fin).toBe(true)
  })

  it('un downgrade el último día deja al menos el día que ya estaba pago', () => {
    const r = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, '2026-12-31')
    expect(r.dias_restantes).toBe(1)
    // Un día de Profesional compra más de un día de Esencial.
    expect(r.periodo_actual_fin >= '2026-12-31').toBe(true)
  })

  it('un downgrade el día 1 extiende sobre el período completo', () => {
    const r = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, '2026-01-01')
    expect(r.dias_restantes).toBe(365)
    expect(r.saldo_a_favor).toBe(91000 * 12)
    // 1.092.000 al precio de Esencial anual (672.000/año) ≈ 1,63 años.
    expect(r.periodo_actual_fin > '2027-01-01').toBe(true)
  })
})

describe('invariantes del cambio de plan', () => {
  const esencialAnual = tarifa(ESENCIAL.base, ESENCIAL.sede, 0, TERMINOS.anual)
  const profesionalAnual = tarifa(PROFESIONAL.base, PROFESIONAL.sede, 0, TERMINOS.anual)

  it('NUNCA se devuelve plata', () => {
    const r = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, CAMBIO)
    expect(r.monto_a_cobrar).toBeGreaterThanOrEqual(0)
  })

  it('un downgrade nunca acorta el período', () => {
    // La propiedad que hace cierto "la plata conserva su valor": bajar de plan
    // no puede dejarte con menos tiempo del que ya habías pagado.
    for (const fecha of ['2026-01-01', '2026-06-01', '2026-09-15', '2026-12-31']) {
      const r = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, fecha)
      expect(r.periodo_actual_fin >= PERIODO_ANUAL.periodo_actual_fin).toBe(true)
    }
  })

  it('un upgrade nunca mueve la fecha', () => {
    for (const fecha of ['2026-01-01', '2026-06-01', '2026-12-31']) {
      const r = calcularCambioDePlan(esencialAnual, profesionalAnual, PERIODO_ANUAL, fecha)
      expect(r.periodo_actual_fin).toBe(PERIODO_ANUAL.periodo_actual_fin)
    }
  })

  it('bajar a un plan de precio CERO falla ruidoso, no escribe una fecha rota', () => {
    // Alcanzable desde que existe LAB (tenant de pruebas, precio 0). Sin la
    // guarda, `saldo / 0` da Infinity y de ahí sale un Invalid Date que se
    // guardaría en la base sin que nadie lo mire.
    const gratis = tarifa(0, 0, 0, TERMINOS.anual)
    expect(() => calcularCambioDePlan(profesionalAnual, gratis, PERIODO_ANUAL, CAMBIO)).toThrow(
      /precio cero/i,
    )
  })

  it('dos suscripciones de precio cero no rompen: no hay cambio que calcular', () => {
    // El caso real de LAB consigo mismo: tarifas iguales, corta antes de dividir.
    const gratis = tarifa(0, 0, 0, TERMINOS.mensual)
    const r = calcularCambioDePlan(gratis, gratis, PERIODO_ANUAL, CAMBIO)
    expect(r.tipo).toBe('sin_cambio')
    expect(r.saldo_a_favor).toBe(0)
  })

  it('SUBIR desde un plan de precio cero funciona normal', () => {
    // LAB pasando a un plan pago: la guarda es solo para el divisor.
    const gratis = tarifa(0, 0, 0, TERMINOS.anual)
    const r = calcularCambioDePlan(gratis, esencialAnual, PERIODO_ANUAL, CAMBIO)
    expect(r.tipo).toBe('upgrade')
    expect(r.saldo_a_favor).toBe(0)
    expect(r.periodo_actual_fin).toBe('2026-12-31')
  })

  it('cambiar al mismo plan no cobra ni mueve nada', () => {
    const r = calcularCambioDePlan(esencialAnual, esencialAnual, PERIODO_ANUAL, CAMBIO)
    expect(r.tipo).toBe('sin_cambio')
    expect(r.monto_a_cobrar).toBe(0)
    expect(r.periodo_actual_fin).toBe('2026-12-31')
  })

  it('el evento guarda el saldo y las dos fechas', () => {
    const r = calcularCambioDePlan(profesionalAnual, esencialAnual, PERIODO_ANUAL, CAMBIO)
    const datos = datosDelEvento(r, PERIODO_ANUAL.periodo_actual_fin)
    // Dentro de seis meses, "por qué vence ese día" tiene que responderse sin
    // rehacer la cuenta.
    expect(datos.periodo_fin_anterior).toBe('2026-12-31')
    expect(datos.periodo_fin_nuevo).toBe(r.periodo_actual_fin)
    expect(datos.saldo_a_favor).toBe(r.saldo_a_favor)
    expect(datos.tipo_cambio).toBe('downgrade')
  })
})

describe('estado_implementacion — la exoneración condicional', () => {
  it('un anual arranca en exonerada_condicional', () => {
    expect(implementacionAlFirmar(12)).toBe('exonerada_condicional')
  })

  it('los términos cortos arrancan en pendiente', () => {
    expect(implementacionAlFirmar(1)).toBe('pendiente')
    expect(implementacionAlFirmar(6)).toBe('pendiente')
  })

  it('cumplir el año la vuelve exonerada y ya no se reclama', () => {
    expect(transicionImplementacion('exonerada_condicional', { tipo: 'ANIVERSARIO_ANUAL' })).toBe(
      'exonerada',
    )
  })

  it('bajar de término antes del año la vuelve exigible', () => {
    expect(
      transicionImplementacion('exonerada_condicional', {
        tipo: 'CAMBIO_TERMINO',
        nuevo_termino_meses: 1,
      }),
    ).toBe('pendiente')
  })

  it('seguir en anual no rompe la condición', () => {
    expect(
      transicionImplementacion('exonerada_condicional', {
        tipo: 'CAMBIO_TERMINO',
        nuevo_termino_meses: 12,
      }),
    ).toBe('exonerada_condicional')
  })

  it('CANCELAR NO la hace exigible', () => {
    // La regla que más se discute: los doce meses ya se pagaron por
    // adelantado. Cobrar la implementación al que se va sería cobrarle dos
    // veces por irse.
    expect(transicionImplementacion('exonerada_condicional', { tipo: 'CANCELACION' })).toBe(
      'exonerada_condicional',
    )
  })

  it('los estados terminales no vuelven atrás', () => {
    for (const evento of [
      { tipo: 'CAMBIO_TERMINO' as const, nuevo_termino_meses: 1 },
      { tipo: 'CANCELACION' as const },
      { tipo: 'ANIVERSARIO_ANUAL' as const },
    ]) {
      expect(transicionImplementacion('cobrada', evento)).toBe('cobrada')
      expect(transicionImplementacion('exonerada', evento)).toBe('exonerada')
    }
  })

  it('una implementación pendiente no se exonera sola al cumplir el año', () => {
    // El aniversario solo confirma un regalo que ya existía.
    expect(transicionImplementacion('pendiente', { tipo: 'ANIVERSARIO_ANUAL' })).toBe('pendiente')
  })
})
