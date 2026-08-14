/**
 * EL ORDEN DE OPERACIONES DEL HANDLER.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * La invariante que estos tests defienden, y que el 14/08/2026 resultó falsa
 * en el camino real mientras 416 tests decían que todo estaba bien:
 *
 *   NINGUNA ENTRADA INVÁLIDA ESCRIBE EN `banderas_pendientes`.
 *
 * Una fila en la cola significa "esto hay que aplicarlo y se va a reintentar
 * hasta lograrlo". Un dato inválido no es eso: no se arregla reintentando, y
 * cuando exista el barrido en diferido (§9.7) una fila así se reintentaría
 * para siempre. `confirmado_en is null` tiene que poder leerse como "falta
 * aplicar", y cada fila imposible de completar rompe esa lectura.
 *
 * POR QUÉ NO ALCANZABA `enviar.test.ts`: ahí se prueba que `enviarBandera`
 * tira antes de tocar la red. Es cierto, y es irrelevante — el insert no está
 * en `enviarBandera`, está en el handler. Testear la unidad equivocada es
 * indistinguible de no testear.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  sincronizarBandera,
  type CamposCierre,
  type PuertoDatos,
  type SuscripcionParaBandera,
} from './sincronizar.ts'
import { enviarBandera, type ParametrosEnvio, type ResultadoEnvio } from './enviar.ts'
import { MENSAJE_MAX } from './contrato.ts'

const SECRETO = 'secreto-de-prueba-no-es-el-real'
const SUS_LAB = 'ebb49249-7546-4e57-9a37-33d8ba0dbd79'
const ORG_LAB = 'f4fa692d-6cf3-43fb-a17f-18b8b163c918'
const URL_PUENTE = 'https://zudeogjmxfklrrhyvezy.supabase.co/functions/v1/aplicar-estado'

const SUSCRIPCION_OK: SuscripcionParaBandera = {
  id: SUS_LAB,
  organizacion_externa_id: ORG_LAB,
  producto_codigo: 'g-vento',
  url_aplicar_estado: URL_PUENTE,
}

/** Puerto falso que REGISTRA todo. Lo que importa es qué se llamó y cuándo. */
function puertoFalso(opciones: {
  admin?: boolean
  suscripcion?: SuscripcionParaBandera | null
} = {}) {
  const bitacora: string[] = []
  const cierres: Array<{ id: string; campos: CamposCierre }> = []
  let creadas = 0

  const datos: PuertoDatos = {
    async esAdmin() {
      bitacora.push('esAdmin')
      return opciones.admin ?? true
    },
    async buscarSuscripcion(id) {
      bitacora.push('buscarSuscripcion')
      return opciones.suscripcion === undefined ? { ...SUSCRIPCION_OK, id } : opciones.suscripcion
    },
    async crearBandera() {
      bitacora.push('crearBandera')
      creadas++
      return `bandera-${creadas}`
    },
    async cerrarBandera(id, campos) {
      bitacora.push('cerrarBandera')
      cierres.push({ id, campos })
    },
  }

  return {
    datos,
    bitacora,
    cierres,
    get creadas() {
      return creadas
    },
  }
}

/** Envío que siempre funciona. Registra lo que se le pasó. */
function envioFalso() {
  const recibidos: ParametrosEnvio[] = []
  const enviar = async (p: ParametrosEnvio): Promise<ResultadoEnvio> => {
    recibidos.push(p)
    return {
      ok: true,
      intentos: 1,
      changed: true,
      subscription_updated_at: '2026-08-14T00:58:22.976+00:00',
    }
  }
  return { enviar, recibidos }
}

const entradaBuena = {
  suscripcion_id: SUS_LAB,
  valor_deseado: 'gracia',
  mensaje: 'Prueba de laboratorio.',
}

