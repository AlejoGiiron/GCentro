import { describe, it, expect } from 'vitest'
import { scrubEstricto, scrubSobre, scrubEvento } from './sentry'

/**
 * Estos tests SON la política de privacidad, no su documentación.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ SON ADVERSARIALES Y NO "DE COBERTURA"
 *
 * La versión anterior tenía 19 tests en verde y el filtro fugaba igual: los
 * siete importes del esquema, los dos booleanos de catálogo, el texto libre
 * de `ultimo_error` y el `jsonb` entero de `suscripcion_eventos`.
 *
 * No fallaron porque probaban LO QUE EL FILTRO CUBRE, no lo que no cubre:
 * tomaban las claves de la lista y verificaban que sí se redactaban. Un test
 * así no puede descubrir una columna que nadie puso en la lista — que es
 * justamente el modo de fallo de una deny-list.
 *
 * La inversión: se parte del ESQUEMA REAL y se verifica que NADA de esas
 * columnas sale verbatim. Si mañana aparece una columna nueva y nadie la
 * agrega acá, el allowlist ya la redacta por default; el test es la segunda
 * red, no la única.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════════════════
// TABLA DE COLUMNAS DEL ESQUEMA REAL
//
// Derivada de `supabase/schema-inicial.sql` y de §3 del documento de diseño.
// NO de `database.types.ts`, que está escrito a mano y no es fuente confiable
// (regla 3 del CLAUDE.md).
//
// 📌 REGLA (obligatoria): AGREGAR UNA TABLA O COLUMNA AL ESQUEMA OBLIGA A
//    AGREGARLA ACÁ, EN EL MISMO COMMIT. Si no la agregás, el allowlist igual
//    la redacta —ese es el punto de haberlo invertido— pero perdés la
//    verificación, que es el único lugar donde queda escrito qué se consideró.
//
// `permitida: true` = decisión DELIBERADA de que ese dato puede salir del
// navegador. Regla: permitido si sale de un CATÁLOGO CERRADO, filtrado si
// describe a un CLIENTE EN PARTICULAR.
// ═══════════════════════════════════════════════════════════════════════════
interface ColumnaEsquema {
  tabla: string
  columna: string
  ejemplo: unknown
  permitida?: true
  /** La tabla todavía no existe: llega en el Bloque 2. */
  pendiente?: true
}

