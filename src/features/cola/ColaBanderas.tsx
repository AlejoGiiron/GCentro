/**
 * Pantalla 3 — la cola de banderas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA COLA CRECE POR LLAMADA, NO POR CAMBIO DE ESTADO (§5), Y LA PANTALLA
 * TIENE QUE HACER QUE ESO SE ENTIENDA AL MIRARLA.
 *
 * Dos filas seguidas con el mismo `valor_deseado` **no son un error: son dos
 * clics.** Sin decirlo, la primera reacción de quien la abre es pensar que
 * hay duplicados y buscar el bug. Por eso las filas repetidas se marcan como
 * repetidas en vez de esconderse, y por eso `cambio_efectivo` está en la
 * tabla: es lo que distingue el clic que movió algo del que no.
 *
 * Y por eso la cola está partida en dos, que no es un filtro sino dos
 * preguntas distintas:
 *
 *   PENDIENTE   → «¿qué falta aplicar?». Se responde completa, sin paginar.
 *                 Está acotada por diseño: si crece, ESO ES LA ALARMA.
 *   HISTORIAL   → «¿qué pasó?». Se hojea, paginado.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { instante } from '@/lib/formato'
import { RUTAS } from '@/lib/rutas'
import { textoDe } from '@/lib/puente-texto'
import { FOCO, MARCA_PRUEBA, SENAL, TINTA } from '@/lib/tokens'
import { conRepeticiones } from './repeticiones'
import type { FilaCola } from './schemas'
import { POR_PAGINA, useCola, useReintentar } from './useCola'

const TH = 'px-3 py-2 text-left text-micro font-medium text-tinta-media whitespace-nowrap'
const TD = 'px-3 py-2 align-top text-dato whitespace-nowrap'
const SEP = 'border-l-2 border-lienzo-divisor'

/** «Sin autor registrado», nunca un vacío. Ver el historial de la pantalla 2. */
function Autor({ email }: { email: string | null | undefined }) {
  if (email) return <span className="text-tinta-media">{email}</span>
  return <span className="italic text-tinta-debil">sin autor registrado</span>
}

/**
 * ⚠️ TRES ESTADOS, NO DOS. `null` es «sin dato», no «no cambió».
 *
 * Es la distinción que la columna existe para hacer (migración `009`), y hay
 * filas reales del 13/08 —anteriores a la columna— que la ejercitan. Decir
 * «no cambió» sobre ellas sería inventar un dato que no se tiene.
 */
function CambioEfectivo({ valor }: { valor: boolean | null }) {
  if (valor === true) return <span className="text-tinta-fuerte">cambió</span>
  if (valor === false) return <span className="text-tinta-media">ya estaba así</span>
  return <span className="italic text-tinta-debil">sin dato</span>
}

/**
 * El texto que se le mostró al cliente.
 *
 * ⚠️ DOS NULLS DISTINTOS. En una fila posterior a la migración `014`, `null`
 * significa «se envió sin mensaje». En una anterior significa «no quedó
 * registro»: la columna no existía y el texto no está en ningún lado.
 * Mostrarlos igual diría que a alguien no se le dijo nada cuando lo que pasa
 * es que no se sabe.
 */
const NACE_014 = '2026-08-16'

function Mensaje({ f }: { f: FilaCola }) {
  if (f.mensaje) {
    return (
      <div className="mt-0.5 max-w-md text-tinta-media">«{f.mensaje}»</div>
    )
  }
  const anterior = f.creado_en.slice(0, 10) < NACE_014
  return (
    <div className="mt-0.5 italic text-tinta-debil">
      {anterior ? 'mensaje sin registrar' : 'sin mensaje'}
    </div>
  )
}

