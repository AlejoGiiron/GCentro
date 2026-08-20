/**
 * Que la plantilla que se le ofrece al operador SEA ENVIABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MODO DE FALLO QUE ATRAPA, y que ya ocurrió:
 *
 * Al bajar `MENSAJE_MAX` de 280 a 140 (19/08/2026), `restringida` quedó en
 * 177 caracteres y `suspendida` en 209. El botón «usar plantilla» seguía
 * cargando el texto, el operador lo veía completo, y recién al confirmar el
 * puente lo rechazaba con un 400. Nada en el repo lo impedía: no había un
 * solo test sobre las plantillas.
 *
 * Por eso el largo NO se compara acá contra un número. Se llama a
 * `normalizarMensaje`, que es LA MISMA función que corre en el borde antes de
 * firmar el cuerpo. Un test que reimplemente la regla puede pasar mientras el
 * borde rechaza; éste no puede.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest'
import { PLANTILLAS, largoEfectivo } from './plantillas'
import { NIVELES } from './bandera'
import { normalizarMensaje } from '../../supabase/functions/_shared/contrato.ts'

describe('toda plantilla es enviable tal como se ofrece', () => {
  for (const nivel of NIVELES) {
    it(`«${nivel}» pasa la validación del borde`, () => {
      const { texto } = PLANTILLAS[nivel]
      expect(() => normalizarMensaje(texto)).not.toThrow()
    })
  }

  it('`activa` no propone texto: no hay nada que comunicar', () => {
    // Y `normalizarMensaje` lo colapsa a null, que es lo que borra el banner.
    expect(PLANTILLAS.activa.texto).toBe('')
    expect(normalizarMensaje(PLANTILLAS.activa.texto)).toBeNull()
  })

  it('las plantillas con texto no viajan con espacios de más', () => {
    // `largoEfectivo` es lo que cuenta el editor; si difiriera del texto
    // guardado, el contador diría un número y viajaría otro.
    for (const nivel of NIVELES) {
      const { texto } = PLANTILLAS[nivel]
      expect(largoEfectivo(texto), nivel).toBe(texto.length)
    }
  })

  it('los niveles que cobran nombran qué NO se bloquea', () => {
    // §6: restringida y suspendida quedaron casi idénticas en efecto, así que
    // el mensaje es la palanca. La regla de redacción que más importa es no
    // amenazar con algo que no pasa — se descubre en el peor momento. Al
    // recortar para entrar en 140 es justo lo que se corre riesgo de perder.
    for (const nivel of ['restringida', 'suspendida'] as const) {
      expect(PLANTILLAS[nivel].texto, nivel).toMatch(/vender y facturar/i)
    }
  })
})
