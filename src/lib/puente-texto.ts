/**
 * Cómo se le cuenta al operador lo que contestó el puente.
 *
 * En un módulo aparte porque **las cinco respuestas se muestran en dos
 * pantallas** —el botón de la 2 y el reintento de la 3— y dos redacciones
 * distintas para el mismo estado es cómo alguien concluye cosas distintas
 * mirando el mismo hecho.
 */
import type { ResultadoPuente } from './puente'

export interface TextoPuente {
  texto: string
  /** `ok` pinta en verde; el resto en rojo. */
  ok: boolean
}

export function textoDe(r: ResultadoPuente): TextoPuente {
  switch (r.estado) {
    case 'aplicado':
      return {
        ok: true,
        // `cambio: null` es "200 con cuerpo ilegible": se aplicó, pero no
        // sabemos si movió algo. No se dice ninguna de las dos cosas.
        texto:
          r.cambio === true
            ? 'Aplicado en el producto.'
            : r.cambio === false
              ? 'Ya estaba así — no se movió nada.'
              : 'Aplicado. El producto no informó si cambió algo.',
      }
    case 'no_aplicado':
      // Llegó y falló: el código es lo accionable, y queda en la cola.
      return { ok: false, texto: `No se aplicó (${r.codigo}). Quedó en la cola.` }
    case 'rechazado':
      return { ok: false, texto: r.mensaje }
    case 'sin_alcanzar':
      return { ok: false, texto: 'No se pudo llegar al puente. Quedó sin aplicar.' }
    case 'ilegible':
      // ⚠️ NO es una falla del puente: es que contestó algo que no entendemos.
      // Se dice distinto porque se arregla en otro lado — reintentar no sirve.
      return {
        ok: false,
        texto: 'El puente contestó algo inesperado. No se puede saber si se aplicó; avisá.',
      }
  }
}