function Fila({
  f,
  repetida,
  reintentar,
}: {
  f: FilaCola
  repetida: boolean
  reintentar?: () => void
  }) {
  const pendiente = f.confirmado_en === null
  const cliente = f.suscripciones.clientes

  return (
    <tr className="border-b border-lienzo-borde hover:bg-lienzo-realce">
      <td className={`${TD} text-tinta-media`}>
        {instante(f.creado_en)}
        {repetida && (
          // No es un duplicado: es otro clic. Marcarlo evita que alguien
          // salga a buscar un bug que no existe.
          <div className="text-micro text-tinta-debil">repite el anterior</div>
        )}
      </td>
      <th scope="row" className={`${TD} text-left font-normal text-tinta-fuerte`}>
        <Link
          to={RUTAS.suscripcion(f.suscripcion_id)}
          className={`rounded underline-offset-2 hover:underline ${FOCO}`}
        >
          {cliente.nombre_comercial}
        </Link>
        {cliente.es_prueba && <span className={MARCA_PRUEBA}>prueba</span>}
      </th>
      <td className={`${TD} text-tinta-fuerte`}>{f.valor_deseado}</td>
      <td className={`${TD} tabular-nums text-tinta-media`}>{f.intentos}</td>

      <td className={`${TD} ${SEP}`}>
        {pendiente ? (
          <span className={`inline-flex items-center gap-1.5 ${SENAL.alerta}`}>
            <AlertTriangle size={12} aria-hidden="true" />
            sin confirmar
          </span>
        ) : (
          <span className="text-tinta-media">{instante(f.confirmado_en!)}</span>
        )}
      </td>
      <td className={TD}>
        {pendiente ? (
          <span className={SENAL.critico}>{f.bandera_error_codigo ?? 'sin código'}</span>
        ) : (
          <CambioEfectivo valor={f.cambio_efectivo} />
        )}
      </td>
      <td className={`${TD} whitespace-normal text-micro`}>
        <Autor email={f.admins?.email} />
        <Mensaje f={f} />
      </td>
      <td className={TD}>
        {pendiente && reintentar && (
          <button
            onClick={reintentar}
            className={`inline-flex items-center gap-1.5 rounded bg-lienzo-realce px-2 py-1 text-micro text-tinta-fuerte hover:bg-lienzo-divisor/40 ${FOCO}`}
          >
            <RotateCw size={11} aria-hidden="true" />
            Reintentar
          </button>
        )}
      </td>
    </tr>
  )
}


