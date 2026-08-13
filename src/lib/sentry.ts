/* ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  ESTE ARCHIVO ESTÁ DUPLICADO A PROPÓSITO
 *
 * Existe una copia con el mismo diseño en G-Vento (`src/lib/sentry.ts`).
 * No es un descuido ni un candidato a extraer a un paquete compartido: los dos
 * repos son independientes y el monorepo se descartó con razón. La duplicación
 * se acepta, pero explícita.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CÓMO SE SINCRONIZAN LOS DOS REPOS
 *
 * NO se tocan entre sí. Desde este repo no se abre, no se lee y no se modifica
 * G-Vento — ni siquiera para comparar.
 *
 * La sincronización es por TRASPASO ENTRE HILOS: un cambio de diseño acá
 * produce un REPORTE que el humano le pasa al hilo de G-Vento, y ese hilo
 * decide y aplica en su propio repo. Al revés, igual. Cada repo deriva su
 * propia lista de columnas de SU esquema — es el paso que destapa los agujeros
 * que un copiado a ciegas se saltea.
 *
 * Lo que se transfiere es el DISEÑO del filtro y el MÉTODO de test.
 * Lo que NO se transfiere es la lista de columnas ni el allowlist de claves.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EL FILTRO ES ALLOWLIST POR CLAVE. NO SE VUELVE A DENY-LIST.
 *
 * Una deny-list no puede resolver esto, y no por estar mal implementada:
 *   · Un nombre propio es irreconocible por regex. No existe —ni puede
 *     existir— un detector de nombres propios. Solo una regla sobre la
 *     POSICIÓN (qué clave) lo ataja.
 *   · Cada columna nueva del esquema fuga callada hasta que alguien se acuerda
 *     de agregarla a la lista.
 *
 * El modo de fallo correcto es OPACIDAD (`[Filtrado:number]`), nunca fuga.
 * Lo que se olvida se pierde; no se filtra.
 *
 * La redacción es TIPADA a propósito: se pierde el valor y se conserva la
 * forma. Es lo que hace vivible al allowlist — sin eso la opacidad sería real
 * y el filtro se terminaría aflojando por presión de uso.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LOS MARCADORES DE scrubString USAN `\u0000` Y NUNCA ESPACIOS
 *
 * `scrubString` guarda UUID y fechas ISO detrás de un marcador para que la
 * pasada numérica no se los coma, y los restaura al final. Ese marcador va
 * delimitado por NUL, escrito SIEMPRE como el escape `\u0000`.
 *
 * Con espacios (` 0 `) el marcador choca con el texto real del mensaje:
 * un `0` suelto se restaura como un UUID y un índice sin valor emite
 * literalmente `undefined`. Ya pasó.
 *
 * Y como BYTE literal —no como escape— el archivo contiene NUL, git lo trata
 * como BINARIO, y los diffs de este módulo dejan de poder revisarse. Peor: el
 * byte es invisible al copiar el archivo entre repos, que es exactamente la
 * causa raíz de que esta función se rompiera al portarla. El escape es la
 * única forma correcta.
 * ═══════════════════════════════════════════════════════════════════════════ */
