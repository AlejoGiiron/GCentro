/**
 * Pantalla 2 — detalle y acciones.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS TRES ACCIONES ESTÁN SEPARADAS PORQUE PESAN DISTINTO.
 *
 *   Cambiar estado    → decisión comercial nuestra. No sale del panel.
 *   Registrar pago    → un hecho que ya ocurrió. No sale del panel.
 *   Confirmar bandera → **lo único que escribe en la base del cliente.**
 *
 * La tercera es la que pide un clic explícito, tiene estado de carga desde el
 * primer instante y se deshabilita en vuelo: dos segundos de arranque en frío
 * (§5) son exactamente el intervalo en que alguien aprieta de nuevo, y acá
 * apretar de nuevo escribe otra fila en la cola.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { fecha, hoyISO, instante, pesos } from '@/lib/formato'
import { sugerirReactivacion, type Cobertura } from '@/lib/cobertura'
import { ESTADO_VISUAL, FOCO, NIVEL_VISUAL, SENAL } from '@/lib/tokens'
import { ESTADOS_COMERCIALES } from '@/features/clientes/schemas'
import { EditorMensaje } from './EditorMensaje'
import type { FilaLista } from '@/features/clientes/vista'
import { CONCEPTOS, METODOS, formularioPagoSchema, type Evento, type Pago } from './schemas'
import { textoDe } from '@/lib/puente-texto'
import {
  useCambiarEstado,
  useConfirmarBandera,
  useHistorial,
  useRegistrarPago,
} from './useDetalle'

const CAMPO =
  'w-full rounded border border-lienzo-divisor bg-lienzo-panel px-2 py-1 text-dato ' +
  `text-tinta-fuerte placeholder:text-tinta-debil ${FOCO}`
const ETIQUETA = 'block text-micro font-medium text-tinta-media mb-1'
const BOTON = `rounded px-3 py-1.5 text-dato font-medium ${FOCO} disabled:opacity-50 disabled:cursor-not-allowed`
const SECCION = 'rounded border border-lienzo-borde bg-lienzo-panel p-4'
const TITULO_SECCION = 'mb-3 text-micro font-semibold uppercase tracking-grupo text-tinta-media'

// ── Autor ─────────────────────────────────────────────────────────────────

/**
 * ⚠️ «Sin autor registrado» y NO un vacío.
 *
 * Un vacío sugiere que falta cargar algo. Acá no hay nada que cargar: las
 * filas anteriores al 14/08/2026 se escribieron antes de que la columna
 * existiera, y las del SQL Editor no tienen sesión. El dato **no es
 * recuperable**, y decirlo es más honesto que dejar el espacio en blanco.
 */
function Autor({ email }: { email: string | null | undefined }) {
  if (email) return <span className="text-tinta-media">{email}</span>
  return (
    <span className="text-tinta-debil italic">sin autor registrado</span>
  )
}

// ── Cambiar estado ────────────────────────────────────────────────────────

