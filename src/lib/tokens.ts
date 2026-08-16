/**
 * Cómo se ve cada valor del dominio. Un solo lugar, para las cuatro pantallas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS DOS REGLAS QUE SOSTIENEN LA PANTALLA
 *
 * 1. **UN SOLO COLOR POR FILA.** El color aparece en la columna «Atención» y
 *    en ningún otro lado. Si el estado y la bandera también se tiñeran, la
 *    fila entera sería un semáforo y nada saltaría.
 *
 * 2. **`activa` NO LLEVA COLOR.** Lo normal es la ausencia de color. Pintar
 *    lo que está bien obliga al ojo a leer todas las filas para descartarlas;
 *    dejándolo neutro, las tres que no están bien saltan solas.
 *
 * Si algo más adelante presiona contra estas dos, ganan ellas.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ `Atencion` NO se mapea acá. Ese tipo es específico de la lista y vive
 * con ella (`features/clientes/vista.ts`); `lib` no depende de `features`.
 * Lo que sí vive acá son los enums del DOMINIO —estado comercial y nivel de
 * gating (§4)— que las cuatro pantallas comparten, más las clases crudas para
 * que un mapeo nuevo componga con las mismas piezas.
 */
import type { EstadoComercial, Nivel } from './bandera'

// ── Piezas crudas ─────────────────────────────────────────────────────────

export const TINTA = {
  fuerte: 'text-tinta-fuerte',
  media: 'text-tinta-media',
  debil: 'text-tinta-debil',
} as const

export const SENAL = {
  critico: 'text-senal-critico',
  alerta: 'text-senal-alerta',
  info: 'text-senal-info',
  ok: 'text-senal-ok',
} as const

/** Punto de estado. Relleno y borde del mismo tono. */
export const PUNTO = {
  ok: 'fill-senal-ok text-senal-ok',
  alerta: 'fill-senal-alerta text-senal-alerta',
  critico: 'fill-senal-critico text-senal-critico',
  neutro: 'fill-tinta-debil text-tinta-debil',
} as const

// ── Estado comercial (`suscripciones.estado`, §4) ─────────────────────────

/**
 * Cuatro valores, y sólo tres llevan color.
 *
 * `activa` va en tinta fuerte: es el dato principal de la celda, pero sin
 * señal. `cancelada` va en tinta débil porque es un contrato terminado — no
 * necesita atención, necesita dejar de competir por ella.
 */
export const ESTADO_VISUAL: Record<EstadoComercial, string> = {
  activa: TINTA.fuerte,
  gracia: SENAL.alerta,
  suspendida: SENAL.critico,
  cancelada: TINTA.debil,
}

// ── Nivel de gating (§4) ──────────────────────────────────────────────────

/**
 * La escalera de restricción, por cuánto le quita al cliente.
 *
 * ⚠️ En la LISTA no se usa: el nivel sugerido va neutro, porque el color de
 * la fila ya lo lleva «Atención» (regla 1). Existe para las pantallas donde
 * el nivel ES la decisión que se está tomando — el selector de estado
 * (pantalla 2) y la cola (pantalla 3).
 */
export const NIVEL_VISUAL: Record<Nivel, string> = {
  activa: TINTA.fuerte,
  por_vencer: TINTA.media,
  gracia: SENAL.alerta,
  restringida: SENAL.critico,
  suspendida: SENAL.critico,
}

// ── Composiciones que se repiten ──────────────────────────────────────────

/**
 * Anillo de foco. Un cambio de color de borde de 1px no es un indicador
 * (WCAG 2.4.7): el 16/08 la pantalla tenía `focus:outline-none` reemplazado
 * por eso y el foco era invisible.
 */
export const FOCO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-senal-info ' +
  'focus-visible:ring-offset-1 focus-visible:ring-offset-lienzo-base'

/**
 * Marca de tenant de laboratorio.
 *
 * ⚠️ NEUTRA, sin color de señal. LAB no es un nivel de atención: es una
 * propiedad del cliente. Con un color propio competiría con las filas que sí
 * necesitan algo, justo en la vista «Todas» donde conviven.
 */
export const MARCA_PRUEBA =
  'ml-2 rounded border border-lienzo-divisor px-1 py-px text-micro uppercase ' +
  'tracking-grupo text-tinta-media'
