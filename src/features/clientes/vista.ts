/**
 * Qué necesita atención, en qué orden, y qué se muestra en cada vista.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTO ES DECISIÓN DE PRODUCTO, NO DE UI. Por eso vive en un módulo puro y
 * con tests propios, y no adentro del componente: el 14/08 quedó claro que
 * una regla metida en un archivo que no se puede correr en un test es una
 * regla que nadie verifica.
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { EstadoComercial, FechaISO, Nivel, Sugerencia } from '@/lib/bandera'
import { pagoSinReactivar, type Cobertura } from '@/lib/cobertura'
import type { SuscripcionLista } from './schemas'

/**
 * Lo que el PRODUCTO sabe. Deliberadamente separado del estado comercial.
 *
 * §5: la mayoría de los bugs feos de sistemas cruzados son "creí que había
 * escrito y no". Fusionar esto con `suscripciones.estado` en un solo
 * indicador es precisamente cómo se pierde esa distinción.
 */
export interface EstadoBandera {
  /**
   * · `sin_puente`  → falta `organizacion_externa_id` o `url_aplicar_estado`.
   *                   NUNCA va a poder confirmarse; no es transitorio.
   * · `nunca`       → nunca se sincronizó. El producto está en su default.
   * · `confirmada`  → hay un 200 registrado.
   */
  clase: 'sin_puente' | 'nunca' | 'confirmada'
  /** El último nivel que el producto confirmó. */
  nivel?: Nivel
  /** Cuándo lo confirmó. */
  desde?: string
  /** `false` = ya estaba así. `null` = fila anterior a la migración 009. */
  cambioEfectivo?: boolean | null
  /** Filas posteriores sin confirmar. Independiente de lo de arriba. */
  sinConfirmar: number
  /** Código de la más reciente sin confirmar. */
  ultimoCodigo?: string | null
}

export interface FilaLista {
  suscripcion: SuscripcionLista
  /** Total que se cobra por ciclo: mensual efectivo × meses del término. */
  montoCiclo: number
  mensual: number
  /** §4. SUGIERE; no se aplica solo. */
  sugerencia: Sugerencia
  bandera: EstadoBandera
  /** Hasta cuándo llega la plata (vista `suscripcion_cobertura`, 012). */
  cobertura: Cobertura
  atencion: Atencion
}

// ── Qué necesita atención ─────────────────────────────────────────────────

/**
 * ⚠️ EL ORDEN NO ES POR ESTADO: ES POR COSTO DE NO MIRAR.
 *
 * De ahí sale la única parte discutible, y es deliberada:
 * `REGRESION_APLICADA` gana sobre `FALTA_ESCALAR`. **Perjudicar a quien pagó
 * pesa más que no cobrarle a quien debe**, aunque cobrar sea la razón de
 * existir del panel.
 *
 * Es la misma asimetría de §4 y §5: un falso positivo lo paga un bar delante
 * de sus clientes; un falso negativo lo paga Giiron, un día de suscripción.
 */
export type Atencion =
  /**
   * 1 · **Pagó y sigue restringido.** Hay un pago registrado que cubre hasta
   * hoy o más allá, y el estado comercial todavía muestra banner.
   *
   * Va PRIMERO, incluso antes de `REGRESION_APLICADA`, por dos razones: la
   * evidencia es nuestra y no admite duda —el pago está en nuestra base—, y
   * se arregla en un clic sin depender de que el otro sistema responda.
   */
  | 'PAGO_SIN_REACTIVAR'
  /** 2 · Lo aplicado es MÁS restrictivo que lo que se decidiría hoy. Daño en curso. */
  | 'REGRESION_APLICADA'
  /** 3 · Se decidió algo y no se sabe si llegó. Estado desconocido. */
  | 'SIN_CONFIRMAR'
  /** 4 · Nunca va a poder sincronizarse. Silencioso y permanente. */
  | 'SIN_PUENTE'
  /** 5 · Habría que escalar y no se hizo. Fuga de plata, sin daño al cliente. */
  | 'FALTA_ESCALAR'
  /** 6 · Trabajo por hacer, sin urgencia. */
  | 'POR_VENCER'
  /** 7 · Silencio. */
  | 'AL_DIA'

export const ORDEN_ATENCION: Atencion[] = [
  'PAGO_SIN_REACTIVAR',
  'REGRESION_APLICADA',
  'SIN_CONFIRMAR',
  'SIN_PUENTE',
  'FALTA_ESCALAR',
  'POR_VENCER',
  'AL_DIA',
]

/** Los cinco niveles de §4, ordenados por cuánto le quitan al cliente. */
export const SEVERIDAD: Record<Nivel, number> = {
  activa: 0,
  por_vencer: 1,
  gracia: 2,
  restringida: 3,
  suspendida: 4,
}

