/**
 * El envío completo, contra un DOBLE DEL CONTRATO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `gventoFalso` no es un mock de nuestro código: es una reimplementación de
 * lo que G-Vento documentó que hace. Recalcula el HMAC con `node:crypto`
 * sobre el body crudo que efectivamente recibió, chequea la ventana de 300s,
 * valida el estado contra la lista de ellos y busca la organización.
 *
 * Eso es lo que convierte "la firma se calcula sobre el string exacto que se
 * manda" en algo verificable: si `enviarBandera` firmara una cosa y mandara
 * otra, el doble devolvería 401 igual que el sistema real, sin que ningún
 * test tenga que mirar el código por dentro.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { enviarBandera, MAX_INTENTOS } from './enviar.ts'
import { ErrorDeContrato } from './contrato.ts'

const SECRETO = 'secreto-de-prueba-no-es-el-real'
const URL_PUENTE = 'https://zudeogjmxfklrrhyvezy.supabase.co/functions/v1/aplicar-estado'

const ORG_G10 = '12b53bae-a4f7-4076-80f9-8f9288bd0567'
const ORG_LAB = 'f4fa692d-6cf3-43fb-a17f-18b8b163c918'
const ORG_INEXISTENTE = '00000000-0000-4000-8000-000000000000'

/** Los cinco valores del CHECK de ellos. Escritos a mano desde el contrato. */
const ESTADOS_QUE_ACEPTAN = ['active', 'expiring', 'grace', 'restricted', 'suspended']

const AHORA = 1_754_870_400

interface Recibido {
  cuerpo: string
  timestamp: string
  firma: string
  headers: Headers
}

/**
 * Doble de `aplicar-estado`. Guarda todo lo que recibe para que los tests
 * puedan mirarlo, y responde como el contrato dice que responde.
 */
function gventoFalso(opciones: {
  secreto?: string
  ahora?: number
  organizaciones?: Record<string, string>
  /** Fuerza una respuesta cruda, para simular caídas. */
  forzar?: () => Response | Promise<Response>
}) {
  const secreto = opciones.secreto ?? SECRETO
  const reloj = opciones.ahora ?? AHORA
  const orgs = opciones.organizaciones ?? { [ORG_G10]: 'active', [ORG_LAB]: 'active' }
  const recibidas: Recibido[] = []

  const fetchFalso: typeof fetch = async (_url, init) => {
    const headers = new Headers(init?.headers)
    const cuerpo = String(init?.body ?? '')
    const timestamp = headers.get('x-gcentro-timestamp') ?? ''
    const firma = headers.get('x-gcentro-signature') ?? ''
    recibidas.push({ cuerpo, timestamp, firma, headers })

    if (opciones.forzar) return opciones.forzar()

    // 1. Ventana de 300s en ambas direcciones.
    const ts = Number(timestamp)
    if (!Number.isFinite(ts) || Math.abs(reloj - ts) > 300) {
      return new Response('timestamp fuera de ventana', { status: 401 })
    }

    // 2. La firma, sobre el body CRUDO tal como llegó.
    const esperada = createHmac('sha256', secreto).update(`${timestamp}.${cuerpo}`).digest('hex')
    if (firma !== esperada) {
      return new Response('firma invalida', { status: 401 })
    }

    // 3. El contenido.
    const datos = JSON.parse(cuerpo) as { organization_id: string; status: string }
    if (!ESTADOS_QUE_ACEPTAN.includes(datos.status)) {
      return new Response(
        `estado invalido. validos: ${ESTADOS_QUE_ACEPTAN.join(', ')}`,
        { status: 400 },
      )
    }
    if (!(datos.organization_id in orgs)) {
      return new Response('organizacion inexistente', { status: 404 })
    }

    const cambio = orgs[datos.organization_id] !== datos.status
    orgs[datos.organization_id] = datos.status
    return Response.json({
      ok: true,
      changed: cambio,
      organization_id: datos.organization_id,
      status: datos.status,
      subscription_updated_at: cambio ? '2026-08-12T15:00:00Z' : '2026-08-01T09:00:00Z',
    })
  }

  return { fetchFalso, recibidas, orgs }
}