function Tabla({
  filas,
  reintentar,
  enVuelo,
}: {
  filas: FilaCola[]
  reintentar?: (f: FilaCola) => void
  enVuelo?: string | null
}) {
  return (
    <div className="overflow-x-auto rounded border border-lienzo-borde">
      <table className="w-full border-collapse text-dato">
        <thead>
          <tr className="border-b border-lienzo-borde bg-lienzo-panel text-micro">
            <th scope="col" className={TH}>Cuándo se pidió</th>
            <th scope="col" className={TH}>Cliente</th>
            <th scope="col" className={TH}>Nivel</th>
            <th scope="col" className={TH}>Intentos</th>
            <th scope="col" className={`${TH} ${SEP}`}>Confirmada</th>
            <th scope="col" className={TH}>Resultado</th>
            <th scope="col" className={TH}>Quién y qué dijo</th>
            <th scope="col" className={TH}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {conRepeticiones(filas).map(({ f, repetida }) => (
            <Fila
              key={f.id}
              f={f}
              repetida={repetida}
              reintentar={
                reintentar && enVuelo !== f.id ? () => reintentar(f) : undefined
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ColaBanderas() {
  const [pagina, setPagina] = useState(0)
  const [mostrarPrueba, setMostrarPrueba] = useState(false)
  const [enVuelo, setEnVuelo] = useState<string | null>(null)
  const { data, isPending, error } = useCola(pagina, mostrarPrueba)
  const reintentar = useReintentar()

  const paginas = data ? Math.ceil(data.totalConfirmadas / POR_PAGINA) : 0

  function alReintentar(f: FilaCola) {
    setEnVuelo(f.id)
    reintentar.mutate(f, { onSettled: () => setEnVuelo(null) })
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-titulo text-tinta-fuerte">Cola de banderas</h1>
        <label className="flex cursor-pointer items-center gap-2 text-micro text-tinta-media">
          <input
            type="checkbox"
            checked={mostrarPrueba}
            onChange={(e) => setMostrarPrueba(e.target.checked)}
            className={`h-3.5 w-3.5 accent-senal-info ${FOCO}`}
          />
          Tenants de prueba
        </label>
      </div>

      {/* Lo que la pantalla tiene que enseñar antes de que alguien la lea mal. */}
      <p className="mb-4 max-w-3xl text-micro leading-relaxed text-tinta-media">
        Se escribe <strong className="text-tinta-fuerte">una fila por llamada</strong>, no
        por cambio de estado. Dos filas seguidas con el mismo nivel no son un duplicado:
        son dos clics. La columna «Resultado» es la que distingue el que movió algo del
        que no.
      </p>

      {isPending && <p className="text-dato text-tinta-media">Cargando…</p>}
      {error && (
        <p role="alert" className={`text-dato ${SENAL.critico}`}>
          No se pudo leer la cola.
        </p>
      )}

      {data && (
        <>
          <section className="mb-6">
            <h2 className="mb-2 text-micro font-semibold uppercase tracking-grupo text-tinta-media">
              Sin confirmar
              {data.pendientes.length > 0 && (
                <span className={`ml-2 ${SENAL.alerta}`}>{data.pendientes.length}</span>
              )}
            </h2>
            {data.pendientes.length === 0 ? (
              <p className="text-dato text-tinta-media">
                Nada pendiente
                {!mostrarPrueba && ' entre los clientes que facturan'}: todo lo que se pidió
                llegó al producto.
              </p>
            ) : (
              <>
                <p className="mb-2 text-micro text-tinta-debil">
                  Esta lista va completa, sin paginar. Está acotada por diseño — si crece,
                  eso es la alarma.
                </p>
                <Tabla filas={data.pendientes} reintentar={alReintentar} enVuelo={enVuelo} />
              </>
            )}

            <div aria-live="polite" className="mt-2">
              {enVuelo && (
                <span className="inline-flex items-center gap-1.5 text-micro text-tinta-media">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  Reintentando… deja una fila nueva en la cola.
                </span>
              )}
              {!enVuelo && reintentar.isSuccess && reintentar.data && (
                <span
                  className={`text-micro ${textoDe(reintentar.data).ok ? SENAL.ok : SENAL.critico}`}
                >
                  {textoDe(reintentar.data).ok
                    ? 'Aplicado. La fila vieja queda como registro del intento que falló.'
                    : textoDe(reintentar.data).texto}
                </span>
              )}
              {!enVuelo && reintentar.isError && (
                <span role="alert" className={`text-micro ${SENAL.critico}`}>
                  No se pudo llegar al puente.
                </span>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-micro font-semibold uppercase tracking-grupo text-tinta-media">
              Historial
              <span className={`ml-2 font-normal ${TINTA.debil}`}>
                {data.totalConfirmadas} confirmadas
              </span>
            </h2>
            {data.confirmadas.length === 0 ? (
              <p className="text-dato text-tinta-media">Nada confirmado todavía.</p>
            ) : (
              <>
                <Tabla filas={data.confirmadas} />
                {paginas > 1 && (
                  <div className="mt-2 flex items-center gap-3 text-micro text-tinta-media">
                    <button
                      onClick={() => setPagina((p) => Math.max(0, p - 1))}
                      disabled={pagina === 0}
                      className={`rounded px-2 py-1 hover:text-tinta-fuerte disabled:opacity-40 ${FOCO}`}
                    >
                      ← Anterior
                    </button>
                    <span className="tabular-nums">
                      Página {pagina + 1} de {paginas}
                    </span>
                    <button
                      onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))}
                      disabled={pagina >= paginas - 1}
                      className={`rounded px-2 py-1 hover:text-tinta-fuerte disabled:opacity-40 ${FOCO}`}
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