/**
 * Sentry — reporte de errores (v1: SOLO errores).
 *
 * NO se activa performance monitoring, session replay ni profiling: consumen
 * cuota y agregan ruido. Este módulo hace tres cosas:
 *   1. Inicializa Sentry solo en producción real (ver `sentryEnabled`).
 *   2. LIMPIA el payload de PII antes de enviarlo (ver `scrubEvento`).
 *   3. Expone helpers para el contexto de admin y el reporte explícito.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRIVACIDAD — G-Centro maneja los datos comerciales de los clientes de
 * G-Vento (razón social, NIT, contacto) y el histórico de pagos. Nada de eso
 * puede salir del navegador. La política está implementada, no solo escrita:
 *   · `sendDefaultPii: false` → sin IP del usuario ni cookies/headers.
 *   · Del admin propio se envía SOLO su UUID. NUNCA su email (por eso no se
 *     usa `Sentry.setUser({ email })`).
 *   · `beforeBreadcrumb` corta el query string y el cuerpo de las peticiones.
 *   · `scrubEvento` rutea cada rama del evento a uno de DOS MODOS:
 *
 *       scrubEstricto — contexto ESTRUCTURADO que escribimos nosotros
 *                       (`extra`, `contexts`, `tags`, `user`).
 *                       Allowlist por clave. Todo lo no declarado sale como
 *                       `[Filtrado:tipo]`.
 *
 *       scrubSobre    — payload NO estructurado (mensaje del error,
 *                       breadcrumbs). Es prosa: no hay claves de las que
 *                       agarrarse, así que redacta por CONTENIDO.
 *
 *     El allowlist es acotado a propósito. Aplicarlo al envelope entero
 *     rompería el agrupamiento y la symbolication de Sentry.
 *
 * ⚠️ El dinero en G-Centro es `integer` por §2 del diseño, así que TODO
 * importe llega como `number` de JS. Cualquier filtro que trate a los números
 * como "no peligrosos" fuga la plata de los clientes por construcción — es
 * exactamente el agujero que tenía la versión anterior.
 * ─────────────────────────────────────────────────────────────────────────
 */
import * as Sentry from '@sentry/react'

/**
 * Áreas funcionales — el tag que permite priorizar qué se rompe primero.
 * Se amplía a medida que el producto crece (suscripciones, pagos, bandera).
 */
export type SentryArea = 'auth' | 'catalogo' | 'config' | 'bandera'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

/**
 * Sentry se activa SOLO si:
 *   · el build es de producción (`import.meta.env.PROD`) → nunca en `pnpm dev`;
 *   · hay DSN configurado;
 *   · el navegador no está automatizado.
 *
 * ⚠️ OJO con CI: NO se puede apagar Sentry con `process.env.CI` en tiempo de
 * build, porque los proveedores de hosting suelen setear `CI=1` en sus builds
 * de producción — eso lo dejaría desactivado justamente donde se necesita.
 */
export const sentryEnabled =
  import.meta.env.PROD &&
  !!DSN &&
  !(typeof navigator !== 'undefined' && navigator.webdriver)

// ── Redacción de PII ──────────────────────────────────────────────────────

/**
 * Claves cuyo VALOR se redacta siempre, sin mirar el contenido.
 * Cubre los campos PII del dominio (cliente, contacto) y todo el texto
 * libre: `notas`, `motivo`, `nota` los escribe un admin y puede meter ahí
 * cualquier cosa ("Juan de G-10, 3001234567").
 *
 * ⚠️ ESTA LISTA NO ES LA DE G-VENTO. Se adaptó al esquema de §3 del diseño:
 *   · `razon` cubre `razon_social` — la denominación legal del cliente. No la
 *     atrapa ninguna otra regla: no tiene dígitos ni arroba, así que sin esta
 *     entrada "G-10 SAS" viajaba entero a Sentry.
 *   · `nit` va anclado a los bordes (`^` o `_`) para no comerse claves como
 *     `init` o `unit`. Como STRING lo atraparía la pasada numérica, pero como
 *     NUMBER pasaría intacto — y no se confía en la forma del valor.
 *   · `referencia` es el número de la transacción bancaria del pago.
 *   · `secret`, `signature`, `hmac` y `firma` son del puente de §5. Bajo
 *     allowlist ya estarían filtradas por omisión; están igual porque un
 *     chequeo fail-closed redundante sobre una CREDENCIAL cuesta nada, y el
 *     día que alguien agregue una de esas claves al allowlist "para ver por
 *     qué da 401", esto lo ataja. `firma` va anclada para no comerse
 *     `confirmado_en`, que contiene la subcadena.
 * Las claves de G-Vento que acá no existen (`waiter`, `mozo`) se omiten.
 */
