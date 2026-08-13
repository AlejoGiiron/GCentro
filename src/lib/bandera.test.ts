/**
 * La derivación del nivel de gating (§4).
 *
 * La tabla del documento está escrita a mano acá, fila por fila. No se deriva
 * de la implementación: si se derivara, cambiar la regla cambiaría también la
 * expectativa y el test pasaría siempre.
 */
import { describe, it, expect } from 'vitest'
import {
  DIAS_AVISO_PREVIO,
  DIAS_GRACIA_PLENA,
  NIVELES,
  nivelSugerido,
  type EstadoComercial,
} from './bandera'

const HOY = '2026-08-12'

/** `proximo_cobro` a N días de HOY. Negativo = ya venció. */
function cobroEn(dias: number): string {
  const d = new Date(Date.UTC(2026, 7, 12))
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// ═══════════════════════════════════════════════════════════════════════════
// LA TABLA DE §4, FILA POR FILA
// ═══════════════════════════════════════════════════════════════════════════
describe('nivelSugerido — la tabla del documento', () => {
  const TABLA: Array<[EstadoComercial, number, string, string]> = [
    // estado         días a cobro   nivel esperado   por qué
    ['activa', 30, 'activa', 'faltan más de 7 días'],
    ['activa', 8, 'activa', 'faltan 8: todavía más de 7'],
    ['activa', 7, 'por_vencer', 'faltan exactamente 7'],
    ['activa', 1, 'por_vencer', 'falta 1'],
    ['activa', 0, 'por_vencer', 'vence hoy'],
    ['gracia', -1, 'gracia', 'vencido 1 día'],
    ['gracia', -7, 'gracia', 'vencido 7 días'],
    ['gracia', -8, 'restringida', 'vencido 8 días'],
    ['gracia', -15, 'restringida', 'vencido 15 días'],
    ['suspendida', 30, 'suspendida', 'terminal, la fecha no importa'],
    ['suspendida', -100, 'suspendida', 'terminal'],
    ['cancelada', 30, 'suspendida', 'cancelada también escribe suspendida'],
    ['cancelada', -100, 'suspendida', 'terminal'],
  ]

  for (const [estado, dias, esperado, porque] of TABLA) {
    it(`${estado} + ${dias} días → ${esperado} (${porque})`, () => {
      expect(nivelSugerido(estado, cobroEn(dias), HOY).nivel).toBe(esperado)
    })
  }

  it('devuelve los días para que el panel pueda explicar la sugerencia', () => {
    expect(nivelSugerido('activa', cobroEn(3), HOY).dias_para_cobro).toBe(3)
    expect(nivelSugerido('gracia', cobroEn(-5), HOY).dias_para_cobro).toBe(-5)
    expect(nivelSugerido('activa', HOY, HOY).dias_para_cobro).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LOS BORDES, DONDE SE EQUIVOCAN LAS TABLAS
// ═══════════════════════════════════════════════════════════════════════════
describe('los bordes exactos', () => {
  it(`${DIAS_AVISO_PREVIO} días es por_vencer y ${DIAS_AVISO_PREVIO + 1} todavía es activa`, () => {
    // "faltan más de 7" vs "faltan 7 o menos". El off-by-one acá es un aviso
    // que llega un día tarde o un día temprano, todos los meses.
    expect(nivelSugerido('activa', cobroEn(DIAS_AVISO_PREVIO), HOY).nivel).toBe('por_vencer')
    expect(nivelSugerido('activa', cobroEn(DIAS_AVISO_PREVIO + 1), HOY).nivel).toBe('activa')
  })

  it(`vencido ${DIAS_GRACIA_PLENA} es gracia y ${DIAS_GRACIA_PLENA + 1} es restringida`, () => {
    expect(nivelSugerido('gracia', cobroEn(-DIAS_GRACIA_PLENA), HOY).nivel).toBe('gracia')
    expect(nivelSugerido('gracia', cobroEn(-DIAS_GRACIA_PLENA - 1), HOY).nivel).toBe('restringida')
  })

  it('el día del vencimiento en gracia todavía no restringe', () => {
    expect(nivelSugerido('gracia', HOY, HOY).nivel).toBe('gracia')
  })

  it('cruzar un fin de mes no corre la cuenta', () => {
    // §2: las fechas de cobro son días de calendario, no instantes. Un cambio
    // de mes no puede mover el borde.
    expect(nivelSugerido('activa', '2026-09-01', '2026-08-25').nivel).toBe('por_vencer')
    expect(nivelSugerido('activa', '2026-09-02', '2026-08-25').nivel).toBe('activa')
  })

  it('febrero de un año bisiesto tampoco', () => {
    expect(nivelSugerido('activa', '2028-03-01', '2028-02-23').nivel).toBe('por_vencer')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LOS DOS HUECOS QUE LA TABLA DE §4 NO CUBRÍA
// ═══════════════════════════════════════════════════════════════════════════
describe('lo que la tabla del documento no decía', () => {
  it('gracia con más de 15 días vencido NO escala solo a suspendida', () => {
    // §4: "nada escala solo". Si el día 16 la derivación empezara a sugerir
    // `suspendida`, esa promesa sería falsa en la práctica — la sugerencia es
    // lo que se aprieta. Suspender es una decisión comercial: se toma
    // cambiando `suscripciones.estado`, no dejando correr un contador.
    for (const dias of [-16, -30, -90, -365]) {
      expect(nivelSugerido('gracia', cobroEn(dias), HOY).nivel).toBe('restringida')
    }
  })

  it('gracia con la fecha todavía por delante sugiere gracia, no activa', () => {
    // Dato inconsistente: alguien puso el estado a mano, o se movió
    // `proximo_cobro` después. Manda el estado comercial, que es lo que un
    // humano escribió a propósito.
    const s = nivelSugerido('gracia', cobroEn(10), HOY)
    expect(s.nivel).toBe('gracia')
    expect(s.regla).toBe('GRACIA_SIN_VENCER')
  })

  it('activa y ya vencida sugiere por_vencer, no restringida', () => {
    // §5, fail-open: una suscripción que nadie movió a `gracia` no se
    // restringe por aritmética. El estado comercial es el que manda.
    for (const dias of [-1, -20, -200]) {
      expect(nivelSugerido('activa', cobroEn(dias), HOY).nivel).toBe('por_vencer')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PROPIEDADES
// ═══════════════════════════════════════════════════════════════════════════
describe('propiedades', () => {
  const ESTADOS: EstadoComercial[] = ['activa', 'gracia', 'suspendida', 'cancelada']

  it('siempre devuelve uno de los cinco niveles, para cualquier entrada', () => {
    for (const estado of ESTADOS) {
      for (let d = -400; d <= 400; d += 7) {
        expect(NIVELES).toContain(nivelSugerido(estado, cobroEn(d), HOY).nivel)
      }
    }
  })

  it('es determinista: la misma entrada da la misma salida', () => {
    const a = nivelSugerido('gracia', cobroEn(-9), HOY)
    const b = nivelSugerido('gracia', cobroEn(-9), HOY)
    expect(a).toEqual(b)
  })

  it('nunca sugiere suspendida desde un estado no terminal', () => {
    // La consecuencia práctica de "nada escala solo": el único camino a
    // `suspendida` pasa por que un humano cambie el estado comercial.
    for (let d = -400; d <= 400; d += 3) {
      expect(nivelSugerido('activa', cobroEn(d), HOY).nivel).not.toBe('suspendida')
      expect(nivelSugerido('gracia', cobroEn(d), HOY).nivel).not.toBe('suspendida')
    }
  })

  it('el nivel nunca afloja al pasar el tiempo dentro del mismo estado', () => {
    // Monotonía: con el estado fijo, un día más de atraso nunca puede sugerir
    // un nivel MENOS restrictivo. Un banner que desaparece solo al día
    // siguiente sería peor que no ponerlo.
    const severidad = { activa: 0, por_vencer: 1, gracia: 2, restringida: 3, suspendida: 4 }
    for (const estado of ESTADOS) {
      let previa = -1
      for (let d = 400; d >= -400; d--) {
        const actual = severidad[nivelSugerido(estado, cobroEn(d), HOY).nivel]
        expect(actual).toBeGreaterThanOrEqual(previa)
        previa = actual
      }
    }
  })

  it('la regla es un catálogo cerrado, apto para un reporte de error', () => {
    const REGLAS = [
      'ACTIVA_CON_MARGEN',
      'ACTIVA_POR_VENCER',
      'GRACIA_RECIENTE',
      'GRACIA_PROLONGADA',
      'GRACIA_SIN_VENCER',
      'ESTADO_TERMINAL',
    ]
    const vistas = new Set<string>()
    for (const estado of ESTADOS) {
      for (let d = -30; d <= 30; d++) vistas.add(nivelSugerido(estado, cobroEn(d), HOY).regla)
    }
    for (const r of vistas) expect(REGLAS).toContain(r)
    // Las seis son alcanzables: ninguna es código muerto.
    expect(vistas.size).toBe(REGLAS.length)
  })
})
