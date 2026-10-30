export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      agent_versions: {
        Row: {
          agent_id: string;
          base_prompt: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          version: number;
        };
        Insert: {
          agent_id: string;
          base_prompt: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          version: number;
        };
        Update: {
          agent_id?: string;
          base_prompt?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          version?: number;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          allowed_plan_ids: string[];
          created_at: string;
          current_version: number;
          deleted_at: string | null;
          id: string;
          image_url: string | null;
          name: string;
          public_description: string;
          purpose: string;
          settings: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          allowed_plan_ids?: string[];
          created_at?: string;
          current_version?: number;
          deleted_at?: string | null;
          id?: string;
          image_url?: string | null;
          name: string;
          public_description?: string;
          purpose: string;
          settings?: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          allowed_plan_ids?: string[];
          created_at?: string;
          current_version?: number;
          deleted_at?: string | null;
          id?: string;
          image_url?: string | null;
          name?: string;
          public_description?: string;
          purpose?: string;
          settings?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_branding: {
        Row: {
          display_name: string;
          favicon_url: string | null;
          id: boolean;
          logo_url: string | null;
          updated_at: string;
        };
        Insert: {
          display_name?: string;
          favicon_url?: string | null;
          id?: boolean;
          logo_url?: string | null;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          favicon_url?: string | null;
          id?: boolean;
          logo_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          ai_defaults: Json;
          ai_models: Json;
          id: boolean;
          stripe_mode: string;
          trial_credits: number;
          trial_duration_minutes: number;
          trial_enabled: boolean;
          trial_features: string[];
          trial_models: string[];
          updated_at: string;
        };
        Insert: {
          ai_defaults?: Json;
          ai_models?: Json;
          id?: boolean;
          stripe_mode?: string;
          trial_credits?: number;
          trial_duration_minutes?: number;
          trial_enabled?: boolean;
          trial_features?: string[];
          trial_models?: string[];
          updated_at?: string;
        };
        Update: {
          ai_defaults?: Json;
          ai_models?: Json;
          id?: boolean;
          stripe_mode?: string;
          trial_credits?: number;
          trial_duration_minutes?: number;
          trial_enabled?: boolean;
          trial_features?: string[];
          trial_models?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          filename: string;
          id: string;
          kind: string;
          mime: string;
          operation_id: string | null;
          operation_item_id: string | null;
          parent_asset_id: string | null;
          project_id: string | null;
          purged_at: string | null;
          role: string | null;
          size_bytes: number;
          storage_path: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          filename: string;
          id?: string;
          kind: string;
          mime: string;
          operation_id?: string | null;
          operation_item_id?: string | null;
          parent_asset_id?: string | null;
          project_id?: string | null;
          purged_at?: string | null;
          role?: string | null;
          size_bytes: number;
          storage_path: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          filename?: string;
          id?: string;
          kind?: string;
          mime?: string;
          operation_id?: string | null;
          operation_item_id?: string | null;
          parent_asset_id?: string | null;
          project_id?: string | null;
          purged_at?: string | null;
          role?: string | null;
          size_bytes?: number;
          storage_path?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          id: string;
          reason: string | null;
          result: string;
          target_id: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          reason?: string | null;
          result?: string;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          reason?: string | null;
          result?: string;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [];
      };
      credit_buckets: {
        Row: {
          created_at: string;
          expires_at: string | null;
          grant_key: string;
          granted: number;
          id: string;
          invoice_id: string | null;
          remaining: number;
          source: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          grant_key: string;
          granted: number;
          id?: string;
          invoice_id?: string | null;
          remaining: number;
          source: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          grant_key?: string;
          granted?: number;
          id?: string;
          invoice_id?: string | null;
          remaining?: number;
          source?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          actor_id: string | null;
          bucket_id: string | null;
          created_at: string;
          delta: number;
          id: string;
          invoice_id: string | null;
          kind: string;
          operation_item_id: string | null;
          reason: string | null;
          reservation_id: string | null;
          source: string | null;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          bucket_id?: string | null;
          created_at?: string;
          delta: number;
          id?: string;
          invoice_id?: string | null;
          kind: string;
          operation_item_id?: string | null;
          reason?: string | null;
          reservation_id?: string | null;
          source?: string | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          bucket_id?: string | null;
          created_at?: string;
          delta?: number;
          id?: string;
          invoice_id?: string | null;
          kind?: string;
          operation_item_id?: string | null;
          reason?: string | null;
          reservation_id?: string | null;
          source?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      credit_reservations: {
        Row: {
          allocations: Json;
          amount: number;
          created_at: string;
          id: string;
          operation_item_id: string;
          settled_at: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          allocations?: Json;
          amount: number;
          created_at?: string;
          id?: string;
          operation_item_id: string;
          settled_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          allocations?: Json;
          amount?: number;
          created_at?: string;
          id?: string;
          operation_item_id?: string;
          settled_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          amount_due: number;
          amount_paid: number;
          amount_refunded: number;
          billing_reason: string | null;
          created_at: string;
          currency: string;
          disputed: boolean;
          hosted_invoice_url: string | null;
          id: string;
          mode: string;
          paid_at: string | null;
          period_end: string | null;
          period_start: string | null;
          plan_id: string | null;
          status: string;
          stripe_customer_id: string | null;
          stripe_invoice_id: string;
          stripe_price_id: string | null;
          stripe_subscription_id: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          amount_due?: number;
          amount_paid?: number;
          amount_refunded?: number;
          billing_reason?: string | null;
          created_at?: string;
          currency?: string;
          disputed?: boolean;
          hosted_invoice_url?: string | null;
          id?: string;
          mode: string;
          paid_at?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          plan_id?: string | null;
          status: string;
          stripe_customer_id?: string | null;
          stripe_invoice_id: string;
          stripe_price_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          amount_due?: number;
          amount_paid?: number;
          amount_refunded?: number;
          billing_reason?: string | null;
          created_at?: string;
          currency?: string;
          disputed?: boolean;
          hosted_invoice_url?: string | null;
          id?: string;
          mode?: string;
          paid_at?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          plan_id?: string | null;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_invoice_id?: string;
          stripe_price_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      operation_items: {
        Row: {
          ai_returned_at: string | null;
          asset_id: string | null;
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          idx: number;
          operation_id: string;
          reservation_id: string | null;
          source_asset_id: string | null;
          started_at: string | null;
          status: string;
          storage_attempts: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ai_returned_at?: string | null;
          asset_id?: string | null;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          idx: number;
          operation_id: string;
          reservation_id?: string | null;
          source_asset_id?: string | null;
          started_at?: string | null;
          status?: string;
          storage_attempts?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ai_returned_at?: string | null;
          asset_id?: string | null;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          idx?: number;
          operation_id?: string;
          reservation_id?: string | null;
          source_asset_id?: string | null;
          started_at?: string | null;
          status?: string;
          storage_attempts?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operation_items_operation_id_fkey";
            columns: ["operation_id"];
            isOneToOne: false;
            referencedRelation: "operations";
            referencedColumns: ["id"];
          },
        ];
      };
      operations: {
        Row: {
          agent_id: string | null;
          agent_name: string | null;
          agent_version: number | null;
          agent_version_id: string | null;
          charged: boolean;
          created_at: string;
          credits_per_item: number;
          error: string | null;
          id: string;
          idempotency_key: string;
          input_asset_ids: string[];
          model: string | null;
          params: Json;
          project_id: string | null;
          requested_count: number;
          status: string;
          type: string;
          updated_at: string;
          user_id: string;
          user_instructions: string;
        };
        Insert: {
          agent_id?: string | null;
          agent_name?: string | null;
          agent_version?: number | null;
          agent_version_id?: string | null;
          charged?: boolean;
          created_at?: string;
          credits_per_item?: number;
          error?: string | null;
          id?: string;
          idempotency_key: string;
          input_asset_ids?: string[];
          model?: string | null;
          params?: Json;
          project_id?: string | null;
          requested_count?: number;
          status?: string;
          type: string;
          updated_at?: string;
          user_id: string;
          user_instructions?: string;
        };
        Update: {
          agent_id?: string | null;
          agent_name?: string | null;
          agent_version?: number | null;
          agent_version_id?: string | null;
          charged?: boolean;
          created_at?: string;
          credits_per_item?: number;
          error?: string | null;
          id?: string;
          idempotency_key?: string;
          input_asset_ids?: string[];
          model?: string | null;
          params?: Json;
          project_id?: string | null;
          requested_count?: number;
          status?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
          user_instructions?: string;
        };
        Relationships: [];
      };
      plan_prices: {
        Row: {
          active: boolean;
          amount_cents: number;
          billing_interval: string;
          created_at: string;
          currency: string;
          id: string;
          mode: string;
          plan_id: string;
          stripe_price_id: string;
          stripe_product_id: string;
        };
        Insert: {
          active?: boolean;
          amount_cents: number;
          billing_interval: string;
          created_at?: string;
          currency: string;
          id?: string;
          mode: string;
          plan_id: string;
          stripe_price_id: string;
          stripe_product_id: string;
        };
        Update: {
          active?: boolean;
          amount_cents?: number;
          billing_interval?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          mode?: string;
          plan_id?: string;
          stripe_price_id?: string;
          stripe_product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_prices_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          allowed_features: string[];
          allowed_models: string[];
          billing_interval: string;
          created_at: string;
          credits_per_cycle: number;
          currency: string;
          description: string;
          highlight: boolean;
          id: string;
          max_batch: number;
          name: string;
          price_cents: number | null;
          sort_order: number;
          status: string;
          stripe_price_id_live: string | null;
          stripe_price_id_test: string | null;
          stripe_product_id_live: string | null;
          stripe_product_id_test: string | null;
          trial_override: Json | null;
          updated_at: string;
        };
        Insert: {
          allowed_features?: string[];
          allowed_models?: string[];
          billing_interval?: string;
          created_at?: string;
          credits_per_cycle?: number;
          currency?: string;
          description?: string;
          highlight?: boolean;
          id?: string;
          max_batch?: number;
          name: string;
          price_cents?: number | null;
          sort_order?: number;
          status?: string;
          stripe_price_id_live?: string | null;
          stripe_price_id_test?: string | null;
          stripe_product_id_live?: string | null;
          stripe_product_id_test?: string | null;
          trial_override?: Json | null;
          updated_at?: string;
        };
        Update: {
          allowed_features?: string[];
          allowed_models?: string[];
          billing_interval?: string;
          created_at?: string;
          credits_per_cycle?: number;
          currency?: string;
          description?: string;
          highlight?: boolean;
          id?: string;
          max_batch?: number;
          name?: string;
          price_cents?: number | null;
          sort_order?: number;
          status?: string;
          stripe_price_id_live?: string | null;
          stripe_price_id_test?: string | null;
          stripe_product_id_live?: string | null;
          stripe_product_id_test?: string | null;
          trial_override?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          block_reason: string | null;
          created_at: string;
          email: string;
          id: string;
          name: string;
          selected_plan_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          block_reason?: string | null;
          created_at?: string;
          email: string;
          id: string;
          name?: string;
          selected_plan_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          block_reason?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          selected_plan_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      stripe_credentials: {
        Row: {
          api_error: string | null;
          api_status: string;
          api_tested_at: string | null;
          mode: string;
          publishable_key: string | null;
          secret_key_enc: string | null;
          secret_key_hint: string | null;
          updated_at: string;
          updated_by: string | null;
          webhook_secret_enc: string | null;
          webhook_secret_hint: string | null;
          webhook_validated_at: string | null;
        };
        Insert: {
          api_error?: string | null;
          api_status?: string;
          api_tested_at?: string | null;
          mode: string;
          publishable_key?: string | null;
          secret_key_enc?: string | null;
          secret_key_hint?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          webhook_secret_enc?: string | null;
          webhook_secret_hint?: string | null;
          webhook_validated_at?: string | null;
        };
        Update: {
          api_error?: string | null;
          api_status?: string;
          api_tested_at?: string | null;
          mode?: string;
          publishable_key?: string | null;
          secret_key_enc?: string | null;
          secret_key_hint?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          webhook_secret_enc?: string | null;
          webhook_secret_hint?: string | null;
          webhook_validated_at?: string | null;
        };
        Relationships: [];
      };
      stripe_customers: {
        Row: {
          created_at: string;
          id: string;
          mode: string;
          stripe_customer_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mode: string;
          stripe_customer_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mode?: string;
          stripe_customer_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      stripe_events: {
        Row: {
          error: string | null;
          id: string;
          mode: string;
          processed_at: string | null;
          received_at: string;
          status: string;
          type: string;
        };
        Insert: {
          error?: string | null;
          id: string;
          mode: string;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
          type: string;
        };
        Update: {
          error?: string | null;
          id?: string;
          mode?: string;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
          type?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          access_state: string;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          credited_amount: number;
          credited_period_start: string | null;
          current_period_end: string | null;
          current_period_start: string | null;
          ended_at: string | null;
          id: string;
          last_stripe_event_at: string | null;
          mode: string;
          paid_through: string | null;
          plan_id: string | null;
          stripe_customer_id: string;
          stripe_price_id: string | null;
          stripe_status: string;
          stripe_subscription_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_state?: string;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          credited_amount?: number;
          credited_period_start?: string | null;
          current_period_end?: string | null;
          current_period_start?: string | null;
          ended_at?: string | null;
          id?: string;
          last_stripe_event_at?: string | null;
          mode: string;
          paid_through?: string | null;
          plan_id?: string | null;
          stripe_customer_id: string;
          stripe_price_id?: string | null;
          stripe_status: string;
          stripe_subscription_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_state?: string;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          credited_amount?: number;
          credited_period_start?: string | null;
          current_period_end?: string | null;
          current_period_start?: string | null;
          ended_at?: string | null;
          id?: string;
          last_stripe_event_at?: string | null;
          mode?: string;
          paid_through?: string | null;
          plan_id?: string | null;
          stripe_customer_id?: string;
          stripe_price_id?: string | null;
          stripe_status?: string;
          stripe_subscription_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      trials: {
        Row: {
          created_at: string;
          credits_granted: number;
          ends_at: string;
          plan_id: string | null;
          snapshot: Json;
          started_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credits_granted?: number;
          ends_at: string;
          plan_id?: string | null;
          snapshot: Json;
          started_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credits_granted?: number;
          ends_at?: string;
          plan_id?: string | null;
          snapshot?: Json;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _lock_user: { Args: { _uid: string }; Returns: undefined };
      access_state: { Args: { _uid: string }; Returns: Json };
      admin_adjust_credits: {
        Args: {
          _actor: string;
          _delta: number;
          _key: string;
          _reason: string;
          _uid: string;
        };
        Returns: Json;
      };
      apply_invoice_credits: {
        Args: {
          _billing_reason: string;
          _invoice: string;
          _period_end: string;
          _period_start: string;
          _plan_credits: number;
          _sub: string;
        };
        Returns: string;
      };
      consume_reservation: { Args: { _res: string }; Returns: boolean };
      credit_balance: {
        Args: { _uid: string };
        Returns: {
          available: number;
          reserved: number;
        }[];
      };
      expire_bucket_sources: {
        Args: { _reason: string; _sources: string[]; _uid: string };
        Returns: undefined;
      };
      grant_credits: {
        Args: {
          _actor?: string;
          _amount: number;
          _expires_at: string;
          _grant_key: string;
          _invoice?: string;
          _reason: string;
          _source: string;
          _uid: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      my_access: { Args: never; Returns: Json };
      promote_to_admin: { Args: { _email: string }; Returns: string };
      reconcile_stale_operations: { Args: never; Returns: undefined };
      release_reservation: {
        Args: { _reason: string; _res: string };
        Returns: boolean;
      };
      reserve_operation_credits: { Args: { _op: string }; Returns: undefined };
      start_trial: { Args: { _uid: string }; Returns: undefined };
      sweep_expired_credits: { Args: { _uid: string }; Returns: undefined };
    };
    Enums: {
      app_role: "admin" | "subscriber";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "subscriber"],
    },
  },
} as const;