const CLAVE_SENSIBLE =
  /(nombre|name|razon|phone|telefono|tel|email|correo|address|direccion|customer|cliente|contacto|note|nota|reason|motivo|comment|coment|referencia|password|token|apikey|authorization|secret|signature|hmac|(^|_)firma(_|$)|(^|_)nit(_|$))/i

/** Redacción de CONTENIDO, dentro de un string (un email en medio de una frase). */
const REDACTADO = '[Filtrado]'

// ── Allowlist por clave (modo estricto) ────────────────────────────────────

/**
 * IDENTIFICADORES — pasan verbatim, pero SOLO si el valor tiene forma de UUID.
 *
 * ⚠️ Esta regla se evalúa ANTES que la deny-list, y es la única que lo hace.
 * No es un agujero: la deny-list existe para tapar claves cuyo VALOR podría
 * ser PII, y un valor que ya se validó como UUID no tiene capacidad de
 * llevar PII. La precedencia la justifica la validación de forma, no el
 * nombre de la clave.
 *
 * Sin esto, `cliente_id` se destruía porque `cliente` matchea la deny-list —
 * la FK más usada del esquema era la única ilegible en un error, mientras
 * `id` y `suscripcion_id` sobrevivían. Una garantía de diagnóstico no puede
 * depender de que el nombre de una columna no colisione con un regex.
 *
 * Fail-closed por forma: si bajo `cliente_id` llega un nombre, se filtra.
 */
const CLAVE_ID = new Set([
  'id', 'cliente_id', 'producto_id', 'plan_id', 'suscripcion_id',
  'organizacion_externa_id', 'user_id', 'userId',
  // El puente (§5). `organization_id` es el MISMO uuid que
  // `organizacion_externa_id`, con el nombre en inglés del contrato: es el
  // único dato que identifica de quién es la bandera que falló, y sin él un
  // error de sincronización dice "algo falló" y nada más. `bandera_id` es la
  // fila del outbox, que es por donde se sigue el hilo en el panel.
  'organization_id', 'bandera_id',
])

const RE_UUID_EXACTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * FORMA de una constante de catálogo: slug, enum, SQLSTATE, código HTTP.
 * Sin espacios y acotada en largo.
 *
 * Estar en `CLAVE_PERMITIDA` no es un cheque en blanco para cualquier string
 * que pase por debajo: la clave se permite Y el valor se valida, igual que en
 * `CLAVE_ID`. Un permiso por clave sin chequeo de forma se rompe en el primer
 * `mutationKey: ['cliente', nombreDelCliente]` que alguien escriba sin
 * pensarlo — y ese array hereda el permiso del padre por diseño.
 *
 * `'gracia'`, `'CAMBIO_PLAN'`, `'mfa.verify'`, `'23505'` pasan.
 * `'Juan Perez'` no: tiene un espacio, y la prosa no es una constante.
 */
const RE_CONSTANTE = /^[\w.:-]{1,64}$/

/**
 * CLAVES OPACAS — se colapsan enteras, sin mirar adentro.
 *
 * `datos` es el `jsonb` de `suscripcion_eventos` (§3): forma libre, sin
 * esquema fijo. Allowlistear claves internas de una columna que no tiene
 * contrato es prometer algo que no se puede sostener — mañana alguien mete
 * ahí el diff de un cambio de plan con el nombre de quien lo pidió.
 */
const CLAVE_OPACA = new Set(['datos'])

/**
 * ALLOWLIST DE DIAGNÓSTICO — lo único que sale verbatim de un contexto
 * estructurado. Derivada de lo que ESTE repo manda, no heredada.
 *
 * ┌─ REGLA PARA LO QUE APAREZCA DESPUÉS ────────────────────────────────────┐
 * │ Permitido si el valor sale de un CATÁLOGO CERRADO.                      │
 * │ Filtrado si describe a un CLIENTE EN PARTICULAR.                        │
 * │                                                                          │
 * │ La decisión es POR COLUMNA, no por nombre de columna:                   │
 * │ `terminos.descuento_pct` (15 para todo el mundo) es catálogo;           │
 * │ `suscripciones.descuento_pct` (el trato que se le hizo a G-10) no.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ CONSECUENCIA DE ESA REGLA, y es la parte incómoda: el filtro solo ve
 * CLAVES, no tablas. Una clave que mapea a dos columnas con decisiones
 * opuestas NO IDENTIFICA UNA COLUMNA, así que no se puede decidir y cae
 * fail-closed. Por eso `descuento_pct` pelado está FILTRADO, y el valor de
 * catálogo se recupera solo bajo el alias calificado `termino_descuento_pct`.
 * Si querés el descuento del término en un reporte, logueá esa clave.
 */
