/**
 * Que el preflight no vuelva a romper el botón.
 *
 * El 16/08 se descubrió que la Edge Function respondía 405 al `OPTIONS` sin
 * cabeceras CORS, así que el navegador bloqueaba la llamada. Estos tests
 * fijan lo mínimo que un preflight necesita para pasar.
 */
import { describe, it, expect } from 'vitest'
import { CORS, respuestaPreflight } from './cors.ts'

describe('CORS', () => {
  it('el preflight responde 204, no 405', () => {
    expect(respuestaPreflight().status).toBe(204)
  })

  it('permite POST y OPTIONS', () => {
    expect(CORS['Access-Control-Allow-Methods']).toContain('POST')
    expect(CORS['Access-Control-Allow-Methods']).toContain('OPTIONS')
  })

  it('declara las cuatro cabeceras que manda supabase-js', () => {
    // `apikey` y `x-client-info` las agrega el cliente por su cuenta. Sin
    // declararlas el preflight falla aunque `authorization` esté permitido —
    // y el error del navegador no dice cuál falta.
    const permitidas = CORS['Access-Control-Allow-Headers'].toLowerCase()
    for (const h of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
      expect(permitidas, `falta ${h}`).toContain(h)
    }
  })

  it('la respuesta del preflight lleva las cabeceras, no sólo el 204', () => {
    const h = respuestaPreflight().headers
    expect(h.get('Access-Control-Allow-Origin')).toBe('*')
    expect(h.get('Access-Control-Allow-Headers')).toBeTruthy()
  })
})