function CambiarEstado({ fila }: { fila: FilaLista }) {
  const actual = fila.suscripcion.estado
  const [estado, setEstado] = useState(actual)
  const [motivo, setMotivo] = useState('')
  const cambiar = useCambiarEstado(fila.suscripcion.id)
  const sinCambio = estado === actual

  return (
    <section className={SECCION}>
      <h2 className={TITULO_SECCION}>Estado comercial</h2>
      <p className="mb-3 text-dato text-tinta-media">
        Actual: <span className={`font-medium ${ESTADO_VISUAL[actual]}`}>{actual}</span>. Esto
        no toca el producto — para eso está la bandera.
      </p>

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className={ETIQUETA} htmlFor="estado-nuevo">
            Nuevo estado
          </label>
          <select
            id="estado-nuevo"
            className={CAMPO}
            value={estado}
            onChange={(e) => setEstado(e.target.value as typeof estado)}
          >
            {ESTADOS_COMERCIALES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="motivo">
            Motivo <span className="font-normal text-tinta-debil">(queda en el historial)</span>
          </label>
          <input
            id="motivo"
            className={CAMPO}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Habló por WhatsApp, paga el viernes"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          className={`${BOTON} bg-lienzo-realce text-tinta-fuerte hover:bg-lienzo-divisor/40`}
          disabled={sinCambio || cambiar.isPending}
          onClick={() => cambiar.mutate({ estado, motivo })}
        >
          {cambiar.isPending ? 'Guardando…' : 'Cambiar estado'}
        </button>
        {sinCambio && <span className="text-micro text-tinta-debil">Ya está en ese estado.</span>}
        {cambiar.isError && (
          <span role="alert" className={`text-micro ${SENAL.critico}`}>
            No se pudo cambiar.
          </span>
        )}
      </div>
    </section>
  )
}

// ── La bandera ────────────────────────────────────────────────────────────

function ConfirmarBandera({ fila }: { fila: FilaLista }) {
  const sugerencia = fila.sugerencia
  const [mensaje, setMensaje] = useState('')
  const confirmar = useConfirmarBandera(fila.suscripcion.id)
  const r = confirmar.data
  const yaAplicado = fila.bandera.clase === 'confirmada' ? fila.bandera.nivel : undefined
  const coincide = yaAplicado === sugerencia.nivel

  return (
    <section className={SECCION}>
      <h2 className={TITULO_SECCION}>Bandera hacia el producto</h2>

      <p className="mb-1 text-dato text-tinta-media">
        Nivel sugerido:{' '}
        <span className={`font-medium ${NIVEL_VISUAL[sugerencia.nivel]}`}>{sugerencia.nivel}</span>
      </p>
      {/* SUGIERE, no aplica (§4). Que la regla esté a la vista es lo que hace
          que el operador pueda estar en desacuerdo con fundamento. */}
      <p className="mb-3 text-micro text-tinta-debil">
        Según §4: {sugerencia.regla.toLowerCase().replace(/_/g, ' ')}. Nada se aplica solo —
        esto se envía cuando lo confirmás.
      </p>

      <EditorMensaje nivel={sugerencia.nivel} valor={mensaje} onChange={setMensaje} />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className={`${BOTON} bg-lienzo-realce text-tinta-fuerte hover:bg-lienzo-divisor/40`}
          disabled={confirmar.isPending || mensaje.trim().length > 280}
          onClick={() => confirmar.mutate({ nivel: sugerencia.nivel, mensaje: mensaje || null })}
        >
          {/* Estado de carga DESDE EL PRIMER CLIC. La primera llamada del día
              tarda ~2s por arranque en frío (§5), y ese es exactamente el
              intervalo en que alguien aprieta de nuevo — acá eso escribiría
              otra fila en la cola. */}
          {confirmar.isPending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              Enviando…
            </span>
          ) : (
            `Aplicar «${sugerencia.nivel}» en el producto`
          )}
        </button>

        {/* ⚠️ ESTO DESCRIBE UN ESTADO, NO EL RESULTADO DE UNA ACCIÓN.
            Decía «El producto ya está en X. Reenviar no cambia nada.» y
            aparecía SOLO, sin clic, en cuanto el nivel aplicado coincidía con
            el sugerido. El 17/08 se leyó como la respuesta a un reenvío que
            nunca ocurrió, y dio por verificada una prueba de idempotencia que
            no se hizo.

            Ahora se redacta como estado y desaparece apenas hay un resultado
            real que mostrar: dos textos compitiendo en el mismo lugar es lo
            que hace que uno se lea como el otro. */}
        {coincide && !confirmar.isPending && !confirmar.data && (
          <span className="text-micro text-tinta-debil">
            Estado actual: el producto ya tiene «{yaAplicado}».
          </span>
        )}
      </div>

      <div aria-live="polite" className="mt-2">
        {r && (
          <span className={`text-micro ${textoDe(r).ok ? SENAL.ok : SENAL.critico}`}>
            {textoDe(r).texto}
          </span>
        )}
        {confirmar.isError && (
          <span role="alert" className={`text-micro ${SENAL.critico}`}>
            No se pudo enviar. Quedó sin aplicar.
          </span>
        )}
      </div>
    </section>
  )
}

// ── Registrar pago ────────────────────────────────────────────────────────