const CLAVE_PERMITIDA = new Set([
  // Lo que este repo manda a propósito (ver captureError / captureIssue).
  'area', 'etapa', 'mutationKey',
  // Diagnóstico de errores de Supabase / PostgREST. `code` es el SQLSTATE:
  // el campo más útil de un PostgrestError, y hasta hoy salía como [monto].
  'code', 'status', 'statusCode', 'name',
  // Enums de catálogo cerrado (§3 y §4). Ninguno identifica a una persona.
  'codigo', 'termino', 'estado', 'estado_anterior', 'estado_nuevo',
  'estado_implementacion', 'tipo', 'concepto', 'metodo', 'valor_deseado',
  'activo', 'incluye_dian',
  // Marca de tenant de laboratorio. Es un booleano de catálogo: dice qué clase
  // de fila es, no nada sobre el cliente. Y es justo el que hace falta para
  // entender un error raro ("¿esto pasó en LAB o con un cliente real?").
  'es_prueba',
  // Conteos y tasas de catálogo cerrado.
  'meses', 'iva_pct', 'sedes_adicionales', 'intentos',
  'termino_descuento_pct',
  // El código derivado que reemplaza al texto crudo de
  // `banderas_pendientes.ultimo_error`, que va filtrado.
  'bandera_error_codigo',
  // El puente (§5). Los tres son catálogos cerrados y ninguno describe a un
  // cliente: `nivel` son los cinco de §4, `regla` son las seis derivaciones
  // de `bandera.ts`, y `changed` es el booleano de idempotencia que responde
  // "¿el producto ya estaba así?". Sin `regla`, un nivel sugerido que
  // sorprende no se puede explicar sin rehacer la cuenta a mano.
  //
  // ⚠️ `mensaje` y `message` NO están, y no es un olvido: es el texto del
  // banner, prosa que un admin escribe sobre un cliente concreto. Es
  // exactamente la clase de campo donde ya se comprobó que cae un nombre
  // propio. Se ve en el panel; a Sentry no va.
  'nivel', 'regla', 'changed',
  // `banderas_pendientes.cambio_efectivo` (009): el mismo booleano que
  // `changed`, con el nombre en español que le toca por ser columna nuestra
  // (§2). Las dos claves existen porque el dato cruza el límite y vuelve.
  'cambio_efectivo',
])

// ── Redacción TIPADA ──────────────────────────────────────────────────────

/**
 * Lo que hace VIVIBLE al allowlist: se pierde el valor, se conserva la FORMA.
 *
 * Responde casi todo el triage sin un byte de PII: ¿vino null o 0? ¿el array
 * volvió vacío? ¿llegó un string donde esperaba un number? Sin esto la
 * opacidad sería real y el filtro se terminaría aflojando por presión de uso.
 */
/**
 * Un objeto PLANO: literal `{}` o sin prototipo. Todo lo demás —`Date`,
 * `Error`, `Map`, `Set`, `RegExp`, instancias de clase— no tiene claves
 * enumerables, así que recorrerlo con `Object.entries` devuelve `{}`.
 *
 * Eso no sería una fuga, sería una MENTIRA de diagnóstico: diría "objeto
 * vacío" cuando lo que había era una fecha o una excepción. Misma familia que
 * devolver `[Filtrado]` para un `null`. Se filtran con su tipo real.
 */
function esPlano(valor: object): boolean {
  const proto = Object.getPrototypeOf(valor)
  return proto === Object.prototype || proto === null
}

