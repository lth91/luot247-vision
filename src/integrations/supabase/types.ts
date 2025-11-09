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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      classification_history: {
        Row: {
          classified_at: string
          id: string
          news_id: string
          user_id: string
        }
        Insert: {
          classified_at?: string
          id?: string
          news_id: string
          user_id: string
        }
        Update: {
          classified_at?: string
          id?: string
          news_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_news"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_view_stats2: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          view_count: number
          view_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          view_count?: number
          view_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          view_count?: number
          view_date?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string | null
          id: string
          news_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          news_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          news_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news"
            referencedColumns: ["id"]
          },
        ]
      }
      import_history: {
        Row: {
          id: string
          imported_at: string
          news_count: number
          sheet_url: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          id?: string
          imported_at?: string
          news_count?: number
          sheet_url?: string | null
          user_email: string
          user_id: string
        }
        Update: {
          id?: string
          imported_at?: string
          news_count?: number
          sheet_url?: string | null
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          category: Database["public"]["Enums"]["news_category"] | null
          created_at: string | null
          description: string | null
          id: string
          is_approved: boolean | null
          title: string
          updated_at: string | null
          url: string | null
          view_count: number | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["news_category"] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_approved?: boolean | null
          title: string
          updated_at?: string | null
          url?: string | null
          view_count?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["news_category"] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_approved?: boolean | null
          title?: string
          updated_at?: string | null
          url?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      reset_history: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          month_reset: boolean | null
          reset_at: string
          status: string | null
          today_value_before_reset: number
          week_reset: boolean | null
          yesterday_value: number
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          month_reset?: boolean | null
          reset_at?: string
          status?: string | null
          today_value_before_reset: number
          week_reset?: boolean | null
          yesterday_value: number
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          month_reset?: boolean | null
          reset_at?: string
          status?: string | null
          today_value_before_reset?: number
          week_reset?: boolean | null
          yesterday_value?: number
        }
        Relationships: []
      }
      user_read_news: {
        Row: {
          id: string
          news_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          news_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          news_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_read_news_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      view_logs: {
        Row: {
          created_at: string
          id: string
          news_id: string | null
          viewed_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          news_id?: string | null
          viewed_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          news_id?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "view_logs_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news"
            referencedColumns: ["id"]
          },
        ]
      }
      view_logs2: {
        Row: {
          created_at: string | null
          id: string
          viewed_at: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          viewed_at?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      view_stats_base: {
        Row: {
          id: string
          stat_key: string
          stat_value: number
          updated_at: string | null
        }
        Insert: {
          id?: string
          stat_key: string
          stat_value?: number
          updated_at?: string | null
        }
        Update: {
          id?: string
          stat_key?: string
          stat_value?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      view_stats2: {
        Row: {
          created_at: string | null
          id: string
          last_reset_at: string | null
          stat_key: string
          stat_value: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_reset_at?: string | null
          stat_key: string
          stat_value?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_reset_at?: string | null
          stat_key?: string
          stat_value?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_view2_logs: { Args: { count: number }; Returns: undefined }
      backfill_current_stats_distributed: {
        Args: never
        Returns: {
          processed_date: string
          source: string
          view_count: number
        }[]
      }
      backfill_daily_view_stats: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          processed_date: string
          view_count: number
        }[]
      }
      call_daily_auto_views: { Args: never; Returns: undefined }
      get_current_stats: {
        Args: never
        Returns: {
          this_month: number
          this_week: number
          today: number
          total: number
          yesterday: number
        }[]
      }
      get_monthly_stats_from_daily: {
        Args: never
        Returns: {
          day: number
          view_count: number
          view_date: string
        }[]
      }
      get_or_create_daily_stat: {
        Args: { p_view_date: string }
        Returns: string
      }
      get_view2_stats: {
        Args: never
        Returns: {
          this_month: number
          this_week: number
          today: number
          total: number
          yesterday: number
        }[]
      }
      get_weekly_stats_from_daily: {
        Args: never
        Returns: {
          day_name: string
          view_count: number
          view_date: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_view_count: {
        Args: { news_id_param: string }
        Returns: undefined
      }
      reset_daily_view_stats2: { Args: never; Returns: undefined }
      update_daily_view_stats: { Args: { p_date?: string }; Returns: undefined }
      vietnam_time: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user" | "moderator"
      news_category:
        | "chinh-tri"
        | "kinh-te"
        | "xa-hoi"
        | "the-thao"
        | "giai-tri"
        | "cong-nghe"
        | "khac"
        | "phap-luat"
        | "the-gioi"
        | "van-hoa-xa-hoi-khoa-hoc"
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
    Enums: {
      app_role: ["admin", "user", "moderator"],
      news_category: [
        "chinh-tri",
        "kinh-te",
        "xa-hoi",
        "the-thao",
        "giai-tri",
        "cong-nghe",
        "khac",
        "phap-luat",
        "the-gioi",
        "van-hoa-xa-hoi-khoa-hoc",
      ],
    },
  },
} as const
