/**
 * La consulta de la lista, más la derivación de las DOS columnas de §5.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ LA EXCLUSIÓN DE LAB ACÁ ES UN FILTRO Y NO LA VISTA `*_cobrables`
 *
 * §3 dice que la exclusión de los tenants de prueba va por vistas, para que
 * sea el default y no algo que cada consulta tenga que acordarse de escribir.
 * Eso vale para lo que SUMA PLATA: un total de cobranza inflado con datos de
 * prueba falla del lado silencioso.
 *
 * Esta pantalla no suma nada: lista. Y necesita poder MOSTRAR LAB cuando el
 * interruptor está encendido, cosa que una vista que lo excluye no permite.
 * Acá la exclusión es visible en la UI —hay un interruptor apagado— en vez de
 * estar olvidada en un WHERE, que era el modo de fallo que preocupaba.
 *
 * La regla queda así: **lo que suma plata lee `*_cobrables`; lo que lista
 * filtra explícito y muestra el interruptor.**
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
  type Bandera,
  type SuscripcionLista,
} from './schemas'
import { clasificar, type EstadoBandera, type FilaLista } from './vista'

const SELECT = `
  id, estado, sedes_adicionales, precio_base_mensual, precio_sede_adicional,
  descuento_pct, proximo_cobro, periodo_actual_inicio, periodo_actual_fin,
  organizacion_externa_id,
  clientes!inner ( id, nombre_comercial, es_prueba ),
  productos!inner ( codigo, nombre, url_aplicar_estado ),
  planes!inner ( codigo, nombre ),
  terminos!inner ( codigo, meses )
`

function derivarBandera(s: SuscripcionLista, propias: Bandera[]): EstadoBandera {
  if (!s.organizacion_externa_id || !s.productos.url_aplicar_estado) {
    return { clase: 'sin_puente', sinConfirmar: 0 }
  }

  // `propias` viene ordenada de más nueva a más vieja.
  const confirmada = propias.find((b) => b.confirmado_en !== null)
  const sinConfirmar = propias.filter((b) => b.confirmado_en === null)

  if (!confirmada) {
    return {
      clase: 'nunca',
      sinConfirmar: sinConfirmar.length,
      ultimoCodigo: sinConfirmar[0]?.bandera_error_codigo,
    }
  }

  return {
    clase: 'confirmada',
    nivel: confirmada.valor_deseado,
    desde: confirmada.confirmado_en ?? undefined,
    cambioEfectivo: confirmada.cambio_efectivo,
    sinConfirmar: sinConfirmar.length,
    ultimoCodigo: sinConfirmar[0]?.bandera_error_codigo,
  }
}

export function useSuscripciones(mostrarPrueba: boolean) {
  return useQuery({
    queryKey: ['suscripciones', mostrarPrueba],
    queryFn: async (): Promise<FilaLista[]> => {
      let consulta = supabase.from('suscripciones').select(SELECT)
      if (!mostrarPrueba) {
        // El filtro va sobre el embed `!inner`, así que descarta la fila
        // entera y no solo el objeto anidado.
        consulta = consulta.eq('clientes.es_prueba', false)
      }

      const [suscripciones, banderas] = await Promise.all([
        consulta,
        supabase
          .from('banderas_pendientes')
          .select('*')
          .order('creado_en', { ascending: false }),
      ])

      if (suscripciones.error) throw suscripciones.error
      if (banderas.error) throw banderas.error

      const filas = suscripcionListaSchema.array().parse(suscripciones.data)
      const todasLasBanderas = banderaSchema.array().parse(banderas.data)

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
          const sugerencia = nivelSugerido(s.estado, s.proximo_cobro, hoy)
          const bandera = derivarBandera(
            s,
            todasLasBanderas.filter((b) => b.suscripcion_id === s.id),
          )

          return {
            suscripcion: s,
            mensual,
            montoCiclo: mensual * s.terminos.meses,
            sugerencia,
            bandera,
            atencion: clasificar(sugerencia.nivel, bandera),
          }
        })
        .sort((a, b) =>
          a.suscripcion.clientes.nombre_comercial.localeCompare(
            b.suscripcion.clientes.nombre_comercial,
            'es',
          ),
        )
    },
  })
}
