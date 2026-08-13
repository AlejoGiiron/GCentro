/**
 * La firma HMAC.
 *
 * ⚠️ EL VERIFICADOR ES INDEPENDIENTE. Estos tests no comprueban la firma con
 * `hmacHex` —eso sería circular: cualquier bug en la implementación pasaría
 * inadvertido porque los dos lados de la igualdad lo tendrían—. Se recalcula
 * con `node:crypto`, que es otra implementación de HMAC-SHA256 escrita por
 * otra gente. Si las dos coinciden, la firma es correcta de verdad.
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { firmarPeticion, hmacHex, VENTANA_SEGUNDOS } from './firma.ts'
import { construirCuerpo } from './contrato.ts'

const SECRETO = 'secreto-de-prueba-no-es-el-real'
const ORG = '12b53bae-a4f7-4076-80f9-8f9288bd0567'

/** Implementación INDEPENDIENTE, la de Node. */
const hmacNode = (mensaje: string, secreto: string) =>
  createHmac('sha256', secreto).update(mensaje, 'utf8').digest('hex')

describe('hmacHex coincide con una implementación independiente', () => {
  const CASOS = [
    'hola',
    '',
    '1754870400.{"organization_id":"x","status":"active","message":null}',
    'acentos: ñ á é í ó ú ü',
    'emoji: 🚩',
    'a'.repeat(10_000),
  ]

  for (const mensaje of CASOS) {
    it(`«${mensaje.slice(0, 40)}${mensaje.length > 40 ? '…' : ''}»`, async () => {
      expect(await hmacHex(mensaje, SECRETO)).toBe(hmacNode(mensaje, SECRETO))
    })
  }

  it('es hex en minúsculas, 64 caracteres', () => {
    // El otro lado compara strings. Un digest en base64 o en mayúsculas da 401
    // sin ninguna pista de por qué.
    return expect(hmacHex('x', SECRETO)).resolves.toMatch(/^[0-9a-f]{64}$/)
  })

  it('un secreto distinto da una firma distinta', async () => {
    expect(await hmacHex('x', 'uno')).not.toBe(await hmacHex('x', 'otro'))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LA FIRMA SE CALCULA SOBRE EL STRING EXACTO QUE SE MANDA
// ═══════════════════════════════════════════════════════════════════════════
describe('firmarPeticion — sobre `${timestamp}.${cuerpo_crudo}`', () => {
  it('la firma verifica contra el cuerpo devuelto y el timestamp del header', async () => {
    const cuerpo = construirCuerpo(ORG, 'restringida', 'Pago pendiente.')
    const firmada = await firmarPeticion(cuerpo, SECRETO, 1_754_870_400)

    const ts = firmada.headers['x-gcentro-timestamp']
    const esperada = hmacNode(`${ts}.${firmada.cuerpo}`, SECRETO)

    expect(firmada.headers['x-gcentro-signature']).toBe(esperada)
  })

  it('el cuerpo que sale es IDÉNTICO al que entró: no se re-serializa', () => {
    // Si `firmarPeticion` parseara y volviera a serializar, un cambio de orden
    // de claves o un espacio distinto rompería la firma del otro lado. El test
    // fija que el string atraviesa sin tocarse.
    const cuerpo = '{"b":2,"a":1}' // orden a propósito "mal"
    return expect(firmarPeticion(cuerpo, SECRETO, 1_754_870_400)).resolves.toMatchObject({
      cuerpo,
    })
  })

  it('re-serializar el objeto equivalente da OTRA firma', async () => {
    // La demostración de por qué `construirCuerpo` devuelve un string. Estos
    // dos JSON son el mismo objeto y firman distinto.
    const a = '{"organization_id":"x","status":"active","message":null}'
    const b = '{"status":"active","organization_id":"x","message":null}'
    const fa = await firmarPeticion(a, SECRETO, 1_000)
    const fb = await firmarPeticion(b, SECRETO, 1_000)
    expect(fa.headers['x-gcentro-signature']).not.toBe(fb.headers['x-gcentro-signature'])
  })

  it('el timestamp va en SEGUNDOS, no en milisegundos', async () => {
    // `Date.now()` da milisegundos. Mandarlos tal cual pone el timestamp
    // ~55.000 años en el futuro y devuelve 401 siempre. El bug clásico.
    const firmada = await firmarPeticion('{}', SECRETO, 1_754_870_400.987)
    expect(firmada.headers['x-gcentro-timestamp']).toBe('1754870400')
    expect(Number(firmada.headers['x-gcentro-timestamp'])).toBeLessThan(4_000_000_000)
  })

  it('el timestamp es entero: nada de decimales en el header', async () => {
    const firmada = await firmarPeticion('{}', SECRETO, 1_754_870_400.5)
    expect(firmada.headers['x-gcentro-timestamp']).not.toContain('.')
  })

  it('dos timestamps distintos dan firmas distintas sobre el mismo cuerpo', async () => {
    // Es lo que impide repetir una llamada capturada fuera de la ventana.
    const a = await firmarPeticion('{}', SECRETO, 1_000)
    const b = await firmarPeticion('{}', SECRETO, 1_001)
    expect(a.headers['x-gcentro-signature']).not.toBe(b.headers['x-gcentro-signature'])
  })

  it('manda los dos headers del contrato', () => {
    return expect(firmarPeticion('{}', SECRETO, 1_000)).resolves.toMatchObject({
      headers: {
        'Content-Type': 'application/json',
        'x-gcentro-timestamp': '1000',
      },
    })
  })

  it('NO manda Authorization ni apikey', async () => {
    // El contrato lo pide explícitamente: verify-JWT está desactivado del otro
    // lado y la única autenticación es el HMAC. Mandar un token de G-Centro
    // sería filtrar una credencial nuestra a los logs de otro proyecto.
    const firmada = await firmarPeticion('{}', SECRETO, 1_000)
    const claves = Object.keys(firmada.headers).map((k) => k.toLowerCase())
    expect(claves).not.toContain('authorization')
    expect(claves).not.toContain('apikey')
  })

  it('sin secreto no firma: revienta en vez de mandar sin autenticar', () => {
    return expect(firmarPeticion('{}', '', 1_000)).rejects.toThrow(/secreto/i)
  })

  it('la ventana declarada es la del contrato', () => {
    expect(VENTANA_SEGUNDOS).toBe(300)
  })
})
