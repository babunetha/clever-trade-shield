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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      broker_orders: {
        Row: {
          average_price: number | null
          broker_order_id: string
          correlation_id: string | null
          filled_quantity: number
          first_seen_at: string
          id: string
          last_seen_at: string
          order_intent_id: string | null
          quantity: number | null
          raw_payload: Json
          status: string
          symbol: string | null
          transaction_type: string | null
        }
        Insert: {
          average_price?: number | null
          broker_order_id: string
          correlation_id?: string | null
          filled_quantity?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          order_intent_id?: string | null
          quantity?: number | null
          raw_payload?: Json
          status: string
          symbol?: string | null
          transaction_type?: string | null
        }
        Update: {
          average_price?: number | null
          broker_order_id?: string
          correlation_id?: string | null
          filled_quantity?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          order_intent_id?: string | null
          quantity?: number | null
          raw_payload?: Json
          status?: string
          symbol?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_orders_order_intent_id_fkey"
            columns: ["order_intent_id"]
            isOneToOne: false
            referencedRelation: "order_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_postbacks: {
        Row: {
          broker_order_id: string | null
          correlation_id: string | null
          event_key: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
        }
        Insert: {
          broker_order_id?: string | null
          correlation_id?: string | null
          event_key: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          broker_order_id?: string | null
          correlation_id?: string | null
          event_key?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      broker_trades: {
        Row: {
          broker_order_id: string | null
          broker_trade_id: string
          created_at: string
          id: string
          order_intent_id: string | null
          price: number
          quantity: number
          raw_payload: Json
          symbol: string
          trade_time: string | null
          transaction_type: string
        }
        Insert: {
          broker_order_id?: string | null
          broker_trade_id: string
          created_at?: string
          id?: string
          order_intent_id?: string | null
          price: number
          quantity: number
          raw_payload?: Json
          symbol: string
          trade_time?: string | null
          transaction_type: string
        }
        Update: {
          broker_order_id?: string | null
          broker_trade_id?: string
          created_at?: string
          id?: string
          order_intent_id?: string | null
          price?: number
          quantity?: number
          raw_payload?: Json
          symbol?: string
          trade_time?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_trades_order_intent_id_fkey"
            columns: ["order_intent_id"]
            isOneToOne: false
            referencedRelation: "order_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      order_intents: {
        Row: {
          broker_correlation_id: string | null
          broker_order_id: string | null
          created_at: string
          declared_risk: number
          entry_price: number
          exchange_segment: string
          id: string
          idempotency_key: string
          order_type: string
          price: number | null
          product_type: string
          quantity: number
          signal_id: string
          status: string
          stop_loss: number
          symbol: string
          transaction_type: string
          trigger_price: number | null
          updated_at: string
        }
        Insert: {
          broker_correlation_id?: string | null
          broker_order_id?: string | null
          created_at?: string
          declared_risk: number
          entry_price: number
          exchange_segment?: string
          id?: string
          idempotency_key: string
          order_type: string
          price?: number | null
          product_type?: string
          quantity: number
          signal_id: string
          status?: string
          stop_loss: number
          symbol: string
          transaction_type: string
          trigger_price?: number | null
          updated_at?: string
        }
        Update: {
          broker_correlation_id?: string | null
          broker_order_id?: string | null
          created_at?: string
          declared_risk?: number
          entry_price?: number
          exchange_segment?: string
          id?: string
          idempotency_key?: string
          order_type?: string
          price?: number | null
          product_type?: string
          quantity?: number
          signal_id?: string
          status?: string
          stop_loss?: number
          symbol?: string
          transaction_type?: string
          trigger_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          id: string
          idempotency_key: string | null
          reason: string
          severity: string
          signal_id: string | null
          symbol: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          idempotency_key?: string | null
          reason: string
          severity: string
          signal_id?: string | null
          symbol?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          idempotency_key?: string | null
          reason?: string
          severity?: string
          signal_id?: string | null
          symbol?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
