// ARCHIVO GENERADO — no editar a mano.
// Generado por scripts/gen-db-types.mjs a partir del esquema real (migraciones aplicadas en PostgreSQL local).
// Cuando Supabase local esté disponible, regenerar con el generador oficial: `npm run db:types`.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      devices: {
        Row: {
          id: string
          user_id: string
          kind: string
          platform: string | null
          label: string | null
          last_seen_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          kind: string
          platform?: string | null
          label?: string | null
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          kind?: string
          platform?: string | null
          label?: string | null
          last_seen_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          code: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          code: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          code?: string
          name?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      equipment_types: {
        Row: {
          code: string
          name_es: string
        }
        Insert: {
          code: string
          name_es: string
        }
        Update: {
          code?: string
          name_es?: string
        }
        Relationships: []
      }
      exercise_equipment: {
        Row: {
          exercise_id: string
          equipment_code: string
        }
        Insert: {
          exercise_id: string
          equipment_code: string
        }
        Update: {
          exercise_id?: string
          equipment_code?: string
        }
        Relationships: []
      }
      exercise_muscles: {
        Row: {
          exercise_id: string
          muscle_code: string
          role: string
        }
        Insert: {
          exercise_id: string
          muscle_code: string
          role: string
        }
        Update: {
          exercise_id?: string
          muscle_code?: string
          role?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          id: string
          owner_id: string | null
          slug: string
          name: string
          short_name: string | null
          description: string | null
          category: string
          body_part: string | null
          measurement_type: string
          met: number | null
          instructions: Json
          media: Json
          variation_of: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          slug: string
          name: string
          short_name?: string | null
          description?: string | null
          category?: string
          body_part?: string | null
          measurement_type?: string
          met?: number | null
          instructions?: Json
          media?: Json
          variation_of?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string | null
          slug?: string
          name?: string
          short_name?: string | null
          description?: string | null
          category?: string
          body_part?: string | null
          measurement_type?: string
          met?: number | null
          instructions?: Json
          media?: Json
          variation_of?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      muscle_groups: {
        Row: {
          code: string
          name_es: string
          region: string
        }
        Insert: {
          code: string
          name_es: string
          region: string
        }
        Update: {
          code?: string
          name_es?: string
          region?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          user_id: string
          display_name: string | null
          birth_year: number | null
          height_m: number | null
          onboarding_state: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name?: string | null
          birth_year?: number | null
          height_m?: number | null
          onboarding_state?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          display_name?: string | null
          birth_year?: number | null
          height_m?: number | null
          onboarding_state?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      routine_exercises: {
        Row: {
          id: string
          routine_id: string
          user_id: string
          exercise_id: string
          position: number
          target_sets: number
          rep_min: number | null
          rep_max: number | null
          target_rest_s: number | null
          target_load_kg: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          routine_id: string
          user_id?: string
          exercise_id: string
          position: number
          target_sets?: number
          rep_min?: number | null
          rep_max?: number | null
          target_rest_s?: number | null
          target_load_kg?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          routine_id?: string
          user_id?: string
          exercise_id?: string
          position?: number
          target_sets?: number
          rep_min?: number | null
          rep_max?: number | null
          target_rest_s?: number | null
          target_load_kg?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      routines: {
        Row: {
          id: string
          user_id: string
          name: string
          notes: string | null
          schedule_days: number[]
          version: number
          archived_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          notes?: string | null
          schedule_days?: number[]
          version?: number
          archived_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          notes?: string | null
          schedule_days?: number[]
          version?: number
          archived_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          user_id: string
          entitlement_code: string
          source: string
          starts_at: string
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          entitlement_code: string
          source?: string
          starts_at?: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          entitlement_code?: string
          source?: string
          starts_at?: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          user_id: string
          weight_unit: string
          locale: string
          time_zone: string
          week_start: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          weight_unit?: string
          locale?: string
          time_zone?: string
          week_start?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          weight_unit?: string
          locale?: string
          time_zone?: string
          week_start?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workout_session_exercises: {
        Row: {
          id: string
          session_id: string
          user_id: string
          exercise_id: string
          position: number
          exercise_name: string
          target_sets: number | null
          rep_min: number | null
          rep_max: number | null
          target_rest_s: number | null
          target_load_kg: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id?: string
          exercise_id: string
          position: number
          exercise_name: string
          target_sets?: number | null
          rep_min?: number | null
          rep_max?: number | null
          target_rest_s?: number | null
          target_load_kg?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          exercise_id?: string
          position?: number
          exercise_name?: string
          target_sets?: number | null
          rep_min?: number | null
          rep_max?: number | null
          target_rest_s?: number | null
          target_load_kg?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          id: string
          user_id: string
          routine_id: string | null
          routine_version: number | null
          name: string
          status: string
          started_at: string
          ended_at: string | null
          paused_at: string | null
          paused_seconds: number
          local_date: string
          time_zone: string
          notes: string | null
          tags: string[]
          device_id: string | null
          energy_kcal: number | null
          energy_is_estimated: boolean
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          routine_id?: string | null
          routine_version?: number | null
          name: string
          status?: string
          started_at?: string
          ended_at?: string | null
          paused_at?: string | null
          paused_seconds?: number
          local_date: string
          time_zone: string
          notes?: string | null
          tags?: string[]
          device_id?: string | null
          energy_kcal?: number | null
          energy_is_estimated?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          routine_id?: string | null
          routine_version?: number | null
          name?: string
          status?: string
          started_at?: string
          ended_at?: string | null
          paused_at?: string | null
          paused_seconds?: number
          local_date?: string
          time_zone?: string
          notes?: string | null
          tags?: string[]
          device_id?: string | null
          energy_kcal?: number | null
          energy_is_estimated?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          id: string
          user_id: string
          session_id: string
          session_exercise_id: string
          set_index: number
          set_type: string
          weight_kg: number | null
          reps: number | null
          duration_s: number | null
          distance_m: number | null
          rpe: number | null
          rest_s: number | null
          completed_at: string | null
          client_recorded_at: string
          device_id: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id?: string
          session_id: string
          session_exercise_id: string
          set_index: number
          set_type?: string
          weight_kg?: number | null
          reps?: number | null
          duration_s?: number | null
          distance_m?: number | null
          rpe?: number | null
          rest_s?: number | null
          completed_at?: string | null
          client_recorded_at: string
          device_id?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string
          session_exercise_id?: string
          set_index?: number
          set_type?: string
          weight_kg?: number | null
          reps?: number | null
          duration_s?: number | null
          distance_m?: number | null
          rpe?: number | null
          rest_s?: number | null
          completed_at?: string | null
          client_recorded_at?: string
          device_id?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      exercise_history: {
        Row: {
          set_id: string | null
          user_id: string | null
          exercise_id: string | null
          exercise_name: string | null
          session_id: string | null
          session_status: string | null
          started_at: string | null
          local_date: string | null
          set_index: number | null
          set_type: string | null
          weight_kg: number | null
          reps: number | null
          duration_s: number | null
          distance_m: number | null
          rpe: number | null
          completed_at: string | null
          volume_kg: number | null
          e1rm_kg: number | null
          is_weight_pr: boolean | null
          is_e1rm_pr: boolean | null
        }
        Relationships: []
      }
      personal_records: {
        Row: {
          user_id: string | null
          exercise_id: string | null
          exercise_name: string | null
          max_weight_kg: number | null
          max_reps: number | null
          best_e1rm_kg: number | null
          best_set_volume_kg: number | null
          total_sets: number | null
          last_performed_at: string | null
        }
        Relationships: []
      }
      session_summaries: {
        Row: {
          id: string | null
          user_id: string | null
          routine_id: string | null
          name: string | null
          status: string | null
          started_at: string | null
          ended_at: string | null
          local_date: string | null
          time_zone: string | null
          notes: string | null
          tags: string[] | null
          energy_kcal: number | null
          energy_is_estimated: boolean | null
          duration_s: number | null
          set_count: number | null
          volume_kg: number | null
          exercise_count: number | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_session_exercise: {
        Args: {
          p_id: string
          p_session_id: string
          p_exercise_id: string
          p_target_sets?: number
        }
        Returns: Json
      }
      delete_set: {
        Args: {
          p_id: string
        }
        Returns: Json
      }
      duplicate_routine: {
        Args: {
          p_id: string
          p_new_id?: string
        }
        Returns: Json
      }
      export_my_data: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      has_entitlement: {
        Args: {
          p_code: string
        }
        Returns: boolean
      }
      record_set: {
        Args: {
          p_id: string
          p_session_exercise_id: string
          p_set_index: number
          p_weight_kg?: number
          p_reps?: number
          p_duration_s?: number
          p_distance_m?: number
          p_rpe?: number
          p_rest_s?: number
          p_set_type?: string
          p_completed_at?: string
          p_client_ts?: string
          p_device_id?: string
        }
        Returns: Json
      }
      save_routine: {
        Args: {
          p_payload: Json
          p_expected_version?: number
        }
        Returns: Json
      }
      start_session: {
        Args: {
          p_id: string
          p_routine_id?: string
          p_device_id?: string
          p_client_ts?: string
          p_name?: string
        }
        Returns: Json
      }
      transition_session: {
        Args: {
          p_id: string
          p_action: string
          p_client_ts?: string
          p_energy_kcal?: number
        }
        Returns: Json
      }
      update_set: {
        Args: {
          p_id: string
          p_patch: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type Views<T extends keyof Database['public']['Views']> = Database['public']['Views'][T]['Row']
