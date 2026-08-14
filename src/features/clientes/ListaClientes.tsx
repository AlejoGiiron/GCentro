/**
 * Pantalla 1 — la lista.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA TABLA ESTÁ AGRUPADA EN TRES BLOQUES Y ESO ES EL DISEÑO, NO ADORNO.
 *
 * §5: la lista muestra DOS COSAS DISTINTAS —el estado en G-Centro y si la
 * bandera está confirmada en el producto— y la mayoría de los bugs feos de
 * sistemas cruzados son "creí que había escrito y no".
 *
 * Un solo indicador combinado las borraría. Poner las columnas una al lado de
 * la otra sin más las deja parecer parte del mismo dato. Por eso el encabezado
 * de dos filas: la tabla dice, estructuralmente, que hay DOS SISTEMAS acá y
 * que uno no implica al otro.
 *
 * La columna «Atención» va PRIMERA y FUERA de los tres grupos, porque no es un
 * hecho de ninguno de los dos sistemas: se deriva de compararlos.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, Circle, Minus, Search } from 'lucide-react'
import { fecha, instante, pesos, diasEnPalabras } from '@/lib/formato'
import { ESTADOS_COMERCIALES } from './schemas'
import { useSuscripciones } from './useSuscripciones'
import {
  aplicarVista,
  contarAtencion,
  type Atencion,
  type EstadoBandera,
  type FilaLista,
  type Vista,
} from './vista'

const TH = 'px-3 py-2 text-left font-medium text-slate-400 whitespace-nowrap'
const TD = 'px-3 py-2 align-top whitespace-nowrap'
/** Borde que separa un GRUPO del anterior. Marca dónde cambia el sistema. */
const SEP = 'border-l border-slate-700'

/**
 * El texto es la etiqueta, el color la refuerza — nunca al revés. Un estado
 * codificado solo por color deja de existir para quien no lo distingue, y
 * esta columna es justamente la que se lee de reojo.
 */
const ATENCION: Record<Atencion, { texto: string; clase: string }> = {
  REGRESION_APLICADA: { texto: 'restringe de más', clase: 'text-red-400' },
  SIN_CONFIRMAR: { texto: 'sin confirmar', clase: 'text-amber-400' },
  SIN_PUENTE: { texto: 'sin puente', clase: 'text-slate-400' },
  FALTA_ESCALAR: { texto: 'falta escalar', clase: 'text-sky-400' },
  POR_VENCER: { texto: 'vence pronto', clase: 'text-slate-300' },
  AL_DIA: { texto: '—', clase: 'text-slate-700' },
}

const VISTAS: Array<{ id: Vista; texto: string; ayuda: string }> = [
  { id: 'hoy', texto: 'Hoy', ayuda: '¿Hay algo raro? Lo que necesita atención, lo peor arriba.' },
  { id: 'facturacion', texto: 'Facturación', ayuda: 'Lo que hay que cobrar, por fecha de vencimiento.' },
  { id: 'todas', texto: 'Todas', ayuda: 'Todo, sin filtrar.' },
]

function EstadoComercial({ estado }: { estado: string }) {
  const color =
    estado === 'activa'
      ? 'text-slate-200'
      : estado === 'gracia'
        ? 'text-amber-400'
        : estado === 'suspendida'
          ? 'text-red-400'
          : 'text-slate-500'
  return <span className={`font-medium ${color}`}>{estado}</span>
}

/**
 * Lo que el producto sabe. Nunca dice "todo bien" por omisión: los tres
 * estados en que NO hay confirmación se nombran distinto, porque significan
 * cosas distintas y sólo uno de ellos se arregla apretando un botón.
 */
