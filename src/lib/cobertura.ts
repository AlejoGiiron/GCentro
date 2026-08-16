/**
 * ¿Hasta cuándo está pago, y eso contradice el estado comercial?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL HUECO QUE CIERRA ESTE MÓDULO
 *
 * Registrar un pago y reactivar son **dos acciones separadas**. Con un solo
 * operador el que registraba reactivaba. Con varios, alguien registra el pago
 * y no reactiva — y el cliente sigue con el banner de cobranza en la pantalla
 * de venta habiendo pagado.
 *
 * Es el mismo daño que §5 cierra para el transporte de la bandera, entrando
 * por otra puerta, y es peor en un sentido: **es silencioso de este lado**.
 * La bandera sin confirmar deja una fila en la cola; esto no deja nada. Todo
 * se ve normal porque el pago SÍ está registrado.
 *
 * Se ataca en dos lugares, con el mismo predicado:
 *   · En el momento: la pantalla 2 ofrece reactivar junto con el pago.
 *   · Como red: la lista lo marca como anomalía si alguien no lo hizo.
 *
 * Puro y con `hoy` por parámetro, como `cobro.ts` y `bandera.ts`.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { EstadoComercial, FechaISO } from './bandera'

export interface Cobertura {
  /** MÁXIMO `cubre_hasta` de los pagos, no el del último pago (ver 012). */
  cubierto_hasta: FechaISO | null
  ultimo_pago: FechaISO | null
  pagos_registrados: number
  /**
   * El día siguiente al último cubierto (015). **`null` = no hay pagos con
   * cobertura**, o sea que no se puede calcular — no "vence hoy" ni "nunca
   * vence".
   */
  proximo_cobro: FechaISO | null
}

/** Sin ningún pago registrado. No es lo mismo que "pagó 0". */
export const SIN_COBERTURA: Cobertura = {
  cubierto_hasta: null,
  ultimo_pago: null,
  pagos_registrados: 0,
  proximo_cobro: null,
}

/**
 * ¿La plata llega hasta hoy o más allá?
 *
 * El día exacto de `cubierto_hasta` CUENTA como cubierto: igual que
 * `periodo_actual_fin` en §4, es el último día pago y no el primero impago.
 * Cortar un día antes le come un día al cliente, y en cobranza ese día es el
 * que dispara un banner que no correspondía.
 */
export function estaCubierto(c: Cobertura, hoy: FechaISO): boolean {
  if (!c.cubierto_hasta) return false
  return differenceInCalendarDays(parseISO(c.cubierto_hasta), parseISO(hoy)) >= 0
}

/**
 * Los estados que muestran banner o bloquean. `cancelada` NO está: un
 * contrato cancelado con cobertura vigente no es una anomalía a corregir sino
 * un cliente que se fue antes de consumir lo que pagó — §9.3 ya decidió que
 * eso no se le cobra ni se le devuelve, y reactivarlo solo sería revivir un
 * contrato que alguien terminó a propósito.
 */
const RESTRINGEN: EstadoComercial[] = ['gracia', 'suspendida']

/**
 * **Pagó y sigue restringido.** La anomalía que la vista «Hoy» tiene que
 * mostrar (§1 de la lista).
 */
export function pagoSinReactivar(
  estado: EstadoComercial,
  c: Cobertura,
  hoy: FechaISO,
): boolean {
  return RESTRINGEN.includes(estado) && estaCubierto(c, hoy)
}

export type MotivoReactivacion =
  /** Hay un pago que cubre hasta hoy o más allá, y el estado restringe. */
  | 'CUBIERTO_Y_RESTRINGIDO'
  /** El estado no restringe: no hay nada que reactivar. */
  | 'YA_ACTIVA'
  /** Cancelada: se reactiva a mano y a propósito, no de paso (ver arriba). */
  | 'CANCELADA'
  /** El pago no alcanza a cubrir hasta hoy. */
  | 'NO_ALCANZA'

export interface Reactivacion {
  /** Si se muestra la casilla en el formulario de pago. */
  ofrecer: boolean
  /**
   * Si viene MARCADA por default.
   *
   * ⚠️ Marcada, pero **desmarcable**, y nunca automática: §4 exige que una
   * persona vea cada estado que llega al producto. Un `activa` que viaja solo
   * porque entró plata es exactamente la automatización que §4 prohíbe —
   * aunque sea en la dirección amable.
   */
  marcada: boolean
  motivo: MotivoReactivacion
}

/**
 * Qué ofrecer al registrar un pago.
 *
 * `cubreHasta` es el del pago que se está cargando AHORA, no la cobertura
 * histórica: la pregunta es "con este pago, ¿queda al día?".
 */
export function sugerirReactivacion(
  estado: EstadoComercial,
  cubreHasta: FechaISO | null,
  hoy: FechaISO,
): Reactivacion {
  if (estado === 'activa') return { ofrecer: false, marcada: false, motivo: 'YA_ACTIVA' }
  if (estado === 'cancelada') return { ofrecer: false, marcada: false, motivo: 'CANCELADA' }

  const cubre = estaCubierto({ ...SIN_COBERTURA, cubierto_hasta: cubreHasta }, hoy)
  return cubre
    ? { ofrecer: true, marcada: true, motivo: 'CUBIERTO_Y_RESTRINGIDO' }
    : { ofrecer: false, marcada: false, motivo: 'NO_ALCANZA' }
}
