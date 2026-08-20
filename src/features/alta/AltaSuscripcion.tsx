/**
 * Firmar una suscripción.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ES LA PRIMERA PANTALLA DEL PANEL QUE **DECIDE** EN VEZ DE REGISTRAR.
 *
 * Todo lo demás anota hechos que ya pasaron —un pago entró, un estado
 * cambió— o sugiere. Acá se crean cinco números que quedan congelados y que
 * todo lo que viene después trata como verdad establecida. De ahí salen las
 * decisiones de esta pantalla, que no son de estilo:
 *
 *  1. **Ningún default decide plata.** Plan y término arrancan VACÍOS. Un
 *     «mensual» preseleccionado elige el descuento y el estado de la
 *     implementación por omisión de alguien que no eligió. La fecha de inicio
 *     sí arranca en hoy: es un hecho, no una decisión, y está a la vista.
 *  2. **La confirmación muestra CONSECUENCIAS, no campos.** Repetir lo que se
 *     tipeó en el mismo orden no agrega nada: el ojo ya lo dio por bueno.
 *  3. **Se dice qué se congela y qué no.** Esa distinción no existe en
 *     ninguna otra pantalla, así que nadie la trae aprendida.
 *  4. **No hay borrador.** Un contrato a medias no es un estado del modelo.
 *  5. **Un doble clic no firma dos veces**: el id se decide antes de llamar
 *     (ver `useAlta`).
 *
 * Lo que estas defensas NO cubren: $85.000 en vez de $80.000. Es un precio
 * plausible que se aparta de la lista tanto como un descuento real. Queda la
 * comparación con lista, que lo muestra sin poder distinguirlo de una
 * decisión, y la foto del evento `CREADA`, que permite auditarlo después.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { fecha, hoyISO, pesos } from '@/lib/formato'
import { FOCO, SENAL, TINTA } from '@/lib/tokens'
import { implementacionAlFirmar, mensualEfectivo } from '@/lib/cobro'
import { desvioDeLista, exigeJustificacion, periodoFin, type Desvio } from './derivar'
import { formularioAltaSchema, type FormularioAlta } from './schemas'
import { useCatalogo, useFirmar } from './useAlta'

const CAMPO =
  'w-full rounded border border-lienzo-divisor bg-lienzo-panel px-2 py-1 text-dato ' +
  `text-tinta-fuerte placeholder:text-tinta-debil ${FOCO}`
const ETIQUETA = 'block text-micro font-medium text-tinta-media mb-1'
const BOTON = `rounded px-3 py-1.5 text-dato font-medium ${FOCO} disabled:opacity-50 disabled:cursor-not-allowed`
const SECCION = 'rounded border border-lienzo-borde bg-lienzo-panel p-4'
const TITULO_SECCION = 'mb-3 text-micro font-semibold uppercase tracking-grupo text-tinta-media'

const VACIO: FormularioAlta = {
  cliente_id: null,
  cliente_nuevo: '',
  producto_id: '',
  plan_id: '',
  termino: '',
  sedes_adicionales: 0,
  precio_base_mensual: 0,
  precio_sede_adicional: 0,
  monto_implementacion: 0,
  descuento_pct: 0,
  fecha_inicio: hoyISO(),
  motivo: '',
}

/**
 * Precio de lista de la implementación.
 *
 * ⚠️ VIVE ACÁ Y NO EN UNA TABLA, y eso es un hueco declarado: los otros dos
 * precios de lista salen de `planes`, éste está en el comentario de la
 * columna `monto_implementacion` (`006`). Comparar contra una constante del
 * código es peor que comparar contra el catálogo —cuando suba, sube en un
 * despliegue— pero es mucho mejor que no comparar.
 */
const IMPLEMENTACION_LISTA = 250000

