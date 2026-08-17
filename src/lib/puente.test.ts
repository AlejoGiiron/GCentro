/**
 * Las cinco respuestas del puente.
 *
 * Antes esto era `data as ResultadoBandera`: sin validar, y con una rama
 * entera escondida — `functions.invoke` TIRA ante cualquier no-2xx, así que
 * el 502 (llegó, no se aplicó, sabemos el código) se mostraba como «no se
 * pudo llegar al puente».
 */
import { describe, it, expect } from 'vitest'
import { interpretar } from './puente'

const BANDERA = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
/** Imita un `FunctionsHttpError`: trae la respuesta en `context`. */
const httpError = (cuerpo: unknown) => ({ context: { json: async () => cuerpo } })

describe('200', () => {
  it('aplicado, con cambio', async () => {
    expect(
      await interpretar(
        { ok: true, bandera_id: BANDERA, changed: true, subscription_updated_at: '2026-08-17T04:14:20Z', intentos: 1 },
        null,
      ),
    ).toEqual({ estado: 'aplicado', cambio: true, desde: '2026-08-17T04:14:20Z', banderaId: BANDERA })
  })

  it('aplicado sin cambio: `false` se conserva, no se confunde con ausente', async () => {
    const r = await interpretar({ ok: true, bandera_id: BANDERA, changed: false, intentos: 1 }, null)
    expect(r).toMatchObject({ estado: 'aplicado', cambio: false })
  })

  it('un 200 con cuerpo ilegible deja `cambio` en null, no en false', async () => {
    // 009: null es "no sabemos", false es "no cambió". No son lo mismo.
    const r = await interpretar({ ok: true, bandera_id: BANDERA, intentos: 1 }, null)
    expect(r).toMatchObject({ estado: 'aplicado', cambio: null })
  })
})

describe('502 — la rama que estaba escondida', () => {
  it('llegó y no se aplicó: se conserva el código', async () => {
    // Antes esto se veía como "no se pudo llegar al puente" y el código —lo
    // único que dice si el problema es el secreto, la red o el otro lado— se
    // perdía por completo.
    expect(
      await interpretar(
        null,
        httpError({ ok: false, bandera_id: BANDERA, bandera_error_codigo: 'HMAC_INVALIDO', intentos: 1 }),
      ),
    ).toEqual({ estado: 'no_aplicado', codigo: 'HMAC_INVALIDO', banderaId: BANDERA, intentos: 1 })
  })
})

describe('4xx del handler', () => {
  it('un rechazo trae su mensaje', async () => {
    expect(await interpretar(null, httpError({ error: 'La suscripción no tiene organizacion_externa_id.' }))).toEqual({
      estado: 'rechazado',
      mensaje: 'La suscripción no tiene organizacion_externa_id.',
    })
  })
})

describe('transporte', () => {
  it('sin cuerpo que leer = nunca se habló con nadie', async () => {
    expect(await interpretar(null, new TypeError('fetch failed'))).toEqual({ estado: 'sin_alcanzar' })
  })
})

describe('ILEGIBLE — no es lo mismo que fallar', () => {
  it('un 200 con otra forma NO se lee como aplicado', async () => {
    // El defecto que el cast permitía: `r.ok` de cualquier cosa.
    for (const basura of [{}, { ok: 'true' }, null, 'hola', { ok: true }, { changed: true }]) {
      expect(await interpretar(basura, null), JSON.stringify(basura)).toEqual({ estado: 'ilegible' })
    }
  })

  it('un error con cuerpo que no reconocemos tampoco', async () => {
    expect(await interpretar(null, httpError({ cualquier: 'cosa' }))).toEqual({ estado: 'ilegible' })
  })

  it('un cuerpo que no es JSON: se habló, no se entendió', async () => {
    // `sin_alcanzar` sería mentira — hubo respuesta.
    const roto = { context: { json: async () => { throw new Error('no es json') } } }
    expect(await interpretar(null, roto)).toEqual({ estado: 'ilegible' })
  })

  it('NUNCA tira: un error dentro del manejo de errores deja la pantalla muda', async () => {
    const explota = { context: { json: () => { throw new Error('boom') } } }
    await expect(interpretar(undefined, explota)).resolves.toBeTruthy()
  })
})