function RegistrarPago({ fila }: { fila: FilaLista }) {
  const hoy = hoyISO()
  const [f, setF] = useState({
    concepto: 'suscripcion' as (typeof CONCEPTOS)[number],
    monto: '',
    fecha_pago: hoy,
    metodo: 'transferencia',
    referencia: '',
    nota: '',
    cubre_desde: '',
    cubre_hasta: '',
  })
  const registrar = useRegistrarPago(fila.suscripcion.id, fila.suscripcion.clientes.id)

  // La oferta se recalcula con lo que el operador está escribiendo: en cuanto
  // pone un `cubre_hasta` que alcanza, aparece la casilla.
  const oferta = useMemo(
    () => sugerirReactivacion(fila.suscripcion.estado, f.cubre_hasta || null, hoy),
    [fila.suscripcion.estado, f.cubre_hasta, hoy],
  )
  const [reactivar, setReactivar] = useState(true)
  const marcado = oferta.ofrecer && reactivar

  const parsed = formularioPagoSchema.safeParse({
    ...f,
    monto: f.monto === '' ? NaN : Number(f.monto),
  })
  const errores = parsed.success ? [] : parsed.error.issues.map((i) => i.message)

  return (
    <section className={SECCION}>
      <h2 className={TITULO_SECCION}>Registrar un pago</h2>
      <p className="mb-3 text-micro text-tinta-debil">
        El comprobante llega por WhatsApp y se valida a mano. Acá va la referencia; el
        respaldo vive en el chat y en el extracto (§9.10).
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={ETIQUETA} htmlFor="concepto">Concepto</label>
          <select id="concepto" className={CAMPO} value={f.concepto}
                  onChange={(e) => setF({ ...f, concepto: e.target.value as typeof f.concepto })}>
            {CONCEPTOS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="monto">Monto (pesos enteros)</label>
          <input id="monto" inputMode="numeric" className={`${CAMPO} tabular-nums`} value={f.monto}
                 onChange={(e) => setF({ ...f, monto: e.target.value.replace(/[^\d]/g, '') })}
                 placeholder="75000" />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="fecha_pago">Fecha del pago</label>
          <input id="fecha_pago" type="date" className={CAMPO} value={f.fecha_pago}
                 onChange={(e) => setF({ ...f, fecha_pago: e.target.value })} />
        </div>

        <div>
          <label className={ETIQUETA} htmlFor="metodo">Método</label>
          <select id="metodo" className={CAMPO} value={f.metodo}
                  onChange={(e) => setF({ ...f, metodo: e.target.value })}>
            {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="cubre_desde">Cubre desde</label>
          <input id="cubre_desde" type="date" className={CAMPO} value={f.cubre_desde}
                 onChange={(e) => setF({ ...f, cubre_desde: e.target.value })} />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="cubre_hasta">Cubre hasta</label>
          <input id="cubre_hasta" type="date" className={CAMPO} value={f.cubre_hasta}
                 onChange={(e) => setF({ ...f, cubre_hasta: e.target.value })} />
        </div>

        <div className="sm:col-span-1">
          <label className={ETIQUETA} htmlFor="referencia">Referencia</label>
          <input id="referencia" className={CAMPO} value={f.referencia}
                 onChange={(e) => setF({ ...f, referencia: e.target.value })}
                 placeholder="NEQUI-8842119" />
        </div>
        <div className="sm:col-span-2">
          <label className={ETIQUETA} htmlFor="nota">Nota</label>
          <input id="nota" className={CAMPO} value={f.nota}
                 onChange={(e) => setF({ ...f, nota: e.target.value })} />
        </div>
      </div>

      {/* ── EL HUECO QUE ESTO CIERRA ──────────────────────────────────────
          Registrar y reactivar son dos acciones. Con varios operadores,
          alguien registra el pago y no reactiva, y el cliente sigue con el
          banner habiendo pagado. Se ofrece MARCADO, pero desmarcable: §4
          exige que una persona vea cada estado que llega al producto, y eso
          incluye los amables. */}
      {oferta.ofrecer && (
        <label className="mt-3 flex items-start gap-2 rounded border border-senal-ok/40 bg-senal-ok/10 p-3">
          <input type="checkbox" checked={reactivar} className={`mt-0.5 h-3.5 w-3.5 accent-senal-ok ${FOCO}`}
                 onChange={(e) => setReactivar(e.target.checked)} />
          <span className="text-dato text-tinta-fuerte">
            Reactivar la suscripción con este pago
            <span className="mt-0.5 block text-micro text-tinta-media">
              Está en «{fila.suscripcion.estado}» y este pago cubre hasta {fecha(f.cubre_hasta)}.
              Si lo dejás sin marcar, la lista va a mostrarla como «pagó, sigue restringido».
            </span>
          </span>
        </label>
      )}

      {errores.length > 0 && f.monto !== '' && (
        <ul className={`mt-3 space-y-0.5 text-micro ${SENAL.critico}`}>
          {errores.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          className={`${BOTON} bg-lienzo-realce text-tinta-fuerte hover:bg-lienzo-divisor/40`}
          disabled={!parsed.success || registrar.isPending}
          onClick={() => parsed.success && registrar.mutate({ pago: parsed.data, reactivar: marcado })}
        >
          {registrar.isPending
            ? 'Guardando…'
            : marcado
              ? 'Registrar pago y reactivar'
              : 'Registrar pago'}
        </button>
        {registrar.isSuccess && (
          <span className={`text-micro ${SENAL.ok}`} aria-live="polite">
            Pago registrado{marcado ? ' y suscripción reactivada' : ''}.
          </span>
        )}
        {registrar.isError && (
          <span role="alert" className={`text-micro ${SENAL.critico}`}>
            No se pudo registrar.
          </span>
        )}
      </div>
    </section>
  )
}

// ── Historial ─────────────────────────────────────────────────────────────

function Historial({ suscripcionId }: { suscripcionId: string }) {
  const { data, isPending, error } = useHistorial(suscripcionId)

  return (
    <section className={SECCION}>
      <h2 className={TITULO_SECCION}>Historial</h2>
      {isPending && <p className="text-dato text-tinta-media">Cargando…</p>}
      {error && (
        <p role="alert" className={`text-dato ${SENAL.critico}`}>
          No se pudo leer el historial.
        </p>
      )}
      {data && data.eventos.length === 0 && data.pagos.length === 0 && (
        <p className="text-dato text-tinta-media">Sin movimientos registrados.</p>
      )}

      {data && data.pagos.length > 0 && (
        <>
          <h3 className="mb-1 mt-1 text-micro font-medium text-tinta-media">Pagos</h3>
          <ul className="mb-4 divide-y divide-lienzo-borde">
            {data.pagos.map((p: Pago) => (
              <li key={p.id} className="py-1.5 text-dato">
                <span className="tabular-nums text-tinta-fuerte">{pesos(p.monto)}</span>
                <span className="text-tinta-media"> · {p.concepto} · {fecha(p.fecha_pago)}</span>
                {p.cubre_hasta && (
                  <span className="text-tinta-media"> · cubre hasta {fecha(p.cubre_hasta)}</span>
                )}
                <div className="text-micro">
                  {p.referencia && <span className="text-tinta-media">{p.referencia} · </span>}
                  <Autor email={p.admins?.email} />
                </div>
                {p.nota && <div className="text-micro text-tinta-debil">{p.nota}</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      {data && data.eventos.length > 0 && (
        <>
          <h3 className="mb-1 text-micro font-medium text-tinta-media">Eventos</h3>
          <ul className="divide-y divide-lienzo-borde">
            {data.eventos.map((e: Evento) => (
              <li key={e.id} className="py-1.5 text-dato">
                <span className="font-medium text-tinta-fuerte">{e.tipo}</span>
                {e.estado_anterior && e.estado_nuevo && (
                  <span className="text-tinta-media">
                    {' '}
                    {e.estado_anterior} → {e.estado_nuevo}
                  </span>
                )}
                <div className="text-micro">
                  <span className="text-tinta-media">{instante(e.creado_en)} · </span>
                  <Autor email={e.admins?.email} />
                </div>
                {e.motivo && <div className="text-micro text-tinta-media">«{e.motivo}»</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// ── La pantalla ───────────────────────────────────────────────────────────

export function DetalleSuscripcion({ fila, volver }: { fila: FilaLista; volver: () => void }) {
  const s = fila.suscripcion
  const cobertura: Cobertura = fila.cobertura

  return (
    <div>
      <button onClick={volver} className={`mb-3 inline-flex items-center gap-1.5 text-micro text-tinta-media hover:text-tinta-fuerte ${FOCO} rounded px-1 py-0.5`}>
        <ArrowLeft size={13} aria-hidden="true" />
        Volver a la lista
      </button>

      <h1 className="text-titulo text-tinta-fuerte">
        {s.clientes.nombre_comercial}
        <span className="ml-2 font-normal text-tinta-media">
          {s.productos.codigo} · {s.planes.nombre} · {s.terminos.codigo}
        </span>
      </h1>
      <p className="mb-4 text-micro text-tinta-media">
        {cobertura.proximo_cobro
          ? `Próximo cobro ${fecha(cobertura.proximo_cobro)} · pago hasta ${fecha(cobertura.cubierto_hasta!)}`
          : 'Sin historial de pagos: no se puede calcular el próximo cobro'}
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <CambiarEstado fila={fila} />
        <ConfirmarBandera fila={fila} />
        <RegistrarPago fila={fila} />
        <Historial suscripcionId={s.id} />
      </div>
    </div>
  )
}