function Bandera({ b }: { b: EstadoBandera }) {
  return (
    <div className="space-y-0.5">
      {b.clase === 'sin_puente' && (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <Minus size={12} />
          sin puente
        </span>
      )}

      {b.clase === 'nunca' && (
        <span className="inline-flex items-center gap-1.5 text-slate-400">
          <Circle size={9} className="fill-slate-600 text-slate-600" />
          nunca sincronizada
        </span>
      )}

      {b.clase === 'confirmada' && (
        <span className="inline-flex items-center gap-1.5 text-slate-200">
          <Circle size={9} className="fill-emerald-500 text-emerald-500" />
          {b.nivel}
        </span>
      )}

      {/* Independiente de lo de arriba: puede haber una confirmación vieja Y
          intentos nuevos que fallaron. Son dos hechos, no uno. */}
      {b.sinConfirmar > 0 && (
        <div className="flex items-center gap-1.5 text-amber-400">
          <AlertTriangle size={12} />
          {b.sinConfirmar} sin confirmar
          {b.ultimoCodigo && <span className="text-amber-500/70">· {b.ultimoCodigo}</span>}
        </div>
      )}
    </div>
  )
}

function Fila({ f }: { f: FilaLista }) {
  const s = f.suscripcion
  const a = ATENCION[f.atencion]

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-900/60">
      <td className={`${TD} ${a.clase} font-medium`}>{a.texto}</td>

      {/* ── Contrato ────────────────────────────────────────────────── */}
      <td className={`${TD} ${SEP} text-slate-100`}>
        {s.clientes.nombre_comercial}
        {s.clientes.es_prueba && (
          <span className="ml-2 rounded border border-sky-800 bg-sky-950 px-1 py-px text-[10px] uppercase tracking-wide text-sky-400">
            prueba
          </span>
        )}
      </td>
      <td className={`${TD} text-slate-300`}>{s.productos.codigo}</td>
      <td className={`${TD} text-slate-300`}>{s.planes.nombre}</td>
      <td className={`${TD} text-slate-300`}>
        {s.terminos.codigo}
        {s.sedes_adicionales > 0 && (
          <span className="ml-1.5 text-slate-500">+{s.sedes_adicionales} sede(s)</span>
        )}
      </td>
      <td className={`${TD} text-right tabular-nums text-slate-100`}>
        {pesos(f.montoCiclo)}
        {s.terminos.meses > 1 && (
          <div className="text-xs text-slate-500">{pesos(f.mensual)}/mes</div>
        )}
      </td>

      {/* ── G-Centro: lo que decidimos nosotros ─────────────────────── */}
      <td className={`${TD} ${SEP}`}>
        <EstadoComercial estado={s.estado} />
      </td>
      <td className={`${TD} text-slate-300`}>
        {fecha(s.proximo_cobro)}
        <div className="text-xs text-slate-500">
          {diasEnPalabras(f.sugerencia.dias_para_cobro)}
        </div>
      </td>
      <td className={`${TD} text-slate-300`}>
        {f.sugerencia.nivel}
        <div className="text-xs text-slate-600">{f.sugerencia.regla.toLowerCase()}</div>
      </td>

      {/* ── G-Vento: lo que el producto sabe ────────────────────────── */}
      <td className={`${TD} ${SEP}`}>
        <Bandera b={f.bandera} />
      </td>
      <td className={`${TD} text-slate-400`}>
        {f.bandera.desde ? (
          <>
            {instante(f.bandera.desde)}
            {/* 009: `false` = ya estaba así. `null` = fila vieja, sin dato.
                No se muestran igual porque no significan lo mismo. */}
            {f.bandera.cambioEfectivo === false && (
              <div className="text-xs text-slate-600">ya estaba así</div>
            )}
            {f.bandera.cambioEfectivo === null && (
              <div className="text-xs text-slate-600">sin dato</div>
            )}
          </>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
    </tr>
  )
}

export function ListaClientes() {
  const [mostrarPrueba, setMostrarPrueba] = useState(false)
  // Arranca en `hoy`: es el ritmo más frecuente (vistazo diario) y la pregunta
  // que la pantalla tiene que contestar en dos segundos.
  const [vista, setVista] = useState<Vista>('hoy')
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')

  const { data, isLoading, error } = useSuscripciones(mostrarPrueba)

  const filas = useMemo(
    () => (data ? aplicarVista(data, { vista, busqueda, estado }) : []),
    [data, vista, busqueda, estado],
  )
  const pendientes = useMemo(() => (data ? contarAtencion(data) : 0), [data])
  const buscando = busqueda.trim() !== ''

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-1">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVista(v.id)}
              title={v.ayuda}
              className={`rounded px-2.5 py-1 text-sm ${
                vista === v.id
                  ? 'bg-slate-800 font-medium text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {v.texto}
              {v.id === 'hoy' && pendientes > 0 && (
                <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-px text-xs tabular-nums text-amber-400">
                  {pendientes}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-600"
            />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-48 rounded border border-slate-800 bg-slate-900 py-1 pl-7 pr-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
            />
          </div>

          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-sm text-slate-300 focus:border-slate-600 focus:outline-none"
          >
            <option value="">Todos los estados</option>
            {ESTADOS_COMERCIALES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={mostrarPrueba}
              onChange={(e) => setMostrarPrueba(e.target.checked)}
              className="h-3.5 w-3.5 accent-sky-600"
            />
            Tenants de prueba
          </label>
        </div>
      </div>

      {/* La búsqueda ignora la vista a propósito: si no, buscar un cliente que
          está al día desde «Hoy» devolvería vacío por una razón invisible. */}
      {buscando && (
        <p className="mb-2 text-xs text-slate-500">
          Buscando en todas las suscripciones, sin el filtro de «{VISTAS.find((v) => v.id === vista)?.texto}».
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

      {error && (
        <div className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          No se pudo leer la lista. {error instanceof Error ? error.message : ''}
        </div>
      )}

      {data && filas.length === 0 && (
        <p className="text-sm text-slate-500">
          {buscando
            ? 'Ningún cliente coincide con la búsqueda.'
            : vista === 'hoy'
              ? 'Nada que atender. Las banderas están confirmadas y nadie está restringido de más.'
              : vista === 'facturacion'
                ? 'Nada por cobrar en este momento.'
                : `No hay suscripciones que mostrar${mostrarPrueba ? '' : ' (los tenants de prueba están ocultos)'}.`}
        </p>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* Fila de GRUPO: nombra los dos sistemas. Es la que hace visible
                  que las columnas de la derecha no son "más datos del mismo
                  lugar" sino lo que dice otro sistema. */}
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] uppercase tracking-wide">
                <th className={`${TH} text-slate-500`} rowSpan={2}>
                  Atención
                </th>
                <th className={`${TH} ${SEP} text-slate-500`} colSpan={5}>
                  Contrato
                </th>
                <th className={`${TH} ${SEP} text-slate-300`} colSpan={3}>
                  G-Centro · lo que decidimos
                </th>
                <th className={`${TH} ${SEP} text-slate-300`} colSpan={2}>
                  G-Vento · lo que el producto sabe
                </th>
              </tr>
              <tr className="border-b border-slate-800 bg-slate-900/40 text-xs">
                <th className={`${TH} ${SEP}`}>Cliente</th>
                <th className={TH}>Producto</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Término</th>
                <th className={`${TH} !text-right`}>Monto del ciclo</th>

                <th className={`${TH} ${SEP}`}>Estado</th>
                <th className={TH}>Próximo cobro</th>
                <th className={TH}>Nivel sugerido</th>

                <th className={`${TH} ${SEP}`}>Bandera</th>
                <th className={TH}>Confirmada</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <Fila key={f.suscripcion.id} f={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-600">
        <strong className="text-slate-500">Las dos últimas columnas no se derivan de las
        otras.</strong>{' '}
        «Estado» es lo que decidimos acá; «Bandera» es lo último que G-Vento confirmó por
        escrito. Que difieran no es un error de la pantalla: es la información. «Atención»
        ordena por el <em>costo de no mirar</em>, por eso «restringe de más» —un cliente
        que pagó y sigue bloqueado— va por encima de «falta escalar».
      </p>
    </div>
  )
}
