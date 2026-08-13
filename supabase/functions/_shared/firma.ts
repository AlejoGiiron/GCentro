/**
 * HMAC-SHA256 sobre `${timestamp}.${cuerpo_crudo}`.
 *
 * La única autenticación del puente: `aplicar-estado` tiene el JWT desactivado
 * a propósito, así que si la firma no cierra, no hay segunda barrera.
 *
 * Web Crypto y nada más — corre igual en Deno (la Edge Function) y en Node
 * (los tests). Sin dependencias: una librería de HMAC acá sería una
 * dependencia de terceros en el camino del secreto.
 */

/** Ventana que acepta el otro lado, en segundos, para los dos sentidos. */
export const VENTANA_SEGUNDOS = 300

const codificador = new TextEncoder()

function aHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Petición lista para mandar: el cuerpo exacto que se firmó, y los headers.
 *
 * ⚠️ El `cuerpo` sale de acá y tiene que entrar tal cual al `fetch`. Es un
 * string y no un objeto justamente para que no exista la posibilidad de
 * firmar una serialización y mandar otra — el modo de fallo sería un 401
 * intermitente e imposible de diagnosticar desde este lado.
 */
export interface PeticionFirmada {
  cuerpo: string
  headers: Record<string, string>
}

/**
 * Firma el cuerpo y devuelve los headers del contrato.
 *
 * ⚠️ NO incluye `Authorization` ni `apikey`, y no es un olvido: `aplicar-estado`
 * corre con verify-JWT desactivado y mandar un token de G-Centro hacia el
 * proyecto de G-Vento sería filtrar una credencial nuestra a los logs de otro
 * sistema, sin que sirva para nada.
 *
 * `Content-Type` es `application/json` pero el cuerpo firmado es el string
 * crudo: el otro lado tiene que leer el body sin parsear para verificar. Eso
 * es cosa de ellos; de este lado lo que importa es no tocarlo después de
 * firmar.
 */
export async function firmarPeticion(
  cuerpo: string,
  secreto: string,
  epochSegundos: number,
): Promise<PeticionFirmada> {
  if (!secreto) {
    throw new Error('Falta el secreto HMAC: la Edge Function no puede firmar.')
  }

  const timestamp = String(Math.floor(epochSegundos))
  const firma = await hmacHex(`${timestamp}.${cuerpo}`, secreto)

  return {
    cuerpo,
    headers: {
      'Content-Type': 'application/json',
      'x-gcentro-timestamp': timestamp,
      'x-gcentro-signature': firma,
    },
  }
}

/** HMAC-SHA256 en hex. Expuesto para poder verificar una firma capturada. */
export async function hmacHex(mensaje: string, secreto: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'raw',
    codificador.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return aHex(await crypto.subtle.sign('HMAC', clave, codificador.encode(mensaje)))
}
