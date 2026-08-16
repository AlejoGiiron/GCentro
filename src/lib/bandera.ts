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

export interface Sugerencia {
  nivel: Nivel
  /**
   * Días de `hoy` a `proximo_cobro`. Positivo = falta; 0 = vence hoy;
   * negativo = vencido hace tantos días.
   */
  dias_para_cobro: number
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
  proximoCobro: FechaISO,
  hoy: FechaISO,
): Sugerencia {
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
