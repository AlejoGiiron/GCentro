/**
 * Derivación del nivel de gating — funciones PURAS, como `cobro.ts`. Sin
 * React, sin Supabase, sin fechas del sistema: `hoy` entra por parámetro.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTO SUGIERE. NO DECIDE.
 *
 * §4: en v1 el panel calcula el nivel sugerido y Alejandro confirma con un
 * botón. Nada escala solo. Son dos clientes y los conoce por el nombre.
 *
 * Que la derivación sea pura y esté acá —y no adentro de un `useEffect` o de
 * un trigger— es lo que mantiene esa propiedad verificable: no hay ningún
 * camino por el que este archivo escriba algo.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Todo en español. El inglés del producto vive únicamente en
 * `supabase/functions/_shared/contrato.ts` (§6).
 */
import { differenceInCalendarDays, parseISO } from 'date-fns'
import {
  MENSAJE_MAX,
  NIVELES,
  type Nivel,
} from '../../supabase/functions/_shared/contrato.ts'

/**
 * Se reexportan desde acá para que el panel no importe del directorio de las
 * Edge Functions. **El límite NO se duplica**: es el mismo número que valida
 * el borde antes de enviar, y tener dos sería tener dos límites.
 */
export { MENSAJE_MAX, NIVELES }
export type { Nivel }

/** Fecha de calendario `YYYY-MM-DD`. Un cobro es un día, no un instante (§2). */
export type FechaISO = string

/** `suscripciones.estado` — el estado COMERCIAL, no el nivel de gating. */
export type EstadoComercial = 'activa' | 'gracia' | 'suspendida' | 'cancelada'

/** Umbrales de §4, con nombre para que el test hable del contrato y no de números. */
export const DIAS_AVISO_PREVIO = 7
export const DIAS_GRACIA_PLENA = 7

/**
 * Por qué se sugirió ese nivel. Catálogo cerrado: es apto para Sentry y sirve
 * para que el panel explique la sugerencia en vez de mostrar un veredicto.
 */
export type ReglaSugerencia =
  | 'ACTIVA_CON_MARGEN'
  | 'ACTIVA_POR_VENCER'
  | 'GRACIA_RECIENTE'
  | 'GRACIA_PROLONGADA'
  | 'GRACIA_SIN_VENCER'
  | 'ESTADO_TERMINAL'
  /** No hay pagos con cobertura: no se puede calcular una fecha (015). */
  | 'SIN_HISTORIAL'

export interface Sugerencia {
  nivel: Nivel
  /**
   * Días de `hoy` a `proximo_cobro`. Positivo = falta; 0 = vence hoy;
   * negativo = vencido hace tantos días.
   *
   * **`null` cuando no hay historial de pagos.** No es cero ni infinito: es
   * que no se puede calcular.
   */
  dias_para_cobro: number | null
  regla: ReglaSugerencia
}

/**
 * Nivel sugerido a partir del estado comercial y los días respecto a
 * `proximo_cobro` (§4).
 *
 * ⚠️ DOS CASOS QUE LA TABLA DE §4 NO CUBRÍA, resueltos acá y documentados en
 * el documento en el mismo commit:
 *
 * 1. `gracia` con más de 15 días vencido → se queda en `restringida`, NO
 *    escala a `suspendida`. Suspender es una decisión COMERCIAL: se toma
 *    cambiando `suscripciones.estado`, no dejando correr un contador. Si el
 *    día 16 la derivación empezara a sugerir `suspendida` sola, "nada escala
 *    solo" sería falso en la práctica — la sugerencia es lo que se aprieta.
 *
 * 2. `gracia` con la fecha todavía por delante → `gracia`. Es un dato
 *    inconsistente (alguien puso el estado a mano, o se movió `proximo_cobro`
 *    después). Manda el estado comercial, que es lo que un humano escribió a
 *    propósito, y `gracia` es su piso: muestra banner y no bloquea nada.
 *
 * Y uno que la tabla sí cubre aunque no lo parezca: `activa` con la fecha ya
 * pasada cae en "faltan 7 días o menos" y sugiere `por_vencer`. Es lo
 * correcto por §5 (fail-open): una suscripción que nadie movió a `gracia` no
 * se restringe por aritmética.
 */
export function nivelSugerido(
  estado: EstadoComercial,
  /** `null` si la suscripción no tiene pagos con cobertura (015). */
  proximoCobro: FechaISO | null,
  hoy: FechaISO,
): Sugerencia {
  // ── SIN HISTORIAL DE PAGOS ──────────────────────────────────────────────
  //
  // Desde 015 la fecha se deriva de los pagos, así que puede no existir. No
  // se inventa: la aritmética con `null` daría `NaN` días y una sugerencia
  // sin sentido que igual se vería como una decisión.
  //
  // El nivel sale del ESTADO COMERCIAL, que es lo único que se sabe:
  //   · terminal → suspendida, que no dependía de la fecha.
  //   · gracia   → gracia. Un humano lo escribió a propósito.
  //   · activa   → activa. §5, fail-open: **no se restringe a nadie por un
  //                dato que nos falta a nosotros.**
  if (proximoCobro === null) {
    const nivel: Nivel =
      estado === 'suspendida' || estado === 'cancelada'
        ? 'suspendida'
        : estado === 'gracia'
          ? 'gracia'
          : 'activa'
    return { nivel, dias_para_cobro: null, regla: 'SIN_HISTORIAL' }
  }

  const dias = differenceInCalendarDays(parseISO(proximoCobro), parseISO(hoy))

  if (estado === 'suspendida' || estado === 'cancelada') {
    return { nivel: 'suspendida', dias_para_cobro: dias, regla: 'ESTADO_TERMINAL' }
  }

  if (estado === 'activa') {
    return dias > DIAS_AVISO_PREVIO
      ? { nivel: 'activa', dias_para_cobro: dias, regla: 'ACTIVA_CON_MARGEN' }
      : { nivel: 'por_vencer', dias_para_cobro: dias, regla: 'ACTIVA_POR_VENCER' }
  }

  // estado === 'gracia'
  const vencidoHace = -dias
  if (vencidoHace <= 0) {
    return { nivel: 'gracia', dias_para_cobro: dias, regla: 'GRACIA_SIN_VENCER' }
  }
  if (vencidoHace <= DIAS_GRACIA_PLENA) {
    return { nivel: 'gracia', dias_para_cobro: dias, regla: 'GRACIA_RECIENTE' }
  }
  return { nivel: 'restringida', dias_para_cobro: dias, regla: 'GRACIA_PROLONGADA' }
}