function formaDe(valor: unknown): string {
  if (typeof valor === 'string') return `string(${valor.length})`
  if (Array.isArray(valor)) return `array(${valor.length})`
  if (typeof valor === 'object' && valor !== null) {
    if (!esPlano(valor)) return (valor.constructor?.name as string) ?? 'object'
    return `object{${Object.keys(valor).length}}`
  }
  return typeof valor
}

function filtrar(valor: unknown): string {
  return `[Filtrado:${formaDe(valor)}]`
}

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g
/** Detalle de Postgres en violación de constraint: `Key (email)=(...)`. */
const RE_PG_KEY = /Key\s*\(([^)]*)\)\s*=\s*\(([^)]*)\)/gi
/** Montos con separador de miles: `$ 79.000`, `1,250,000`. */
const RE_MONTO_FMT = /\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?/g
/** Enteros de 4+ dígitos: montos en COP sin formato y teléfonos. */
const RE_NUM_LARGO = /\b\d{4,}\b/g

const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const RE_ISO = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g

/**
 * Teléfono móvil colombiano (10 dígitos empezando en 3). Se redacta SIEMPRE:
 * es PII, no un identificador interno.
 */
const RE_MOVIL_CO = /\b3\d{9}\b/g

/**
 * Centinela de los marcadores internos de `scrubString`.
 *
 * Escrito como escape `\u0000` y NO como byte NUL literal: el literal es
 * invisible en el editor y se corrompe en silencio al copiar el archivo — que
 * es exactamente como se rompió esta función al portarla desde G-Vento.
 * G-Vento usa esta misma forma desde el cierre del Bloque 1 de G-Centro.
 */
const CENTINELA = '\u0000'
/** Marcador completo: NUL + `g` + índice + NUL. Ver por qué la `g` en `guardar`. */
// eslint-disable-next-line no-control-regex -- NUL deliberado: es el centinela
const RE_MARCADOR = /\u0000g(\d+)\u0000/g
/** Todo NUL que venga en la ENTRADA se barre antes de crear marcadores. */
// eslint-disable-next-line no-control-regex -- NUL deliberado: es el centinela
const RE_NUL = /\u0000/g

/**
 * Redacta PII dentro de un string conservando lo que sirve para depurar.
 *
 * Los UUID y las fechas ISO se enmascaran ANTES de la pasada numérica y se
 * restauran después: sin eso, `2026-08-05` saldría como `[monto]-08-05`.
 *
 * ⚠️ Los marcadores se delimitan con NUL y no con espacios. Con espacios
 * (` 0 `) el marcador choca con el texto real y corrompe el mensaje:
 *   · "reintento 0 de 3" + un UUID guardado → el `0` literal se restauraba
 *     como el UUID.
 *   · "código 7 rechazado" sin nada guardado → `guardados[7]` es `undefined`
 *     y salía "códigoundefinedrechazado".
 * El NUL no aparece en mensajes de error reales y, por las dudas, se barre de
 * la entrada antes de crear ningún marcador.
 */
function scrubString(input: string): string {
  if (!input) return input

  const guardados: string[] = []
  // La `g` delante del índice NO es decorativa: protege al marcador de
  // RE_NUM_LARGO. `\b\d{4,}\b` exige un límite de palabra antes del primer
  // dígito y entre `g` y `1` no lo hay. Sin ella, del marcador 1000 en
  // adelante el índice salía redactado como `[monto]`, la restauración no
  // encontraba el marcador y el valor guardado se perdía.
  const guardar = (m: string) => {
    guardados.push(m)
    return `${CENTINELA}g${guardados.length - 1}${CENTINELA}`
  }

  // Se barre cualquier NUL de la ENTRADA antes de crear marcadores: es lo que
  // hace que un centinela no se pueda falsificar desde el texto de origen.
  let s = input.replace(RE_NUL, '')

  s = s.replace(RE_MOVIL_CO, REDACTADO)

  s = s.replace(RE_UUID, guardar).replace(RE_ISO, guardar)

  s = s
    .replace(RE_EMAIL, REDACTADO)
    // El nombre de la columna se conserva (dice QUÉ constraint falló); el valor no.
    .replace(RE_PG_KEY, (_m, col: string) => `Key (${col})=(${REDACTADO})`)
    .replace(RE_MONTO_FMT, '[monto]')
    .replace(RE_NUM_LARGO, '[monto]')

  // FAIL-CLOSED: si un marcador quedara sin su valor (solo posible por un bug
  // acá adentro), sale REDACTADO — nunca `undefined` ni el texto crudo.
  return s.replace(RE_MARCADOR, (_m, i: string) => guardados[Number(i)] ?? REDACTADO)
}

