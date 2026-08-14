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
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { AlertTriangle, Circle, Minus } from 'lucide-react'
import { fecha, instante, pesos, diasEnPalabras } from '@/lib/formato'
import type { EstadoBandera, FilaLista } from './useSuscripciones'
import { useSuscripciones } from './useSuscripciones'

const TH = 'px-3 py-2 text-left font-medium text-slate-400 whitespace-nowrap'
const TD = 'px-3 py-2 align-top whitespace-nowrap'
/** Borde que separa un GRUPO del anterior. Marca dónde cambia el sistema. */
const SEP = 'border-l border-slate-700'

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
          <Circle size={9} className="text-slate-600 fill-slate-600" />
          nunca sincronizada
        </span>
      )}

      {b.clase === 'confirmada' && (
        <span className="inline-flex items-center gap-1.5 text-slate-200">
          <Circle size={9} className="text-emerald-500 fill-emerald-500" />
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
  const b = f.bandera

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-900/60">
      {/* ── Contrato ────────────────────────────────────────────────── */}
      <td className={`${TD} text-slate-100`}>
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
        <Bandera b={b} />
      </td>
      <td className={`${TD} text-slate-400`}>
        {b.desde ? (
          <>
            {instante(b.desde)}
            {/* 009: `false` = ya estaba así. `null` = fila vieja, sin dato.
                No se muestran igual porque no significan lo mismo. */}
            {b.cambioEfectivo === false && (
              <div className="text-xs text-slate-600">ya estaba así</div>
            )}
            {b.cambioEfectivo === null && (
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
  const { data, isLoading, error } = useSuscripciones(mostrarPrueba)

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h1 className="text-base font-semibold text-slate-100">
          Suscripciones
          {data && <span className="ml-2 font-normal text-slate-500">{data.length}</span>}
        </h1>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={mostrarPrueba}
            onChange={(e) => setMostrarPrueba(e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-600"
          />
          Mostrar tenants de prueba
        </label>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}

      {error && (
        <div className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          No se pudo leer la lista. {error instanceof Error ? error.message : ''}
        </div>
      )}

      {data && data.length === 0 && (
        <p className="text-sm text-slate-500">
          No hay suscripciones que mostrar
          {!mostrarPrueba && ' (los tenants de prueba están ocultos)'}.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* Fila de GRUPO: nombra los dos sistemas. Es la que hace visible
                  que las columnas de la derecha no son "más datos del mismo
                  lugar" sino lo que dice otro sistema. */}
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] uppercase tracking-wide">
                <th className={`${TH} text-slate-500`} colSpan={5}>
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
                <th className={TH}>Cliente</th>
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
              {data.map((f) => (
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
        escrito. Que difieran no es un error de la pantalla: es la información. El nivel
        sugerido se calcula según §4 y <em>no se aplica solo</em>.
      </p>
    </div>
  )
}
