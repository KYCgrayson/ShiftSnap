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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      daily_notes: {
        Row: {
          content: string
          created_at: string | null
          date: string
          id: string
          image_urls: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string | null
          date: string
          id?: string
          image_urls?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          date?: string
          id?: string
          image_urls?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          claimed_name_on_schedule: string | null
          claimed_person_id: string | null
          color: string | null
          group_id: string
          id: string
          is_visible: boolean | null
          joined_at: string
          nickname: string | null
          role: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Insert: {
          claimed_name_on_schedule?: string | null
          claimed_person_id?: string | null
          color?: string | null
          group_id: string
          id?: string
          is_visible?: boolean | null
          joined_at?: string
          nickname?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Update: {
          claimed_name_on_schedule?: string | null
          claimed_person_id?: string | null
          color?: string | null
          group_id?: string
          id?: string
          is_visible?: boolean | null
          joined_at?: string
          nickname?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_claimed_person_id_fkey"
            columns: ["claimed_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_code: string
          name: string
          settings: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_code: string
          name: string
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          name?: string
          settings?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      person_aliases: {
        Row: {
          alias: string
          canonical_person_id: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          normalized_alias: string
        }
        Insert: {
          alias: string
          canonical_person_id: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          normalized_alias: string
        }
        Update: {
          alias?: string
          canonical_person_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          normalized_alias?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_aliases_canonical_person_id_fkey"
            columns: ["canonical_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_aliases_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          avatar_url: string | null
          canonical_person_id: string | null
          color: string
          created_at: string
          group_id: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          canonical_person_id?: string | null
          color?: string
          created_at?: string
          group_id?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          canonical_person_id?: string | null
          color?: string
          created_at?: string
          group_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "persons_canonical_person_id_fkey"
            columns: ["canonical_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_identity_merge_claim_movements: {
        Row: {
          group_member_id: string
          merge_id: string
          previous_person_id: string
        }
        Insert: {
          group_member_id: string
          merge_id: string
          previous_person_id: string
        }
        Update: {
          group_member_id?: string
          merge_id?: string
          previous_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_identity_merge_claim_movements_group_member_id_fkey"
            columns: ["group_member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merge_claim_movements_merge_id_fkey"
            columns: ["merge_id"]
            isOneToOne: false
            referencedRelation: "roster_identity_merges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merge_claim_movements_previous_person_id_fkey"
            columns: ["previous_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_identity_merge_person_movements: {
        Row: {
          merge_id: string
          person_id: string
          previous_canonical_person_id: string
        }
        Insert: {
          merge_id: string
          person_id: string
          previous_canonical_person_id: string
        }
        Update: {
          merge_id?: string
          person_id?: string
          previous_canonical_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_identity_merge_person__previous_canonical_person_id_fkey"
            columns: ["previous_canonical_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merge_person_movements_merge_id_fkey"
            columns: ["merge_id"]
            isOneToOne: false
            referencedRelation: "roster_identity_merges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merge_person_movements_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_identity_merge_shift_movements: {
        Row: {
          merge_id: string
          previous_person_id: string
          shift_id: string
        }
        Insert: {
          merge_id: string
          previous_person_id: string
          shift_id: string
        }
        Update: {
          merge_id?: string
          previous_person_id?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_identity_merge_shift_movements_merge_id_fkey"
            columns: ["merge_id"]
            isOneToOne: false
            referencedRelation: "roster_identity_merges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merge_shift_movements_previous_person_id_fkey"
            columns: ["previous_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merge_shift_movements_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_identity_merges: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          moved_alias_ids: string[]
          primary_person_id: string
          secondary_person_id: string
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          moved_alias_ids?: string[]
          primary_person_id: string
          secondary_person_id: string
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          moved_alias_ids?: string[]
          primary_person_id?: string
          secondary_person_id?: string
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_identity_merges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merges_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merges_primary_person_id_fkey"
            columns: ["primary_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merges_secondary_person_id_fkey"
            columns: ["secondary_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_identity_merges_undone_by_fkey"
            columns: ["undone_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_sharing: {
        Row: {
          accepted_at: string | null
          color: string | null
          created_at: string
          expires_at: string | null
          from_user_id: string
          id: string
          invite_code: string
          invite_url: string | null
          is_visible: boolean | null
          nickname: string | null
          status: Database["public"]["Enums"]["share_status"]
          to_user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          color?: string | null
          created_at?: string
          expires_at?: string | null
          from_user_id: string
          id?: string
          invite_code: string
          invite_url?: string | null
          is_visible?: boolean | null
          nickname?: string | null
          status?: Database["public"]["Enums"]["share_status"]
          to_user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          color?: string | null
          created_at?: string
          expires_at?: string | null
          from_user_id?: string
          id?: string
          invite_code?: string
          invite_url?: string | null
          is_visible?: boolean | null
          nickname?: string | null
          status?: Database["public"]["Enums"]["share_status"]
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_sharing_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_sharing_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          image_status: string
          image_url: string
          owner_id: string
          person_id: string | null
          raw_ocr_result: Json | null
          status: Database["public"]["Enums"]["schedule_status"]
          updated_at: string
          year_month: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          image_status?: string
          image_url: string
          owner_id: string
          person_id?: string | null
          raw_ocr_result?: Json | null
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
          year_month: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          image_status?: string
          image_url?: string
          owner_id?: string
          person_id?: string | null
          raw_ocr_result?: Json | null
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_codes: {
        Row: {
          code: string
          created_at: string
          end_time: string | null
          group_id: string | null
          id: string
          is_confirmed: boolean | null
          is_day_off: boolean | null
          is_group_shared: boolean | null
          meaning: string
          person_id: string | null
          start_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          end_time?: string | null
          group_id?: string | null
          id?: string
          is_confirmed?: boolean | null
          is_day_off?: boolean | null
          is_group_shared?: boolean | null
          meaning: string
          person_id?: string | null
          start_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          end_time?: string | null
          group_id?: string | null
          id?: string
          is_confirmed?: boolean | null
          is_day_off?: boolean | null
          is_group_shared?: boolean | null
          meaning?: string
          person_id?: string | null
          start_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_codes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_codes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          calendar_event_id: string | null
          comparison_status:
            | Database["public"]["Enums"]["comparison_status"]
            | null
          created_at: string
          date: string
          end_time: string | null
          id: string
          is_day_off: boolean | null
          name_on_schedule: string | null
          paired_shift_id: string | null
          person_id: string | null
          schedule_id: string
          shift_code: string
          source: Database["public"]["Enums"]["shift_source"]
          start_time: string | null
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          comparison_status?:
            | Database["public"]["Enums"]["comparison_status"]
            | null
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          is_day_off?: boolean | null
          name_on_schedule?: string | null
          paired_shift_id?: string | null
          person_id?: string | null
          schedule_id: string
          shift_code: string
          source?: Database["public"]["Enums"]["shift_source"]
          start_time?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          comparison_status?:
            | Database["public"]["Enums"]["comparison_status"]
            | null
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          is_day_off?: boolean | null
          name_on_schedule?: string | null
          paired_shift_id?: string | null
          person_id?: string | null
          schedule_id?: string
          shift_code?: string
          source?: Database["public"]["Enums"]["shift_source"]
          start_time?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_paired_shift_id_fkey"
            columns: ["paired_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedule_image_audit"
            referencedColumns: ["schedule_id"]
          },
          {
            foreignKeyName: "shifts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_alarm_minutes: number | null
          display_name: string | null
          email: string
          id: string
          locale: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_alarm_minutes?: number | null
          display_name?: string | null
          email: string
          id: string
          locale?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_alarm_minutes?: number | null
          display_name?: string | null
          email?: string
          id?: string
          locale?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      schedule_image_audit: {
        Row: {
          group_id: string | null
          image_status: string | null
          image_url: string | null
          owner_id: string | null
          reference_kind: string | null
          schedule_id: string | null
          storage_object_present: boolean | null
          storage_owner_id: string | null
          year_month: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_match_shifts: {
        Args: { p_person_name: string; p_user_id: string; p_year_month: string }
        Returns: undefined
      }
      claim_person_in_schedule: {
        Args: { p_name_on_schedule: string; p_schedule_id: string }
        Returns: number
      }
      find_group_by_invite_code: { Args: { code: string }; Returns: string }
      get_group_member_profiles: {
        Args: { gid: string }
        Returns: {
          avatar_url: string
          claimed_name_on_schedule: string
          claimed_person_id: string
          color: string
          display_name: string
          email: string
          is_visible: boolean
          joined_at: string
          membership_id: string
          nickname: string
          role: Database["public"]["Enums"]["group_role"]
          user_id: string
        }[]
      }
      get_my_schedule_shifts: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          calendar_event_id: string | null
          comparison_status:
            | Database["public"]["Enums"]["comparison_status"]
            | null
          created_at: string
          date: string
          end_time: string | null
          id: string
          is_day_off: boolean | null
          name_on_schedule: string | null
          paired_shift_id: string | null
          person_id: string | null
          schedule_id: string
          shift_code: string
          source: Database["public"]["Enums"]["shift_source"]
          start_time: string | null
          synced_at: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_group_ids: { Args: { uid: string }; Returns: string[] }
      is_group_admin: { Args: { gid: string; uid: string }; Returns: boolean }
      join_group_by_invite_code: { Args: { code: string }; Returns: string }
      merge_roster_people: {
        Args: { p_primary_person_id: string; p_secondary_person_id: string }
        Returns: string
      }
      remove_group_member: {
        Args: { gid: string; target_user_id: string }
        Returns: boolean
      }
      resolve_roster_person: {
        Args: { p_color?: string; p_group_id: string; p_name: string }
        Returns: string
      }
      roster_normalize_name: {
        Args: { p_ignore_trailing_number?: boolean; p_name: string }
        Returns: string
      }
      set_group_roster_name_matching: {
        Args: { p_group_id: string; p_mode: string; p_sensitivity?: string }
        Returns: undefined
      }
      unclaim_person_in_schedule: {
        Args: { p_schedule_id: string }
        Returns: undefined
      }
      undo_roster_people_merge: {
        Args: { p_merge_id: string }
        Returns: undefined
      }
    }
    Enums: {
      comparison_status: "pending" | "matched" | "discrepancy" | "resolved"
      group_role: "member" | "site_manager" | "admin"
      schedule_status: "draft" | "published" | "archived"
      share_status: "pending" | "accepted" | "revoked" | "expired"
      shift_source: "self_scan" | "manager_distributed" | "reference_scan"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
      comparison_status: ["pending", "matched", "discrepancy", "resolved"],
      group_role: ["member", "site_manager", "admin"],
      schedule_status: ["draft", "published", "archived"],
      share_status: ["pending", "accepted", "revoked", "expired"],
      shift_source: ["self_scan", "manager_distributed", "reference_scan"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
