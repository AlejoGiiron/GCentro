/**
 * Qué dice el `datos` de un evento, en castellano.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SIN ESTO, TODO LO QUE SE GUARDA PARA EL DÍA MALO ES INVISIBLE.
 *
 * La `016` y la `017` guardan con cuidado la foto de lo que se congeló al
 * firmar, el par de organizaciones viejo y nuevo con sus dos nombres, y el
 * de-dónde-a-dónde de la implementación. El historial mostraba sólo el tipo,
 * la hora, el autor y el motivo — así que **cinco vinculaciones seguidas se
 * veían idénticas** y la pregunta del día malo —«¿qué creía quien vinculó, y
 * qué creía quien corrigió?»— sólo se podía contestar abriendo el SQL Editor.
 *
 * Un registro de auditoría que hay que leer por fuera de la herramienta donde
 * ocurrió el hecho es la mitad de un registro de auditoría.
 *
 * ⚠️ NADA SE OCULTA. Un evento con una forma que este módulo no conoce
 * muestra su JSON crudo: es feo y es correcto. Filtrar lo que no se entiende
 * dejaría al historial diciendo «no pasó nada» sobre algo que sí pasó, que es
 * exactamente el modo de fallo que estas migraciones vinieron a cerrar.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { pesos } from '@/lib/formato'

/** Un renglón del detalle de un evento. `mono` para lo que es un identificador. */
export interface Renglon {
  texto: string
  mono?: boolean
}

function leer(datos: unknown): Record<string, unknown> | null {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return null
  return datos as Record<string, unknown>
}

const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const entero = (v: unknown): number | null => (typeof v === 'number' ? v : null)

/** «—» y no vacío: la ausencia de un valor anterior es un dato, no un hueco. */
const NADA = '—'

export function detalleDeEvento(tipo: string, datos: unknown): Renglon[] {
  const d = leer(datos)
  if (d === null) return []

  switch (tipo) {
    case 'ORGANIZACION_VINCULADA': {
      const antes = texto(d.nombre_anterior) ?? NADA
      const despues = texto(d.nombre_nueva) ?? NADA
      return [
        { texto: `${antes} → ${despues}` },
        // Los UUID completos, sin abreviar: son la identidad, y abreviarlos
        // convertiría la auditoría en «dos cosas que empiezan igual».
        { texto: `${texto(d.anterior) ?? NADA} → ${texto(d.nueva) ?? NADA}`, mono: true },
      ]
    }

    case 'IMPLEMENTACION_ACTUALIZADA': {
      const monto = entero(d.monto)
      const cambio = `${texto(d.anterior) ?? NADA} → ${texto(d.nuevo) ?? NADA}`
      return [{ texto: monto === null ? cambio : `${cambio} · ${pesos(monto)}` }]
    }

    case 'CREADA': {
      // Lo que se muestra es LO QUE SE CONGELÓ: los cinco números que van a
      // facturarse hasta que alguien los cambie a mano. El `plan_id` queda
      // afuera a propósito — un UUID en un renglón de historial es ruido, y
      // el plan está en el encabezado de la pantalla.
      const base = entero(d.precio_base_mensual)
      const sede = entero(d.precio_sede_adicional)
      const impl = entero(d.monto_implementacion)
      const sedes = entero(d.sedes_adicionales)
      const desc = entero(d.descuento_pct)
      const partes = [
        texto(d.termino),
        base === null ? null : `${pesos(base)}/mes`,
        sedes === null || sedes === 0
          ? null
          : `${sedes} sede${sedes === 1 ? '' : 's'}${sede === null ? '' : ` a ${pesos(sede)}`}`,
        desc === null || desc === 0 ? null : `${desc}% de descuento`,
        impl === null ? null : `implementación ${pesos(impl)}`,
        texto(d.estado_implementacion),
      ].filter((p): p is string => p !== null)
      return partes.length === 0 ? [] : [{ texto: partes.join(' · ') }]
    }

    default:
      // Forma desconocida: se muestra crudo. Ver el encabezado.
      return [{ texto: JSON.stringify(d), mono: true }]
  }
}
