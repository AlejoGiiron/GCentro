/**
 * La consulta de la lista, más la derivación de las DOS columnas de §5.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRES CONSULTAS ACOTADAS, NINGUNA QUE CREZCA SIN TECHO
 *
 * §5: la cola de banderas crece por LLAMADA, no por cambio de estado. Traerla
 * entera para derivar "la última de cada suscripción" era barato con 8 filas y
 * dejaba de serlo con 50 clientes sincronizando a diario.
 *
 *   · suscripciones                → acotada por la cantidad de contratos.
 *   · bandera_ultima_confirmada    → una fila por suscripción (vista, 011).
 *   · banderas sin confirmar       → el backlog del outbox, acotado por
 *                                    diseño. Si crece, ESO ES LA ALARMA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LOS TENANTS DE PRUEBA SE TRAEN SIEMPRE Y SE OCULTAN AL MOSTRAR
 *
 * Antes el filtro iba en la consulta. Eso hacía que el contador de "necesita
 * atención" contara sobre datos ya filtrados: **con LAB roto y el interruptor
 * apagado, la pantalla decía que no había nada que atender.** Es el modo de
 * fallo silencioso que el proyecto evita en todos lados, puesto justo en el
 * texto que más confianza transmite.
 *
 * Trayéndolos siempre, el contador es honesto y la vista puede avisar que hay
 * algo escondido. De paso, alternar el interruptor ya no refetchea.
 *
 * §3 sigue en pie: **lo que SUMA PLATA lee las vistas `*_cobrables`.** Esto
 * lista y cuenta; no suma.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { mensualEfectivo } from '@/lib/cobro'
import { nivelSugerido } from '@/lib/bandera'
import { hoyISO } from '@/lib/formato'
import {
  banderaSchema,
  suscripcionListaSchema,
  coberturaSchema,
  ultimaConfirmadaSchema,
  type Bandera,
  type SuscripcionLista,
  type UltimaConfirmada,
} from './schemas'
import { SIN_COBERTURA, type Cobertura } from '@/lib/cobertura'
import { clasificar, type EstadoBandera, type FilaLista } from './vista'

const SELECT = `
  id, estado, sedes_adicionales, precio_base_mensual, precio_sede_adicional,
  descuento_pct, estado_implementacion, fecha_inicio,
  periodo_actual_inicio, periodo_actual_fin,
  organizacion_externa_id,
  clientes!inner ( id, nombre_comercial, es_prueba ),
  productos!inner ( codigo, nombre, url_aplicar_estado ),
  planes!inner ( codigo, nombre ),
  terminos!inner ( codigo, meses )
`

function derivarBandera(
  s: SuscripcionLista,
  confirmada: UltimaConfirmada | undefined,
  pendientes: Bandera[],
): EstadoBandera {
  if (!s.organizacion_externa_id || !s.productos.url_aplicar_estado) {
    return { clase: 'sin_puente', sinConfirmar: 0 }
  }

  if (!confirmada) {
    return {
      clase: 'nunca',
      sinConfirmar: pendientes.length,
      ultimoCodigo: pendientes[0]?.bandera_error_codigo,
    }
  }

  return {
    clase: 'confirmada',
    nivel: confirmada.valor_deseado,
    desde: confirmada.confirmado_en,
    cambioEfectivo: confirmada.cambio_efectivo,
    sinConfirmar: pendientes.length,
    ultimoCodigo: pendientes[0]?.bandera_error_codigo,
  }
}

export function useSuscripciones() {
  return useQuery({
    // Sin `mostrarPrueba` en la clave: el interruptor es de presentación, no
    // de datos. Alternarlo no vuelve a pedir nada.
    queryKey: ['suscripciones'],
    queryFn: async (): Promise<FilaLista[]> => {
      const [suscripciones, confirmadas, coberturas, pendientes] = await Promise.all([
        supabase.from('suscripciones').select(SELECT),
        supabase.from('bandera_ultima_confirmada').select('*'),
        supabase.from('suscripcion_cobertura').select('*'),
        supabase
          .from('banderas_pendientes')
          .select('*')
          .is('confirmado_en', null)
          .order('creado_en', { ascending: false }),
      ])

      if (suscripciones.error) throw suscripciones.error
      if (confirmadas.error) throw confirmadas.error
      if (coberturas.error) throw coberturas.error
      if (pendientes.error) throw pendientes.error

      const filas = suscripcionListaSchema.array().parse(suscripciones.data)
      const ultimas = ultimaConfirmadaSchema.array().parse(confirmadas.data)
      const sinConfirmar = banderaSchema.array().parse(pendientes.data)

      const cobs = coberturaSchema.array().parse(coberturas.data)
      const porSuscripcion = new Map(ultimas.map((u) => [u.suscripcion_id, u]))
      const porCobertura = new Map<string, Cobertura>(cobs.map((c) => [c.suscripcion_id, c]))
      const hoy = hoyISO()

      return filas
        .map((s): FilaLista => {
          const tarifa = {
            precio_base_mensual: s.precio_base_mensual,
            precio_sede_adicional: s.precio_sede_adicional,
            sedes_adicionales: s.sedes_adicionales,
            descuento_pct: s.descuento_pct,
            termino_meses: s.terminos.meses,
          }
          const mensual = mensualEfectivo(tarifa)
          const cobertura = porCobertura.get(s.id) ?? SIN_COBERTURA
          const sugerencia = nivelSugerido(s.estado, cobertura.proximo_cobro, hoy)
          const bandera = derivarBandera(
            s,
            porSuscripcion.get(s.id),
            sinConfirmar.filter((b) => b.suscripcion_id === s.id),
          )

          return {
            suscripcion: s,
            proximo_cobro: cobertura.proximo_cobro,
            mensual,
            montoCiclo: mensual * s.terminos.meses,
            sugerencia,
            bandera,
            cobertura,
            atencion: clasificar(sugerencia.nivel, bandera, s.estado, cobertura, hoy, {
              estado: s.estado_implementacion,
              fecha_inicio: s.fecha_inicio,
            }),
          }
        })
        .sort((a, b) =>
          a.suscripcion.clientes.nombre_comercial.localeCompare(
            b.suscripcion.clientes.nombre_comercial,
            'es',
          ),
        )
    },
    // La tabla no desaparece mientras se refresca: sin esto, cualquier
    // invalidación deja la pantalla en blanco un instante y el operador
    // pierde de vista la fila que estaba mirando.
    placeholderData: (anterior) => anterior,
  })
}
