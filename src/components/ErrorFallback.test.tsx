/**
 * Que la pantalla de error no afirme algo falso.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Decía «El error ya se reportó al equipo» SIEMPRE. Con la telemetría
 * apagada —que es el estado del despliegue del 16/08— eso es mentira, en la
 * única pantalla que alguien lee cuando algo ya salió mal. Y encima le quita
 * la razón para avisar: si el sistema dice que ya avisó, nadie avisa.
 *
 * Es la misma familia que las tres afirmaciones que el repaso encontró en el
 * documento, sólo que ésta la lee un operador en vez de un desarrollador.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ErrorFallback } from './ErrorFallback'
import { SOPORTE } from '@/lib/soporte'

const html = (eventId: string | null) => renderToString(<ErrorFallback eventId={eventId} />)

describe('ErrorFallback', () => {
  it('CON reporte: dice que ya se reportó y muestra el código', () => {
    const h = html('fc847dba1234')
    expect(h).toContain('ya se reportó')
    expect(h).toContain('fc847dba')
  })

  it('SIN reporte: NO dice que se reportó', () => {
    // La regresión concreta. Si alguien vuelve a poner el texto fijo, esto cae.
    const h = html(null)
    expect(h).not.toContain('ya se reportó')
  })

  it('SIN reporte: dice qué hacer y a quién avisar', () => {
    // Un error sin telemetría y sin instrucción es un callejón: el operador
    // recarga, el error se pierde, y nadie se entera nunca.
    const h = html(null)
    expect(h).toContain(SOPORTE.destinatario)
    expect(h).toContain('avisale')
  })

  it('SIN reporte: no muestra un código vacío', () => {
    expect(html(null)).not.toContain('Código del error')
  })

  it('el botón de recargar está en los dos casos', () => {
    // Es la única salida de la pantalla. Perderlo la convierte en una trampa.
    for (const id of ['abc12345', null]) expect(html(id)).toContain('Recargar')
  })
})
