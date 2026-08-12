/**
 * Modelo de cobro — funciones PURAS. Sin React, sin Supabase, sin fechas del
 * sistema: todo entra por parámetro y todo es determinista.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL PRINCIPIO, del que sale todo lo demás:
 *
 *   LA PLATA PAGADA CONSERVA SU VALOR.
 *
 * El período NO se reinicia al cambiar de plan. Lo que el cliente ya pagó y
 * todavía no consumió no se pierde, no se recalcula desde cero y no se
 * devuelve: se convierte.
 *
 *   · UPGRADE   → se cobra la diferencia por lo que queda. La fecha no se mueve.
 *   · DOWNGRADE → el saldo se convierte a más tiempo. La fecha se extiende.
 *
 * Nunca se devuelve plata. Un downgrade compra más días del plan nuevo, no un
 * reembolso.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { differenceInCalendarDays, addDays, parseISO, formatISO } from 'date-fns'

/** Fecha de calendario `YYYY-MM-DD`. Nunca un instante: un cobro es un día. */
export type FechaISO = string

const dia = (f: FechaISO) => parseISO(f)
const aISO = (d: Date): FechaISO => formatISO(d, { representation: 'date' })

// ── Precio efectivo ───────────────────────────────────────────────────────

/** Lo que define el precio de una suscripción en un momento dado. */
export interface TarifaSuscripcion {
  /** Congelado al firmar. Base gravable, sin IVA. */
  precio_base_mensual: number
  /** Congelado al firmar. Precio de UNA sede adicional. */
  precio_sede_adicional: number
  sedes_adicionales: number
  /** Congelado al firmar. Puede no coincidir con el del término vigente. */
  descuento_pct: number
  /** Meses que cubre el término (mensual 1 · semestral 6 · anual 12). */
  termino_meses: number
}

/**
 * Total mensual efectivo: plan + sedes, con el descuento del término aplicado
 * sobre el TOTAL y no solo sobre el plan.
 *
 * Que las sedes entren al descuento no es un detalle de implementación: es la
 * diferencia entre que un anual con dos sedes pague 30% menos por todo o solo
 * por una parte. Se aplica sobre el total.
 *
 * El redondeo existe por seguridad, pero con el catálogo vigente NUNCA se
 * activa: las cuatro bases por los tres términos dan enteros exactos, y eso
 * está verificado en `cobro.test.ts`. Si un precio de lista futuro rompe esa
 * propiedad, el test avisa antes de que aparezca un peso de diferencia.
 */
export function mensualEfectivo(t: TarifaSuscripcion): number {
  const bruto = t.precio_base_mensual + t.precio_sede_adicional * t.sedes_adicionales
  return Math.round((bruto * (100 - t.descuento_pct)) / 100)
}

// ── Días, no meses ────────────────────────────────────────────────────────

/**
 * Días de un período, con AMBOS extremos incluidos.
 *
 * `periodo_actual_fin` es el ÚLTIMO DÍA CUBIERTO, no el día del próximo cobro.
 * Por eso el `+ 1`: un período del 1 al 31 de agosto son 31 días, no 30. Sin
 * esa convención, un cambio de plan el último día del período calcularía cero
 * días de saldo y le comería un día al cliente.
 */
export function diasDelPeriodo(inicio: FechaISO, fin: FechaISO): number {
  return differenceInCalendarDays(dia(fin), dia(inicio)) + 1
}

/**
 * Días que quedan por consumir contando el día del cambio como no consumido.
 *
 * Cambio el día 1 → el período entero. Cambio el último día → 1 día. Nunca 0
 * mientras la fecha caiga dentro del período.
 */
export function diasRestantes(fechaCambio: FechaISO, fin: FechaISO): number {
  return Math.max(0, differenceInCalendarDays(dia(fin), dia(fechaCambio)) + 1)
}

/**
 * Tarifa diaria en pesos, SIN redondear.
 *
 * ⚠️ Devuelve un float a propósito y es el único lugar del módulo donde eso
 * pasa. Redondear la tarifa diaria y después multiplicarla por 200 días mete
 * un error de cientos de pesos; el redondeo va al final, sobre el monto, una
 * sola vez.
 *
 * El total del período es `mensual × meses`, y se reparte sobre los días
 * REALES de ese período — no sobre 30 ni sobre 365. Así un año bisiesto o un
 * mes de 28 días no corren la cuenta.
 */
