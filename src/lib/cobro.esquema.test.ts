/**
 * LA GUARDA DEL CÓDIGO EN ESPERA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `cobro.ts` está completo, tiene 46 tests y **ningún consumidor**. El panel
 * no puede crear ni modificar una suscripción, así que ni el cambio de plan
 * ni las transiciones de implementación son alcanzables (§9.7).
 *
 * El riesgo de código en espera no es que esté mal: es que **se pudra en
 * silencio** — que el esquema cambie, el modelo quede viejo, y nadie lo
 * descubra hasta el día que se necesita.
 *
 * Estos tests no prueban el modelo. Prueban que **el modelo y el esquema
 * siguen hablando de lo mismo**, leyendo las migraciones que son la fuente
 * de verdad. Si divergen, fallan acá y no seis meses después.
 *
 * ⚠️ Se lee el SQL, NO `database.types.ts`: los tipos generados salen de la
 * base y la base podría ya haber divergido de la migración. La migración es
 * lo que se revisó y se acordó.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { ESTADOS_IMPLEMENTACION, implementacionAlFirmar, transicionImplementacion } from './cobro'

const DIR = 'supabase/migrations'
const sql = (fragmento: string): string => {
  const f = readdirSync(DIR).find((n) => n.includes(fragmento))
  if (!f) throw new Error(`no existe la migración ${fragmento}`)
  return readFileSync(`${DIR}/${f}`, 'utf8')
}

describe('el esquema y el modelo de implementación no divergieron', () => {
  it('los estados del CHECK son exactamente los del modelo', () => {
    // Si alguien agrega un quinto estado a la base, `transicionImplementacion`
    // no lo contempla y lo devolvería sin tocar — que se ve igual que "es
    // terminal". Este test falla antes de que eso llegue a una decisión.
    const check = sql('003_tablas_negocio').match(
      /check \(estado_implementacion in\s*\(([^)]+)\)/,
    )
    expect(check, 'no se encontró el CHECK en la migración 003').not.toBeNull()

    const enElEsquema = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(enElEsquema).toEqual([...ESTADOS_IMPLEMENTACION].sort())
  })

  it('el default de la columna es un estado que el modelo conoce', () => {
    const def = sql('003_tablas_negocio').match(
      /estado_implementacion\s+text not null default '([a-z_]+)'/,
    )
    expect(def).not.toBeNull()
    expect(ESTADOS_IMPLEMENTACION).toContain(def![1] as never)
  })
})

describe('el umbral de los doce meses sigue teniendo sentido', () => {
  /** Términos vigentes: los del seed inicial menos lo que borró la 002. */
  function terminosVigentes(): Array<{ codigo: string; meses: number }> {
    const inicial = [...sql('schema_inicial').matchAll(/\('([a-z]+)',\s*(\d+),\s*\d+\)/g)].map(
      (m) => ({ codigo: m[1], meses: Number(m[2]) }),
    )
    const borrados = [...sql('002_terminos_corregidos').matchAll(
      /delete from public\.terminos where codigo = '([a-z]+)'/g,
    )].map((m) => m[1])
    return inicial.filter((t) => !borrados.includes(t.codigo))
  }

  it('los términos del esquema son los tres esperados', () => {
    expect(terminosVigentes().map((t) => t.codigo).sort()).toEqual([
      'anual',
      'mensual',
      'semestral',
    ])
  })

  it('`>= 12 meses` distingue EXACTAMENTE al anual', () => {
    // `implementacionAlFirmar` usa `terminoMeses >= 12` para decidir si la
    // implementación arranca exonerada condicional. Si mañana entrara un
    // término de 18 o de 24 meses, la regla los incluiría sin que nadie lo
    // haya decidido — y §9.3 habla del ANUAL, no de "12 o más".
    const conExoneracion = terminosVigentes().filter(
      (t) => implementacionAlFirmar(t.meses) === 'exonerada_condicional',
    )
    expect(conExoneracion.map((t) => t.codigo)).toEqual(['anual'])
  })
})

describe('las propiedades que el modelo promete siguen en pie', () => {
  it('los dos estados terminales no se mueven ante ningún evento', () => {
    // §9.3: cobrada y exonerada son firmes. Es lo que hace que G-10 y
    // Salchimelo (ambos `cobrada`) no tengan nada reclamable.
    const eventos = [
      { tipo: 'ANIVERSARIO_ANUAL' },
      { tipo: 'CAMBIO_TERMINO', nuevo_termino_meses: 1 },
      { tipo: 'CANCELACION' },
    ] as const
    for (const terminal of ['cobrada', 'exonerada'] as const) {
      for (const e of eventos) {
        expect(transicionImplementacion(terminal, e), `${terminal} + ${e.tipo}`).toBe(terminal)
      }
    }
  })

  it('toda transición devuelve un estado que el esquema acepta', () => {
    // Sin esto, un estado nuevo en el modelo reventaría el CHECK al escribir.
    const eventos = [
      { tipo: 'ANIVERSARIO_ANUAL' },
      { tipo: 'CAMBIO_TERMINO', nuevo_termino_meses: 1 },
      { tipo: 'CAMBIO_TERMINO', nuevo_termino_meses: 12 },
      { tipo: 'CANCELACION' },
    ] as const
    for (const desde of ESTADOS_IMPLEMENTACION) {
      for (const e of eventos) {
        expect(ESTADOS_IMPLEMENTACION).toContain(transicionImplementacion(desde, e))
      }
    }
  })
})