const PROFUNDIDAD_MAX = 8

/**
 * MODO ESTRICTO — allowlist por clave, para el contexto ESTRUCTURADO que
 * escribimos nosotros (`extra`, `contexts`, `tags`, `user`).
 *
 * Acá el allowlist es casi gratis porque elegimos los nombres de las claves:
 * no adivinamos qué manda un tercero, declaramos qué mandamos.
 *
 * Dos propiedades que no son negociables:
 *
 * · SE DECIDE EN LA HOJA, y se RECURRE SIEMPRE. Un objeto con una clave
 *   desconocida no se colapsa entero: se baja y se decide hoja por hoja. Eso
 *   preserva la forma del árbol, que es la mitad del valor de un reporte.
 *
 * · EL MODO DE FALLO ES OPACIDAD, NUNCA FUGA. Una columna que nadie agregó a
 *   `CLAVE_PERMITIDA` sale como `[Filtrado:number]`. Eso es exactamente lo
 *   que se buscaba al invertir el filtro: lo que se olvida se pierde, no se
 *   filtra.
 *
 * `null` y `undefined` pasan verbatim a propósito. No tienen capacidad de
 * llevar PII y SÍ son diagnóstico: `hint: null` significa "Postgres no dio
 * pista", y devolver `[Filtrado]` ahí sería una mentira — diría "acá había
 * algo" cuando el hallazgo es que no había nada.
 */
export function scrubEstricto(valor: unknown, clave?: string, prof = 0): unknown {
  if (prof > PROFUNDIDAD_MAX) return '[Filtrado:profundidad]'

  if (valor === null || valor === undefined) return valor

  // Colapso explícito: columnas sin esquema fijo (ver CLAVE_OPACA).
  if (clave !== undefined && CLAVE_OPACA.has(clave)) return filtrar(valor)

  // Identificadores validados por FORMA. Única regla que precede a la
  // deny-list, y solo porque el valor se prueba, no se supone.
  if (clave !== undefined && CLAVE_ID.has(clave)) {
    return typeof valor === 'string' && RE_UUID_EXACTO.test(valor) ? valor : filtrar(valor)
  }

  // Deny-list. Bajo allowlist queda redundante, pero un chequeo fail-closed
  // redundante no cuesta nada: la política efectiva es allowlist ∧ ¬denylist.
  if (clave !== undefined && CLAVE_SENSIBLE.test(clave)) return filtrar(valor)

  if (Array.isArray(valor)) {
    // Los arrays no tienen clave propia: heredan la decisión del padre. Bajo
    // clave permitida se recorren; bajo clave desconocida colapsan enteros.
    if (clave !== undefined && CLAVE_PERMITIDA.has(clave)) {
      return valor.map((v) => scrubEstricto(v, clave, prof + 1))
    }
    return filtrar(valor)
  }

  if (typeof valor === 'object') {
    // Solo se recorre lo que se puede recorrer sin mentir (ver `esPlano`).
    if (!esPlano(valor)) return filtrar(valor)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = scrubEstricto(v, k, prof + 1)
    }
    return out
  }

  // HOJA. Acá y solo acá decide el allowlist. Sin clave (raíz o elemento de
  // array suelto) no hay posición de la que fiarse: se filtra.
  if (clave !== undefined && CLAVE_PERMITIDA.has(clave)) {
    // Permitido por clave Y validado por forma. Los números y booleanos no
    // tienen forma que validar; los strings sí, y tienen que parecer una
    // constante de catálogo, no prosa.
    if (typeof valor === 'number' || typeof valor === 'boolean') return valor
    if (typeof valor === 'string' && RE_CONSTANTE.test(valor)) return valor
    return filtrar(valor)
  }
  return filtrar(valor)
}