export function tarifaDiaria(mensual: number, meses: number, diasPeriodo: number): number {
  if (diasPeriodo <= 0) return 0
  return (mensual * meses) / diasPeriodo
}

// ── Cambio de plan ────────────────────────────────────────────────────────

export interface PeriodoActual {
  periodo_actual_inicio: FechaISO
  /** INCLUSIVO: último día cubierto. */
  periodo_actual_fin: FechaISO
}

export type TipoCambio = 'upgrade' | 'downgrade' | 'sin_cambio'

export interface ResultadoCambio {
  tipo: TipoCambio
  /** Días del período actual todavía no consumidos, contando el del cambio. */
  dias_restantes: number
  /** Valor en pesos de esos días al precio VIEJO. Es la plata que se conserva. */
  saldo_a_favor: number
  /** Solo en upgrade: diferencia a cobrar por lo que queda. En downgrade, 0. */
  monto_a_cobrar: number
  /** Solo en downgrade se corre. En upgrade queda igual. */
  periodo_actual_fin: FechaISO
  proximo_cobro: FechaISO
  mensual_anterior: number
  mensual_nuevo: number
}

/**
 * Calcula el efecto de cambiar de plan, término o cantidad de sedes a mitad de
 * período.
 *
 * ⚠️ `nueva` NO se deriva del catálogo. El precio del plan nuevo entra por
 * parámetro porque el precio congelado de un contrato es una NEGOCIACIÓN, no
 * una consulta: G-10 paga 75.000 donde la lista dice 80.000. Derivarlo del
 * catálogo le subiría el precio al cliente en silencio justo cuando cambia de
 * plan, que es el peor momento posible. Quién decide el precio nuevo es de
 * quien llama a esta función.
 *
 * El cálculo va EN DÍAS y no en meses para que la fecha caiga exacta. Una
 * cuenta en meses obliga a decidir qué es "medio mes" y arrastra el error
 * hasta la fecha de vencimiento.
 */
export function calcularCambioDePlan(
  actual: TarifaSuscripcion,
  nueva: TarifaSuscripcion,
  periodo: PeriodoActual,
  fechaCambio: FechaISO,
): ResultadoCambio {
  const mensualAnterior = mensualEfectivo(actual)
  const mensualNuevo = mensualEfectivo(nueva)

  const diasPeriodo = diasDelPeriodo(periodo.periodo_actual_inicio, periodo.periodo_actual_fin)
  const restantes = diasRestantes(fechaCambio, periodo.periodo_actual_fin)

  const tarifaVieja = tarifaDiaria(mensualAnterior, actual.termino_meses, diasPeriodo)
  const tarifaNueva = tarifaDiaria(mensualNuevo, nueva.termino_meses, diasPeriodo)

  const saldo = Math.round(tarifaVieja * restantes)

  const base: ResultadoCambio = {
    tipo: 'sin_cambio',
    dias_restantes: restantes,
    saldo_a_favor: saldo,
    monto_a_cobrar: 0,
    periodo_actual_fin: periodo.periodo_actual_fin,
    proximo_cobro: aISO(addDays(dia(periodo.periodo_actual_fin), 1)),
    mensual_anterior: mensualAnterior,
    mensual_nuevo: mensualNuevo,
  }

  if (tarifaNueva === tarifaVieja) return base

  if (tarifaNueva > tarifaVieja) {
    // UPGRADE: se cobra solo la diferencia, y solo por lo que queda. La fecha
    // no se toca — el cliente ya pagó ese tiempo, solo está pagando más nivel
    // por el mismo tiempo.
    return {
      ...base,
      tipo: 'upgrade',
      monto_a_cobrar: Math.round((tarifaNueva - tarifaVieja) * restantes),
    }
  }

  // DOWNGRADE: no se devuelve plata. El saldo compra días del plan nuevo, que
  // por ser más barato son MÁS días. Se trunca a favor de la casa por el día
  // fraccionado: el cliente igual queda con más tiempo del que tenía.
  //
  // ⚠️ Guarda contra la tarifa CERO. Un plan gratis no tiene tasa de conversión:
  // el saldo compraría tiempo infinito. `saldo / 0` da `Infinity`, y de ahí sale
  // una fecha `Invalid Date` que se guardaría en la base sin que nadie la mire.
  // Es alcanzable desde que existe el tenant de pruebas (LAB, precio 0), así que
  // no es hipotético. Falla ruidoso en vez de escribir una fecha rota.
  if (tarifaNueva <= 0) {
    throw new Error(
      'No se puede convertir un saldo hacia un plan de precio cero: no hay tasa de conversión. ' +
        'Si la suscripción es de prueba, no debería pasar por un cambio de plan.',
    )
  }

  const diasNuevos = Math.floor(saldo / tarifaNueva)
  // `- 1` porque el día del cambio ya cuenta como cubierto (el período es
  // cerrado en ambos extremos). Sin esto la fecha se corre un día de más.
  const nuevoFin = aISO(addDays(dia(fechaCambio), diasNuevos - 1))

  return {
    ...base,
    tipo: 'downgrade',
    periodo_actual_fin: nuevoFin,
    proximo_cobro: aISO(addDays(dia(nuevoFin), 1)),
  }
}

