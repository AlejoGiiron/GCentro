/**
 * Tokens de G-Centro.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LOS NOMBRES SON SEMÁNTICOS, NO DE COLOR. `senal-critico`, no `red-400`.
 *
 * Un nombre de color sobrevive a un cambio de paleta convirtiéndose en
 * mentira: `text-red-400` en una fila que ya no es crítica sigue compilando.
 * El nombre semántico obliga a decidir qué significa antes de pintarlo.
 *
 * ⚠️ TODOS los tonos de `tinta` y `senal` están MEDIDOS contra los tres
 * fondos y pasan 4.5:1 (WCAG AA). Ninguno es "solo decorativo": esa categoría
 * fue exactamente el origen del defecto del 16/08, cuando la nota al pie que
 * explicaba el concepto central de §5 quedó a 2.66:1. Si un token existe,
 * se puede escribir texto con él.
 *
 * Lo decorativo vive en `lienzo`, y usar un color de lienzo para texto se ve
 * mal a simple vista en el código — que es el punto.
 * ─────────────────────────────────────────────────────────────────────────
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        lienzo: {
          /** Fondo de la aplicación. */
          base: '#0B0F16',
          /** Superficie de trabajo: tablas, tarjetas, encabezados. */
          panel: '#111725',
          /**
           * Refuerzo del bloque "otro sistema" (§5). 1.03:1 contra `panel`:
           * imperceptible A PROPÓSITO y puede desaparecer en un monitor mal
           * calibrado o a plena luz. NO carga significado por sí solo — el
           * peso está en `divisor` y en el encabezado del grupo.
           */
          panelAlt: '#0E141F',
          /** Separación entre filas. Decorativa. */
          borde: '#1F2937',
          /**
           * Separación entre GRUPOS de columnas. 3.52:1 contra `panel`:
           * cumple WCAG 1.4.11 porque sí carga significado — es lo que dice
           * "acá empieza otro sistema" cuando el fondo no se distingue.
           */
          divisor: '#5B6F91',
          /** Fila bajo el cursor. */
          realce: '#161E2E',
        },
        tinta: {
          /** El dato: nombre, monto, estado. 15.2:1 */
          fuerte: '#E8EDF5',
          /** Etiquetas, encabezados de columna, valores secundarios. 8.5:1 */
          media: '#A8B4C6',
          /** Sub-líneas y notas. 5.2:1 — bajo, pero AA. */
          debil: '#7C8CA3',
        },
        senal: {
          /** Un cliente que pagó está bloqueado ahora. 7.7:1 */
          critico: '#F98A8A',
          /** Algo quedó sin confirmar, o el cliente está en gracia. 11.0:1 */
          alerta: '#F5C451',
          /** Falta escalar: fuga de plata, sin daño al cliente. 9.5:1 */
          info: '#7FC4F5',
          /** El producto confirmó. 8.6:1 */
          ok: '#58C79A',
        },
      },
      fontSize: {
        /**
         * Escala corta a propósito. La jerarquía sale del PESO y del COLOR,
         * que no ocupan alto de fila; el tamaño casi no varía porque cada
         * píxel de más son filas menos en pantalla.
         */
        titulo: ['0.9375rem', { lineHeight: '1.25rem', fontWeight: '600' }],
        dato: ['0.8125rem', { lineHeight: '1.125rem' }],
        micro: ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        /** Encabezados de grupo en versalitas. */
        grupo: '0.08em',
      },
    },
  },
  plugins: [],
}
