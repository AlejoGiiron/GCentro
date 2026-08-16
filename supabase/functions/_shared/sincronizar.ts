/**
 * La orquestación de `sincronizar-bandera`, separada del runtime.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * Vivía adentro de `index.ts`, que usa globales de Deno y no se puede correr
 * en vitest. Eso dejaba SIN TESTS justo la parte donde se decide el orden de
 * las operaciones — y el 14/08/2026 una prueba en vivo encontró ahí un
 * defecto que los 416 tests no veían: la validación del largo del mensaje
 * corría DESPUÉS del insert, así que un mensaje de 281 caracteres devolvía
 * 400 y dejaba una fila muerta en la cola.
 *
 * El test de `enviar.test.ts` sí probaba que `enviarBandera` tira antes de
 * tocar la red. Era cierto y era irrelevante: el insert no está ahí.
 * Testear la unidad equivocada es indistinguible de no testear.
 *
 * Todo lo del mundo exterior entra por puerto: la base, el envío, el reloj.
 * `index.ts` queda como adaptador de Deno y nada más.
 * ─────────────────────────────────────────────────────────────────────────
 */
import {
  ErrorDeContrato,
  esNivel,
  NIVELES,
  normalizarMensaje,
  type BanderaErrorCodigo,
  type Nivel,
} from './contrato.ts'
import type { ParametrosEnvio, ResultadoEnvio } from './enviar.ts'

export interface SuscripcionParaBandera {
  id: string
  organizacion_externa_id: string | null
  producto_codigo: string
  url_aplicar_estado: string | null
}

export interface CamposCierre {
  intentos: number
  confirmado_en: string | null
  ultimo_error: string | null
  bandera_error_codigo: BanderaErrorCodigo | null
  cambio_efectivo: boolean | null
}

/**
 * Acceso a la base. Los métodos TIRAN si la base falla; devolver `null` es
 * "no está", que es otra cosa. Mezclarlas es cómo un fallo de conexión se
 * termina reportando como "la suscripción no existe".
 */
export interface PuertoDatos {
  esAdmin(): Promise<boolean>
  buscarSuscripcion(id: string): Promise<SuscripcionParaBandera | null>
  /**
   * Escribe la intención COMPLETA: nivel y mensaje.
   *
   * El mensaje se guarda (014) para dos cosas: poder contestar «¿qué le
   * dijimos a este cliente?», y que un reintento pueda repetir la intención
   * entera. Antes se perdía, y reintentar mandaba `null` — que en el producto
   * BORRA el banner.
   */
  crearBandera(suscripcionId: string, nivel: Nivel, mensaje: string | null): Promise<string>
  cerrarBandera(id: string, campos: CamposCierre): Promise<void>
}

export type Enviar = (p: ParametrosEnvio) => Promise<ResultadoEnvio>