/**
 * Los `datos` del `suscripcion_evento` que deja todo cambio (§3).
 *
 * Se guarda el saldo y las dos fechas y no solo el resultado: dentro de seis
 * meses, "por qué esta suscripción vence el 12 de marzo" tiene que poder
 * responderse sin rehacer la cuenta.
 */
export function datosDelEvento(
  r: ResultadoCambio,
  finAnterior: FechaISO,
): Record<string, unknown> {
  return {
    tipo_cambio: r.tipo,
    dias_restantes: r.dias_restantes,
    saldo_a_favor: r.saldo_a_favor,
    monto_a_cobrar: r.monto_a_cobrar,
    mensual_anterior: r.mensual_anterior,
    mensual_nuevo: r.mensual_nuevo,
    periodo_fin_anterior: finAnterior,
    periodo_fin_nuevo: r.periodo_actual_fin,
  }
}

// ── Estado de implementación ──────────────────────────────────────────────

export type EstadoImplementacion =
  | 'pendiente'
  | 'cobrada'
  | 'exonerada_condicional'
  | 'exonerada'

/**
 * Estado inicial al firmar. Un anual arranca EXONERADA CONDICIONAL: la
 * implementación se regala a cambio de doce meses de permanencia, y hasta que
 * esos meses se cumplan el regalo no está confirmado.
 */
export function implementacionAlFirmar(terminoMeses: number): EstadoImplementacion {
  return terminoMeses >= 12 ? 'exonerada_condicional' : 'pendiente'
}

export type EventoImplementacion =
  | { tipo: 'ANIVERSARIO_ANUAL' }
  | { tipo: 'CAMBIO_TERMINO'; nuevo_termino_meses: number }
  | { tipo: 'CANCELACION' }

/**
 * Transición de `estado_implementacion` (§9.2.2, resuelta).
 *
 * Tres reglas, y la tercera es la que más se discute:
 *
 * · Completar los doce meses de servicio anual → `exonerada`. Firme, ya no se
 *   puede reclamar.
 * · Cambiar de término ANTES del año → `pendiente`. La condición del regalo
 *   era la permanencia; si se rompe, la implementación se vuelve exigible.
 * · **Cancelar NO la hace exigible.** Los doce meses ya se pagaron por
 *   adelantado: el cliente cumplió su parte, se va antes de consumirla. Cobrar
 *   la implementación ahí sería cobrarle dos veces por irse.
 */
export function transicionImplementacion(
  actual: EstadoImplementacion,
  evento: EventoImplementacion,
): EstadoImplementacion {
  // Los estados terminales no vuelven atrás.
  if (actual === 'cobrada' || actual === 'exonerada') return actual

  switch (evento.tipo) {
    case 'ANIVERSARIO_ANUAL':
      return actual === 'exonerada_condicional' ? 'exonerada' : actual

    case 'CAMBIO_TERMINO':
      // Solo rompe la condición bajar de anual. Pasar de anual a anual, o
      // subir a anual desde otro término, no.
      if (actual === 'exonerada_condicional' && evento.nuevo_termino_meses < 12) {
        return 'pendiente'
      }
      return actual

    case 'CANCELACION':
      // Deliberadamente inmutable. Ver el docblock.
      return actual
  }
}