/**
 * MODO SOBRE — para el payload NO estructurado: el mensaje del error, el
 * `details` / `hint` de un PostgrestError, los breadcrumbs.
 *
 * Es prosa: no hay claves de las que agarrarse, así que el allowlist no tiene
 * tracción y la herramienta correcta sigue siendo el scrub de contenido.
 * Aplicar el allowlist acá rompería el agrupamiento y la symbolication — y el
 * riesgo en esa rama no es de diagnóstico, es que Sentry no pueda procesar el
 * evento.
 *
 * ⚠️ SUPOSICIÓN VIVA, propia de G-Centro. En este modo un string bajo una
 * clave desconocida pasa solo por el scrub de contenido: un nombre propio
 * saldría. Se sostiene porque los datos de la app entran por `extra`, que va
 * en modo estricto.
 *
 * El disparador realista acá NO es un breadcrumb de red: `beforeBreadcrumb`
 * ya borra `body` e `input` de todo fetch/xhr. Es un `console.log` de una
 * fila de cliente o de pago — la categoría `console` no pasa por ese hook y
 * su mensaje llega hasta acá. El día que aparezca uno, esa rama se rutea a
 * modo estricto; mientras tanto, la regla es no loguear filas por consola.
 */
export function scrubSobre(valor: unknown, prof = 0): unknown {
  if (prof > PROFUNDIDAD_MAX) return '[Filtrado:profundidad]'

  if (valor === null || valor === undefined) return valor
  if (typeof valor === 'string') return scrubString(valor)
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor
  if (Array.isArray(valor)) return valor.map((v) => scrubSobre(v, prof + 1))

  if (typeof valor === 'object') {
    if (!esPlano(valor)) return filtrar(valor)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      // La deny-list sigue viva también acá: es lo único que da protección
      // por posición en un modo que por definición no la tiene.
      out[k] = CLAVE_SENSIBLE.test(k) ? filtrar(v) : scrubSobre(v, prof + 1)
    }
    return out
  }

  return filtrar(valor)
}

/**
 * Las ÚNICAS ramas del evento que este ruteo conoce. Todo lo demás pasa
 * intacto, y por eso no se enumera: la forma completa de un evento cambia con
 * cada versión del SDK, y listarla sería prometer que la seguimos.
 */
interface RamasEvento {
  extra?: unknown
  contexts?: unknown
  tags?: unknown
  user?: unknown
  message?: unknown
  breadcrumbs?: unknown
  exception?: { values?: unknown[] } & Record<string, unknown>
}

/**
 * Rutea cada rama del evento a su modo. **El allowlist es ACOTADO, no global.**
 *
 * Un allowlist global sobre el envelope borraría `level`, `platform`, `sdk`,
 * `release`, `fingerprint` y demás metadata del SDK — y ahí el problema no es
 * perder diagnóstico, es que Sentry no pueda agrupar ni symbolicar el evento.
 * Por eso todo lo que no se nombra acá queda INTACTO a propósito.
 *
 * `stacktrace` pasa ENTERO y es la ÚNICA excepción de subárbol del diseño: la
 * forma que emite el SDK es profunda y variable, cualquier allowlist sobre
 * ella se desactualiza en la próxima versión, y el JS no captura variables
 * locales — no hay datos del usuario en un frame.
 */
