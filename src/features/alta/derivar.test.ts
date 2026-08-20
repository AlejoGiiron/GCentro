/**
 * Los modos de fallo que estos tests atrapan, nombrados antes de escribirlos:
 *
 * · Un período que termina un día tarde o un día temprano. Se congela al
 *   firmar y el cálculo de cambio de plan lo usa como base: un día de más es
 *   un día de saldo a favor que no existe.
 * · El borde de mes. Un mensual firmado un 31 no puede terminar en una fecha
 *   inexistente ni tirar `Invalid Date`.
 * · Un desvío de precio calculado contra una lista que no está: mostrar «0%»
 *   ahí afirma que coincide con la lista, que es exactamente lo que nadie
 *   verificó.
 */
import { describe, it, expect } from 'vitest'
import { desvioDeLista, exigeJustificacion, periodoFin } from './derivar'

describe('el último día cubierto del primer período', () => {
  it('un mensual del 1 termina el último día del mes', () => {
    expect(periodoFin('2026-08-01', 1)).toBe('2026-08-31')
    expect(periodoFin('2026-02-01', 1)).toBe('2026-02-28')
  })

  it('un semestral y un anual cuentan meses, no días', () => {
    expect(periodoFin('2026-01-01', 6)).toBe('2026-06-30')
    expect(periodoFin('2026-01-01', 12)).toBe('2026-12-31')
  })

  it('firmar a mitad de mes termina el día ANTERIOR al aniversario', () => {
    // Cubre [15/08, 14/09]: 31 días. Si terminara el 15 se cobrarían dos veces
    // ese día — el primero del período siguiente.
    expect(periodoFin('2026-08-15', 1)).toBe('2026-09-14')
  })

  it('el borde de mes se resuelve hacia atrás y no revienta', () => {
    // El 31 de febrero no existe: `addMonths` lleva al 28 y el último día
    // cubierto es el 27. Queda fijado para que se vea si algún día cambia.
    expect(periodoFin('2026-01-31', 1)).toBe('2026-02-27')
    expect(periodoFin('2026-01-31', 6)).toBe('2026-07-30')
    // Año bisiesto: 2028 sí tiene 29 de febrero.
    expect(periodoFin('2028-02-29', 12)).toBe('2029-02-27')
  })
})

describe('el desvío contra el precio de lista', () => {
  it('un descuento se reporta en pesos y en porcentaje', () => {
    expect(desvioDeLista(67150, 79000)).toEqual({ pesos: -11850, pct: -15 })
  })

  it('un precio por encima de la lista también es un desvío', () => {
    expect(desvioDeLista(90000, 80000)).toEqual({ pesos: 10000, pct: 12.5 })
  })

  it('coincidir con la lista no es apartarse', () => {
    expect(desvioDeLista(80000, 80000)).toEqual({ pesos: 0, pct: 0 })
    expect(exigeJustificacion([desvioDeLista(80000, 80000)])).toBe(false)
  })

  it('sin lista cargada devuelve null, NO cero', () => {
    // El plan del contador. Un 0 se lee como "coincide con la lista".
    expect(desvioDeLista(120000, null)).toBeNull()
    expect(desvioDeLista(120000, 0)).toBeNull()
  })

  it('un tipeo de un orden de magnitud se ve como tal', () => {
    // 790.000 en vez de 79.000. La defensa no es un rango válido: es que el
    // número que se muestra sea imposible de leer como intencional.
    expect(desvioDeLista(790000, 79000)?.pct).toBe(900)
  })

  it('basta que UNO de los precios se aparte para exigir justificación', () => {
    // Se puede pactar el plan a lista y la sede con descuento. El segundo
    // desvío no puede quedar sin explicación por culpa del primero.
    expect(
      exigeJustificacion([desvioDeLista(80000, 80000), desvioDeLista(50000, 60000)]),
    ).toBe(true)
  })

  it('sin ninguna lista contra qué comparar, no se puede exigir nada', () => {
    expect(exigeJustificacion([null, null])).toBe(false)
  })
})
