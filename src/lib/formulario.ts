/**
 * Las clases de los formularios, en un solo lugar.
 *
 * Estaban duplicadas en `DetalleSuscripcion` y en `AltaSuscripcion`, y al
 * aparecer la tercera pantalla que las necesita —vincular— la duplicación
 * dejaba de ser tolerable: tres copias divergen, dos todavía se comparan.
 *
 * Todos los tonos salen de `tokens.ts` y están medidos (§7).
 */
import { FOCO } from './tokens'

export const CAMPO =
  'w-full rounded border border-lienzo-divisor bg-lienzo-panel px-2 py-1 text-dato ' +
  `text-tinta-fuerte placeholder:text-tinta-debil ${FOCO}`

export const ETIQUETA = 'block text-micro font-medium text-tinta-media mb-1'

export const BOTON =
  `rounded px-3 py-1.5 text-dato font-medium ${FOCO} disabled:opacity-50 disabled:cursor-not-allowed`

export const SECCION = 'rounded border border-lienzo-borde bg-lienzo-panel p-4'

export const TITULO_SECCION =
  'mb-3 text-micro font-semibold uppercase tracking-grupo text-tinta-media'