export function scrubEvento<T extends object>(evento: T): T {
  const out = { ...evento } as T & RamasEvento

  // Estructurado → estricto.
  if (out.extra !== undefined) out.extra = scrubEstricto(out.extra)
  if (out.contexts !== undefined) out.contexts = scrubEstricto(out.contexts)
  // `tags` y `user` van por claves INTERNAS, no como subárbol de confianza:
  // "los construimos nosotros y ya están curados" es justo la suposición que
  // falló antes.
  if (out.tags !== undefined) out.tags = scrubEstricto(out.tags)
  if (out.user !== undefined) out.user = scrubEstricto(out.user)

  // No estructurado → sobre.
  if (out.message !== undefined) out.message = scrubSobre(out.message)
  if (out.breadcrumbs !== undefined) out.breadcrumbs = scrubSobre(out.breadcrumbs)

  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => {
        if (typeof v !== 'object' || v === null) return v
        const val = v as Record<string, unknown>
        // Se limpia el mensaje; `stacktrace` y `mechanism` quedan intactos.
        return typeof val.value === 'string'
          ? { ...val, value: scrubString(val.value) }
          : val
      }),
    }
  }

  return out
}

// ── Filtros de ruido ──────────────────────────────────────────────────────

const RUIDO = [
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
  /Network request failed/i,
  /Load failed/i,
  /The Internet connection appears to be offline/i,
  /AbortError/i,
  /TypeError: cancelled/i,
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured with value: undefined/i,
  /^chrome-extension:/i,
  /^moz-extension:/i,
  /Extension context invalidated/i,
]

const URLS_IGNORADAS = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-(web-)?extension:\/\//i,
  /^chrome:\/\//i,
]

// ── Init ──────────────────────────────────────────────────────────────────

export function initSentry(): void {
  if (!sentryEnabled) return

  Sentry.init({
    dsn: DSN,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) ?? 'production',
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,

    // v1 = SOLO errores. Sin performance, sin replay, sin profiling.
    tracesSampleRate: 0,

    // NUNCA true: adjuntaría la IP del usuario, cookies y headers.
    sendDefaultPii: false,

    ignoreErrors: RUIDO,
    denyUrls: URLS_IGNORADAS,

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
        const url = breadcrumb.data?.url
        if (typeof url === 'string') {
          // El endpoint de auth mueve tokens y credenciales: se descarta entero.
          if (url.includes('/auth/v1/')) return null
          try {
            const u = new URL(url, window.location.origin)
            breadcrumb.data = { ...breadcrumb.data, url: `${u.origin}${u.pathname}` }
          } catch {
            breadcrumb.data = { ...breadcrumb.data, url: REDACTADO }
          }
        }
        if (breadcrumb.data) {
          delete breadcrumb.data.body
          delete breadcrumb.data.input
        }
      }
      return breadcrumb
    },

    beforeSend(event) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return null
      }
      return scrubEvento(event)
    },
  })
}

// ── Contexto del admin ────────────────────────────────────────────────────

export interface SentryUserContext {
  /** UUID de auth. Es lo ÚNICO que identifica al admin en Sentry. */
  userId: string
}

/** Del admin va SOLO el id. Su email NO se envía nunca. */
export function setSentryUserContext(ctx: SentryUserContext): void {
  if (!sentryEnabled) return
  Sentry.setUser({ id: ctx.userId })
}

/** Limpia el contexto al cerrar sesión. */
export function clearSentryUserContext(): void {
  if (!sentryEnabled) return
  Sentry.setUser(null)
}

// ── Reporte explícito ─────────────────────────────────────────────────────

/**
 * Reporta un error que la app YA manejó (mostró un mensaje, degradó, siguió).
 * `contexto` admite datos EXTRA que igual pasan por el redactor de
 * `beforeSend`, así que no hace falta pre-limpiarlos.
 */
export function captureError(
  error: unknown,
  area: SentryArea,
  contexto?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return
  Sentry.captureException(error, {
    tags: { area },
    extra: contexto,
  })
}

/** Reporta una condición anómala que no lanzó excepción. */
export function captureIssue(
  mensaje: string,
  area: SentryArea,
  contexto?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return
  Sentry.captureMessage(mensaje, {
    level: 'error',
    tags: { area },
    extra: contexto,
  })
}
