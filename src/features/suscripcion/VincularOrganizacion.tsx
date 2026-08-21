/**
 * El vínculo con la organización de G-Vento, y la implementación del año.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VINCULAR ES LA OPERACIÓN MÁS PELIGROSA DEL PANEL, y no se nota mirándola.
 *
 * Un UUID equivocado apunta este contrato a la organización de OTRO cliente:
 * la próxima bandera le pone —o le saca— el banner de cobranza a quien no
 * era, en vivo, en su pantalla de venta. Y no hay forma de verificarlo desde
 * acá: el contrato con G-Vento tiene UNA llamada y **escribe** (§9.5). Se
 * pidió un endpoint de lectura y lo rechazaron con mejor argumento que el
 * pedido — superficie pública permanente para un problema de copy-paste que
 * ocurre una vez por cliente.
 *
 * Lo que queda es una segunda lectura humana: el operador **escribe** el
 * nombre que ve al lado del UUID en el onboarding de G-Vento. Escribir obliga
 * a leer; pegar no. El nombre NO identifica —es mutable, y su unique allá
 * distingue mayúsculas— así que no se compara exacto contra nada, y cuando
 * discrepa **advierte en vez de bloquear** (ver `lib/organizacion.ts`).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { addMonths, format, parseISO } from 'date-fns'
import { fecha, hoyISO, pesos } from '@/lib/formato'
import { BOTON, CAMPO, ETIQUETA, SECCION, TITULO_SECCION } from '@/lib/formulario'
import { FOCO, SENAL, TINTA } from '@/lib/tokens'
import { esUuid, nombresDifieren } from '@/lib/organizacion'
import { implementacionPorExonerar, type FilaLista } from '@/features/clientes/vista'
import { useCorregirVinculo, useExonerar, useVincular } from './useDetalle'

export function VincularOrganizacion({ fila }: { fila: FilaLista }) {
  const s = fila.suscripcion
  const vincular = useVincular(s.id)
  const corregir = useCorregirVinculo(s.id)
  const [uuid, setUuid] = useState('')
  const [nombre, setNombre] = useState('')
  const [motivo, setMotivo] = useState('')
  const [corrigiendo, setCorrigiendo] = useState(false)

  /**
   * ⚠️ CERRAR Y LIMPIAR AL TERMINAR, y decir que terminó.
   *
   * Sin esto la corrección se guardaba y el formulario quedaba abierto con los
   * mismos valores adentro: se leía como que no había pasado nada, y el
   * operador lo apretaba de nuevo. La invalidación de la consulta es
   * asíncrona, así que entre el éxito y el refresco la sección mostraría
   * todavía el vínculo VIEJO — por eso hace falta el aviso además del cierre.
   */
  const listo = () => {
    setCorrigiendo(false)
    setUuid('')
    setNombre('')
    setMotivo('')
  }

  const yaVinculada = s.organizacion_externa_id !== null
  const formaOk = esUuid(uuid)
  const nombreOk = nombre.trim() !== ''
  const mismoUuid = yaVinculada && uuid.trim() === s.organizacion_externa_id
  const otraOrganizacion = nombresDifieren(s.organizacion_externa_nombre, nombre)
  const falla = vincular.error ?? corregir.error

  /**
   * ⚠️ QUÉ FALTA, DICHO EN VOZ ALTA. Un botón deshabilitado sin explicación no
   * comunica que falta algo: comunica que la pantalla está rota. Se apretó
   * varias veces «Corregir el vínculo» sin motivo escrito y la lectura fue
   * «el botón no hace nada» — que es exactamente lo que parecía.
   */
  const falta = !formaOk
    ? 'Falta el UUID de la organización.'
    : !nombreOk
      ? 'Falta el nombre, escrito a mano.'
      : corrigiendo && motivo.trim() === ''
        ? 'Falta el motivo: corregir un vínculo queda en el historial.'
        : null

  return (
    <section className={SECCION}>
      <h2 className={TITULO_SECCION}>Organización en el producto</h2>

      {yaVinculada ? (
        <>
          <p className="text-dato text-tinta-fuerte">
            {s.organizacion_externa_nombre ?? (
              <span className="text-tinta-debil">sin nombre registrado</span>
            )}
          </p>
          <p className="mb-3 break-all font-mono text-micro text-tinta-media">
            {s.organizacion_externa_id}
          </p>

          {corrigiendo ? (
            <p className={`mb-3 text-micro ${SENAL.critico}`}>
              Cambiar esto apunta el contrato a otra organización, y la próxima bandera va a
              ir ahí. Por eso pide motivo y queda en el historial con tu nombre.
            </p>
          ) : (
            <button
              onClick={() => setCorrigiendo(true)}
              className={`text-micro text-tinta-media underline underline-offset-2 hover:text-tinta-fuerte ${FOCO} rounded`}
            >
              Corregir el vínculo
            </button>
          )}
        </>
      ) : (
        <p className="mb-3 text-micro text-tinta-media">
          Sin vincular: no se le puede mandar bandera. El nombre y el UUID salen juntos del
          onboarding de G-Vento — <strong>escribí el nombre</strong>, no lo pegues.
        </p>
      )}

      {(vincular.isSuccess || corregir.isSuccess) && !corrigiendo && (
        <p className={`mb-3 text-micro ${SENAL.ok}`} aria-live="polite">
          Vínculo guardado. Quedó en el historial, abajo.
        </p>
      )}

      {(!yaVinculada || corrigiendo) && (
        <div className="space-y-3">
          <div>
            <label className={ETIQUETA} htmlFor="org_uuid">
              UUID de la organización
            </label>
            <input
              id="org_uuid"
              className={`${CAMPO} font-mono`}
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              placeholder="266d4b37-…"
            />
            {uuid.trim() !== '' && !formaOk && (
              <p className={`mt-1 text-micro ${SENAL.critico}`}>
                Eso no tiene forma de UUID. Que la tenga tampoco prueba que exista: la forma
                es lo único que se puede verificar de este lado.
              </p>
            )}
            {mismoUuid && (
              <p className={`mt-1 text-micro ${TINTA.debil}`}>
                Es el mismo UUID que ya tiene.
              </p>
            )}
          </div>

          <div>
            <label className={ETIQUETA} htmlFor="org_nombre">
              Nombre, como figura en G-Vento
            </label>
            <input
              id="org_nombre"
              className={CAMPO}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Escribilo mirando la pantalla"
            />
            {/* ⚠️ ADVIERTE, NO BLOQUEA, y se compara normalizado: una mayúscula
                distinta no es un desacuerdo. Una alarma que salta cuando todo
                está bien enseña a ignorar la alarma. */}
            {corrigiendo && nombreOk && otraOrganizacion && (
              <p className={`mt-1 text-micro ${SENAL.alerta}`}>
                Es una organización distinta de «{s.organizacion_externa_nombre}». Si sólo
                querías corregir el UUID, revisá el nombre antes de seguir.
              </p>
            )}
          </div>

          {corrigiendo && (
            <div>
              <label className={ETIQUETA} htmlFor="org_motivo">
                Por qué se corrige
              </label>
              <input
                id="org_motivo"
                className={CAMPO}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Queda en el historial, con tu nombre"
              />
            </div>
          )}

          {formaOk && nombreOk && (
            <p className="text-dato text-tinta-fuerte">
              Vas a vincular este contrato a <strong>{nombre.trim()}</strong>.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              className={`${BOTON} bg-lienzo-realce text-tinta-fuerte hover:bg-lienzo-divisor/40`}
              disabled={
                !formaOk ||
                !nombreOk ||
                (corrigiendo && motivo.trim() === '') ||
                vincular.isPending ||
                corregir.isPending
              }
              onClick={() =>
                corrigiendo
                  ? corregir.mutate({ organizacion: uuid, nombre, motivo }, { onSuccess: listo })
                  : vincular.mutate({ organizacion: uuid, nombre }, { onSuccess: listo })
              }
            >
              {/* ⚠️ NO dice «Corregir el vínculo»: así se llama el botón que
                  ABRE este formulario, y dos botones con la misma etiqueta en
                  la misma pantalla hacen imposible reportar cuál falló. */}
              {corrigiendo ? 'Guardar la corrección' : 'Vincular'}
            </button>

            {corrigiendo && (
              <button
                onClick={() => setCorrigiendo(false)}
                className={`text-micro text-tinta-media underline underline-offset-2 ${FOCO} rounded`}
              >
                Cancelar
              </button>
            )}

            {falta !== null && (
              <span className={`text-micro ${TINTA.debil}`}>{falta}</span>
            )}

            {falla !== null && (
              <span role="alert" className={`text-micro ${SENAL.critico}`}>
                {(falla as Error).message}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * La implementación perdonada condicionalmente (§9.3, §9.9).
 *
 * Sólo existe mientras haya algo pendiente: los otros tres estados no se
 * mueven ante ningún evento. El botón aparece recién cuando la exoneración es
 * EXIGIBLE — exonerar antes del año regala la implementación de un contrato
 * que todavía puede bajar de término y volverla exigible.
 *
 * La guarda de verdad está en la RPC, no acá: una pantalla no puede ser la
 * única defensa de algo que cambia plata, porque cualquiera puede llamar a la
 * función sin pasar por ella.
 */
export function Implementacion({ fila }: { fila: FilaLista }) {
  const s = fila.suscripcion
  const exonerar = useExonerar(s.id)

  if (s.estado_implementacion !== 'exonerada_condicional') return null

  /**
   * ⚠️ SE PREGUNTA POR EL ANIVERSARIO, NO POR `fila.atencion`.
   *
   * Estaba escrito como `atencion === 'IMPLEMENTACION_POR_EXONERAR'`, y eso
   * eran dos defectos en una línea:
   *
   * · `atencion` es la PRIORIDAD EN LA LISTA, una sola por fila y la peor que
   *   haya. Un contrato que cumplió el año y además está sin puente o sin
   *   pagos nunca habría mostrado el botón — la exoneración no depende de
   *   ninguna de esas cosas.
   * · Y el texto de abajo afirmaba «todavía no cumplió el año» sin haberlo
   *   mirado: para una fila con otra atención encima, era falso. Afirmar un
   *   motivo que no se verificó es la misma familia que mostrar un 0% donde
   *   no hay lista contra qué comparar.
   */
  const listo = implementacionPorExonerar(s.estado_implementacion, s.fecha_inicio, hoyISO())
  const aniversario = format(addMonths(parseISO(s.fecha_inicio), 12), 'yyyy-MM-dd')

  return (
    <section className={SECCION}>
      <h2 className={TITULO_SECCION}>Implementación</h2>
      <p className="mb-1 text-dato text-tinta-fuerte">
        Perdonada condicionalmente — {pesos(s.monto_implementacion)}
      </p>
      <p className="mb-3 text-micro text-tinta-media">
        Empezó el {fecha(s.fecha_inicio)}. Al cumplir los doce meses de servicio deja de ser
        reclamable para siempre; hasta entonces, bajar de término la vuelve exigible.
      </p>

      {listo ? (
        <>
          <button
            className={`${BOTON} bg-lienzo-realce text-tinta-fuerte hover:bg-lienzo-divisor/40`}
            disabled={exonerar.isPending}
            onClick={() => exonerar.mutate({ motivo: 'Cumplió los doce meses de servicio.' })}
          >
            {exonerar.isPending ? 'Exonerando…' : 'Exonerar: cumplió el año'}
          </button>
          {exonerar.isError && (
            <p role="alert" className={`mt-2 text-micro ${SENAL.critico}`}>
              {(exonerar.error as Error).message}
            </p>
          )}
        </>
      ) : (
        <p className={`text-micro ${TINTA.debil}`}>
          Cumple los doce meses el {fecha(aniversario)}. Hasta entonces no hay nada que
          hacer acá.
        </p>
      )}
    </section>
  )
}
