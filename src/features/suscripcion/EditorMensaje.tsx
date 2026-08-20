/**
 * El editor del mensaje del banner.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO ES UNA PANTALLA APARTE, Y ESO ES EL DISEÑO.
 *
 * §6: **el mensaje viaja con el nivel**, en el mismo cuerpo, en la misma
 * llamada. Una pantalla que mandara mensajes por su cuenta contradiría el
 * contrato y abriría un camino donde el texto llega sin el nivel que lo
 * explica — o peor, donde alguien cambia el banner creyendo que cambió la
 * restricción.
 *
 * Así que el editor vive DENTRO de la acción que envía la bandera.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { MENSAJE_MAX, type Nivel } from '@/lib/bandera'
import { largoEfectivo, PLANTILLAS } from '@/lib/plantillas'
import { FOCO, SENAL, TINTA } from '@/lib/tokens'

const CAMPO =
  'w-full rounded border border-lienzo-divisor bg-lienzo-panel px-2 py-1.5 text-dato ' +
  `text-tinta-fuerte placeholder:text-tinta-debil ${FOCO}`

/**
 * Cómo lo ve el cajero.
 *
 * ⚠️ SE VE COMO G-VENTO, NO COMO G-CENTRO, y a propósito: es la única parte
 * de este panel que representa OTRO producto. Con los tokens de acá, el
 * operador juzgaría el contraste y el peso del banner contra un fondo oscuro
 * que en el POS no existe.
 *
 * ⚠️ Y ES UNA APROXIMACIÓN, NO UNA COPIA. No se puede abrir el repo de
 * G-Vento (regla 2), así que esto reproduce la FORMA —franja de ancho
 * completo, arriba de la pantalla de venta, sobre fondo claro— y no sus
 * colores exactos. Decir lo contrario sería prometer una fidelidad que nadie
 * verificó; por eso la pantalla lo aclara donde se ve.
 */
function Previsualizacion({ nivel, texto }: { nivel: Nivel; texto: string }) {
  const vacio = largoEfectivo(texto) === 0
  // Tonos del lado del POS: fondo claro, texto oscuro. Nada de la paleta de
  // G-Centro entra acá.
  const fondo =
    nivel === 'suspendida' || nivel === 'restringida'
      ? { fondo: '#FDE7E7', borde: '#E0A0A0', texto: '#7A1F1F' }
      : { fondo: '#FDF3D7', borde: '#DDC178', texto: '#6B4E12' }

  return (
    <div>
      <p className="mb-1.5 text-micro text-tinta-media">
        Cómo lo ve el cajero{' '}
        <span className={TINTA.debil}>— aproximado, no es una copia exacta de G-Vento</span>
      </p>

      {/* Marco que sugiere la pantalla de venta, para que el banner no se lea
          como un componente de este panel. */}
      <div className="overflow-hidden rounded border border-lienzo-divisor bg-white">
        {vacio ? (
          <div className="px-3 py-6 text-center" style={{ color: '#94a3b8', fontSize: 13 }}>
            Sin banner: el cajero no ve nada.
          </div>
        ) : (
          <div
            style={{
              background: fondo.fondo,
              borderBottom: `1px solid ${fondo.borde}`,
              color: fondo.texto,
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {texto.trim()}
          </div>
        )}
        {/* Lo que el banner tapa: la pantalla de venta. Sin esto no se
            entiende que el texto largo empuja el trabajo hacia abajo. */}
        <div className="px-3 py-3" style={{ background: '#ffffff' }}>
          <div style={{ height: 8, width: '55%', background: '#e2e8f0', borderRadius: 3 }} />
          <div
            style={{ height: 8, width: '35%', background: '#eef2f7', borderRadius: 3, marginTop: 6 }}
          />
        </div>
      </div>
    </div>
  )
}

export function EditorMensaje({
  nivel,
  valor,
  onChange,
}: {
  nivel: Nivel
  valor: string
  onChange: (v: string) => void
}) {
  const [tocado, setTocado] = useState(false)
  const plantilla = PLANTILLAS[nivel]
  const largo = largoEfectivo(valor)
  const excedido = largo > MENSAJE_MAX
  const restantes = MENSAJE_MAX - largo
  // ⚠️ DERIVADOS del límite, no constantes sueltas. Estaban escritos como 140
  // y 60 —la mitad y un quinto de 280— y al bajar el límite a 140 dejaron de
  // significar eso: el contador se habría quedado pegado en "quedan N" desde
  // el primer carácter y el aviso naranja no habría aparecido nunca.
  const MOSTRAR_CONTADOR = Math.round(MENSAJE_MAX / 2)
  const CERCA = Math.round(MENSAJE_MAX / 5)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="mensaje" className="text-micro font-medium text-tinta-media">
          <MessageSquare size={11} className="mr-1 inline" aria-hidden="true" />
          Mensaje del banner
        </label>
        {/* El contador aparece cuando importa. Un "0/140" desde el principio
            es ruido; a partir de la mitad es información. */}
        <span
          className={`text-micro tabular-nums ${
            excedido ? SENAL.critico : restantes <= CERCA ? SENAL.alerta : TINTA.debil
          }`}
          aria-live="polite"
        >
          {excedido
            ? `${largo - MENSAJE_MAX} de más`
            : restantes <= MOSTRAR_CONTADOR
              ? `quedan ${restantes}`
              : `${largo}/${MENSAJE_MAX}`}
        </span>
      </div>

      {plantilla.texto !== '' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onChange(plantilla.texto)
              setTocado(true)
            }}
            className={`rounded border border-lienzo-divisor bg-lienzo-realce px-2 py-1 text-micro text-tinta-fuerte hover:bg-lienzo-divisor/30 ${FOCO}`}
          >
            Usar la plantilla de «{nivel}»
          </button>
          {valor !== '' && (
            <button
              type="button"
              onClick={() => onChange('')}
              className={`rounded px-1.5 py-1 text-micro text-tinta-media hover:text-tinta-fuerte ${FOCO}`}
            >
              Vaciar
            </button>
          )}
          {!tocado && valor === '' && (
            <span className="text-micro text-tinta-debil">{plantilla.intencion}</span>
          )}
        </div>
      )}

      <textarea
        id="mensaje"
        rows={3}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        // ⚠️ SIN `maxLength`. Cortar la escritura al llegar al límite hace que el
        // texto se pierda sin aviso mientras alguien redacta. Se deja escribir
        // de más, se muestra cuánto sobra, y el botón de enviar se bloquea.
        className={`${CAMPO} ${excedido ? 'border-senal-critico' : ''}`}
        placeholder={
          plantilla.texto === ''
            ? 'En «activa» no hace falta mensaje.'
            : 'Escribí, o usá la plantilla.'
        }
      />

      {excedido && (
        <p role="alert" className={`text-micro ${SENAL.critico}`}>
          El límite de {MENSAJE_MAX} es nuestro: G-Vento acepta texto sin límite, pero
          arriba de eso el banner ocupa más de un renglón y empuja la pantalla de venta.
          Recortá antes de enviar.
        </p>
      )}

      <Previsualizacion nivel={nivel} texto={valor} />
    </div>
  )
}