describe('la condición de disparo de §9.9 sigue siendo la que dice el documento', () => {
  it('firmar un ANUAL deja la implementación en un estado que exige un paso posterior', () => {
    // §9.9: el daño es LATENTE porque las tres suscripciones vivas están en
    // estado terminal. Deja de serlo **al firmar el primer anual**: ese
    // contrato nace `exonerada_condicional`, que NO es firme, y a los doce
    // meses alguien tiene que moverlo. Hoy no hay quién.
    //
    // Este test fija esa cadena. Si algún día firmar un anual dejara de
    // producir un estado pendiente de confirmación, el pendiente de §9.9
    // dejaría de tener sentido y hay que reescribirlo, no borrarlo callado.
    const alFirmar = implementacionAlFirmar(12)
    expect(alFirmar).toBe('exonerada_condicional')
    expect(transicionImplementacion(alFirmar, { tipo: 'ANIVERSARIO_ANUAL' })).toBe('exonerada')

    // Y que no llegue solo: ningún otro evento lo vuelve firme.
    const otros = [
      { tipo: 'CAMBIO_TERMINO', nuevo_termino_meses: 1 },
      { tipo: 'CANCELACION' },
    ] as const
    for (const e of otros) {
      expect(transicionImplementacion(alFirmar, e), e.tipo).not.toBe('exonerada')
    }
  })

  it('nadie llama todavía a `transicionImplementacion`: el pendiente sigue abierto', () => {
    // ⚠️ ESTE TEST ESTÁ HECHO PARA FALLAR ALGÚN DÍA, y esa es su función.
    //
    // §9.9 afirma que el modelo no tiene consumidor. Una afirmación así se
    // pudre sola: alguien escribe el primer llamador, el documento sigue
    // diciendo que no existe, y nadie se entera. Cuando este test falle,
    // el consumidor existe — actualizar §9.9 y borrar este test.
    const archivos = readdirSync('src', { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      // Se excluye por SUFIJO y no por ruta exacta: en Windows `readdirSync`
      // devuelve los separadores al revés y la comparación no coincidiría.
      .filter((f) => !f.endsWith('cobro.ts'))
      .filter((f) => readFileSync(`src/${f}`, 'utf8').includes('transicionImplementacion'))

    expect(archivos, 'apareció un consumidor: §9.9 quedó vieja').toEqual([])
  })
})

describe('el alta escribe todas las columnas que la base exige', () => {
  /**
   * ⚠️ ESTE TEST EXISTE PORQUE EL DEFECTO YA OCURRIÓ (19/08/2026).
   *
   * La `016` se escribió leyendo el `create table` de la `003` y tomándolo
   * por el esquema actual. No lo es: la `006` agregó `monto_implementacion`
   * NOT NULL y sin default, y la `015` borró `proximo_cobro`. **Un
   * `create table` de hace nueve migraciones no describe la tabla de hoy** —
   * el alta falló al aplicarse, contra la base, con violación de NOT NULL.
   *
   * Acá SÍ se leen los tipos generados y no las migraciones, al revés que el
   * resto del archivo, y la diferencia es a propósito: la pregunta no es "qué
   * se acordó" sino "qué exige la base HOY para poder insertar". Eso es
   * exactamente lo que `database.types.ts` sabe y una migración suelta no.
   */
  it('la RPC de la 016 cubre todo lo obligatorio de `suscripciones`', () => {
    const migracion = sql('016_alta_de_suscripcion')
    const insert = migracion.match(
      /insert into public\.suscripciones \(([\s\S]*?)\) values/,
    )
    expect(insert, 'no se encontró el insert en la 016').not.toBeNull()

    const escribe = insert![1]
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && !c.startsWith('--'))

    const tipos = readFileSync('src/types/database.types.ts', 'utf8')
    const desde = tipos.indexOf('      suscripciones: {')
    const bloque = tipos.slice(tipos.indexOf('Insert:', desde), tipos.indexOf('Update:', desde))

    // Sin `?` = la base lo exige: NOT NULL y sin default.
    const obligatorias = [...bloque.matchAll(/^\s{10}([a-z_]+):/gm)].map((m) => m[1])
    expect(obligatorias.length, 'no se pudo leer el Insert de suscripciones').toBeGreaterThan(3)

    expect(escribe.filter((c) => obligatorias.includes(c)).sort()).toEqual(obligatorias.sort())
  })
})
