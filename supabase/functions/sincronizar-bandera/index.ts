/**
 * Edge Function `sincronizar-bandera` — el salto que guarda el secreto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE (§5)
 *
 * El navegador NUNCA toca el secreto HMAC. Un SPA no puede guardar un secreto:
 * todo lo que llega al bundle es público, mire quien mire. Por eso el panel
 * llama acá, y acá —y solo acá— vive la credencial que abre la puerta de la
 * base de los clientes.
 *
 * QUÉ NO TIENE, A PROPÓSITO
 *
 * No usa service role. Ni de G-Centro ni de G-Vento. Todo el acceso a la base
 * va con el JWT de quien llamó, así que esta función NO puede hacer nada que
 * el admin que la invocó no pudiera hacer solo desde el panel. Las policies de
 * §8 siguen siendo la única autorización; no hay un segundo camino con más
 * privilegios que haya que auditar aparte.
 *
 * Lo único que esta función agrega al poder del que llama es la capacidad de
 * firmar con el secreto. Esa es exactamente la superficie que se quería.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ErrorDeContrato, esNivel, NIVELES } from '../_shared/contrato.ts'
import { enviarBandera } from '../_shared/enviar.ts'

declare const Deno: { env: { get(clave: string): string | undefined }; serve(h: Handler): void }
type Handler = (peticion: Request) => Promise<Response>

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (peticion) => {
  if (peticion.method !== 'POST') {
    return json({ error: 'Solo POST.' }, 405)
  }

  // ── El secreto ──────────────────────────────────────────────────────────
  // Se lee y no se loguea, no se devuelve y no se compara en un mensaje de
  // error. Que falte es un problema de despliegue, no del que llamó: 500.
  const secreto = Deno.env.get('GVENTO_HMAC_SECRETO')
  if (!secreto) {
    console.error('Falta GVENTO_HMAC_SECRETO en el entorno de la función.')
    return json({ error: 'El puente no está configurado.' }, 500)
  }

  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) {
    return json({ error: 'Falta sesión.' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    // Anon key, no service role. La autorización real la hacen las policies.
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacion } } },
  )

  // ── ¿Es admin? ──────────────────────────────────────────────────────────
  //
  // No se consulta un claim ni una lista aparte: se le pide a la base que
  // devuelva una fila de `admins`. Bajo RLS eso solo funciona si el que
  // pregunta ES admin (§8), así que la comprobación y la política son LA
  // MISMA cosa. Una función con su propio criterio de autorización es cómo se
  // termina con dos definiciones de "admin" que divergen.
  const { data: quienSoy, error: errorAdmin } = await supabase
    .from('admins')
    .select('id')
    .limit(1)

  if (errorAdmin) {
    console.error('Error consultando admins:', errorAdmin.code)
    return json({ error: 'No se pudo verificar la sesión.' }, 500)
  }
  if (!quienSoy || quienSoy.length === 0) {
    return json({ error: 'No autorizado.' }, 403)
  }

  // ── Entrada ─────────────────────────────────────────────────────────────
  let entrada: { suscripcion_id?: unknown; valor_deseado?: unknown; mensaje?: unknown }
  try {
    entrada = await peticion.json()
  } catch {
    return json({ error: 'Cuerpo inválido.' }, 400)
  }

  const suscripcionId = entrada.suscripcion_id
  if (typeof suscripcionId !== 'string' || !RE_UUID.test(suscripcionId)) {
    return json({ error: 'suscripcion_id tiene que ser un uuid.' }, 400)
  }
  if (!esNivel(entrada.valor_deseado)) {
    return json(
      { error: `valor_deseado tiene que ser uno de: ${NIVELES.join(', ')}.` },
      400,
    )
  }
  const nivel = entrada.valor_deseado

  // ── La suscripción y su puente ──────────────────────────────────────────
  const { data: suscripcion, error: errorSus } = await supabase
    .from('suscripciones')
    .select('id, organizacion_externa_id, productos ( codigo, url_aplicar_estado )')
    .eq('id', suscripcionId)
    .maybeSingle()

  if (errorSus) {
    console.error('Error leyendo la suscripción:', errorSus.code)
    return json({ error: 'No se pudo leer la suscripción.' }, 500)
  }
  if (!suscripcion) {
    return json({ error: 'La suscripción no existe.' }, 404)
  }

  const producto = suscripcion.productos as unknown as {
    codigo: string
    url_aplicar_estado: string | null
  } | null

  if (!producto?.url_aplicar_estado) {
    return json(
      { error: `El producto ${producto?.codigo ?? '?'} no tiene puente configurado.` },
      422,
    )
  }
  if (!suscripcion.organizacion_externa_id) {
    return json({ error: 'La suscripción no tiene organizacion_externa_id.' }, 422)
  }

  // ── El outbox: primero la intención ─────────────────────────────────────
  //
  // §5: nunca asumir que la escritura funcionó. Si la fila no se puede
  // escribir, NO se llama — una llamada sin rastro es exactamente el estado
  // que el outbox existe para hacer imposible, y es peor que no llamar.
  //
  // Lo que NO llega hasta acá: un nivel inválido o un mensaje demasiado largo
  // ya se rechazaron arriba, sin escribir nada. Un dato inválido no es una
  // intención pendiente; no hay nada que reintentar y no tiene por qué quedar
  // ensuciando la cola.
  const { data: bandera, error: errorInsert } = await supabase
    .from('banderas_pendientes')
    .insert({ suscripcion_id: suscripcionId, valor_deseado: nivel })
    .select('id')
    .single()

  if (errorInsert || !bandera) {
    console.error('No se pudo escribir la intención:', errorInsert?.code)
    return json({ error: 'No se pudo registrar la intención.' }, 500)
  }

  // ── El envío ────────────────────────────────────────────────────────────
  let resultado
  try {
    resultado = await enviarBandera(
      {
        url: producto.url_aplicar_estado,
        secreto,
        organizacionExternaId: suscripcion.organizacion_externa_id,
        nivel,
        mensaje: entrada.mensaje,
      },
      {
        fetch: globalThis.fetch,
        ahora: () => Date.now() / 1000,
        esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
      },
    )
  } catch (e) {
    // Solo `ErrorDeContrato` llega acá (mensaje largo, uuid inválido). La fila
    // ya existe, así que se marca en vez de dejarla muda.
    const detalle = e instanceof Error ? e.message : String(e)
    await supabase
      .from('banderas_pendientes')
      .update({ intentos: 0, ultimo_error: detalle, bandera_error_codigo: 'DESCONOCIDO' })
      .eq('id', bandera.id)
    const status = e instanceof ErrorDeContrato ? 400 : 500
    return json({ error: detalle, bandera_id: bandera.id }, status)
  }

  // ── El resultado ────────────────────────────────────────────────────────
  //
  // `confirmado_en` SOLO con un 200. Es la columna de la que depende que el
  // panel pueda mostrar "el producto sabe" separado de "yo lo decidí", que es
  // la duplicación deliberada de §5.
  const { error: errorUpdate } = await supabase
    .from('banderas_pendientes')
    .update({
      intentos: resultado.intentos,
      confirmado_en: resultado.ok ? new Date().toISOString() : null,
      ultimo_error: resultado.ok ? null : (resultado.error ?? null),
      bandera_error_codigo: resultado.ok ? null : (resultado.codigo ?? 'DESCONOCIDO'),
    })
    .eq('id', bandera.id)

  if (errorUpdate) {
    // El estado del producto puede haber quedado bien y el nuestro no. Se
    // reporta como fallo: un falso "confirmado" es el bug que §5 nombra —
    // "creí que había escrito y no"— con el signo invertido.
    console.error('No se pudo actualizar la bandera:', errorUpdate.code)
    return json(
      { error: 'Se sincronizó pero no se pudo registrar.', bandera_id: bandera.id },
      500,
    )
  }

  if (!resultado.ok) {
    return json(
      {
        ok: false,
        bandera_id: bandera.id,
        bandera_error_codigo: resultado.codigo,
        intentos: resultado.intentos,
      },
      502,
    )
  }

  return json(
    {
      ok: true,
      bandera_id: bandera.id,
      // `false` significa que el producto YA estaba en ese estado. No es un
      // error: es idempotencia, y `subscription_updated_at` no se movió.
      changed: resultado.changed,
      intentos: resultado.intentos,
    },
    200,
  )
})
