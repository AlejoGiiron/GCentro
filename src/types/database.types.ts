/**
 * Tipos hechos a mano contra §3 de docs/g-centro-diseno-v1.md.
 *
 * TODO(bloque futuro): regenerar con `supabase gen types typescript` en
 * cuanto el proyecto esté enlazado (`supabase link`). Hasta entonces, este
 * archivo puede desincronizarse de la base real — ver nota en el reporte del
 * Bloque 1.
 */
export interface Database {
  public: {
    Tables: {
      admins: {
        Row: {
          id: string
          email: string
          creado_en: string
        }
        Insert: {
          id: string
          email: string
          creado_en?: string
        }
        Update: {
          id?: string
          email?: string
          creado_en?: string
        }
      }
      productos: {
        Row: {
          id: string
          codigo: string
          nombre: string
          url_aplicar_estado: string | null
          activo: boolean
          creado_en: string
        }
        Insert: {
          id?: string
          codigo: string
          nombre: string
          url_aplicar_estado?: string | null
          activo?: boolean
          creado_en?: string
        }
        Update: {
          id?: string
          codigo?: string
          nombre?: string
          url_aplicar_estado?: string | null
          activo?: boolean
          creado_en?: string
        }
      }
      terminos: {
        Row: {
          codigo: string
          meses: number
          descuento_pct: number
        }
        Insert: {
          codigo: string
          meses: number
          descuento_pct: number
        }
        Update: {
          codigo?: string
          meses?: number
          descuento_pct?: number
        }
      }
      planes: {
        Row: {
          id: string
          producto_id: string
          codigo: string
          nombre: string
          precio_mensual: number
          precio_sede_adicional: number
          incluye_dian: boolean
          vigente_desde: string
          activo: boolean
        }
        Insert: {
          id?: string
          producto_id: string
          codigo: string
          nombre: string
          precio_mensual: number
          precio_sede_adicional: number
          incluye_dian?: boolean
          vigente_desde: string
          activo?: boolean
        }
        Update: {
          id?: string
          producto_id?: string
          codigo?: string
          nombre?: string
          precio_mensual?: number
          precio_sede_adicional?: number
          incluye_dian?: boolean
          vigente_desde?: string
          activo?: boolean
        }
      }
    }
  }
}
