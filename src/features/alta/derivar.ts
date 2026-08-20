/**
 * Lo que el alta DERIVA y no pregunta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * El formulario pide siete cosas y calcula el resto. Todo lo calculado se
 * MUESTRA: un valor derivado mal que nadie vio se congela igual que uno
 * tipeado mal, y a partir del alta ese número es contexto para todo lo que
 * viene — pagos, banderas, cobranza (§9.7-7).
 *
 * Acá no hay estado ni React: son funciones puras, que es lo que permite
 * probarlas contra los bordes de mes sin montar una pantalla.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { addMonths, format, parseISO, subDays } from 'date-fns'
import type { FechaISO } from '@/lib/bandera'

/**
 * Último día cubierto por el primer período.
 *
 * INCLUSIVO, como manda la convención de la columna: es el último día
 * cubierto, no el día del próximo cobro. Un mensual que arranca el 1 de agosto
 * termina el 31, no el 1 de septiembre.
 *
 * ⚠️ EL BORDE DE MES CORRE LA FECHA, y no es un defecto: un mensual firmado el
 * 31 de enero termina el 27 de febrero, porque el 31 de febrero no existe y
 * `addMonths` lo lleva al 28. La consecuencia es que el aniversario se corre y
 * ya no vuelve al 31. Hoy sólo afecta al PRIMER período —nada avanza los
 * períodos, §9.7-2— así que el arrastre no ocurre todavía; el día que se
 * construya el avance, la decisión de si el ciclo vuelve al día original es de
 * ahí, no de acá.
 */
export function periodoFin(inicio: FechaISO, terminoMeses: number): FechaISO {
  return format(subDays(addMonths(parseISO(inicio), terminoMeses), 1), 'yyyy-MM-dd')
}

/**
 * Cuánto se aparta el precio pactado del precio de lista.
 *
 * `null` cuando NO HAY LISTA CONTRA QUÉ COMPARAR. Eso pasa hoy con el plan del
 * contador, que no tiene precio cargado, y el formulario **lo dice** en vez de
 * mostrar un cero o un guion: parecer que comparó es peor que no comparar
 * —quien lee un «0%» entiende «coincide con la lista», que es una afirmación
 * que nadie hizo—.
 */
export interface Desvio {
  /** Pesos de diferencia. Negativo = por debajo de la lista. */
  pesos: number
  /** Porcentaje respecto de la lista, redondeado a un decimal. */
  pct: number
}

export function desvioDeLista(pactado: number, lista: number | null): Desvio | null {
  // Un precio de lista en 0 no es "gratis": es una fila del catálogo sin
  // cargar. Dividir por él daría Infinity y el formulario mostraría un
  // porcentaje inventado.
  if (lista === null || lista <= 0) return null
  const pesos = pactado - lista
  return { pesos, pct: Math.round((pesos / lista) * 1000) / 10 }
}

/**
 * ¿El precio se apartó lo suficiente como para exigir justificación?
 *
 * Cualquier diferencia cuenta, por chica que sea. No hay tolerancia: G-10 y
 * Salchimelo prueban que apartarse es lo normal, así que la justificación no
 * es un castigo por hacer algo raro — es el único registro de POR QUÉ este
 * contrato tiene el precio que tiene, y sin ella el número queda huérfano
 * para siempre en la foto del evento `CREADA`.
 */
export function exigeJustificacion(desvios: Array<Desvio | null>): boolean {
  return desvios.some((d) => d !== null && d.pesos !== 0)
}
