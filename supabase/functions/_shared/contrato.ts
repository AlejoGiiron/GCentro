/**
 * EL BORDE — contrato con la Edge Function `aplicar-estado` de G-Vento.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTE ES EL ÚNICO ARCHIVO DEL REPO DONDE EXISTE EL INGLÉS DEL PRODUCTO.
 *
 * §6 del documento: el producto nombró sus columnas en inglés, nosotros
 * usamos español por la convención Giiron (§2), y la traducción vive de
 * NUESTRO lado, en un solo lugar. Adentro del panel todo es español; el
 * inglés existe únicamente en el borde que habla con el producto.
 *
 * Un mapeo esparcido en varios archivos es cómo se termina con dos
 * traducciones que discrepan, y el síntoma aparece del otro lado —en la base
 * de un cliente— donde no se puede depurar.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * PURO A PROPÓSITO: sin Deno, sin npm, sin red, sin reloj. Lo importan tanto
 * la Edge Function (Deno) como los tests (Node), y esa portabilidad es lo que
 * permite que el contrato se pruebe de verdad en vez de por inspección.
 */

// ── Los cinco niveles, de los dos lados ───────────────────────────────────

/** Nuestra escalera (§4). Es lo que va en `banderas_pendientes.valor_deseado`. */
export const NIVELES = ['activa', 'por_vencer', 'gracia', 'restringida', 'suspendida'] as const
export type Nivel = (typeof NIVELES)[number]

/**
 * Los cinco valores que acepta `organizaciones.subscription_status`.
 *
 * Es `text` con CHECK del lado de ellos, no un enum de Postgres — o sea que
 * la lista puede cambiar sin que un `ALTER TYPE` nos avise. Si algún día
 * agregan o quitan uno, esta constante es el único lugar que hay que tocar, y
 * el test de correspondencia biyectiva falla hasta que se toque.
 */
export const ESTADOS_PRODUCTO = ['active', 'expiring', 'grace', 'restricted', 'suspended'] as const
export type EstadoProducto = (typeof ESTADOS_PRODUCTO)[number]

/**
 * LA TRADUCCIÓN. Escrita como `Record<Nivel, EstadoProducto>` y no como un
 * objeto suelto: si mañana se agrega un sexto nivel a `NIVELES`, esto deja de
 * compilar hasta que alguien decida su traducción. No hay forma de agregar un
 * nivel y olvidarse del borde.
 */
const TRADUCCION: Record<Nivel, EstadoProducto> = {
  activa: 'active',
  por_vencer: 'expiring',
  gracia: 'grace',
  restringida: 'restricted',
  suspendida: 'suspended',
}

/**
 * Falla ANTES de la llamada, no después.
 *
 * Se distingue de un error de transporte a propósito: un `ErrorDeContrato` es
 * un bug nuestro o un dato inválido, nunca algo que se arregle reintentando.
 */
export class ErrorDeContrato extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDeContrato'
  }
}

export function esNivel(valor: unknown): valor is Nivel {
  return typeof valor === 'string' && (NIVELES as readonly string[]).includes(valor)
}

/**
 * Español → inglés. Tira si el nivel no es uno de los cinco.
 *
 * ⚠️ NO se depende del 400 del otro lado para atajar un valor desconocido, y
 * la razón es §5: fail-open. Si un valor que ellos no entienden se escribiera
 * igual —o si su CHECK cambiara y aceptara cualquier cosa— una SUSPENSIÓN se
 * leería como `activa` y el sistema no fallaría: simplemente no cobraría, en
 * silencio, hasta que alguien note que un moroso sigue operando normal.
 *
 * Un error del que dependemos para la corrección tiene que ser nuestro. El 400
 * de ellos es la segunda red, no la primera.
 */
export function traducirNivel(nivel: string): EstadoProducto {
  if (!esNivel(nivel)) {
    throw new ErrorDeContrato(
      `Nivel desconocido: ${JSON.stringify(nivel)}. Los válidos son ${NIVELES.join(', ')}.`,
    )
  }
  return TRADUCCION[nivel]
}

// ── El mensaje del banner ─────────────────────────────────────────────────

/**
 * Largo máximo de `subscription_message`, impuesto de NUESTRO lado.
 *
 * G-Vento lo declara `text` sin límite y no lo valida. Eso no significa que
 * cualquier largo sirva: el campo se renderiza en un banner del POS, encima
 * de la pantalla de venta, en una tablet apaisada detrás de un mostrador.
 *
 * 280 caracteres, por tres razones:
 *
 * · Es el techo natural de DOS FRASES. Más que eso ya no es un aviso de
 *   cobranza, es una carta — y un banner persistente que nadie termina de
 *   leer deja de comunicar y pasa a ser ruido que se aprende a ignorar.
 * · Entra en dos o tres renglones en pantalla angosta sin empujar la venta
 *   hacia abajo ni obligar a scroll. Un banner que tapa el flujo de trabajo
 *   se convierte en un problema del cliente, no en presión de cobranza.
 * · El límite tiene que existir de este lado porque del otro no existe. Un
 *   `text` sin límite escrito desde un panel es donde alguien termina pegando
 *   un hilo de correo entero, y el que lo ve es el cajero del bar.
 *
 * Es un número de producto, no una restricción técnica: se puede mover. Lo
 * que no se puede es no tenerlo.
 */
export const MENSAJE_MAX = 280