function Diferencia({ desvio, sinLista }: { desvio: Desvio | null; sinLista: boolean }) {
  if (sinLista) {
    // Peor que no comparar es PARECER que comparó. Un guion o un 0% se leen
    // como "coincide con la lista", que es lo que nadie verificó.
    return (
      <p className={`mt-1 text-micro ${SENAL.alerta}`}>
        Este plan no tiene precio de lista cargado: no hay contra qué comparar.
      </p>
    )
  }
  if (desvio === null || desvio.pesos === 0) {
    return <p className={`mt-1 text-micro ${TINTA.debil}`}>Coincide con la lista.</p>
  }
  const signo = desvio.pesos > 0 ? '+' : ''
  return (
    <p className={`mt-1 text-micro ${Math.abs(desvio.pct) > 50 ? SENAL.critico : SENAL.alerta}`}>
      {signo}
      {desvio.pct}% respecto de la lista ({signo}
      {pesos(desvio.pesos)}).
    </p>
  )
}

export function AltaSuscripcion({ volver, alFirmar }: {
  volver: () => void
  alFirmar: (suscripcionId: string) => void
}) {
  const { data: catalogo, isPending, error } = useCatalogo()
  const firmar = useFirmar()
  const [form, setForm] = useState<FormularioAlta>(VACIO)
  const [confirmando, setConfirmando] = useState(false)
  // El id se decide UNA vez por intento de firma, no por clic.
  const [id] = useState(() => crypto.randomUUID())

  const set = <K extends keyof FormularioAlta>(k: K, v: FormularioAlta[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    // Cambiar algo después de haber llegado a la confirmación te devuelve al
    // formulario: confirmar algo distinto de lo que se leyó es el modo de
    // fallo que la confirmación existe para evitar.
    setConfirmando(false)
  }

  const plan = catalogo?.planes.find((p) => p.id === form.plan_id) ?? null
  const termino = catalogo?.terminos.find((t) => t.codigo === form.termino) ?? null
  const planes = catalogo?.planes.filter((p) => p.producto_id === form.producto_id) ?? []

  const desvios = useMemo(
    () => ({
      base: desvioDeLista(form.precio_base_mensual, plan?.precio_mensual ?? null),
      sede: desvioDeLista(form.precio_sede_adicional, plan?.precio_sede_adicional ?? null),
      impl: desvioDeLista(form.monto_implementacion, IMPLEMENTACION_LISTA),
    }),
    [form.precio_base_mensual, form.precio_sede_adicional, form.monto_implementacion, plan],
  )

  const pideMotivo = exigeJustificacion([desvios.base, desvios.sede, desvios.impl])
  const validacion = formularioAltaSchema.safeParse(form)
  const faltaMotivo = pideMotivo && form.motivo.trim() === ''
  const puedeConfirmar = validacion.success && termino !== null && !faltaMotivo

  const mensual =
    termino === null
      ? 0
      : mensualEfectivo({
          precio_base_mensual: form.precio_base_mensual,
          precio_sede_adicional: form.precio_sede_adicional,
          sedes_adicionales: form.sedes_adicionales,
          descuento_pct: form.descuento_pct,
          termino_meses: termino.meses,
        })

  if (isPending) return <p className="text-dato text-tinta-media">Cargando el catálogo…</p>
  if (error || !catalogo) {
    return (
      <p role="alert" className={`text-dato ${SENAL.critico}`}>
        No se pudo leer el catálogo. Sin planes y términos no se puede firmar.
      </p>
    )
  }

  /** Al elegir plan se PROPONEN sus precios de lista; quedan editables. */
  const elegirPlan = (planId: string) => {
    const p = catalogo.planes.find((x) => x.id === planId)
    setConfirmando(false)
    setForm((f) => ({
      ...f,
      plan_id: planId,
      precio_base_mensual: p?.precio_mensual ?? 0,
      precio_sede_adicional: p?.precio_sede_adicional ?? 0,
      monto_implementacion: f.monto_implementacion || IMPLEMENTACION_LISTA,
    }))
  }

  /** Al elegir término se PROPONE su descuento; queda editable (§3). */
  const elegirTermino = (codigo: string) => {
    const t = catalogo.terminos.find((x) => x.codigo === codigo)
    setConfirmando(false)
    setForm((f) => ({ ...f, termino: codigo, descuento_pct: t?.descuento_pct ?? 0 }))
  }

  return (
    <div className="max-w-2xl">
      <button
        onClick={volver}
        className={`mb-3 inline-flex items-center gap-1 text-micro ${TINTA.media} hover:text-tinta-fuerte`}
      >
        <ArrowLeft size={12} aria-hidden="true" /> Volver
      </button>

      <h1 className="mb-1 text-titulo font-semibold text-tinta-fuerte">Firmar una suscripción</h1>
      <p className={`mb-4 text-micro ${TINTA.media}`}>
        Los precios y el término quedan congelados en el contrato: no se leen más del
        catálogo, así que cuando la lista suba, este contrato no se mueve.
      </p>

      <div className="space-y-4">
        {/* ── Cliente ─────────────────────────────────────────────────── */}
        <section className={SECCION}>
          <h2 className={TITULO_SECCION}>Cliente</h2>
          <label className={ETIQUETA} htmlFor="cliente">
            Existente
          </label>
          <select
            id="cliente"
            className={CAMPO}
            value={form.cliente_id ?? ''}
            onChange={(e) => set('cliente_id', e.target.value || null)}
          >
            <option value="">— Ninguno: es un cliente nuevo —</option>
            {catalogo.clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_comercial}
                {c.es_prueba ? ' (prueba)' : ''}
              </option>
            ))}
          </select>

          {form.cliente_id === null && (
            <div className="mt-3">
              <label className={ETIQUETA} htmlFor="cliente_nuevo">
                Nombre comercial del cliente nuevo
              </label>
              <input
                id="cliente_nuevo"
                className={CAMPO}
                value={form.cliente_nuevo}
                onChange={(e) => set('cliente_nuevo', e.target.value)}
                placeholder="Como lo conocen sus clientes"
              />
              <p className={`mt-1 text-micro ${TINTA.debil}`}>
                NIT, razón social y contacto se completan después: no frenan una firma.
              </p>
            </div>
          )}
        </section>

        {/* ── Contrato ────────────────────────────────────────────────── */}
        <section className={SECCION}>
          <h2 className={TITULO_SECCION}>Contrato</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={ETIQUETA} htmlFor="producto">
                Producto
              </label>
              <select
                id="producto"
                className={CAMPO}
                value={form.producto_id}
                onChange={(e) => {
                  setConfirmando(false)
                  setForm((f) => ({ ...f, producto_id: e.target.value, plan_id: '' }))
                }}
              >
                <option value="">— Elegí —</option>
                {catalogo.productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="plan">
                Plan
              </label>
              <select
                id="plan"
                className={CAMPO}
                value={form.plan_id}
                disabled={form.producto_id === ''}
                onChange={(e) => elegirPlan(e.target.value)}
              >
                <option value="">— Elegí —</option>
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="termino">
                Término
              </label>
              <select
                id="termino"
                className={CAMPO}
                value={form.termino}
                onChange={(e) => elegirTermino(e.target.value)}
              >
                <option value="">— Elegí —</option>
                {catalogo.terminos.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.codigo} ({t.meses} {t.meses === 1 ? 'mes' : 'meses'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="sedes">
                Sedes adicionales
              </label>
              <input
                id="sedes"
                type="number"
                min={0}
                className={CAMPO}
                value={form.sedes_adicionales}
                onChange={(e) => set('sedes_adicionales', Number(e.target.value))}
              />
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="fecha_inicio">
                Fecha de inicio
              </label>
              <input
                id="fecha_inicio"
                type="date"
                className={CAMPO}
                value={form.fecha_inicio}
                onChange={(e) => set('fecha_inicio', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ── Precios ─────────────────────────────────────────────────── */}
        <section className={SECCION}>
          <h2 className={TITULO_SECCION}>Precios — se congelan al firmar</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={ETIQUETA} htmlFor="precio_base">
                Plan, por mes
              </label>
              <input
                id="precio_base"
                type="number"
                className={CAMPO}
                value={form.precio_base_mensual}
                onChange={(e) => set('precio_base_mensual', Number(e.target.value))}
              />
              <Diferencia
                desvio={desvios.base}
                sinLista={plan !== null && plan.precio_mensual === null}
              />
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="precio_sede">
                Sede adicional, por mes
              </label>
              <input
                id="precio_sede"
                type="number"
                className={CAMPO}
                value={form.precio_sede_adicional}
                onChange={(e) => set('precio_sede_adicional', Number(e.target.value))}
              />
              <Diferencia
                desvio={desvios.sede}
                sinLista={plan !== null && plan.precio_sede_adicional === null}
              />
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="implementacion">
                Implementación (única vez)
              </label>
              <input
                id="implementacion"
                type="number"
                className={CAMPO}
                value={form.monto_implementacion}
                onChange={(e) => set('monto_implementacion', Number(e.target.value))}
              />
              <Diferencia desvio={desvios.impl} sinLista={false} />
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="descuento">
                Descuento del término (%)
              </label>
              <input
                id="descuento"
                type="number"
                min={0}
                max={100}
                className={CAMPO}
                value={form.descuento_pct}
                onChange={(e) => set('descuento_pct', Number(e.target.value))}
              />
              <p className={`mt-1 text-micro ${TINTA.debil}`}>
                Propuesto por el término; puede ser un acuerdo puntual.
              </p>
            </div>
          </div>

          {pideMotivo && (
            <div className="mt-3">
              <label className={ETIQUETA} htmlFor="motivo">
                Por qué se aparta de la lista
              </label>
              <input
                id="motivo"
                className={CAMPO}
                value={form.motivo}
                onChange={(e) => set('motivo', e.target.value)}
                placeholder="Queda en el historial del contrato"
              />
              <p className={`mt-1 text-micro ${TINTA.debil}`}>
                Es el único registro de por qué este contrato tiene el precio que tiene.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Confirmación: consecuencias, no campos ───────────────────── */}
      {confirmando && termino !== null && (
        <section className={`${SECCION} mt-4 border-lienzo-divisor`} aria-live="polite">
          <h2 className={TITULO_SECCION}>Antes de firmar</h2>
          <p className="mb-3 text-titulo font-semibold tabular-nums text-tinta-fuerte">
            {pesos(mensual)} por mes
          </p>
          <ul className={`space-y-1 text-dato ${TINTA.media}`}>
            <li>
              Cubre desde el {fecha(form.fecha_inicio)} hasta el{' '}
              {fecha(periodoFin(form.fecha_inicio, termino.meses))}, inclusive.
            </li>
            <li>
              {implementacionAlFirmar(termino.meses) === 'exonerada_condicional' ? (
                <>
                  La implementación queda <strong>perdonada condicionalmente</strong>: se
                  vuelve firme al cumplir los doce meses. Si baja de término antes, se
                  vuelve exigible.
                </>
              ) : (
                <>
                  La implementación queda <strong>exigible</strong>: {pesos(form.monto_implementacion)}
                  , una vez.
                </>
              )}
            </li>
            <li>
              <strong>Se congelan</strong> los tres precios, el descuento y el término.
              Cambian sólo a mano. El plan y las sedes se pueden cambiar después.
            </li>
            <li>
              Nace <strong>sin puente</strong>: no se le puede mandar bandera hasta
              vincular la organización de G-Vento.
            </li>
            <li>No queda paga: aparece pendiente hasta que se registre el primer pago.</li>
          </ul>
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!confirmando ? (
          <button
            className={`${BOTON} bg-lienzo-realce text-tinta-fuerte hover:bg-lienzo-divisor/40`}
            disabled={!puedeConfirmar}
            onClick={() => setConfirmando(true)}
          >
            Revisar antes de firmar
          </button>
        ) : (
          <button
            className={`${BOTON} bg-lienzo-realce text-tinta-fuerte hover:bg-lienzo-divisor/40`}
            disabled={firmar.isPending || termino === null}
            onClick={() =>
              firmar.mutate(
                { form, termino_meses: termino?.meses ?? 0, id },
                { onSuccess: alFirmar },
              )
            }
          >
            {firmar.isPending ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Firmando…
              </span>
            ) : (
              'Firmar'
            )}
          </button>
        )}

        {faltaMotivo && (
          <span className={`text-micro ${SENAL.alerta}`}>
            El precio se aparta de la lista: falta el porqué.
          </span>
        )}

        {firmar.isError && (
          <span role="alert" className={`text-micro ${SENAL.critico}`}>
            No se firmó. {(firmar.error as Error).message}
          </span>
        )}
      </div>
    </div>
  )
}
