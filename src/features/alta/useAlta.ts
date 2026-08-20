/**
 * El catálogo y la firma.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FIRMA VA POR LA RPC `crear_suscripcion` (016), NO POR UN INSERT.
 *
 * Tres cosas que un insert directo desde acá no daría:
 *
 *   · El `motivo` del precio pactado. Viaja por un GUC de transacción que
 *     sólo una función puede setear, y el trigger de `CREADA` lo lee.
 *   · Un id ELEGIDO ACÁ. Un doble clic —o un reintento después de un timeout
 *     que en realidad había funcionado— choca contra la PK en vez de firmar
 *     dos contratos idénticos que nada distinguiría.
 *   · El evento de nacimiento con la foto de lo congelado, que igual lo
 *     garantiza el trigger, pero acá se apoya en él en vez de armarlo.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { implementacionAlFirmar } from '@/lib/cobro'
import { periodoFin } from './derivar'
import {
  clienteOpcionSchema,
  planSchema,
  productoSchema,
  terminoSchema,
  type FormularioAlta,
  type Termino,
} from './schemas'

export interface Catalogo {
  productos: ReturnType<typeof productoSchema.parse>[]
  planes: ReturnType<typeof planSchema.parse>[]
  terminos: Termino[]
  clientes: ReturnType<typeof clienteOpcionSchema.parse>[]
}

export function useCatalogo() {
  return useQuery({
    queryKey: ['catalogo'],
    queryFn: async (): Promise<Catalogo> => {
      const [productos, planes, terminos, clientes] = await Promise.all([
        // Sólo los activos: hoy `g-vento` es el único, y ofrecer `g-mura` o
        // `g-quota` sería ofrecer firmar un contrato de algo que no existe.
        supabase.from('productos').select('id, codigo, nombre').eq('activo', true),
        supabase
          .from('planes')
          .select('id, producto_id, codigo, nombre, precio_mensual, precio_sede_adicional')
          .eq('activo', true),
        supabase.from('terminos').select('codigo, meses, descuento_pct').order('meses'),
        supabase.from('clientes').select('id, nombre_comercial, es_prueba').order('nombre_comercial'),
      ])
      for (const r of [productos, planes, terminos, clientes]) {
        if (r.error) throw r.error
      }
      return {
        productos: productoSchema.array().parse(productos.data),
        planes: planSchema.array().parse(planes.data),
        terminos: terminoSchema.array().parse(terminos.data),
        clientes: clienteOpcionSchema.array().parse(clientes.data),
      }
    },
    // El catálogo casi no cambia y se consulta en cada apertura del alta.
    staleTime: 5 * 60 * 1000,
  })
}

export interface Firma {
  form: FormularioAlta
  /** Meses del término elegido. Sale del catálogo, no de una constante. */
  termino_meses: number
  /**
   * El id del contrato, decidido ANTES de llamar. Se genera una vez por
   * intento de firma y se reusa si el operador reintenta: eso es lo que
   * convierte un doble clic en un choque de PK y no en un segundo contrato.
   */
  id: string
}

export function useFirmar() {
  const qc = useQueryClient()
  return useMutation({
    meta: { area: 'clientes' },
    mutationKey: ['firmar-suscripcion'],
    mutationFn: async ({ form, termino_meses, id }: Firma): Promise<string> => {
      // ⚠️ EL CLIENTE PRIMERO Y EN SU PROPIA LLAMADA. Si la suscripción falla
      // después, queda un cliente sin contrato: visible, inofensivo y
      // reutilizable en el siguiente intento. Al revés no se puede —la
      // suscripción necesita el `cliente_id`— y meter las dos en una RPC
      // pediría pasar el cliente nuevo como parámetros sueltos de algo que se
      // llama "crear suscripción".
      let clienteId = form.cliente_id
      if (clienteId === null) {
        const { data, error } = await supabase
          .from('clientes')
          .insert({
            nombre_comercial: form.cliente_nuevo.trim(),
            // Va en el INSERT y no en un UPDATE posterior: si dependiera de
            // que alguien se acuerde de correrlo, no sería una garantía. Un
            // cliente de laboratorio creado sin esto entra a las vistas de
            // cobranza mezclado con los que pagan.
            es_prueba: form.cliente_nuevo_es_prueba,
          })
          .select('id')
          .single()
        if (error) throw error
        clienteId = data.id
      }

      const { error } = await supabase.rpc('crear_suscripcion', {
        p_id: id,
        p_cliente_id: clienteId,
        p_producto_id: form.producto_id,
        p_plan_id: form.plan_id,
        p_termino: form.termino,
        p_sedes_adicionales: form.sedes_adicionales,
        p_precio_base_mensual: form.precio_base_mensual,
        p_precio_sede_adicional: form.precio_sede_adicional,
        p_descuento_pct: form.descuento_pct,
        p_monto_implementacion: form.monto_implementacion,
        p_fecha_inicio: form.fecha_inicio,
        // Derivados, no preguntados. Se muestran en la confirmación antes de
        // llegar acá: un derivado que nadie vio se congela igual que un
        // tipeo.
        p_periodo_actual_fin: periodoFin(form.fecha_inicio, termino_meses),
        p_estado_implementacion: implementacionAlFirmar(termino_meses),
        p_motivo: form.motivo.trim() || undefined,
      })
      if (error) throw error

      return id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suscripciones'] })
      void qc.invalidateQueries({ queryKey: ['catalogo'] })
    },
  })
}
