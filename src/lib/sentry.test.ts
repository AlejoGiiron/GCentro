import { describe, it, expect } from 'vitest'
import { scrubValue } from './sentry'

/**
 * Estos tests SON la política de privacidad, no su documentación.
 *
 * G-Centro maneja los datos comerciales de los clientes de G-Vento (razón
 * social, NIT, contacto) y el histórico de pagos. Si alguien afloja el
 * redactor, acá se cae — y se entera antes de mandarle datos de un tercero a
 * un servicio externo.
 *
 * ⚠️ PARIDAD CON G-VENTO. Este módulo es una copia deliberada de
 * `gvento/src/lib/sentry.ts` (ver el encabezado de sentry.ts). El bloque
 * "integridad de los marcadores internos" está duplicado CASO POR CASO desde
 * el suite de G-Vento a propósito: es el núcleo del redactor y debe
 * comportarse idéntico en los dos repos. Si tocás uno, corré los dos.
 */

const scrub = (v: unknown) => scrubValue(v) as Record<string, unknown>
const scrubStr = (s: string) => scrubValue(s) as string

describe('scrubValue — lo que NUNCA debe salir', () => {
  it('redacta el valor de claves con PII del dominio', () => {
    const out = scrub({
      nombre_comercial: 'Bar G-10',
      razon_social: 'G-10 SAS',
      contacto_nombre: 'Juan Pérez',
      contacto_telefono: '3001234567',
      contacto_email: 'juan@g10.co',
    })
    for (const v of Object.values(out)) expect(v).toBe('[Filtrado]')
  })

  it('redacta el texto libre que escribe el admin', () => {
    // `notas`, `nota` y `motivo` son campos abiertos: ahí termina cualquier
    // cosa, incluido "hablé con Juan, 3001234567, paga el viernes".
    const out = scrub({
      notas: 'Debe dos meses — llamar al 3009876543',
      nota: 'Transferencia de Ana',
      motivo: 'Cambio de plan pedido por Carlos',
    })
    expect(out.notas).toBe('[Filtrado]')
    expect(out.nota).toBe('[Filtrado]')
    expect(out.motivo).toBe('[Filtrado]')
  })

  it('redacta el NIT aunque venga como número', () => {
    // El NIT identifica a la empresa cliente. Como STRING lo atrapa la pasada
    // numérica, pero como NUMBER pasaría intacto si la clave no fuera
    // sensible: por eso `nit` está en CLAVE_SENSIBLE y no se confía en la
    // forma del valor.
    expect(scrub({ nit: 900123456 }).nit).toBe('[Filtrado]')
    expect(scrub({ nit: '900123456-7' }).nit).toBe('[Filtrado]')
  })

  it('redacta montos y teléfonos sueltos dentro de un mensaje', () => {
    expect(scrubStr('El pago (79000) no cubre el período')).toBe(
      'El pago ([monto]) no cubre el período',
    )
    expect(scrubStr('Saldo pendiente: $ 1.250.000')).toBe('Saldo pendiente: [monto]')
    expect(scrubStr('Contacto 3001234567')).toBe('Contacto [Filtrado]')
  })

  it('redacta el VALOR del detalle de Postgres, conservando la columna', () => {
    expect(
      scrubStr('duplicate key value violates unique constraint. Key (nit)=(900123456) already exists.'),
    ).toBe('duplicate key value violates unique constraint. Key (nit)=([Filtrado]) already exists.')
  })

  it('redacta emails en cualquier posición', () => {
    expect(scrubStr('login falló para admin@gcentro.co')).toBe('login falló para [Filtrado]')
  })

  it('el allowlist numérico es fail-closed', () => {
    // Bajo una clave de confianza solo pasa un `number`. Un string ahí se
    // redacta entero: el redactor de texto no detecta nombres propios sueltos.
    expect(scrub({ count: 12 }).count).toBe(12)
    expect(scrub({ count: 'Juan Pérez' }).count).toBe('[Filtrado]')
    // Y una clave sensible gana sobre el allowlist aunque el valor sea número.
    expect(scrub({ contacto_telefono: 3001234567 }).contacto_telefono).toBe('[Filtrado]')
  })

  it('redacta PII anidada en profundidad', () => {
    const out = scrub({ extra: { suscripcion: { pagos: [{ nota: 'para Pedro' }] } } })
    const extra = out.extra as { suscripcion: { pagos: { nota: string }[] } }
    expect(extra.suscripcion.pagos[0].nota).toBe('[Filtrado]')
  })
})

