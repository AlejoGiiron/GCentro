/**
 * Formato para pantalla. Español de Colombia (§2).
 *
 * Vive acá y no en los componentes porque un panel de cobranza donde el mismo
 * monto se ve distinto en dos tablas es un panel en el que no se confía.
 */
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * COP en pesos enteros, sin decimales (§2).
 *
 * `maximumFractionDigits: 0` no es estético: los montos SON enteros en la base
 * y mostrar `$79.000,00` sugeriría una precisión de centavos que no existe.
 */
const PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export function pesos(monto: number): string {
  return PESOS.format(monto)
}

/** Fecha de calendario `YYYY-MM-DD` → "12 ago 2026". */
export function fecha(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy", { locale: es })
}

/** Instante `timestamptz` → "12 ago 2026, 15:46". */
export function instante(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: es })
}

/**
 * Días respecto a hoy, en palabras.
 *
 * "vence en 3 días" y "vencido hace 12 días" en vez de un número con signo:
 * el signo se lee mal de reojo, y esta columna se lee de reojo.
 */
export function diasEnPalabras(dias: number | null): string {
  // `null` = no hay historial de pagos (015). No es cero.
  if (dias === null) return 'sin historial de pagos'
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  if (dias > 1) return `en ${dias} días`
  if (dias === -1) return 'venció ayer'
  return `hace ${Math.abs(dias)} días`
}

/** Fecha de hoy como `YYYY-MM-DD`, en la zona del navegador. */
export function hoyISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
