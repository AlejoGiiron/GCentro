/**
 * A quién avisar cuando algo se rompe y el sistema no puede reportarlo solo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ ESTE ES EL ÚNICO LUGAR DONDE APARECE UN NOMBRE PROPIO EN LA UI.
 *
 * `PRODUCT.md` dice varios operadores. Hoy Alejandro es el único que puede
 * hacer algo con un error, así que el texto lo nombra — pero eso es un hecho
 * de HOY, no del diseño. El día que exista soporte de verdad (una casilla,
 * un turno, un canal), se cambia **acá y en ningún otro lado**.
 *
 * Está en su propio módulo justamente para que se encuentre buscando
 * "soporte" y no haga falta saber que vivía adentro de una pantalla de error.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const SOPORTE = {
  /** Cómo nombrar al destinatario en un texto dirigido a un operador. */
  destinatario: 'Alejandro',
  /** Qué se le pide a quien ve el error, cuando no hay telemetría. */
  queHacer: 'Anotá qué estabas haciendo justo antes y avisale a Alejandro.',
} as const
