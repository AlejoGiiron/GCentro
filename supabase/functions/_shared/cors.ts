/**
 * CORS para `sincronizar-bandera`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ HIZO FALTA, Y POR QUÉ NADIE LO NOTÓ
 *
 * `supabase.functions.invoke` manda `Authorization` y `Content-Type`, que no
 * son cabeceras "simples", así que el navegador hace **preflight**: un
 * `OPTIONS` antes del `POST`. El handler respondía `405` a todo lo que no
 * fuera POST, sin cabeceras CORS, y el navegador bloqueaba la llamada.
 *
 * O sea que **el botón de confirmar la bandera y el de reintentar nunca
 * pudieron funcionar desde un navegador** — ni en producción ni en local.
 * No se detectó porque todas las pruebas del puente fueron con `curl`, que
 * no hace preflight. Es, otra vez, testear la unidad equivocada: se probó el
 * transporte, no el camino que usa la aplicación.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ `*` COMO ORIGEN, Y ES SEGURO ACÁ — pero por una razón concreta.
 *
 * La única autenticación de esta función es el **header `Authorization`**, y
 * un navegador NO lo adjunta solo: hay que ponerlo desde JavaScript. Supabase
 * guarda la sesión en `localStorage`, no en cookies, así que **no existe una
 * credencial ambiente** que un sitio de terceros pueda hacer viajar sin
 * tenerla. Sin token no hay nada que un origen ajeno pueda hacer que no
 * pudiera hacer igual desde `curl`.
 *
 * Si algún día esta función pasara a autenticarse por cookie, `*` dejaría de
 * ser aceptable **el mismo día**.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // `apikey` y `x-client-info` los agrega supabase-js por su cuenta: sin
  // declararlos, el preflight falla aunque `authorization` esté permitido.
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Max-Age': '86400',
}

/** Respuesta al preflight. 204: no hay cuerpo que devolver. */
export function respuestaPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS })
}
