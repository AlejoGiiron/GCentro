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
 * §8 siguen siendo la única autorización.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTE ARCHIVO ES SOLO EL ADAPTADOR DE DENO.
 *
 * La lógica —y sobre todo el ORDEN de las operaciones— vive en
 * `_shared/sincronizar.ts`, que sí se puede correr en vitest. Estaba acá
 * adentro, y por eso el 14/08/2026 una prueba en vivo encontró un defecto de
 * orden que 416 tests no veían: nada de lo que estuviera en este archivo
 * podía ejecutarse en un test.
 *
 * Todo lo que se agregue a este archivo hereda esa propiedad. Si algo tiene
 * una decisión adentro, no va acá: va en `_shared/`.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS, respuestaPreflight } from '../_shared/cors.ts'
import { enviarBandera } from '../_shared/enviar.ts'
import {
  sincronizarBandera,
  type CamposCierre,
  type PuertoDatos,
  type SuscripcionParaBandera,
} from '../_shared/sincronizar.ts'

declare const Deno: { env: { get(clave: string): string | undefined }; serve(h: Handler): void }
type Handler = (peticion: Request) => Promise<Response>

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    // CORS en TODAS las respuestas, no sólo en el preflight: sin esto el
    // navegador deja pasar el OPTIONS y después bloquea la respuesta del POST.
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (peticion) => {
  // El preflight va PRIMERO: llega sin `Authorization` a propósito, así que
  // cualquier chequeo previo lo rechazaría y el navegador bloquearía el POST.
  if (peticion.method === 'OPTIONS') return respuestaPreflight()

  if (peticion.method !== 'POST') {
    return json({ error: 'Solo POST.' }, 405)
  }

  // El secreto se lee y no se loguea, no se devuelve y no se compara en un
  // mensaje de error.
  const secreto = Deno.env.get('GVENTO_HMAC_SECRETO') ?? ''

  const autorizacion = peticion.headers.get('Authorization')
  if (!autorizacion) {
    return json({ error: 'Falta sesión.' }, 401)
  }

  let entrada: Record<string, unknown>
  try {
    entrada = await peticion.json()
  } catch {
    return json({ error: 'Cuerpo inválido.' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    // Anon key, no service role. La autorización real la hacen las policies.
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacion } } },
  )

  // ── El puerto: traduce supabase-js a lo que espera la orquestación ──────
  //
  // Los métodos TIRAN si la base falla. Devolver `null` es "no está", que es
  // otra cosa: mezclarlas convertiría un fallo de conexión en "la suscripción
  // no existe", y alguien buscaría el problema en los datos.
  const datos: PuertoDatos = {
    // No se consulta un claim ni una lista aparte: se le pide a la base una
    // fila de `admins`. Bajo RLS eso solo funciona si el que pregunta ES
    // admin (§8), así que la comprobación y la política son LA MISMA cosa.
    async esAdmin() {
      const { data, error } = await supabase.from('admins').select('id').limit(1)
      if (error) throw new Error(`admins: ${error.code}`)
      return !!data && data.length > 0
    },

    async buscarSuscripcion(id): Promise<SuscripcionParaBandera | null> {
      const { data, error } = await supabase
        .from('suscripciones')
        .select('id, organizacion_externa_id, productos ( codigo, url_aplicar_estado )')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(`suscripciones: ${error.code}`)
      if (!data) return null

      const producto = data.productos as unknown as {
        codigo: string
        url_aplicar_estado: string | null
      } | null

      return {
        id: data.id,
        organizacion_externa_id: data.organizacion_externa_id,
        producto_codigo: producto?.codigo ?? '?',
        url_aplicar_estado: producto?.url_aplicar_estado ?? null,
      }
    },

    async crearBandera(suscripcionId, nivel, mensaje) {
      const { data, error } = await supabase
        .from('banderas_pendientes')
        .insert({ suscripcion_id: suscripcionId, valor_deseado: nivel, mensaje })
        .select('id')
        .single()
      if (error || !data) throw new Error(`insert bandera: ${error?.code ?? 'sin fila'}`)
      return data.id
    },

    async cerrarBandera(id, campos: CamposCierre) {
      const { error } = await supabase.from('banderas_pendientes').update(campos).eq('id', id)
      // Se propaga a propósito: el estado del producto puede haber quedado
      // bien y el nuestro no. Un falso "confirmado" es el bug que §5 nombra
      // —"creí que había escrito y no"— con el signo invertido.
      if (error) throw new Error(`update bandera: ${error.code}`)
    },
  }

  try {
    const r = await sincronizarBandera(entrada, secreto, datos, (params) =>
      enviarBandera(params, {
        fetch: globalThis.fetch,
        ahora: () => Date.now() / 1000,
        esperar: (ms) => new Promise((res) => setTimeout(res, ms)),
      }),
    )
    return json(r.cuerpo, r.status)
  } catch (e) {
    // Fallo de la base. El código de Postgres al log; al que llamó, nada:
    // un mensaje de error de la base es texto libre y ahí ya se comprobó que
    // termina cayendo un nombre propio (§3).
    console.error('sincronizar-bandera:', e instanceof Error ? e.message : 'desconocido')
    return json({ error: 'No se pudo completar la sincronización.' }, 500)
  }
})