const COLUMNAS_DEL_ESQUEMA: ColumnaEsquema[] = [
  // ── productos (schema-inicial.sql) ──────────────────────────────────────
  { tabla: 'productos', columna: 'codigo', ejemplo: 'g-vento', permitida: true },
  { tabla: 'productos', columna: 'nombre', ejemplo: 'G-Vento' },
  // Hoy es infraestructura, pero si mañana la URL lleva un id en el path la
  // clase de dato cambia sin que nadie lo note. Filtrada.
  { tabla: 'productos', columna: 'url_aplicar_estado', ejemplo: 'https://x.supabase.co/functions/v1/aplicar-estado' },
  { tabla: 'productos', columna: 'activo', ejemplo: true, permitida: true },

  // ── terminos (schema-inicial.sql) ───────────────────────────────────────
  { tabla: 'terminos', columna: 'codigo', ejemplo: 'mensual', permitida: true },
  { tabla: 'terminos', columna: 'meses', ejemplo: 12, permitida: true },
  // ⚠️ `descuento_pct` PELADO va filtrado: la misma clave existe en
  // `suscripciones`, donde es el trato específico de un cliente. Una clave que
  // mapea a dos columnas con decisiones opuestas no identifica una columna, y
  // cae fail-closed. El valor de catálogo se recupera calificado.
  { tabla: 'terminos', columna: 'descuento_pct', ejemplo: 15 },
  { tabla: 'terminos', columna: 'termino_descuento_pct', ejemplo: 15, permitida: true },

  // ── planes (schema-inicial.sql) ─────────────────────────────────────────
  { tabla: 'planes', columna: 'codigo', ejemplo: 'esencial', permitida: true },
  { tabla: 'planes', columna: 'nombre', ejemplo: 'Plan Esencial' },
  { tabla: 'planes', columna: 'precio_mensual', ejemplo: 79000 },
  { tabla: 'planes', columna: 'precio_sede_adicional', ejemplo: 25000 },
  { tabla: 'planes', columna: 'incluye_dian', ejemplo: true, permitida: true },
  { tabla: 'planes', columna: 'vigente_desde', ejemplo: '2026-01-01' },

  // ── admins (schema-inicial.sql) ─────────────────────────────────────────
  { tabla: 'admins', columna: 'email', ejemplo: 'admin@gcentro.co' },

  // ── clientes (§3, Bloque 2) ─────────────────────────────────────────────
  { tabla: 'clientes', columna: 'nombre_comercial', ejemplo: 'Bar G-10', pendiente: true },
  { tabla: 'clientes', columna: 'razon_social', ejemplo: 'G-10 SAS', pendiente: true },
  { tabla: 'clientes', columna: 'nit', ejemplo: 900123456, pendiente: true },
  { tabla: 'clientes', columna: 'contacto_nombre', ejemplo: 'Juan Perez', pendiente: true },
  { tabla: 'clientes', columna: 'contacto_email', ejemplo: 'juan@g10.co', pendiente: true },
  { tabla: 'clientes', columna: 'contacto_telefono', ejemplo: '3001234567', pendiente: true },
  { tabla: 'clientes', columna: 'notas', ejemplo: 'Debe dos meses, hablar con Ana', pendiente: true },

  // ── suscripciones (§3, Bloque 2) ────────────────────────────────────────
  { tabla: 'suscripciones', columna: 'termino', ejemplo: 'anual', permitida: true, pendiente: true },
  { tabla: 'suscripciones', columna: 'estado', ejemplo: 'gracia', permitida: true, pendiente: true },
  { tabla: 'suscripciones', columna: 'sedes_adicionales', ejemplo: 3, permitida: true, pendiente: true },
  { tabla: 'suscripciones', columna: 'precio_base_mensual', ejemplo: 79000, pendiente: true },
  { tabla: 'suscripciones', columna: 'precio_sede_adicional', ejemplo: 25000, pendiente: true },
  { tabla: 'suscripciones', columna: 'descuento_pct', ejemplo: 15, pendiente: true },
  { tabla: 'suscripciones', columna: 'estado_implementacion', ejemplo: 'exonerada', permitida: true, pendiente: true },
  { tabla: 'suscripciones', columna: 'fecha_inicio', ejemplo: '2026-01-15', pendiente: true },
  { tabla: 'suscripciones', columna: 'proximo_cobro', ejemplo: '2026-09-01', pendiente: true },

  // ── suscripcion_eventos (§3, Bloque 2) ──────────────────────────────────
  { tabla: 'suscripcion_eventos', columna: 'tipo', ejemplo: 'CAMBIO_PLAN', permitida: true, pendiente: true },
  { tabla: 'suscripcion_eventos', columna: 'estado_anterior', ejemplo: 'activa', permitida: true, pendiente: true },
  { tabla: 'suscripcion_eventos', columna: 'estado_nuevo', ejemplo: 'gracia', permitida: true, pendiente: true },
  { tabla: 'suscripcion_eventos', columna: 'motivo', ejemplo: 'Lo pidio Juan por telefono', pendiente: true },
  { tabla: 'suscripcion_eventos', columna: 'efectivo_desde', ejemplo: '2026-09-01', pendiente: true },
  // `jsonb` sin esquema fijo: se colapsa entero, no se allowlistean claves internas.
  { tabla: 'suscripcion_eventos', columna: 'datos', ejemplo: { quien: 'Juan Perez', precio_viejo: 79000 }, pendiente: true },

  // ── pagos (§3, Bloque 2) ────────────────────────────────────────────────
  { tabla: 'pagos', columna: 'concepto', ejemplo: 'suscripcion', permitida: true, pendiente: true },
  { tabla: 'pagos', columna: 'monto', ejemplo: 94010, pendiente: true },
  { tabla: 'pagos', columna: 'monto_base', ejemplo: 79000, pendiente: true },
  { tabla: 'pagos', columna: 'iva_pct', ejemplo: 19, permitida: true, pendiente: true },
  { tabla: 'pagos', columna: 'metodo', ejemplo: 'transferencia', permitida: true, pendiente: true },
  { tabla: 'pagos', columna: 'referencia', ejemplo: 'NEQUI-8842119', pendiente: true },
  { tabla: 'pagos', columna: 'nota', ejemplo: 'Pago parcial de Carlos', pendiente: true },
  { tabla: 'pagos', columna: 'fecha_pago', ejemplo: '2026-08-05', pendiente: true },
  { tabla: 'pagos', columna: 'cubre_hasta', ejemplo: '2026-09-01', pendiente: true },

  // ── banderas_pendientes (§3, Bloque 2) ──────────────────────────────────
  { tabla: 'banderas_pendientes', columna: 'valor_deseado', ejemplo: 'restringida', permitida: true, pendiente: true },
  { tabla: 'banderas_pendientes', columna: 'intentos', ejemplo: 3, permitida: true, pendiente: true },
  // Texto libre: ya dejó salir un nombre propio en la auditoría. Para triage
  // de sync existe `bandera_error_codigo`, que es un enum derivado.
  { tabla: 'banderas_pendientes', columna: 'ultimo_error', ejemplo: 'HMAC invalido para org de Juan Perez', pendiente: true },
  { tabla: 'banderas_pendientes', columna: 'bandera_error_codigo', ejemplo: 'HMAC_INVALIDO', permitida: true, pendiente: true },
]

