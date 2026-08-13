export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          creado_en: string
          email: string
          id: string
        }
        Insert: {
          creado_en?: string
          email: string
          id: string
        }
        Update: {
          creado_en?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      banderas_pendientes: {
        Row: {
          bandera_error_codigo: string | null
          confirmado_en: string | null
          creado_en: string
          id: string
          intentos: number
          suscripcion_id: string
          ultimo_error: string | null
          valor_deseado: string
        }
        Insert: {
          bandera_error_codigo?: string | null
          confirmado_en?: string | null
          creado_en?: string
          id?: string
          intentos?: number
          suscripcion_id: string
          ultimo_error?: string | null
          valor_deseado: string
        }
        Update: {
          bandera_error_codigo?: string | null
          confirmado_en?: string | null
          creado_en?: string
          id?: string
          intentos?: number
          suscripcion_id?: string
          ultimo_error?: string | null
          valor_deseado?: string
        }
        Relationships: [
          {
            foreignKeyName: "banderas_pendientes_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banderas_pendientes_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones_cobrables"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          creado_en: string
          es_prueba: boolean
          id: string
          nit: string | null
          nombre_comercial: string
          notas: string | null
          razon_social: string | null
        }
        Insert: {
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          creado_en?: string
          es_prueba?: boolean
          id?: string
          nit?: string | null
          nombre_comercial: string
          notas?: string | null
          razon_social?: string | null
        }
        Update: {
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          creado_en?: string
          es_prueba?: boolean
          id?: string
          nit?: string | null
          nombre_comercial?: string
          notas?: string | null
          razon_social?: string | null
        }
        Relationships: []
      }
      pagos: {
        Row: {
          cliente_id: string
          concepto: string
          cubre_desde: string | null
          cubre_hasta: string | null
          fecha_pago: string
          id: string
          iva_pct: number
          metodo: string | null
          monto: number
          monto_base: number
          nota: string | null
          referencia: string | null
          registrado_en: string
          suscripcion_id: string | null
        }
        Insert: {
          cliente_id: string
          concepto: string
          cubre_desde?: string | null
          cubre_hasta?: string | null
          fecha_pago: string
          id?: string
          iva_pct?: number
          metodo?: string | null
          monto: number
          monto_base: number
          nota?: string | null
          referencia?: string | null
          registrado_en?: string
          suscripcion_id?: string | null
        }
        Update: {
          cliente_id?: string
          concepto?: string
          cubre_desde?: string | null
          cubre_hasta?: string | null
          fecha_pago?: string
          id?: string
          iva_pct?: number
          metodo?: string | null
          monto?: number
          monto_base?: number
          nota?: string | null
          referencia?: string | null
          registrado_en?: string
          suscripcion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_cobrables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones_cobrables"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          activo: boolean
          codigo: string
          id: string
          incluye_dian: boolean
          nombre: string
          precio_mensual: number
          precio_sede_adicional: number
          producto_id: string
          vigente_desde: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          id?: string
          incluye_dian?: boolean
          nombre: string
          precio_mensual: number
          precio_sede_adicional: number
          producto_id: string
          vigente_desde: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          id?: string
          incluye_dian?: boolean
          nombre?: string
          precio_mensual?: number
          precio_sede_adicional?: number
          producto_id?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "planes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          id: string
          nombre: string
          url_aplicar_estado: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          id?: string
          nombre: string
          url_aplicar_estado?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          id?: string
          nombre?: string
          url_aplicar_estado?: string | null
        }
        Relationships: []
      }
      suscripcion_eventos: {
        Row: {
          creado_en: string
          datos: Json | null
          efectivo_desde: string | null
          estado_anterior: string | null
          estado_nuevo: string | null
          id: string
          motivo: string | null
          suscripcion_id: string
          tipo: string
        }
        Insert: {
          creado_en?: string
          datos?: Json | null
          efectivo_desde?: string | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          motivo?: string | null
          suscripcion_id: string
          tipo: string
        }
        Update: {
          creado_en?: string
          datos?: Json | null
          efectivo_desde?: string | null
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          motivo?: string | null
          suscripcion_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "suscripcion_eventos_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripcion_eventos_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones_cobrables"
            referencedColumns: ["id"]
          },
        ]
      }
      suscripciones: {
        Row: {
          cliente_id: string
          creado_en: string
          descuento_pct: number
          estado: string
          estado_implementacion: string
          fecha_inicio: string
          id: string
          monto_implementacion: number
          organizacion_externa_id: string | null
          periodo_actual_fin: string
          periodo_actual_inicio: string
          plan_id: string
          precio_base_mensual: number
          precio_sede_adicional: number
          producto_id: string
          proximo_cobro: string
          sedes_adicionales: number
          termino: string
        }
        Insert: {
          cliente_id: string
          creado_en?: string
          descuento_pct?: number
          estado?: string
          estado_implementacion?: string
          fecha_inicio: string
          id?: string
          monto_implementacion: number
          organizacion_externa_id?: string | null
          periodo_actual_fin: string
          periodo_actual_inicio: string
          plan_id: string
          precio_base_mensual: number
          precio_sede_adicional: number
          producto_id: string
          proximo_cobro: string
          sedes_adicionales?: number
          termino: string
        }
        Update: {
          cliente_id?: string
          creado_en?: string
          descuento_pct?: number
          estado?: string
          estado_implementacion?: string
          fecha_inicio?: string
          id?: string
          monto_implementacion?: number
          organizacion_externa_id?: string | null
          periodo_actual_fin?: string
          periodo_actual_inicio?: string
          plan_id?: string
          precio_base_mensual?: number
          precio_sede_adicional?: number
          producto_id?: string
          proximo_cobro?: string
          sedes_adicionales?: number
          termino?: string
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_cobrables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_termino_fkey"
            columns: ["termino"]
            isOneToOne: false
            referencedRelation: "terminos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      terminos: {
        Row: {
          codigo: string
          descuento_pct: number
          meses: number
        }
        Insert: {
          codigo: string
          descuento_pct: number
          meses: number
        }
        Update: {
          codigo?: string
          descuento_pct?: number
          meses?: number
        }
        Relationships: []
      }
    }
    Views: {
      clientes_cobrables: {
        Row: {
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          creado_en: string | null
          es_prueba: boolean | null
          id: string | null
          nit: string | null
          nombre_comercial: string | null
          notas: string | null
          razon_social: string | null
        }
        Insert: {
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          creado_en?: string | null
          es_prueba?: boolean | null
          id?: string | null
          nit?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          razon_social?: string | null
        }
        Update: {
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          creado_en?: string | null
          es_prueba?: boolean | null
          id?: string | null
          nit?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          razon_social?: string | null
        }
        Relationships: []
      }
      suscripciones_cobrables: {
        Row: {
          cliente_id: string | null
          creado_en: string | null
          descuento_pct: number | null
          estado: string | null
          estado_implementacion: string | null
          fecha_inicio: string | null
          id: string | null
          monto_implementacion: number | null
          organizacion_externa_id: string | null
          periodo_actual_fin: string | null
          periodo_actual_inicio: string | null
          plan_id: string | null
          precio_base_mensual: number | null
          precio_sede_adicional: number | null
          producto_id: string | null
          proximo_cobro: string | null
          sedes_adicionales: number | null
          termino: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_cobrables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_termino_fkey"
            columns: ["termino"]
            isOneToOne: false
            referencedRelation: "terminos"
            referencedColumns: ["codigo"]
          },
        ]
      }
    }
    Functions: {
      es_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