const deps = (fetchFalso: typeof fetch, ahora = AHORA) => ({
  fetch: fetchFalso,
  ahora: () => ahora,
  // Sin esperas reales: el backoff se verifica por lo que se registra, no
  // haciendo que la suite tarde cuatro segundos.
  esperar: async () => {},
})

const base = {
  url: URL_PUENTE,
  secreto: SECRETO,
  organizacionExternaId: ORG_G10,
  nivel: 'restringida',
  mensaje: 'Pago pendiente. Comunicate con nosotros.',
}

// ═══════════════════════════════════════════════════════════════════════════
// EL CAMINO FELIZ, VERIFICADO POR EL OTRO LADO
// ═══════════════════════════════════════════════════════════════════════════
describe('enviarBandera — el doble acepta la firma', () => {
  it('un envío bueno da 200 al primer intento', async () => {
    const g = gventoFalso({})
    const r = await enviarBandera(base, deps(g.fetchFalso))
    expect(r.ok).toBe(true)
    expect(r.intentos).toBe(1)
    expect(r.codigo).toBeUndefined()
  })

  it('el estado que llega del otro lado es el TRADUCIDO', async () => {
    const g = gventoFalso({})
    await enviarBandera(base, deps(g.fetchFalso))
    expect(JSON.parse(g.recibidas[0].cuerpo).status).toBe('restricted')
    expect(g.orgs[ORG_G10]).toBe('restricted')
  });

  // Los cinco niveles, cada uno atravesando el doble de punta a punta.
  ([
    ['activa', 'active'],
    ['por_vencer', 'expiring'],
    ['gracia', 'grace'],
    ['restringida', 'restricted'],
    ['suspendida', 'suspended'],
  ] as const).forEach(([nivel, esperado]) => {
    it(`${nivel} llega como ${esperado} y G-Vento lo acepta`, async () => {
      const g = gventoFalso({})
      const r = await enviarBandera({ ...base, nivel }, deps(g.fetchFalso))
      expect(r.ok).toBe(true)
      expect(JSON.parse(g.recibidas[0].cuerpo).status).toBe(esperado)
    })
  })

  it('idempotencia: re-aplicar el mismo estado devuelve changed:false', async () => {
    const g = gventoFalso({})
    const primera = await enviarBandera({ ...base, nivel: 'gracia' }, deps(g.fetchFalso))
    const segunda = await enviarBandera({ ...base, nivel: 'gracia' }, deps(g.fetchFalso))
    expect(primera.changed).toBe(true)
    expect(segunda.changed).toBe(false)
    // Las dos son ok: `changed:false` NO es un error. El producto está en el
    // estado que queríamos, que es lo único que `confirmado_en` afirma.
    expect(segunda.ok).toBe(true)
  })

  it('un 200 con cuerpo ilegible sigue siendo un éxito', async () => {
    // El cuerpo del 200 es informativo. Que venga roto no deshace el hecho de
    // que el otro lado aceptó: marcar esto como fallo dejaría la bandera sin
    // confirmar cuando el estado SÍ se aplicó — "creí que no había escrito y sí".
    const g = gventoFalso({ forzar: () => new Response('no soy json', { status: 200 }) })
    const r = await enviarBandera(base, deps(g.fetchFalso))
    expect(r.ok).toBe(true)
    expect(r.changed).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LA FIRMA ES SOBRE EL STRING EXACTO QUE SE MANDA
// ═══════════════════════════════════════════════════════════════════════════
describe('la firma cubre exactamente el body que viaja', () => {
  it('el doble recalcula el HMAC sobre lo que recibió y coincide', async () => {
    const g = gventoFalso({})
    await enviarBandera(base, deps(g.fetchFalso))
    const { cuerpo, timestamp, firma } = g.recibidas[0]
    expect(firma).toBe(createHmac('sha256', SECRETO).update(`${timestamp}.${cuerpo}`).digest('hex'))
  })

  it('el body recibido es JSON válido con las tres claves', async () => {
    const g = gventoFalso({})
    await enviarBandera(base, deps(g.fetchFalso))
    expect(Object.keys(JSON.parse(g.recibidas[0].cuerpo)).sort()).toEqual([
      'message',
      'organization_id',
      'status',
    ])
  })

  it('un secreto distinto del que espera el otro lado da 401 → HMAC_INVALIDO', async () => {
    const g = gventoFalso({ secreto: 'el-que-tiene-g-vento' })
    const r = await enviarBandera({ ...base, secreto: 'el-que-tengo-yo' }, deps(g.fetchFalso))
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe('HMAC_INVALIDO')
  })

  it('un reloj corrido más de 300s da 401', async () => {
    // El modo de fallo más molesto de diagnosticar: la firma está perfecta y
    // el otro lado igual rechaza. Por eso 401 mapea a HMAC_INVALIDO y no a
    // "firma mala": el código nombra la causa raíz, que incluye la ventana.
    const g = gventoFalso({ ahora: AHORA })
    const r = await enviarBandera(base, deps(g.fetchFalso, AHORA + 400))
    expect(r.codigo).toBe('HMAC_INVALIDO')
  })

  it('301 segundos de adelanto ya está fuera; 299 todavía entra', async () => {
    const fuera = gventoFalso({ ahora: AHORA })
    expect((await enviarBandera(base, deps(fuera.fetchFalso, AHORA + 301))).ok).toBe(false)

    const adentro = gventoFalso({ ahora: AHORA })
    expect((await enviarBandera(base, deps(adentro.fetchFalso, AHORA + 299))).ok).toBe(true)
  })

  it('la ventana vale para los dos lados: atrasado también', async () => {
    const g = gventoFalso({ ahora: AHORA })
    expect((await enviarBandera(base, deps(g.fetchFalso, AHORA - 301))).ok).toBe(false)
  })

  it('no se manda Authorization hacia el proyecto de G-Vento', async () => {
    const g = gventoFalso({})
    await enviarBandera(base, deps(g.fetchFalso))
    expect(g.recibidas[0].headers.get('authorization')).toBeNull()
    expect(g.recibidas[0].headers.get('apikey')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// UN ESTADO DESCONOCIDO NO LLEGA NUNCA A LA RED
// ═══════════════════════════════════════════════════════════════════════════
describe('lo inválido falla de nuestro lado, sin tocar la red', () => {
  it('un nivel desconocido tira antes del fetch', async () => {
    const g = gventoFalso({})
    await expect(
      enviarBandera({ ...base, nivel: 'suspendido' }, deps(g.fetchFalso)),
    ).rejects.toThrow(ErrorDeContrato)
    // Lo importante no es que tire: es que NO se llamó.
    expect(g.recibidas).toHaveLength(0)
  })

  it('sin organizacion_externa_id tampoco se llama', async () => {
    const g = gventoFalso({})
    await expect(
      enviarBandera({ ...base, organizacionExternaId: null }, deps(g.fetchFalso)),
    ).rejects.toThrow(ErrorDeContrato)
    expect(g.recibidas).toHaveLength(0)
  })

  it('un mensaje demasiado largo tampoco se llama', async () => {
    const g = gventoFalso({})
    await expect(
      enviarBandera({ ...base, mensaje: 'a'.repeat(281) }, deps(g.fetchFalso)),
    ).rejects.toThrow(ErrorDeContrato)
    expect(g.recibidas).toHaveLength(0)
  })

  it('el doble CONFIRMA que un estado inválido daría 400 — pero nunca llegamos ahí', async () => {
    // Verifica que el 400 del otro lado existe de verdad, y que nuestra
    // validación lo hace inalcanzable. Sin esta prueba, "no dependemos del
    // 400" sería una afirmación sin evidencia de que el 400 exista.
    const g = gventoFalso({})
    const respuesta = await g.fetchFalso(URL_PUENTE, {
      method: 'POST',
      headers: {
        'x-gcentro-timestamp': String(AHORA),
        'x-gcentro-signature': createHmac('sha256', SECRETO)
          .update(`${AHORA}.{"organization_id":"${ORG_G10}","status":"suspendido","message":null}`)
          .digest('hex'),
      },
      body: `{"organization_id":"${ORG_G10}","status":"suspendido","message":null}`,
    })
    expect(respuesta.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CADA FALLA AL ENUM CORRECTO, Y LOS REINTENTOS
// ═══════════════════════════════════════════════════════════════════════════
describe('errores y reintentos', () => {
  it('404 → ORG_NO_ENCONTRADA, sin reintentar', async () => {
    const g = gventoFalso({})
    const r = await enviarBandera(
      { ...base, organizacionExternaId: ORG_INEXISTENTE },
      deps(g.fetchFalso),
    )
    expect(r.codigo).toBe('ORG_NO_ENCONTRADA')
    expect(r.intentos).toBe(1)
    expect(g.recibidas).toHaveLength(1)
  })

  it('401 → HMAC_INVALIDO, sin reintentar', async () => {
    const g = gventoFalso({ secreto: 'otro' })
    const r = await enviarBandera(base, deps(g.fetchFalso))
    expect(r.codigo).toBe('HMAC_INVALIDO')
    expect(g.recibidas).toHaveLength(1)
  })

  it('500 → HTTP_5XX y se agotan los tres intentos', async () => {
    const g = gventoFalso({ forzar: () => new Response('boom', { status: 500 }) })
    const r = await enviarBandera(base, deps(g.fetchFalso))
    expect(r.codigo).toBe('HTTP_5XX')
    expect(r.intentos).toBe(MAX_INTENTOS)
    expect(g.recibidas).toHaveLength(MAX_INTENTOS)
  })

  it('un TypeError de red → RED, con reintentos', async () => {
    let llamadas = 0
    const fetchRoto: typeof fetch = async () => {
      llamadas++
      throw new TypeError('fetch failed')
    }
    const r = await enviarBandera(base, deps(fetchRoto))
    expect(r.codigo).toBe('RED')
    expect(llamadas).toBe(MAX_INTENTOS)
  })

  it('un timeout → TIMEOUT, con reintentos', async () => {
    const fetchLento: typeof fetch = async () => {
      throw Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })
    }
    const r = await enviarBandera(base, deps(fetchLento))
    expect(r.codigo).toBe('TIMEOUT')
    expect(r.intentos).toBe(MAX_INTENTOS)
  })

  it('si el segundo intento funciona, se corta ahí', async () => {
    let llamadas = 0
    const g = gventoFalso({})
    const intermitente: typeof fetch = async (u, i) => {
      llamadas++
      if (llamadas === 1) throw new TypeError('fetch failed')
      return g.fetchFalso(u, i)
    }
    const r = await enviarBandera(base, deps(intermitente))
    expect(r.ok).toBe(true)
    expect(r.intentos).toBe(2)
  })

  it('cada reintento se re-firma con su propio timestamp', async () => {
    // Si se reutilizara la firma del primer intento, un reintento después de
    // 300s daría 401 y el diagnóstico apuntaría al secreto.
    let t = AHORA
    const g = gventoFalso({ forzar: () => new Response('boom', { status: 503 }) })
    const r = await enviarBandera(base, {
      fetch: g.fetchFalso,
      ahora: () => (t += 60),
      esperar: async () => {},
    })
    expect(r.codigo).toBe('HTTP_5XX')
    const timestamps = g.recibidas.map((x) => x.timestamp)
    expect(new Set(timestamps).size).toBe(MAX_INTENTOS)
  })

  it('el texto crudo del error se guarda recortado', async () => {
    const g = gventoFalso({ forzar: () => new Response('x'.repeat(5_000), { status: 500 }) })
    const r = await enviarBandera(base, deps(g.fetchFalso))
    // `ultimo_error` es para mirar en el panel, no un volcado. Y NUNCA va a
    // Sentry: el texto del otro lado es prosa.
    expect(r.error!.length).toBeLessThanOrEqual(501)
    expect(r.error).toContain('HTTP 500')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LAB
// ═══════════════════════════════════════════════════════════════════════════
describe('LAB es el tenant de pruebas', () => {
  it('el circuito completo funciona contra LAB', async () => {
    const g = gventoFalso({})
    const r = await enviarBandera(
      { ...base, organizacionExternaId: ORG_LAB, nivel: 'suspendida' },
      deps(g.fetchFalso),
    )
    expect(r.ok).toBe(true)
    expect(g.orgs[ORG_LAB]).toBe('suspended')
    // Y el de un cliente real quedó intacto: probar en LAB no toca a G-10.
    expect(g.orgs[ORG_G10]).toBe('active')
  })
})
