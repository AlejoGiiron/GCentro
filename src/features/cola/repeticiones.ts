/**
 * Qué fila «repite» a la anterior.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO ES COSMÉTICA: es §5 hecho pantalla.
 *
 * La cola crece por LLAMADA, no por cambio de estado. Dos filas seguidas con
 * el mismo `valor_deseado` **no son un duplicado: son dos clics.** Sin
 * marcarlas, la primera reacción de quien abre la pantalla es pensar que hay
 * filas repetidas por un bug y salir a buscarlo.
 *
 * Marcarlas es lo contrario de esconderlas. La fila repetida se muestra
 * entera —es un hecho que ocurrió— con una nota que explica por qué está.
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { FilaCola } from './schemas'

export interface FilaMarcada {
  f: FilaCola
  repetida: boolean
}

/**
 * ⚠️ Espera las filas de MÁS NUEVA A MÁS VIEJA, que es como las devuelve la
 * consulta. «La anterior en el tiempo» es entonces la SIGUIENTE del array —
 * invertir eso marcaría la primera de cada par en vez de la segunda, y la
 * nota «repite el anterior» quedaría en la fila equivocada.
 *
 * Sólo cuentan como repetición las de la MISMA suscripción: dos clientes
 * distintos puestos en `gracia` el mismo día no tienen nada que ver.
 */
export function conRepeticiones(filas: FilaCola[]): FilaMarcada[] {
  return filas.map((f, i) => {
    const previa = filas[i + 1]
    return {
      f,
      repetida:
        !!previa &&
        previa.suscripcion_id === f.suscripcion_id &&
        previa.valor_deseado === f.valor_deseado,
    }
  })
}
