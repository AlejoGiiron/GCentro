/**
 * El contrato con `aplicar-estado`, probado como contrato.
 *
 * La pregunta que estos tests contestan no es "¿el código hace lo que dice el
 * código?" sino "¿lo que sale de acá es lo que G-Vento documentó que acepta?".
 * Por eso las listas de valores están escritas a mano, copiadas del contrato,
 * en vez de derivarse de las constantes del módulo: derivarlas haría que un
 * cambio en el módulo cambiara también la expectativa, y el test pasaría
 * siempre.
 */
import { describe, it, expect } from 'vitest'
import {
  codigoDeEstadoHttp,
  codigoDeExcepcion,
  construirCuerpo,
  ErrorDeContrato,
  esNivel,
  esReintentable,
  ESTADOS_PRODUCTO,
  MENSAJE_MAX,
  NIVELES,
  normalizarMensaje,
  traducirNivel,
  type BanderaErrorCodigo,
} from './contrato.ts'

const ORG = '12b53bae-a4f7-4076-80f9-8f9288bd0567'

// ═══════════════════════════════════════════════════════════════════════════
// LOS CINCO VALORES DEL MAPEO
// ═══════════════════════════════════════════════════════════════════════════
describe('traducirNivel — los cinco valores del contrato', () => {
  // Copiado del contrato que mandó el equipo del producto. NO derivado.
  const CONTRATO: Array<[string, string]> = [
    ['activa', 'active'],
    ['por_vencer', 'expiring'],
    ['gracia', 'grace'],
    ['restringida', 'restricted'],
    ['suspendida', 'suspended'],
  ]

  for (const [nuestro, suyo] of CONTRATO) {
    it(`${nuestro} → ${suyo}`, () => {
      expect(traducirNivel(nuestro)).toBe(suyo)
    })
  }

  it('los cinco niveles de §4 tienen traducción, sin faltar ninguno', () => {
    expect(NIVELES.map(traducirNivel).sort()).toEqual([...ESTADOS_PRODUCTO].sort())
  })

  it('la traducción es BIYECTIVA: dos niveles nunca colapsan en el mismo estado', () => {
    // Si dos niveles mapearan al mismo valor, `restringida` y `suspendida` se
    // volverían indistinguibles del otro lado y el banner —que según §6 es la
    // palanca real de cobranza— perdería su único escalón.
    const salidas = NIVELES.map(traducirNivel)
    expect(new Set(salidas).size).toBe(NIVELES.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// UN ESTADO DESCONOCIDO NO SE MANDA NUNCA
// ═══════════════════════════════════════════════════════════════════════════
describe('un valor desconocido falla de NUESTRO lado, antes de la llamada', () => {
  // El punto de todo esto: con fail-open (§5), un valor que ellos no
  // reconocen probablemente se lea como `activa`. Depender del 400 del otro
  // lado para atajarlo convierte una suspensión en "todo bien", en silencio.
  const BASURA = [
    'active', // el valor de ELLOS: correcto allá, inválido acá
    'suspended',
    'ACTIVA', // mayúsculas
    'suspendido', // género equivocado
    'restringido',
    'por-vencer', // guion en vez de guion bajo
    'pendiente', // estado de implementación, no nivel
    'cancelada', // estado COMERCIAL, no nivel de gating
    '',
    ' activa',
    'activa ',
  ]

  for (const valor of BASURA) {
    it(`${JSON.stringify(valor)} — tira ErrorDeContrato`, () => {
      expect(() => traducirNivel(valor)).toThrow(ErrorDeContrato)
    })
  }

  it('`cancelada` es el caso peligroso: es un estado real del esquema', () => {
    // `suscripciones.estado` acepta 'cancelada', y el nivel de gating no. Es
    // exactamente la confusión que §4 advierte ("dos enums que es fácil
    // confundir"). Tiene que reventar, no traducirse a algo parecido.
    expect(() => traducirNivel('cancelada')).toThrow(ErrorDeContrato)
  })

  it('construirCuerpo tampoco deja pasar un nivel inválido', () => {
    expect(() => construirCuerpo(ORG, 'suspended', null)).toThrow(ErrorDeContrato)
  })

  it('esNivel acepta los cinco y nada más', () => {
    for (const n of NIVELES) expect(esNivel(n)).toBe(true)
    for (const b of ['active', 'cancelada', 42, null, undefined, {}]) {
      expect(esNivel(b)).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EL CUERPO
// ═══════════════════════════════════════════════════════════════════════════
describe('construirCuerpo', () => {
  it('tiene las tres claves del contrato y ninguna más', () => {
    const cuerpo = JSON.parse(construirCuerpo(ORG, 'gracia', 'Pendiente de pago.'))
    expect(Object.keys(cuerpo).sort()).toEqual(['message', 'organization_id', 'status'])
  })

  it('manda el uuid de la organización, nunca el nombre', () => {
    const cuerpo = JSON.parse(construirCuerpo(ORG, 'activa', null))
    expect(cuerpo.organization_id).toBe(ORG)
  })

  it('devuelve un STRING, no un objeto', () => {
    // Es la mitad de la seguridad del HMAC: si devolviera un objeto habría dos
    // serializaciones posibles, la firmada y la mandada.
    expect(typeof construirCuerpo(ORG, 'activa', null)).toBe('string')
  })

  it('sin organizacion_externa_id no se construye nada', () => {
    // El caso de G-10 y Salchimelo antes de la migración 007. Reventar acá es
    // mucho mejor que mandar `"organization_id": null` y recibir un 404.
    expect(() => construirCuerpo(null, 'activa', null)).toThrow(ErrorDeContrato)
  })

  it('un organizacion_externa_id que no es uuid tampoco pasa', () => {
    expect(() => construirCuerpo('G-10', 'activa', null)).toThrow(ErrorDeContrato)
    expect(() => construirCuerpo('12b53bae', 'activa', null)).toThrow(ErrorDeContrato)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EL MENSAJE
// ═══════════════════════════════════════════════════════════════════════════
describe('normalizarMensaje', () => {
  it('null y string vacío colapsan los dos a null', () => {
    // Un '' del otro lado renderiza un banner en blanco: un rectángulo de
    // color sin texto, que es peor que no mandar nada.
    expect(normalizarMensaje(null)).toBeNull()
    expect(normalizarMensaje(undefined)).toBeNull()
    expect(normalizarMensaje('')).toBeNull()
    expect(normalizarMensaje('   ')).toBeNull()
  })

  it('recorta los espacios de los bordes', () => {
    expect(normalizarMensaje('  Pago pendiente.  ')).toBe('Pago pendiente.')
  })

  it(`acepta exactamente ${MENSAJE_MAX} caracteres`, () => {
    const justo = 'a'.repeat(MENSAJE_MAX)
    expect(normalizarMensaje(justo)).toBe(justo)
  })

  it('rechaza uno más', () => {
    expect(() => normalizarMensaje('a'.repeat(MENSAJE_MAX + 1))).toThrow(ErrorDeContrato)
  })

  it('el largo se mide DESPUÉS de recortar', () => {
    // Si no, 300 espacios y una palabra fallarían por un texto de una palabra.
    const conEspacios = `   ${'a'.repeat(MENSAJE_MAX)}   `
    expect(normalizarMensaje(conEspacios)).toHaveLength(MENSAJE_MAX)
  })

  it('un número no es un mensaje', () => {
    expect(() => normalizarMensaje(42)).toThrow(ErrorDeContrato)
    expect(() => normalizarMensaje({ texto: 'hola' })).toThrow(ErrorDeContrato)
  })

  it('el límite lo pone G-Centro: G-Vento acepta text sin límite', () => {
    // Fijado como test para que quede escrito que el 280 es una decisión de
    // producto de ESTE lado, no una restricción heredada. Si se mueve, se
    // mueve a propósito.
    expect(MENSAJE_MAX).toBe(280)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CADA CÓDIGO DE RESPUESTA AL ENUM CORRECTO
// ═══════════════════════════════════════════════════════════════════════════
describe('codigoDeEstadoHttp — el mapeo del contrato', () => {
  // Los tres que el contrato nombra explícitamente.
  const DEL_CONTRATO: Array<[number, BanderaErrorCodigo]> = [
    [401, 'HMAC_INVALIDO'], // firma o ventana
    [400, 'HTTP_4XX'], // estado inválido
    [404, 'ORG_NO_ENCONTRADA'], // organización inexistente
  ]

  for (const [http, codigo] of DEL_CONTRATO) {
    it(`${http} → ${codigo}`, () => {
      expect(codigoDeEstadoHttp(http)).toBe(codigo)
    })
  }

  it('401 gana sobre el rango 4xx genérico', () => {
    // Si el orden de los `if` se invirtiera, un secreto mal rotado se
    // diagnosticaría como "el otro lado rechazó el dato" y se buscaría el bug
    // en el lugar equivocado.
    expect(codigoDeEstadoHttp(401)).toBe('HMAC_INVALIDO')
    expect(codigoDeEstadoHttp(401)).not.toBe('HTTP_4XX')
  })

  it('404 gana sobre el rango 4xx genérico', () => {
    expect(codigoDeEstadoHttp(404)).toBe('ORG_NO_ENCONTRADA')
  })

  it('el resto del rango 4xx cae en HTTP_4XX', () => {
    for (const http of [402, 403, 405, 409, 418, 422, 429, 499]) {
      expect(codigoDeEstadoHttp(http)).toBe('HTTP_4XX')
    }
  })

  it('todo 5xx cae en HTTP_5XX', () => {
    for (const http of [500, 502, 503, 504, 599]) {
      expect(codigoDeEstadoHttp(http)).toBe('HTTP_5XX')
    }
  })

  it('un código fuera de rango no se inventa una categoría', () => {
    for (const http of [0, 200, 301, 600, -1]) {
      expect(codigoDeEstadoHttp(http)).toBe('DESCONOCIDO')
    }
  })
})

describe('codigoDeExcepcion — transporte', () => {
  it('el timeout de AbortSignal → TIMEOUT', () => {
    const e = new Error('signal timed out')
    e.name = 'TimeoutError'
    expect(codigoDeExcepcion(e)).toBe('TIMEOUT')
  })

  it('un abort manual también → TIMEOUT', () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    expect(codigoDeExcepcion(e)).toBe('TIMEOUT')
  })

  it('el TypeError de fetch (DNS, conexión, TLS) → RED', () => {
    expect(codigoDeExcepcion(new TypeError('fetch failed'))).toBe('RED')
  })

  it('cualquier otra cosa → DESCONOCIDO, sin inventar', () => {
    expect(codigoDeExcepcion(new Error('vaya a saber'))).toBe('DESCONOCIDO')
    expect(codigoDeExcepcion('un string suelto')).toBe('DESCONOCIDO')
    expect(codigoDeExcepcion(null)).toBe('DESCONOCIDO')
  })

  it('los siete códigos del enum del esquema están cubiertos por el módulo', () => {
    // `bandera_error_codigo` tiene un CHECK con estos siete valores. Si el
    // módulo produjera uno que no está, el INSERT reventaría en producción.
    const DEL_ESQUEMA = [
      'HMAC_INVALIDO',
      'TIMEOUT',
      'HTTP_4XX',
      'HTTP_5XX',
      'ORG_NO_ENCONTRADA',
      'RED',
      'DESCONOCIDO',
    ]
    const producidos = new Set<string>([
      ...[401, 404, 400, 500, 200].map(codigoDeEstadoHttp),
      codigoDeExcepcion(Object.assign(new Error(''), { name: 'TimeoutError' })),
      codigoDeExcepcion(new TypeError('')),
    ])
    for (const c of producidos) expect(DEL_ESQUEMA).toContain(c)
    // Y al revés: los siete son alcanzables, no hay valores muertos.
    expect(producidos.size).toBe(DEL_ESQUEMA.length)
  })
})

describe('esReintentable', () => {
  it('lo transitorio se reintenta', () => {
    expect(esReintentable('TIMEOUT')).toBe(true)
    expect(esReintentable('RED')).toBe(true)
    expect(esReintentable('HTTP_5XX')).toBe(true)
  })

  it('un secreto mal configurado NO se reintenta', () => {
    // Tres 401 idénticos, treinta segundos de espera, y el mismo problema.
    expect(esReintentable('HMAC_INVALIDO')).toBe(false)
  })

  it('un dato que el otro lado rechaza NO se reintenta', () => {
    expect(esReintentable('HTTP_4XX')).toBe(false)
    expect(esReintentable('ORG_NO_ENCONTRADA')).toBe(false)
  })

  it('lo que no se pudo clasificar NO se reintenta', () => {
    expect(esReintentable('DESCONOCIDO')).toBe(false)
  })
})