/**
 * Normaliza y valida el mensaje.
 *
 * `null` y `''` colapsan los dos a `null`: el contrato dice nullable, y un
 * string vacío del otro lado renderizaría un banner en blanco —un rectángulo
 * de color sin texto— que es peor que no mandar nada.
 */
export function normalizarMensaje(mensaje: unknown): string | null {
  if (mensaje === null || mensaje === undefined) return null
  if (typeof mensaje !== 'string') {
    throw new ErrorDeContrato('El mensaje tiene que ser texto o null.')
  }
  const limpio = mensaje.trim()
  if (limpio === '') return null
  if (limpio.length > MENSAJE_MAX) {
    throw new ErrorDeContrato(
      `El mensaje tiene ${limpio.length} caracteres y el máximo es ${MENSAJE_MAX}.`,
    )
  }
  return limpio
}

// ── El cuerpo ─────────────────────────────────────────────────────────────

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Construye el cuerpo de la petición y lo devuelve YA SERIALIZADO.
 *
 * ⚠️ Devuelve un `string` y no un objeto, y eso es la mitad de la seguridad
 * del HMAC. El contrato firma `${timestamp}.${cuerpo_crudo}` sobre el cuerpo
 * TAL CUAL se manda; si esta función devolviera un objeto, habría dos
 * serializaciones posibles —la que se firma y la que se manda— y basta con
 * que difieran en el orden de una clave o en un espacio para que el otro lado
 * responda 401 sin que se entienda por qué.
 *
 * Devolviendo el string, no queda nada que re-serializar. Ver `firma.ts`.
 */
export function construirCuerpo(
  organizacionExternaId: string | null,
  nivel: string,
  mensaje: unknown,
): string {
  if (!organizacionExternaId || !RE_UUID.test(organizacionExternaId)) {
    throw new ErrorDeContrato(
      'La suscripción no tiene un organizacion_externa_id válido: no hay a quién escribirle.',
    )
  }
  // El orden de las claves es el del contrato documentado. No importa para el
  // JSON, sí para poder comparar a ojo un cuerpo capturado contra el contrato.
  return JSON.stringify({
    organization_id: organizacionExternaId,
    status: traducirNivel(nivel),
    message: normalizarMensaje(mensaje),
  })
}

// ── Códigos de error ──────────────────────────────────────────────────────

/**
 * El enum derivado de `banderas_pendientes.bandera_error_codigo` (§3).
 *
 * Existe porque `ultimo_error` es texto crudo y ya se comprobó que ahí termina
 * cayendo un nombre propio. Este responde la única pregunta que importa cuando
 * falla la sincronización: ¿es el secreto, la red, o el otro lado?
 */
export type BanderaErrorCodigo =
  | 'HMAC_INVALIDO'
  | 'TIMEOUT'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'ORG_NO_ENCONTRADA'
  | 'RED'
  | 'DESCONOCIDO'

/**
 * Código HTTP → enum. El orden de los `if` es el contrato, no una comodidad:
 * 401 y 404 tienen significado propio y se atajan ANTES del rango genérico.
 *
 *   401 → HMAC_INVALIDO      firma mal calculada, secreto rotado, o reloj
 *                            corrido más de 300s. Los tres son "arreglalo vos".
 *   404 → ORG_NO_ENCONTRADA  el uuid que guardamos no existe del otro lado.
 *   400 → HTTP_4XX           estado inválido. No debería pasar nunca: se
 *                            valida antes (ver `traducirNivel`). Si aparece,
 *                            el contrato cambió y no nos enteramos.
 */
export function codigoDeEstadoHttp(estado: number): BanderaErrorCodigo {
  if (estado === 401) return 'HMAC_INVALIDO'
  if (estado === 404) return 'ORG_NO_ENCONTRADA'
  if (estado >= 400 && estado <= 499) return 'HTTP_4XX'
  if (estado >= 500 && estado <= 599) return 'HTTP_5XX'
  return 'DESCONOCIDO'
}

/**
 * Excepción de transporte → enum.
 *
 * `AbortError` / `TimeoutError` es el `AbortSignal.timeout` de nuestro lado.
 * `TypeError` es lo que tira `fetch` cuando ni siquiera llegó a hablar: DNS,
 * conexión rechazada, TLS. Todo lo demás es DESCONOCIDO, que es honesto:
 * inventarle una categoría a un error que no se reconoce es exactamente cómo
 * se pierde media hora diagnosticando la categoría equivocada.
 */
export function codigoDeExcepcion(e: unknown): BanderaErrorCodigo {
  if (e instanceof Error) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'TIMEOUT'
    if (e.name === 'TypeError') return 'RED'
  }
  return 'DESCONOCIDO'
}

/**
 * ¿Vale la pena reintentar?
 *
 * Solo lo transitorio. Reintentar un HMAC_INVALIDO tres veces son tres 401
 * idénticos, un cliente esperando treinta segundos de más, y tres líneas de
 * log que dicen lo mismo. Un secreto mal configurado no se arregla en 1.5s.
 *
 * DESCONOCIDO tampoco se reintenta: un error que no se pudo clasificar
 * reintentado tres veces son tres errores que no se pudieron clasificar. La
 * fila queda sin confirmar, que es exactamente la señal que el outbox existe
 * para dar.
 */
export function esReintentable(codigo: BanderaErrorCodigo): boolean {
  return codigo === 'TIMEOUT' || codigo === 'RED' || codigo === 'HTTP_5XX'
}