// ═══════════════════════════════════════════════════════════════════════════
// LA INVARIANTE: NADA INVÁLIDO ESCRIBE EN LA COLA
// ═══════════════════════════════════════════════════════════════════════════
describe('ninguna entrada inválida escribe en banderas_pendientes', () => {
  const INVALIDAS: Array<[string, Record<string, unknown>, number]> = [
    // ── suscripcion_id ────────────────────────────────────────────────────
    ['suscripcion_id ausente', { valor_deseado: 'gracia' }, 400],
    ['suscripcion_id no es uuid', { ...entradaBuena, suscripcion_id: 'LAB' }, 400],
    ['suscripcion_id es un número', { ...entradaBuena, suscripcion_id: 42 }, 400],
    ['suscripcion_id es null', { ...entradaBuena, suscripcion_id: null }, 400],

    // ── valor_deseado ─────────────────────────────────────────────────────
    ['valor_deseado ausente', { suscripcion_id: SUS_LAB }, 400],
    ['valor_deseado con el género equivocado', { ...entradaBuena, valor_deseado: 'suspendido' }, 400],
    ['valor_deseado en el idioma de ELLOS', { ...entradaBuena, valor_deseado: 'suspended' }, 400],
    ['valor_deseado es un estado COMERCIAL', { ...entradaBuena, valor_deseado: 'cancelada' }, 400],
    ['valor_deseado con espacio al final', { ...entradaBuena, valor_deseado: 'gracia ' }, 400],

    // ── mensaje ── el que se escapó el 14/08/2026 ─────────────────────────
    ['mensaje de 281 caracteres', { ...entradaBuena, mensaje: 'a'.repeat(MENSAJE_MAX + 1) }, 400],
    ['mensaje de 5000 caracteres', { ...entradaBuena, mensaje: 'a'.repeat(5_000) }, 400],
    ['mensaje que es un número', { ...entradaBuena, mensaje: 42 }, 400],
    ['mensaje que es un objeto', { ...entradaBuena, mensaje: { texto: 'hola' } }, 400],
  ]

  for (const [nombre, entrada, status] of INVALIDAS) {
    it(`${nombre} → ${status} y CERO filas`, async () => {
      const p = puertoFalso()
      const e = envioFalso()
      const r = await sincronizarBandera(entrada, SECRETO, p.datos, e.enviar)

      expect(r.status).toBe(status)
      // Lo que de verdad se está probando:
      expect(p.creadas).toBe(0)
      expect(p.bitacora).not.toContain('crearBandera')
      // Y tampoco se llamó al otro sistema.
      expect(e.recibidos).toHaveLength(0)
    })
  }

  it('el mensaje de EXACTAMENTE 280 sí pasa: el límite no se corrió', async () => {
    // Sin esto, "nada inválido escribe" se podría satisfacer rechazando todo.
    const p = puertoFalso()
    const e = envioFalso()
    const r = await sincronizarBandera(
      { ...entradaBuena, mensaje: 'a'.repeat(MENSAJE_MAX) },
      SECRETO,
      p.datos,
      e.enviar,
    )
    expect(r.status).toBe(200)
    expect(p.creadas).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE NO ES ENTRADA INVÁLIDA TAMPOCO ESCRIBE ANTES DE TIEMPO
// ═══════════════════════════════════════════════════════════════════════════
describe('los rechazos por estado tampoco dejan fila', () => {
  it('no es admin → 403, sin tocar nada', async () => {
    const p = puertoFalso({ admin: false })
    const e = envioFalso()
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, e.enviar)
    expect(r.status).toBe(403)
    expect(p.creadas).toBe(0)
    // Ni siquiera se leyó la suscripción: la autorización va primero.
    expect(p.bitacora).not.toContain('buscarSuscripcion')
  })

  it('la suscripción no existe → 404, sin fila', async () => {
    const p = puertoFalso({ suscripcion: null })
    const e = envioFalso()
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, e.enviar)
    expect(r.status).toBe(404)
    expect(p.creadas).toBe(0)
  })

  it('producto sin url_aplicar_estado → 422, sin fila', async () => {
    // El caso de g-mura y g-quota, que quedaron en NULL a propósito (008).
    const p = puertoFalso({
      suscripcion: { ...SUSCRIPCION_OK, producto_codigo: 'g-mura', url_aplicar_estado: null },
    })
    const e = envioFalso()
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, e.enviar)
    expect(r.status).toBe(422)
    expect(r.cuerpo.error).toContain('g-mura')
    expect(p.creadas).toBe(0)
  })

  it('suscripción sin organizacion_externa_id → 422, sin fila', async () => {
    // El estado en que estaban G-10 y Salchimelo antes de la migración 007.
    const p = puertoFalso({
      suscripcion: { ...SUSCRIPCION_OK, organizacion_externa_id: null },
    })
    const e = envioFalso()
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, e.enviar)
    expect(r.status).toBe(422)
    expect(p.creadas).toBe(0)
    expect(e.recibidos).toHaveLength(0)
  })

  it('organizacion_externa_id con forma inválida → 422, sin fila', async () => {
    // AUDITORÍA DEL 14/08. El handler chequeaba "tiene algo" y
    // `construirCuerpo` exige forma de UUID: la diferencia entre los dos era
    // un camino que escribía fila y después fallaba. Hoy es inalcanzable
    // porque la columna es `uuid` en Postgres, pero la invariante no puede
    // depender del tipo de otra capa.
    for (const malo of ['G-10', '12b53bae', 'null', '  ']) {
      const p = puertoFalso({
        suscripcion: { ...SUSCRIPCION_OK, organizacion_externa_id: malo },
      })
      const e = envioFalso()
      const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, e.enviar)
      expect(r.status).toBe(422)
      expect(p.creadas).toBe(0)
    }
  })

  it('sin secreto → 500, sin fila y sin leer nada', async () => {
    // AUDITORÍA DEL 14/08. `firmarPeticion` falla adentro de `enviarBandera`,
    // o sea DESPUÉS del insert: la fila quedaba como DESCONOCIDO, imposible
    // de completar y eterna para el barrido en diferido (§9.7).
    const p = puertoFalso()
    const e = envioFalso()
    const r = await sincronizarBandera(entradaBuena, '', p.datos, e.enviar)
    expect(r.status).toBe(500)
    expect(p.creadas).toBe(0)
    expect(p.bitacora).toEqual([])
    // Y el mensaje no dice nada del secreto más allá de que falta.
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/secreto|hmac/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LA OTRA MITAD: TODA FILA CREADA SE CIERRA
// ═══════════════════════════════════════════════════════════════════════════
describe('toda fila creada termina cerrada', () => {
  it('éxito: una fila, cerrada y confirmada', async () => {
    const p = puertoFalso()
    const e = envioFalso()
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, e.enviar)

    expect(r.status).toBe(200)
    expect(p.creadas).toBe(1)
    expect(p.cierres).toHaveLength(1)
    expect(p.cierres[0].campos.confirmado_en).not.toBeNull()
    expect(p.cierres[0].campos.bandera_error_codigo).toBeNull()
    expect(p.cierres[0].campos.cambio_efectivo).toBe(true)
  })

  it('el insert va ANTES del envío, no después', async () => {
    // §5: primero la intención, después se intenta. Una llamada sin rastro es
    // el estado que el outbox existe para hacer imposible.
    const p = puertoFalso()
    const orden: string[] = []
    const enviar = async (): Promise<ResultadoEnvio> => {
      orden.push('envio')
      return { ok: true, intentos: 1, changed: true }
    }
    const original = p.datos.crearBandera
    p.datos.crearBandera = async (...a) => {
      orden.push('insert')
      return original.apply(p.datos, a)
    }
    await sincronizarBandera(entradaBuena, SECRETO, p.datos, enviar)
    expect(orden).toEqual(['insert', 'envio'])
  })

  it('fallo del otro lado: la fila queda con su código y SIN confirmar', async () => {
    const p = puertoFalso()
    const enviar = async (): Promise<ResultadoEnvio> => ({
      ok: false,
      intentos: 3,
      codigo: 'HTTP_5XX',
      error: 'HTTP 500: boom',
    })
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, enviar)

    expect(r.status).toBe(502)
    expect(p.cierres[0].campos.confirmado_en).toBeNull()
    expect(p.cierres[0].campos.bandera_error_codigo).toBe('HTTP_5XX')
    expect(p.cierres[0].campos.intentos).toBe(3)
    expect(p.cierres[0].campos.cambio_efectivo).toBeNull()
  })

  it('idempotencia: changed false se guarda como false, no como null', async () => {
    const p = puertoFalso()
    const enviar = async (): Promise<ResultadoEnvio> => ({
      ok: true,
      intentos: 1,
      changed: false,
      subscription_updated_at: '2026-08-14T00:58:22.976+00:00',
    })
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, enviar)
    expect(p.cierres[0].campos.cambio_efectivo).toBe(false)
    expect(p.cierres[0].campos.confirmado_en).not.toBeNull()
    expect(r.cuerpo.subscription_updated_at).toBe('2026-08-14T00:58:22.976+00:00')
  })

  it('un 200 con cuerpo ilegible deja cambio_efectivo en NULL, no en false', async () => {
    // 009: el null significa "no sabemos". Un false diría "no cambió nada",
    // que es inventar un dato que no tenemos.
    const p = puertoFalso()
    const enviar = async (): Promise<ResultadoEnvio> => ({ ok: true, intentos: 1 })
    await sincronizarBandera(entradaBuena, SECRETO, p.datos, enviar)
    expect(p.cierres[0].campos.cambio_efectivo).toBeNull()
    expect(p.cierres[0].campos.confirmado_en).not.toBeNull()
  })

  it('si el envío TIRA, la fila igual se cierra y da 500, no 400', async () => {
    // Después del arreglo, un ErrorDeContrato acá no puede venir de la
    // entrada: es que el handler y `contrato.ts` se desincronizaron. Un 400
    // le echaría la culpa al que llamó de un bug nuestro.
    const p = puertoFalso()
    const enviar = async (): Promise<ResultadoEnvio> => {
      throw new Error('lo que sea')
    }
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, enviar)
    expect(r.status).toBe(500)
    expect(p.cierres).toHaveLength(1)
    expect(p.cierres[0].campos.confirmado_en).toBeNull()
  })

  it('nunca queda una fila creada sin cerrar, para ninguna respuesta', async () => {
    // Propiedad, sobre todos los casos de esta suite: creadas === cerradas.
    const casos: Array<Record<string, unknown>> = [
      entradaBuena,
      { ...entradaBuena, mensaje: null },
      { ...entradaBuena, mensaje: 'a'.repeat(MENSAJE_MAX + 1) },
      { ...entradaBuena, valor_deseado: 'nada' },
      { suscripcion_id: 'x' },
    ]
    for (const caso of casos) {
      const p = puertoFalso()
      const e = envioFalso()
      await sincronizarBandera(caso, SECRETO, p.datos, e.enviar)
      expect(p.cierres.length).toBe(p.creadas)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE EL HANDLER LE PASA AL ENVÍO ES LO QUE EL ENVÍO ESPERA
// ═══════════════════════════════════════════════════════════════════════════
describe('el handler y el envío encajan', () => {
  it('el mensaje llega NORMALIZADO, no crudo', async () => {
    const p = puertoFalso()
    const e = envioFalso()
    await sincronizarBandera(
      { ...entradaBuena, mensaje: '   Pago pendiente.   ' },
      SECRETO,
      p.datos,
      e.enviar,
    )
    expect(e.recibidos[0].mensaje).toBe('Pago pendiente.')
  })

  it('un mensaje vacío llega como null', async () => {
    const p = puertoFalso()
    const e = envioFalso()
    await sincronizarBandera({ ...entradaBuena, mensaje: '   ' }, SECRETO, p.datos, e.enviar)
    expect(e.recibidos[0].mensaje).toBeNull()
  })

  it('camino completo con el enviarBandera REAL y un verificador de firma', async () => {
    // Cierra el hueco entre las dos suites: prueba que lo que el handler
    // arma efectivamente atraviesa `enviarBandera` y sale firmado bien.
    let recibido: { cuerpo: string; ts: string; firma: string } | null = null
    const fetchFalso: typeof fetch = async (_u, init) => {
      const h = new Headers(init?.headers)
      const cuerpo = String(init?.body ?? '')
      const ts = h.get('x-gcentro-timestamp') ?? ''
      const firma = h.get('x-gcentro-signature') ?? ''
      recibido = { cuerpo, ts, firma }
      if (firma !== createHmac('sha256', SECRETO).update(`${ts}.${cuerpo}`).digest('hex')) {
        return new Response('firma invalida', { status: 401 })
      }
      return Response.json({ ok: true, changed: true, subscription_updated_at: '2026-08-14T00:00:00Z' })
    }

    const p = puertoFalso()
    const r = await sincronizarBandera(entradaBuena, SECRETO, p.datos, (params) =>
      enviarBandera(params, {
        fetch: fetchFalso,
        ahora: () => 1_786_669_000,
        esperar: async () => {},
      }),
    )

    expect(r.status).toBe(200)
    expect(r.cuerpo.changed).toBe(true)
    const enviado = JSON.parse(recibido!.cuerpo)
    expect(enviado.organization_id).toBe(ORG_LAB)
    expect(enviado.status).toBe('grace') // traducido
    expect(enviado.message).toBe('Prueba de laboratorio.')
  })
})