export function clasificar(
  sugerido: Nivel,
  b: EstadoBandera,
  estado: EstadoComercial,
  cobertura: Cobertura,
  hoy: FechaISO,
): Atencion {
  // Antes que todo: hay plata registrada que cubre y el estado igual
  // restringe. Es nuestro error, la evidencia está en nuestra base, y el
  // cliente está pagando el banner ahora mismo.
  if (pagoSinReactivar(estado, cobertura, hoy)) return 'PAGO_SIN_REACTIVAR'

  // Lo que el producto tiene aplicado AHORA. Una suscripción que nunca se
  // sincronizó está en el default del producto, que es `active` (§6) — o sea
  // `activa`. Tratarla como desconocida haría gritar a todo cliente nuevo.
  const aplicado: Nivel = b.clase === 'confirmada' && b.nivel ? b.nivel : 'activa'

  // 1 antes que 2 a propósito: una fila puede estar restringiendo de más Y
  // tener intentos fallidos encima. Lo que duele es lo primero.
  if (b.clase === 'confirmada' && SEVERIDAD[aplicado] > SEVERIDAD[sugerido]) {
    return 'REGRESION_APLICADA'
  }
  if (b.sinConfirmar > 0) return 'SIN_CONFIRMAR'
  if (b.clase === 'sin_puente') return 'SIN_PUENTE'
  if (SEVERIDAD[sugerido] > SEVERIDAD[aplicado]) return 'FALTA_ESCALAR'
  if (sugerido === 'por_vencer') return 'POR_VENCER'
  return 'AL_DIA'
}

// ── Las dos vistas ────────────────────────────────────────────────────────

/**
 * Los dos ritmos de uso confirmados en la entrevista de producto, más una
 * salida para buscar algo puntual.
 *
 * No son un filtro sobre la misma tabla: contestan preguntas distintas, y por
 * eso ordenan distinto. `hoy` responde "¿hay algo raro?" y arranca por
 * defecto porque es el ritmo más frecuente. `facturacion` responde "¿recorrí
 * todo lo que vence?", y ahí lo que manda es la fecha, no la prioridad —
 * saltearse uno es el error de esa tarea.
 */
export type Vista = 'hoy' | 'facturacion' | 'todas'

export const ATENCION_DE_VISTA: Record<Vista, Atencion[] | null> = {
  hoy: ['PAGO_SIN_REACTIVAR', 'REGRESION_APLICADA', 'SIN_CONFIRMAR', 'SIN_PUENTE'],
  facturacion: ['FALTA_ESCALAR', 'POR_VENCER'],
  todas: null,
}

export interface Filtros {
  vista: Vista
  /** Texto libre sobre el nombre del cliente y el código de producto. */
  busqueda: string
  /** `suscripciones.estado`, o `''` para todos. */
  estado: string
  /** Los tenants de laboratorio se ocultan por default (§3). */
  mostrarPrueba: boolean
}

/** Sin tildes y en minúsculas: buscar "salchimelo" tiene que encontrar "Salchimeló". */
function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function aplicarVista(filas: FilaLista[], f: Filtros): FilaLista[] {
  const permitidas = ATENCION_DE_VISTA[f.vista]
  const q = normalizar(f.busqueda)

  const visibles = filas.filter((fila) => {
    if (!f.mostrarPrueba && fila.suscripcion.clientes.es_prueba) return false
    // ⚠️ La búsqueda NO se filtra por vista. Buscar un cliente que está al día
    // desde la vista "hoy" tiene que encontrarlo: si no, la caja de búsqueda
    // devuelve vacío por una razón que no se ve en pantalla.
    if (q === '') {
      if (permitidas && !permitidas.includes(fila.atencion)) return false
    } else {
      const s = fila.suscripcion
      const heno = normalizar(`${s.clientes.nombre_comercial} ${s.productos.codigo} ${s.planes.nombre}`)
      if (!heno.includes(q)) return false
    }
    if (f.estado !== '' && fila.suscripcion.estado !== f.estado) return false
    return true
  })

  const porFecha = (a: FilaLista, b: FilaLista) =>
    a.suscripcion.proximo_cobro.localeCompare(b.suscripcion.proximo_cobro)
  const porNombre = (a: FilaLista, b: FilaLista) =>
    a.suscripcion.clientes.nombre_comercial.localeCompare(
      b.suscripcion.clientes.nombre_comercial,
      'es',
    )

  // En facturación manda la FECHA y no la prioridad: la tarea es recorrer todo
  // lo que vence en orden, y reordenar por gravedad haría saltear filas.
  if (f.vista === 'facturacion') {
    return [...visibles].sort((a, b) => porFecha(a, b) || porNombre(a, b))
  }

  return [...visibles].sort(
    (a, b) =>
      ORDEN_ATENCION.indexOf(a.atencion) - ORDEN_ATENCION.indexOf(b.atencion) ||
      porFecha(a, b) ||
      porNombre(a, b),
  )
}

/**
 * Cuánto necesita atención, separando lo visible de lo escondido.
 *
 * ⚠️ `ocultos` existe porque un contador que cuenta sobre datos ya filtrados
 * MIENTE. Con LAB roto y el interruptor de prueba apagado, la versión anterior
 * decía "0" y el estado vacío decía "nada que atender" — afirmando sobre un
 * conjunto que no había mirado. Es el modo de fallo silencioso que este
 * proyecto evita en todos lados, puesto en el texto que más confianza da.
 *
 * Ahora la pantalla puede decir "nada entre los que facturan, y hay 1
 * escondido", que es la verdad completa.
 */
export interface Atencionados {
  /** Necesitan atención y se están mostrando. */
  visibles: number
  /** Necesitan atención pero el interruptor de prueba los está ocultando. */
  ocultos: number
}

export function contarAtencion(filas: FilaLista[], mostrarPrueba: boolean): Atencionados {
  const urgentes = ATENCION_DE_VISTA.hoy!
  const necesitan = filas.filter((f) => urgentes.includes(f.atencion))
  if (mostrarPrueba) return { visibles: necesitan.length, ocultos: 0 }
  return {
    visibles: necesitan.filter((f) => !f.suscripcion.clientes.es_prueba).length,
    ocultos: necesitan.filter((f) => f.suscripcion.clientes.es_prueba).length,
  }
}