export interface Respuesta {
  status: number
  cuerpo: Record<string, unknown>
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface EntradaCruda {
  suscripcion_id?: unknown
  valor_deseado?: unknown
  mensaje?: unknown
}

/**
 * ⚠️ EL ORDEN DE ESTA FUNCIÓN ES EL CONTRATO, no una comodidad.
 *
 * TODO lo que pueda rechazarse por el dato de entrada se rechaza ANTES de
 * `crearBandera`. Una fila en la cola significa "esto hay que aplicarlo y se
 * va a reintentar hasta lograrlo"; un dato inválido no es eso — no se arregla
 * reintentando, y cuando exista el barrido en diferido (§9.7) una fila así se
 * reintentaría para siempre.
 *
 * `confirmado_en is null` tiene que poder leerse como "falta aplicar". Cada
 * fila que no puede completarse nunca rompe esa lectura.
 */
export async function sincronizarBandera(
  entrada: EntradaCruda,
  secreto: string,
  datos: PuertoDatos,
  enviar: Enviar,
): Promise<Respuesta> {
  // AUDITORÍA DEL 14/08: sin secreto, `firmarPeticion` falla DESPUÉS del
  // insert y la fila queda como `DESCONOCIDO` — imposible de completar y
  // eterna para el barrido en diferido. `index.ts` ya lo ataja antes, pero la
  // invariante tiene que valer para este módulo solo, no por lo que haga su
  // llamador. Es configuración faltante, no culpa del que llamó: 500.
  if (!secreto) {
    return { status: 500, cuerpo: { error: 'El puente no está configurado.' } }
  }

  if (!(await datos.esAdmin())) {
    return { status: 403, cuerpo: { error: 'No autorizado.' } }
  }

  // ── VALIDACIÓN DE ENTRADA — todo acá arriba, nada después del insert ────
  const suscripcionId = entrada.suscripcion_id
  if (typeof suscripcionId !== 'string' || !RE_UUID.test(suscripcionId)) {
    return { status: 400, cuerpo: { error: 'suscripcion_id tiene que ser un uuid.' } }
  }

  if (!esNivel(entrada.valor_deseado)) {
    return {
      status: 400,
      cuerpo: { error: `valor_deseado tiene que ser uno de: ${NIVELES.join(', ')}.` },
    }
  }
  const nivel = entrada.valor_deseado

  // El largo y el tipo del mensaje. Esta línea es el arreglo del 14/08: vivía
  // adentro de `construirCuerpo`, o sea después del insert. La de allá se
  // queda como red de atrás, no se saca de ahí.
  let mensaje: string | null
  try {
    mensaje = normalizarMensaje(entrada.mensaje)
  } catch (e) {
    return {
      status: 400,
      cuerpo: { error: e instanceof Error ? e.message : 'Mensaje inválido.' },
    }
  }

  // ── La suscripción y su puente ──────────────────────────────────────────
  const suscripcion = await datos.buscarSuscripcion(suscripcionId)
  if (!suscripcion) {
    return { status: 404, cuerpo: { error: 'La suscripción no existe.' } }
  }
  if (!suscripcion.url_aplicar_estado) {
    return {
      status: 422,
      cuerpo: { error: `El producto ${suscripcion.producto_codigo} no tiene puente configurado.` },
    }
  }
  // AUDITORÍA DEL 14/08: acá había un chequeo de "tiene algo" mientras
  // `construirCuerpo` exige forma de UUID. Que la columna sea `uuid` en
  // Postgres lo vuelve inalcanzable hoy, pero la invariante no puede depender
  // de un tipo de otra capa: si el handler valida MENOS que el contrato, la
  // diferencia es un camino que escribe fila y después falla.
  if (!suscripcion.organizacion_externa_id || !RE_UUID.test(suscripcion.organizacion_externa_id)) {
    return { status: 422, cuerpo: { error: 'La suscripción no tiene organizacion_externa_id.' } }
  }

  // ── El outbox: primero la intención ─────────────────────────────────────
  //
  // §5: nunca asumir que la escritura funcionó. A partir de acá, todo camino
  // termina con la fila cerrada — confirmada o con su código de error.
  const banderaId = await datos.crearBandera(suscripcionId, nivel, mensaje)

  let resultado: ResultadoEnvio
  try {
    resultado = await enviar({
      url: suscripcion.url_aplicar_estado,
      secreto,
      organizacionExternaId: suscripcion.organizacion_externa_id,
      nivel,
      mensaje,
    })
  } catch (e) {
    // ⚠️ ESTO YA NO DEBERÍA PODER PASAR POR UNA ENTRADA INVÁLIDA.
    //
    // `construirCuerpo` valida el nivel, el uuid de la organización y el
    // mensaje; los tres se validan arriba, antes del insert. Si igual cae un
    // `ErrorDeContrato` acá, no es un dato malo del que llamó: es que esta
    // función y el módulo del contrato se desincronizaron. Por eso 500 y no
    // 400 — un 400 le echaría la culpa al cliente de un bug nuestro, que es
    // exactamente cómo un defecto se queda años sin que nadie lo mire.
    const detalle = e instanceof Error ? e.message : String(e)
    await datos.cerrarBandera(banderaId, {
      intentos: 0,
      confirmado_en: null,
      ultimo_error: detalle,
      // El enum no tiene categoría para "dato inválido de este lado" y no la
      // necesita: se diseñó para fallas de SINCRONIZACIÓN, y después del
      // arreglo esa clase de error no llega hasta acá. `DESCONOCIDO` acá es
      // literal: no sabemos qué pasó, porque no debería estar pasando.
      bandera_error_codigo: 'DESCONOCIDO',
      cambio_efectivo: null,
    })
    return {
      status: e instanceof ErrorDeContrato ? 500 : 500,
      cuerpo: { error: 'Invariante roto al construir la petición.', bandera_id: banderaId },
    }
  }

  await datos.cerrarBandera(banderaId, {
    intentos: resultado.intentos,
    confirmado_en: resultado.ok ? new Date().toISOString() : null,
    ultimo_error: resultado.ok ? null : (resultado.error ?? null),
    bandera_error_codigo: resultado.ok ? null : (resultado.codigo ?? 'DESCONOCIDO'),
    // `?? null` y no `?? false`: si el 200 vino con un cuerpo ilegible no
    // sabemos si cambió algo, y decir "no cambió" sería inventarlo (ver 009).
    cambio_efectivo: resultado.ok ? (resultado.changed ?? null) : null,
  })

  if (!resultado.ok) {
    return {
      status: 502,
      cuerpo: {
        ok: false,
        bandera_id: banderaId,
        bandera_error_codigo: resultado.codigo,
        intentos: resultado.intentos,
      },
    }
  }

  return {
    status: 200,
    cuerpo: {
      ok: true,
      bandera_id: banderaId,
      // `false` significa que el producto YA estaba en ese estado. No es un
      // error: es idempotencia, y `subscription_updated_at` no se movió.
      changed: resultado.changed,
      // ⚠️ SE DEVUELVE PERO NO SE GUARDA, y las dos mitades son deliberadas.
      //
      // No se guarda porque los días de gracia se cuentan contra NUESTRO
      // `proximo_cobro` (§4); duplicar el reloj del otro sistema sería estado
      // que mantener sincronizado sin que nadie lo consulte.
      //
      // Se devuelve porque sin él la idempotencia solo se puede creer, no
      // comprobar: `changed:false` es un booleano que calcula el otro lado,
      // mientras que dos llamadas con el MISMO timestamp son la evidencia de
      // que no se movió nada. Verificado en vivo el 14/08/2026.
      subscription_updated_at: resultado.subscription_updated_at,
      intentos: resultado.intentos,
    },
  }
}