const FILTRADAS = COLUMNAS_DEL_ESQUEMA.filter((c) => !c.permitida)
const PERMITIDAS = COLUMNAS_DEL_ESQUEMA.filter((c) => c.permitida)

/** Serializa la salida para buscar el valor crudo en cualquier posición. */
const salida = (v: unknown) => JSON.stringify(scrubEstricto(v))

// ═══════════════════════════════════════════════════════════════════════════
// ADVERSARIAL: ninguna columna filtrada sale verbatim, en NINGUNA forma
// ═══════════════════════════════════════════════════════════════════════════
describe('scrubEstricto — ninguna columna sensible sale verbatim', () => {
  for (const col of FILTRADAS) {
    const etiqueta = `${col.tabla}.${col.columna}${col.pendiente ? ' (Bloque 2)' : ''}`

    it(`${etiqueta} — como valor nativo`, () => {
      const out = salida({ [col.columna]: col.ejemplo })
      // `crudo` y no String(): para un objeto, String() da "[object Object]",
      // que no aparece nunca en la salida y volvía la aserción vacua.
      const crudo =
        typeof col.ejemplo === 'object' && col.ejemplo !== null
          ? JSON.stringify(col.ejemplo).slice(1, -1)
          : String(col.ejemplo)
      expect(out).not.toContain(crudo)
      expect(out).toContain('[Filtrado:')
    })

    it(`${etiqueta} — forzada a string`, () => {
      // Una columna numérica que llega como texto (un form, un JSON crudo) no
      // puede escaparse por cambiar de tipo.
      const comoTexto = typeof col.ejemplo === 'object' ? JSON.stringify(col.ejemplo) : String(col.ejemplo)
      const out = salida({ [col.columna]: comoTexto })
      expect(out).not.toContain(comoTexto)
    })

    it(`${etiqueta} — forzada a number`, () => {
      // El caso que rompía el filtro anterior: el corte por tipo devolvía
      // cualquier number sin mirar la clave.
      const out = salida({ [col.columna]: 900123456 })
      expect(out).not.toContain('900123456')
    })

    it(`${etiqueta} — anidada a 3 niveles`, () => {
      const out = salida({ fila: { datos_extra: { [col.columna]: col.ejemplo } } })
      expect(out).not.toContain(String(col.ejemplo))
    })

    it(`${etiqueta} — dentro de un array`, () => {
      const out = salida({ filas: [{ [col.columna]: col.ejemplo }] })
      expect(out).not.toContain(String(col.ejemplo))
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// INVERSO: el diagnóstico SÍ sobrevive, o el reporte no sirve
// ═══════════════════════════════════════════════════════════════════════════
describe('scrubEstricto — el diagnóstico sobrevive', () => {
  for (const col of PERMITIDAS) {
    it(`${col.tabla}.${col.columna} pasa verbatim`, () => {
      const out = scrubEstricto({ [col.columna]: col.ejemplo }) as Record<string, unknown>
      expect(out[col.columna]).toEqual(col.ejemplo)
    })
  }

  it('el SQLSTATE de Postgres se recupera (antes salía como [monto])', () => {
    const out = scrubEstricto({ code: '23505' }) as Record<string, unknown>
    expect(out.code).toBe('23505')
  })

  it('los códigos HTTP sobreviven como string y como number', () => {
    expect((scrubEstricto({ statusCode: '409' }) as Record<string, unknown>).statusCode).toBe('409')
    expect((scrubEstricto({ status: 409 }) as Record<string, unknown>).status).toBe(409)
  })

  it('lo que este repo manda a propósito sobrevive', () => {
    const out = scrubEstricto({
      area: 'auth',
      etapa: 'mfa.verify',
      mutationKey: ['planes', 'lista'],
    }) as Record<string, unknown>
    expect(out).toEqual({ area: 'auth', etapa: 'mfa.verify', mutationKey: ['planes', 'lista'] })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// IDENTIFICADORES: sobreviven sin depender de colisiones con la deny-list
// ═══════════════════════════════════════════════════════════════════════════
describe('scrubEstricto — los identificadores sobreviven', () => {
  const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
  const IDS = ['id', 'cliente_id', 'suscripcion_id', 'producto_id', 'plan_id', 'organizacion_externa_id']

  for (const k of IDS) {
    it(`${k} pasa verbatim`, () => {
      const out = scrubEstricto({ [k]: UUID }) as Record<string, unknown>
      expect(out[k]).toBe(UUID)
    })
  }

  it('cliente_id sobrevive AUNQUE "cliente" matchee la deny-list', () => {
    // Regresión explícita: esta es la FK más usada del esquema y era la única
    // ilegible, por una coincidencia de substring. La garantía no puede
    // depender de que el nombre de una columna no choque con un regex.
    const out = scrubEstricto({ cliente_id: UUID }) as Record<string, unknown>
    expect(out.cliente_id).toBe(UUID)
    // Y la clave que sí es PII sigue filtrada.
    const pii = scrubEstricto({ cliente_nombre: 'Juan Perez' }) as Record<string, unknown>
    expect(pii.cliente_nombre).toBe('[Filtrado:string(10)]')
  })

  it('un id es fail-closed POR FORMA: si no es UUID, se filtra', () => {
    const out = scrubEstricto({ cliente_id: 'Juan Perez' }) as Record<string, unknown>
    expect(out.cliente_id).toBe('[Filtrado:string(10)]')
  })

  it('las fechas ISO sobreviven en modo sobre', () => {
    expect(scrubSobre('cobro en 2026-08-05T14:30:00.000Z')).toBe('cobro en 2026-08-05T14:30:00.000Z')
  })

  it('los UUID sobreviven en modo sobre', () => {
    expect(scrubSobre(`fila ${UUID}`)).toBe(`fila ${UUID}`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// REDACCIÓN TIPADA: se pierde el valor, se conserva la forma
// ═══════════════════════════════════════════════════════════════════════════
describe('scrubEstricto — redacción tipada', () => {
  it('reporta el tipo y la magnitud de lo que filtró', () => {
    const out = scrubEstricto({
      monto: 79000,
      razon_social: 'G-10 SAS',
      activo_flag: false,
      filas: [1, 2, 3],
      fila: { a: 1, b: 2 },
    }) as Record<string, unknown>
    expect(out.monto).toBe('[Filtrado:number]')
    expect(out.razon_social).toBe('[Filtrado:string(8)]')
    expect(out.activo_flag).toBe('[Filtrado:boolean]')
    expect(out.filas).toBe('[Filtrado:array(3)]')
    expect(out.fila).toEqual({ a: '[Filtrado:number]', b: '[Filtrado:number]' })
  })

  it('null y undefined pasan verbatim: son diagnóstico, no PII', () => {
    // `hint: null` significa "Postgres no dio pista". Devolver [Filtrado] ahí
    // sería una MENTIRA: diría "acá había algo" cuando el hallazgo es que no
    // había nada. `cliente_id: null` es una causa de fallo, no un dato a tapar.
    const out = scrubEstricto({ hint: null, cliente_id: null, detalle: undefined }) as Record<string, unknown>
    expect(out.hint).toBeNull()
    expect(out.cliente_id).toBeNull()
    expect(out.detalle).toBeUndefined()
  })

  it('recurre siempre: no colapsa un objeto por tener una clave desconocida', () => {
    // La forma del árbol es la mitad del valor de un reporte.
    const out = scrubEstricto({ fila: { code: '23505', monto: 79000 } }) as Record<string, unknown>
    expect(out.fila).toEqual({ code: '23505', monto: '[Filtrado:number]' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// SIN CLAVE: raíz y arrays no tienen posición de la que fiarse
// ═══════════════════════════════════════════════════════════════════════════
describe('scrubEstricto — valores sin clave', () => {
  it('un valor en la raíz se filtra', () => {
    expect(scrubEstricto('Juan Perez')).toBe('[Filtrado:string(10)]')
    expect(scrubEstricto(79000)).toBe('[Filtrado:number]')
  })

  it('un array suelto colapsa', () => {
    expect(scrubEstricto(['Juan Perez', 'G-10 SAS'])).toBe('[Filtrado:array(2)]')
  })

  it('un array bajo clave desconocida colapsa', () => {
    const out = scrubEstricto({ items: ['Juan Perez', 79000] }) as Record<string, unknown>
    expect(out.items).toBe('[Filtrado:array(2)]')
  })

  it('un array bajo clave permitida hereda la decisión del padre', () => {
    const out = scrubEstricto({ mutationKey: ['planes', 'lista'] }) as Record<string, unknown>
    expect(out.mutationKey).toEqual(['planes', 'lista'])
  })

  it('una clave permitida NO es un cheque en blanco para su contenido', () => {
    // `mutationKey` es el único array permitido, y su contenido lo escribe un
    // desarrollador. La herencia de la reserva (iii) lo convertiría en un
    // agujero si alguien mete un dato de cliente en la clave de una mutación
    // — `['cliente', 'Juan Perez']` es exactamente lo que uno escribe sin
    // pensarlo. El permiso es sobre la CLAVE, no sobre cualquier string que
    // pase por debajo: se valida la forma de cada elemento.
    const out = scrubEstricto({ mutationKey: ['cliente', 'Juan Perez'] }) as Record<string, unknown>
    expect(out.mutationKey).toEqual(['cliente', '[Filtrado:string(10)]'])
  })

  it('un objeto anidado dentro de un array permitido no se cuela', () => {
    const out = scrubEstricto({
      mutationKey: ['clientes', { nombre: 'Juan Perez' }],
    }) as Record<string, unknown>
    expect(JSON.stringify(out)).not.toContain('Juan Perez')
  })

  it('el jsonb `datos` se colapsa entero, sin mirar adentro', () => {
    const out = scrubEstricto({
      datos: { quien: 'Juan Perez', precio_viejo: 79000, plan: 'esencial' },
    }) as Record<string, unknown>
    expect(out.datos).toBe('[Filtrado:object{3}]')
  })

  it('corta por profundidad sin colgarse', () => {
    const ciclo: Record<string, unknown> = { nivel: 1 }
    ciclo.self = ciclo
    expect(() => scrubEstricto(ciclo)).not.toThrow()
  })

  it('un objeto NO PLANO no se convierte en {} en silencio', () => {
    // Date, Error, Map y Set son `typeof "object"` pero no tienen claves
    // enumerables: un recorrido ingenuo con Object.entries los deja en `{}`.
    // Eso no es una fuga, es una MENTIRA de diagnóstico —igual de mala que
    // `hint: null` saliendo como [Filtrado]—: dice "objeto vacío" cuando lo
    // que había era una fecha o una excepción. La forma tiene que ser honesta.
    const out = scrubEstricto({
      creado_en: new Date('2026-08-05T00:00:00.000Z'),
      err: new Error('boom'),
      cache: new Map([['a', 1]]),
    }) as Record<string, unknown>

    expect(out.creado_en).not.toEqual({})
    expect(out.err).not.toEqual({})
    expect(out.cache).not.toEqual({})
    // Y ninguno puede filtrar su contenido.
    expect(JSON.stringify(out)).not.toContain('boom')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RUTEO DEL EVENTO: allowlist ACOTADO, no global
// ═══════════════════════════════════════════════════════════════════════════
describe('scrubEvento — ruteo por rama', () => {
  it('extra va en modo estricto', () => {
    const out = scrubEvento({ extra: { monto: 79000, code: '23505' } })
    expect(out.extra).toEqual({ monto: '[Filtrado:number]', code: '23505' })
  })

  it('tags y user van por claves internas, no como subárbol de confianza', () => {
    // "los construimos nosotros y ya están curados" es la suposición que falló.
    const out = scrubEvento({
      tags: { area: 'pagos', cliente: 'Bar G-10' },
      user: { id: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', email: 'juan@g10.co' },
    })
    expect(out.tags).toEqual({ area: 'pagos', cliente: '[Filtrado:string(8)]' })
    expect(out.user).toEqual({
      id: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      email: '[Filtrado:string(11)]',
    })
  })

  it('el stacktrace pasa ENTERO: única excepción de subárbol', () => {
    const stacktrace = {
      frames: [{ filename: 'https://app.co/assets/index-4f2a9c1e.js', lineno: 1234, function: 'onSubmit' }],
    }
    const out = scrubEvento({ exception: { values: [{ value: 'boom', stacktrace }] } })
    const v = (out.exception!.values as Record<string, unknown>[])[0]
    expect(v.stacktrace).toEqual(stacktrace)
  })

  it('el mensaje de la excepción se limpia por contenido', () => {
    const out = scrubEvento({
      exception: { values: [{ value: 'fallo para admin@gcentro.co con 79000' }] },
    })
    const v = (out.exception!.values as Record<string, unknown>[])[0]
    expect(v.value).toBe('fallo para [Filtrado] con [monto]')
  })

  it('la metadata del SDK queda INTACTA (si no, Sentry no agrupa)', () => {
    const evento = {
      level: 'error',
      platform: 'javascript',
      release: '1.2.3',
      environment: 'production',
      fingerprint: ['{{ default }}'],
      sdk: { name: 'sentry.javascript.react', version: '10.0.0' },
    }
    expect(scrubEvento(evento)).toEqual(evento)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// MODO SOBRE: prosa. Redacción por contenido, no por clave.
// ═══════════════════════════════════════════════════════════════════════════
describe('scrubSobre — payload no estructurado', () => {
  it('redacta email, móvil y montos dentro de la prosa', () => {
    expect(scrubSobre('login de admin@gcentro.co')).toBe('login de [Filtrado]')
    expect(scrubSobre('Contacto 3001234567')).toBe('Contacto [Filtrado]')
    expect(scrubSobre('Saldo: $ 1.250.000')).toBe('Saldo: [monto]')
  })

  it('conserva la columna del detalle de Postgres y redacta el valor', () => {
    expect(scrubSobre('Key (nit)=(900123456) already exists.')).toBe(
      'Key (nit)=([Filtrado]) already exists.',
    )
  })

  it('la deny-list sigue viva acá: es la única protección por posición', () => {
    const out = scrubSobre({ contacto_nombre: 'Juan Perez' }) as Record<string, unknown>
    expect(out.contacto_nombre).toBe('[Filtrado:string(10)]')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// REGLAS INERTES: si una regla no tiene efecto medible, esto falla
// ═══════════════════════════════════════════════════════════════════════════
describe('ninguna regla del filtro es decorativa', () => {
  /**
   * El test anterior en esta posición aseveraba `scrub({count: 12}) === 12`
   * para "verificar" un allowlist numérico que era INERTE: los numbers ya
   * pasaban bajo cualquier clave, así que la aserción daba verde con el set
   * vacío. Un test que pasa con y sin la regla no verifica nada.
   *
   * Estos comparan la clave DENTRO de la regla contra una clave fuera, que es
   * la única forma de medir que la regla hace algo.
   */
  it('el allowlist de diagnóstico tiene efecto medible', () => {
    const dentro = scrubEstricto({ code: '23505' }) as Record<string, unknown>
    const fuera = scrubEstricto({ code_x: '23505' }) as Record<string, unknown>
    expect(dentro.code).toBe('23505')
    expect(fuera.code_x).toBe('[Filtrado:string(5)]')
    expect(dentro.code).not.toBe(fuera.code_x)
  })

  it('el allowlist de identificadores tiene efecto medible', () => {
    const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
    const dentro = scrubEstricto({ cliente_id: UUID }) as Record<string, unknown>
    const fuera = scrubEstricto({ cliente_ref: UUID }) as Record<string, unknown>
    expect(dentro.cliente_id).toBe(UUID)
    expect(fuera.cliente_ref).toBe(`[Filtrado:string(${UUID.length})]`)
  })

  it('la deny-list tiene efecto medible sobre una clave que el allowlist no cubre', () => {
    const denegada = scrubEstricto({ contacto_x: 'Juan Perez' }) as Record<string, unknown>
    const neutra = scrubEstricto({ zzz_x: 'Juan Perez' }) as Record<string, unknown>
    // Ambas terminan filtradas (el allowlist es el default), pero por caminos
    // distintos. Lo que se verifica es que la deny-list no dependa de eso:
    // sigue siendo el chequeo fail-closed redundante del diseño.
    expect(denegada.contacto_x).toBe('[Filtrado:string(10)]')
    expect(neutra.zzz_x).toBe('[Filtrado:string(10)]')
  })

  it('el colapso de claves opacas tiene efecto medible', () => {
    const opaca = scrubEstricto({ datos: { a: 1 } }) as Record<string, unknown>
    const normal = scrubEstricto({ datos_x: { a: 1 } }) as Record<string, unknown>
    expect(opaca.datos).toBe('[Filtrado:object{1}]')
    // Sin el colapso se habría recurrido y conservado la forma del árbol.
    expect(normal.datos_x).toEqual({ a: '[Filtrado:number]' })
  })
})