describe('scrubValue — lo que SÍ debe llegar (o el error no sirve)', () => {
  it('conserva los UUID: identifican la fila sin identificar a nadie', () => {
    const id = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
    expect(scrubStr(`falló el UPDATE de la suscripción ${id}`)).toBe(
      `falló el UPDATE de la suscripción ${id}`,
    )
  })

  it('conserva las fechas ISO sin convertirlas en [monto]', () => {
    // El año son 4 dígitos: sin la protección explícita, `2026-08-05` salía
    // como `[monto]-08-05` y se perdía la fecha del cobro.
    expect(scrubStr('próximo cobro 2026-08-05T14:30:00.000Z')).toBe(
      'próximo cobro 2026-08-05T14:30:00.000Z',
    )
  })

  it('conserva el contexto curado de tags y user', () => {
    const out = scrub({ tags: { area: 'catalogo' }, user: { id: 'abc' } })
    expect(out.tags).toEqual({ area: 'catalogo' })
    expect(out.user).toEqual({ id: 'abc' })
  })

  it('conserva el stack trace intacto', () => {
    const stacktrace = {
      frames: [
        { filename: 'https://app.co/assets/index-4f2a9c1e.js', lineno: 1234, function: 'onSubmit' },
      ],
    }
    const out = scrub({ stacktrace })
    expect(out.stacktrace).toEqual(stacktrace)
  })

  it('no rompe con null, undefined ni booleanos', () => {
    const out = scrub({ a: null, b: undefined, c: true, d: 42 })
    expect(out).toEqual({ a: null, b: undefined, c: true, d: 42 })
  })

  it('corta la recursión en estructuras cíclicas sin colgarse', () => {
    const ciclo: Record<string, unknown> = { nivel: 1 }
    ciclo.self = ciclo
    expect(() => scrubValue(ciclo)).not.toThrow()
  })
})

/**
 * ⚠️ BLOQUE ESPEJO — duplicado caso por caso desde
 * `gvento/src/lib/sentry.test.ts`. Debe pasar IGUAL en los dos repos.
 *
 * Los marcadores internos que `scrubString` usa para salvar UUID y fechas ISO
 * de la pasada numérica van delimitados por NUL. Con delimitadores más
 * "legibles" —espacios, por ejemplo— el marcador choca con el texto real del
 * mensaje y lo corrompe: un `0` suelto se restaura como un UUID, y un índice
 * sin valor emite literalmente `undefined`. Es exactamente lo que pasó cuando
 * este módulo se copió desde G-Vento y el NUL se perdió en el camino.
 */
describe('scrubValue — integridad de los marcadores internos', () => {
  const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
  const NUL = String.fromCharCode(0)

  it('no confunde un dígito suelto del mensaje con un marcador', () => {
    expect(scrubStr(`reintento 0 de 3 para la orden ${UUID}`)).toBe(
      `reintento 0 de 3 para la orden ${UUID}`,
    )
  })

  it('nunca emite `undefined` por un índice que no existe', () => {
    expect(scrubStr('código 7 rechazado')).toBe('código 7 rechazado')
  })

  it('un NUL en la entrada no puede falsificar un marcador', () => {
    // Si el texto de origen pudiera inyectar un marcador, podría extraer un
    // valor guardado que no le corresponde.
    expect(scrubStr(`${NUL}0${NUL} dato ${UUID}`)).toBe(`0 dato ${UUID}`)
  })

  it('soporta más de mil marcadores en un mismo string', () => {
    // El índice cruza los 4 dígitos y queda al alcance de RE_NUM_LARGO
    // (`\b\d{4,}\b`), que lo convertiría en `[monto]` y rompería la
    // restauración. Improbable en la práctica, pero es exactamente el tipo de
    // borde que nadie vuelve a mirar.
    const entrada = Array.from({ length: 1001 }, () => UUID).join(' ')
    expect(scrubStr(entrada)).toBe(entrada)
  })
})

/**
 * Diferencias DELIBERADAS con G-Vento. Se testean para que queden fijadas:
 * si algún día alguien "unifica" los dos módulos, estos casos explican qué se
 * pierde en cada dirección.
 */
describe('scrubValue — divergencias deliberadas con G-Vento', () => {
  it('NO preserva `#N`: G-Centro no tiene ventas numeradas', () => {
    // En G-Vento `#1234` sobrevive (es el correlativo de venta, diagnóstico
    // clave). Acá no existe ese concepto, así que gana la regla numérica y el
    // número se redacta. Es lo correcto: sin correlativos, un `#` seguido de
    // 4+ dígitos es mucho más probable que sea plata.
    expect(scrubStr('registro #1234')).toBe('registro #[monto]')
  })
})
