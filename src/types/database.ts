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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      admin_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["admin_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          capabilities_granted: string[]
          capabilities_revoked: string[]
          created_at: string
          created_by: string | null
          disabled_at: string | null
          display_name: string
          id: string
          last_login_at: string | null
          last_login_ip: unknown
          role: Database["public"]["Enums"]["admin_role"]
          totp_enrolled_at: string | null
          totp_recovery_codes_hashed: Json
          totp_secret_encrypted: string | null
          updated_at: string
        }
        Insert: {
          capabilities_granted?: string[]
          capabilities_revoked?: string[]
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          display_name: string
          id: string
          last_login_at?: string | null
          last_login_ip?: unknown
          role: Database["public"]["Enums"]["admin_role"]
          totp_enrolled_at?: string | null
          totp_recovery_codes_hashed?: Json
          totp_secret_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          capabilities_granted?: string[]
          capabilities_revoked?: string[]
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          display_name?: string
          id?: string
          last_login_at?: string | null
          last_login_ip?: unknown
          role?: Database["public"]["Enums"]["admin_role"]
          totp_enrolled_at?: string | null
          totp_recovery_codes_hashed?: Json
          totp_secret_encrypted?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          image_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email_snapshot: string | null
          actor_id: string | null
          actor_role_snapshot: string | null
          created_at: string
          id: number
          ip: unknown
          metadata: Json
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email_snapshot?: string | null
          actor_id?: string | null
          actor_role_snapshot?: string | null
          created_at?: string
          id?: number
          ip?: unknown
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email_snapshot?: string | null
          actor_id?: string | null
          actor_role_snapshot?: string | null
          created_at?: string
          id?: number
          ip?: unknown
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      cities: {
        Row: {
          country: string
          created_at: string
          description: string | null
          display_order: number
          hero_query: string | null
          is_active: boolean
          latitude: number
          longitude: number
          name: string
          population: number | null
          region: string | null
          slug: string
          state: string
          tier: number
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          description?: string | null
          display_order?: number
          hero_query?: string | null
          is_active?: boolean
          latitude: number
          longitude: number
          name: string
          population?: number | null
          region?: string | null
          slug: string
          state: string
          tier: number
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          description?: string | null
          display_order?: number
          hero_query?: string | null
          is_active?: boolean
          latitude?: number
          longitude?: number
          name?: string
          population?: number | null
          region?: string | null
          slug?: string
          state?: string
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      communities: {
        Row: {
          created_at: string
          display_name: string
          display_order: number
          hero_query: string | null
          is_active: boolean
          slug: string
          tagline: string | null
          tier: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          display_order?: number
          hero_query?: string | null
          is_active?: boolean
          slug: string
          tagline?: string | null
          tier: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          display_order?: number
          hero_query?: string | null
          is_active?: boolean
          slug?: string
          tagline?: string | null
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      discount_code_usages: {
        Row: {
          created_at: string
          discount_applied_cents: number
          discount_code_id: string
          guest_email: string | null
          id: string
          order_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discount_applied_cents?: number
          discount_code_id: string
          guest_email?: string | null
          id?: string
          order_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discount_applied_cents?: number
          discount_code_id?: string
          guest_email?: string | null
          id?: string
          order_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_code_usages_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_code_usages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          applicable_tier_ids: string[] | null
          code: string
          created_at: string
          currency: string | null
          current_uses: number
          discount_amount_cents: number | null
          discount_percentage: number | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          event_id: string
          id: string
          is_active: boolean
          max_uses: number | null
          max_uses_per_user: number
          min_order_amount_cents: number | null
          organisation_id: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_tier_ids?: string[] | null
          code: string
          created_at?: string
          currency?: string | null
          current_uses?: number
          discount_amount_cents?: number | null
          discount_percentage?: number | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          event_id: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number
          min_order_amount_cents?: number | null
          organisation_id: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_tier_ids?: string[] | null
          code?: string
          created_at?: string
          currency?: string | null
          current_uses?: number
          discount_amount_cents?: number | null
          discount_percentage?: number | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          event_id?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number
          min_order_amount_cents?: number | null
          organisation_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_pricing_rules: {
        Row: {
          capacity_threshold_percent: number
          created_at: string
          id: string
          price_cents: number
          step_order: number
          ticket_tier_id: string
          updated_at: string
        }
        Insert: {
          capacity_threshold_percent: number
          created_at?: string
          id?: string
          price_cents: number
          step_order: number
          ticket_tier_id: string
          updated_at?: string
        }
        Update: {
          capacity_threshold_percent?: number
          created_at?: string
          id?: string
          price_cents?: number
          step_order?: number
          ticket_tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_pricing_rules_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_subscribers: {
        Row: {
          confirmed: boolean
          confirmed_at: string | null
          consent: boolean
          email: string
          id: string
          source: string
          subscribed_at: string
          unsubscribed_at: string | null
        }
        Insert: {
          confirmed?: boolean
          confirmed_at?: string | null
          consent?: boolean
          email: string
          id?: string
          source?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
        }
        Update: {
          confirmed?: boolean
          confirmed_at?: string | null
          consent?: boolean
          email?: string
          id?: string
          source?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      event_addons: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          name: string
          price: number
          sold_count: number
          sort_order: number
          total_capacity: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sold_count?: number
          sort_order?: number
          total_capacity?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sold_count?: number
          sort_order?: number
          total_capacity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_addons_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_artists: {
        Row: {
          artist_id: string
          billing_order: number
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          artist_id: string
          billing_order?: number
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          artist_id?: string
          billing_order?: number
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      event_types: {
        Row: {
          created_at: string
          display_name: string
          display_order: number
          is_active: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          display_order?: number
          is_active?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          display_order?: number
          is_active?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          age_restriction_min: number | null
          category_id: string | null
          city_primary: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          community_primary: string | null
          description: string | null
          end_date: string
          event_type: Database["public"]["Enums"]["event_type"]
          fee_pass_type: Database["public"]["Enums"]["fee_pass_type"]
          gallery_urls: Json | null
          genre_slug: string | null
          has_reserved_seating: boolean
          id: string
          is_age_restricted: boolean
          is_featured: boolean
          is_free: boolean | null
          is_high_demand: boolean
          is_multi_day: boolean
          is_recurring: boolean
          max_capacity: number | null
          metadata: Json | null
          organisation_id: string
          parent_event_id: string | null
          published_at: string | null
          queue_admission_window_minutes: number
          recurrence_rule: string | null
          scheduled_publish_at: string | null
          seat_map_id: string | null
          slug: string
          squad_booking_enabled: boolean
          squad_timeout_hours: number
          start_date: string
          status: Database["public"]["Enums"]["event_status"]
          sub_community: string | null
          subgenre_slug: string | null
          suburb_primary: string | null
          summary: string | null
          tags: Json | null
          thumbnail_url: string | null
          timezone: string
          title: string
          updated_at: string
          venue_address: string | null
          venue_city: string | null
          venue_country: string | null
          venue_id: string | null
          venue_latitude: number | null
          venue_longitude: number | null
          venue_name: string | null
          venue_place_id: string | null
          venue_postal_code: string | null
          venue_state: string | null
          virtual_url: string | null
          visibility: Database["public"]["Enums"]["event_visibility"]
          waitlist_enabled: boolean
        }
        Insert: {
          age_restriction_min?: number | null
          category_id?: string | null
          city_primary?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          community_primary?: string | null
          description?: string | null
          end_date: string
          event_type?: Database["public"]["Enums"]["event_type"]
          fee_pass_type?: Database["public"]["Enums"]["fee_pass_type"]
          gallery_urls?: Json | null
          genre_slug?: string | null
          has_reserved_seating?: boolean
          id?: string
          is_age_restricted?: boolean
          is_featured?: boolean
          is_free?: boolean | null
          is_high_demand?: boolean
          is_multi_day?: boolean
          is_recurring?: boolean
          max_capacity?: number | null
          metadata?: Json | null
          organisation_id: string
          parent_event_id?: string | null
          published_at?: string | null
          queue_admission_window_minutes?: number
          recurrence_rule?: string | null
          scheduled_publish_at?: string | null
          seat_map_id?: string | null
          slug: string
          squad_booking_enabled?: boolean
          squad_timeout_hours?: number
          start_date: string
          status?: Database["public"]["Enums"]["event_status"]
          sub_community?: string | null
          subgenre_slug?: string | null
          suburb_primary?: string | null
          summary?: string | null
          tags?: Json | null
          thumbnail_url?: string | null
          timezone?: string
          title: string
          updated_at?: string
          venue_address?: string | null
          venue_city?: string | null
          venue_country?: string | null
          venue_id?: string | null
          venue_latitude?: number | null
          venue_longitude?: number | null
          venue_name?: string | null
          venue_place_id?: string | null
          venue_postal_code?: string | null
          venue_state?: string | null
          virtual_url?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
          waitlist_enabled?: boolean
        }
        Update: {
          age_restriction_min?: number | null
          category_id?: string | null
          city_primary?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          community_primary?: string | null
          description?: string | null
          end_date?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          fee_pass_type?: Database["public"]["Enums"]["fee_pass_type"]
          gallery_urls?: Json | null
          genre_slug?: string | null
          has_reserved_seating?: boolean
          id?: string
          is_age_restricted?: boolean
          is_featured?: boolean
          is_free?: boolean | null
          is_high_demand?: boolean
          is_multi_day?: boolean
          is_recurring?: boolean
          max_capacity?: number | null
          metadata?: Json | null
          organisation_id?: string
          parent_event_id?: string | null
          published_at?: string | null
          queue_admission_window_minutes?: number
          recurrence_rule?: string | null
          scheduled_publish_at?: string | null
          seat_map_id?: string | null
          slug?: string
          squad_booking_enabled?: boolean
          squad_timeout_hours?: number
          start_date?: string
          status?: Database["public"]["Enums"]["event_status"]
          sub_community?: string | null
          subgenre_slug?: string | null
          suburb_primary?: string | null
          summary?: string | null
          tags?: Json | null
          thumbnail_url?: string | null
          timezone?: string
          title?: string
          updated_at?: string
          venue_address?: string | null
          venue_city?: string | null
          venue_country?: string | null
          venue_id?: string | null
          venue_latitude?: number | null
          venue_longitude?: number | null
          venue_name?: string | null
          venue_place_id?: string | null
          venue_postal_code?: string | null
          venue_state?: string | null
          virtual_url?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_city_primary_fkey"
            columns: ["city_primary"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_community_primary_fkey"
            columns: ["community_primary"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "events_genre_slug_fkey"
            columns: ["genre_slug"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_seat_map_fk"
            columns: ["seat_map_id"]
            isOneToOne: false
            referencedRelation: "seat_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_subgenre_slug_fkey"
            columns: ["subgenre_slug"]
            isOneToOne: false
            referencedRelation: "subgenres"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "events_suburb_primary_fkey"
            columns: ["suburb_primary"]
            isOneToOne: false
            referencedRelation: "suburbs"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "events_venue_fk"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followable_id: string
          followable_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          followable_id: string
          followable_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          followable_id?: string
          followable_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          email_enabled: boolean
          push_enabled: boolean
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          push_enabled?: boolean
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          push_enabled?: boolean
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: string
          converted: boolean
          created_at: string
          event_id: string | null
          id: string
          opened_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          channel: string
          converted?: boolean
          created_at?: string
          event_id?: string | null
          id?: string
          opened_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          channel?: string
          converted?: boolean
          created_at?: string
          event_id?: string | null
          id?: string
          opened_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      organiser_marketing_consents: {
        Row: {
          consent_text: string
          consent_version: string
          created_at: string
          email: string
          event_id: string | null
          id: string
          order_id: string | null
          organisation_id: string
          source: string
          status: string
          unsubscribe_token: string
          updated_at: string
          user_id: string | null
          withdrawn_at: string | null
        }
        Insert: {
          consent_text: string
          consent_version?: string
          created_at?: string
          email: string
          event_id?: string | null
          id?: string
          order_id?: string | null
          organisation_id: string
          source?: string
          status?: string
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          consent_text?: string
          consent_version?: string
          created_at?: string
          email?: string
          event_id?: string | null
          id?: string
          order_id?: string | null
          organisation_id?: string
          source?: string
          status?: string
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string | null
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      genres: {
        Row: {
          created_at: string
          display_order: number
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          addon_id: string | null
          attendee_email: string | null
          attendee_first_name: string | null
          attendee_last_name: string | null
          created_at: string
          id: string
          item_name: string
          item_type: string
          metadata: Json
          order_id: string
          quantity: number
          ticket_tier_id: string | null
          total_cents: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          addon_id?: string | null
          attendee_email?: string | null
          attendee_first_name?: string | null
          attendee_last_name?: string | null
          created_at?: string
          id?: string
          item_name: string
          item_type: string
          metadata?: Json
          order_id: string
          quantity?: number
          ticket_tier_id?: string | null
          total_cents?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Update: {
          addon_id?: string | null
          attendee_email?: string | null
          attendee_first_name?: string | null
          attendee_last_name?: string | null
          created_at?: string
          id?: string
          item_name?: string
          item_type?: string
          metadata?: Json
          order_id?: string
          quantity?: number
          ticket_tier_id?: string | null
          total_cents?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "event_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          addon_total_cents: number
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          discount_cents: number
          discount_code_id: string | null
          event_id: string
          expires_at: string | null
          fee_pass_type: Database["public"]["Enums"]["fee_pass_type"]
          guest_email: string | null
          guest_name: string | null
          id: string
          metadata: Json
          order_number: string
          organisation_id: string
          platform_fee_cents: number
          processing_fee_cents: number
          reservation_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          addon_total_cents?: number
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          discount_cents?: number
          discount_code_id?: string | null
          event_id: string
          expires_at?: string | null
          fee_pass_type?: Database["public"]["Enums"]["fee_pass_type"]
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          metadata?: Json
          order_number: string
          organisation_id: string
          platform_fee_cents?: number
          processing_fee_cents?: number
          reservation_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          addon_total_cents?: number
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          discount_cents?: number
          discount_code_id?: string | null
          event_id?: string
          expires_at?: string | null
          fee_pass_type?: Database["public"]["Enums"]["fee_pass_type"]
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          metadata?: Json
          order_number?: string
          organisation_id?: string
          platform_fee_cents?: number
          processing_fee_cents?: number
          reservation_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_discount_code_fk"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          organisation_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          organisation_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          organisation_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_members_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          description: string | null
          email: string | null
          hold_amount_cents: number
          id: string
          logo_url: string | null
          metadata: Json | null
          name: string
          owner_id: string
          payout_destination: string | null
          payout_schedule: string
          payout_status: string
          payout_tier: string
          phone: string | null
          refund_window_days: number
          risk_tier: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          stripe_account_country: string | null
          stripe_account_id: string | null
          stripe_capabilities: Json
          stripe_charges_enabled: boolean
          stripe_onboarding_complete: boolean
          stripe_payouts_enabled: boolean
          stripe_requirements: Json
          total_event_count: number
          total_volume_cents: number
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          email?: string | null
          hold_amount_cents?: number
          id?: string
          logo_url?: string | null
          metadata?: Json | null
          name: string
          owner_id: string
          payout_destination?: string | null
          payout_schedule?: string
          payout_status?: string
          payout_tier?: string
          phone?: string | null
          refund_window_days?: number
          risk_tier?: string
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          stripe_account_country?: string | null
          stripe_account_id?: string | null
          stripe_capabilities?: Json
          stripe_charges_enabled?: boolean
          stripe_onboarding_complete?: boolean
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json
          total_event_count?: number
          total_volume_cents?: number
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          email?: string | null
          hold_amount_cents?: number
          id?: string
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          owner_id?: string
          payout_destination?: string | null
          payout_schedule?: string
          payout_status?: string
          payout_tier?: string
          phone?: string | null
          refund_window_days?: number
          risk_tier?: string
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          stripe_account_country?: string | null
          stripe_account_id?: string | null
          stripe_capabilities?: Json
          stripe_charges_enabled?: boolean
          stripe_onboarding_complete?: boolean
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json
          total_event_count?: number
          total_volume_cents?: number
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organiser_balance_ledger: {
        Row: {
          created_at: string
          currency: string
          delta_cents: number
          id: string
          metadata: Json
          organisation_id: string
          reason: string
          reference_id: string | null
          reference_type: string
        }
        Insert: {
          created_at?: string
          currency: string
          delta_cents: number
          id?: string
          metadata?: Json
          organisation_id: string
          reason: string
          reference_id?: string | null
          reference_type: string
        }
        Update: {
          created_at?: string
          currency?: string
          delta_cents?: number
          id?: string
          metadata?: Json
          organisation_id?: string
          reason?: string
          reference_id?: string | null
          reference_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "organiser_balance_ledger_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          client_secret: string | null
          completed_at: string | null
          created_at: string
          currency: string
          failure_code: string | null
          failure_reason: string | null
          gateway: Database["public"]["Enums"]["payment_gateway"]
          gateway_customer_id: string | null
          gateway_payment_id: string | null
          gateway_response: Json
          id: string
          idempotency_key: string
          order_id: string
          receipt_url: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          client_secret?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_reason?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_customer_id?: string | null
          gateway_payment_id?: string | null
          gateway_response?: Json
          id?: string
          idempotency_key: string
          order_id: string
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          client_secret?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_reason?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_customer_id?: string | null
          gateway_payment_id?: string | null
          gateway_response?: Json
          id?: string
          idempotency_key?: string
          order_id?: string
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_holds: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          event_id: string | null
          hold_type: string
          id: string
          metadata: Json
          organisation_id: string
          reason_text: string | null
          release_at: string
          released_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          event_id?: string | null
          hold_type: string
          id?: string
          metadata?: Json
          organisation_id: string
          reason_text?: string | null
          release_at: string
          released_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          event_id?: string | null
          hold_type?: string
          id?: string
          metadata?: Json
          organisation_id?: string
          reason_text?: string | null
          release_at?: string
          released_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_holds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_holds_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_cents: number
          arrival_date: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          initiated_by: string | null
          metadata: Json
          organisation_id: string
          reversed_at: string | null
          status: string
          stripe_payout_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          arrival_date?: string | null
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          initiated_by?: string | null
          metadata?: Json
          organisation_id: string
          reversed_at?: string | null
          status?: string
          stripe_payout_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          arrival_date?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          initiated_by?: string | null
          metadata?: Json
          organisation_id?: string
          reversed_at?: string | null
          status?: string
          stripe_payout_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          country_code: string
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_until: string | null
          event_id: string | null
          event_type: string
          id: string
          organisation_id: string | null
          organiser_tier: string
          rule_type: string
          value_cents: number | null
          value_integer: number | null
          value_percentage: number | null
          value_type: string
          version: number
        }
        Insert: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_until?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          organisation_id?: string | null
          organiser_tier?: string
          rule_type: string
          value_cents?: number | null
          value_integer?: number | null
          value_percentage?: number | null
          value_type: string
          version?: number
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_until?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          organisation_id?: string | null
          organiser_tier?: string
          rule_type?: string
          value_cents?: number | null
          value_integer?: number | null
          value_percentage?: number | null
          value_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_id: string
          event_type: string
          last_error: string | null
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_id: string
          event_type: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_id?: string
          event_type?: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          is_verified: boolean
          metadata: Json | null
          onboarding_completed: boolean
          phone: string | null
          preferred_city: Json | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          full_name?: string | null
          id: string
          is_verified?: boolean
          metadata?: Json | null
          onboarding_completed?: boolean
          phone?: string | null
          preferred_city?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_verified?: boolean
          metadata?: Json | null
          onboarding_completed?: boolean
          phone?: string | null
          preferred_city?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      refund_tickets: {
        Row: {
          created_at: string
          is_active: boolean
          refund_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          refund_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          refund_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_tickets_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_tickets_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_cents: number
          buyer_message: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          initiator: Database["public"]["Enums"]["refund_initiator"]
          order_id: string
          organisation_id: string
          organiser_internal_notes: string | null
          processed_at: string | null
          processed_by: string | null
          reason: Database["public"]["Enums"]["refund_reason"]
          refund_reverse_transfer: boolean
          requested_at: string
          requested_by: string | null
          status: Database["public"]["Enums"]["refund_status"]
          stripe_application_fee_refund_id: string | null
          stripe_pending_reason: string | null
          stripe_refund_id: string | null
          stripe_refund_status: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          buyer_message?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          initiator: Database["public"]["Enums"]["refund_initiator"]
          order_id: string
          organisation_id: string
          organiser_internal_notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason: Database["public"]["Enums"]["refund_reason"]
          refund_reverse_transfer?: boolean
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_application_fee_refund_id?: string | null
          stripe_pending_reason?: string | null
          stripe_refund_id?: string | null
          stripe_refund_status?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          buyer_message?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          initiator?: Database["public"]["Enums"]["refund_initiator"]
          order_id?: string
          organisation_id?: string
          organiser_internal_notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: Database["public"]["Enums"]["refund_reason"]
          refund_reverse_transfer?: boolean
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_application_fee_refund_id?: string | null
          stripe_pending_reason?: string | null
          stripe_refund_id?: string | null
          stripe_refund_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          converted_at: string | null
          created_at: string
          event_id: string
          expires_at: string
          id: string
          items: Json
          session_id: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          event_id: string
          expires_at: string
          id?: string
          items?: Json
          session_id?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          items?: Json
          session_id?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_organisers: {
        Row: {
          created_at: string
          id: string
          organisation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organisation_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organisation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_organisers_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_holds: {
        Row: {
          created_at: string
          event_id: string
          held_by_user_id: string
          id: string
          notes: string | null
          reason: string | null
          seat_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          held_by_user_id: string
          id?: string
          notes?: string | null
          reason?: string | null
          seat_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          held_by_user_id?: string
          id?: string
          notes?: string | null
          reason?: string | null
          seat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_holds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_holds_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_map_sections: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          seat_map_id: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          seat_map_id: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          seat_map_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "seat_map_sections_seat_map_id_fkey"
            columns: ["seat_map_id"]
            isOneToOne: false
            referencedRelation: "seat_maps"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_maps: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          layout: Json
          name: string
          total_seats: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          layout?: Json
          name: string
          total_seats?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          layout?: Json
          name?: string
          total_seats?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_maps_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          created_at: string
          event_id: string
          held_by_user_id: string | null
          held_reason: string | null
          id: string
          metadata: Json
          order_item_id: string | null
          price_cents: number | null
          reservation_id: string | null
          row_label: string
          seat_map_section_id: string | null
          seat_number: string
          seat_type: Database["public"]["Enums"]["seat_type"]
          status: Database["public"]["Enums"]["seat_status"]
          ticket_tier_id: string | null
          updated_at: string
          x: number | null
          y: number | null
        }
        Insert: {
          created_at?: string
          event_id: string
          held_by_user_id?: string | null
          held_reason?: string | null
          id?: string
          metadata?: Json
          order_item_id?: string | null
          price_cents?: number | null
          reservation_id?: string | null
          row_label: string
          seat_map_section_id?: string | null
          seat_number: string
          seat_type?: Database["public"]["Enums"]["seat_type"]
          status?: Database["public"]["Enums"]["seat_status"]
          ticket_tier_id?: string | null
          updated_at?: string
          x?: number | null
          y?: number | null
        }
        Update: {
          created_at?: string
          event_id?: string
          held_by_user_id?: string | null
          held_reason?: string | null
          id?: string
          metadata?: Json
          order_item_id?: string | null
          price_cents?: number | null
          reservation_id?: string | null
          row_label?: string
          seat_map_section_id?: string | null
          seat_number?: string
          seat_type?: Database["public"]["Enums"]["seat_type"]
          status?: Database["public"]["Enums"]["seat_status"]
          ticket_tier_id?: string | null
          updated_at?: string
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_seat_map_section_id_fkey"
            columns: ["seat_map_section_id"]
            isOneToOne: false
            referencedRelation: "seat_map_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_members: {
        Row: {
          attendee_email: string | null
          attendee_first_name: string | null
          attendee_last_name: string | null
          created_at: string
          guest_email: string | null
          id: string
          order_id: string | null
          paid_at: string | null
          position: number
          squad_id: string
          status: Database["public"]["Enums"]["squad_member_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attendee_email?: string | null
          attendee_first_name?: string | null
          attendee_last_name?: string | null
          created_at?: string
          guest_email?: string | null
          id?: string
          order_id?: string | null
          paid_at?: string | null
          position: number
          squad_id: string
          status?: Database["public"]["Enums"]["squad_member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attendee_email?: string | null
          attendee_first_name?: string | null
          attendee_last_name?: string | null
          created_at?: string
          guest_email?: string | null
          id?: string
          order_id?: string | null
          paid_at?: string | null
          position?: number
          squad_id?: string
          status?: Database["public"]["Enums"]["squad_member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squads: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          event_id: string
          expires_at: string
          extended_once: boolean
          id: string
          leader_user_id: string | null
          reservation_id: string | null
          share_token: string
          status: Database["public"]["Enums"]["squad_status"]
          ticket_tier_id: string
          total_spots: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          event_id: string
          expires_at: string
          extended_once?: boolean
          id?: string
          leader_user_id?: string | null
          reservation_id?: string | null
          share_token: string
          status?: Database["public"]["Enums"]["squad_status"]
          ticket_tier_id: string
          total_spots: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string
          extended_once?: boolean
          id?: string
          leader_user_id?: string | null
          reservation_id?: string | null
          share_token?: string
          status?: Database["public"]["Enums"]["squad_status"]
          ticket_tier_id?: string
          total_spots?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "squads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squads_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      subgenres: {
        Row: {
          created_at: string
          display_order: number
          genre_slug: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          genre_slug: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          genre_slug?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subgenres_genre_slug_fkey"
            columns: ["genre_slug"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["slug"]
          },
        ]
      }
      suburbs: {
        Row: {
          city_slug: string
          created_at: string
          description: string | null
          display_order: number
          hero_query: string | null
          is_active: boolean
          latitude: number
          longitude: number
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          city_slug: string
          created_at?: string
          description?: string | null
          display_order?: number
          hero_query?: string | null
          is_active?: boolean
          latitude: number
          longitude: number
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          city_slug?: string
          created_at?: string
          description?: string | null
          display_order?: number
          hero_query?: string | null
          is_active?: boolean
          latitude?: number
          longitude?: number
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suburbs_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
        ]
      }
      tax_rules: {
        Row: {
          applies_to_platform_fees: boolean
          applies_to_ticket_price: boolean
          country_code: string
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          is_active: boolean
          state_code: string | null
          tax_name: string
          tax_rate: number
        }
        Insert: {
          applies_to_platform_fees?: boolean
          applies_to_ticket_price?: boolean
          country_code: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean
          state_code?: string | null
          tax_name: string
          tax_rate: number
        }
        Update: {
          applies_to_platform_fees?: boolean
          applies_to_ticket_price?: boolean
          country_code?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean
          state_code?: string | null
          tax_name?: string
          tax_rate?: number
        }
        Relationships: []
      }
      ticket_scans: {
        Row: {
          device_info: Json
          event_id: string
          id: string
          result: string
          scanned_at: string
          scanned_by: string | null
          ticket_id: string
        }
        Insert: {
          device_info?: Json
          event_id: string
          id?: string
          result: string
          scanned_at?: string
          scanned_by?: string | null
          ticket_id: string
        }
        Update: {
          device_info?: Json
          event_id?: string
          id?: string
          result?: string
          scanned_at?: string
          scanned_by?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_scans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_scans_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tiers: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          dynamic_pricing_enabled: boolean
          event_id: string
          hidden_until: string | null
          id: string
          is_active: boolean
          is_visible: boolean
          max_per_order: number
          metadata: Json | null
          min_per_order: number
          name: string
          price: number
          requires_access_code: boolean
          reserved_count: number
          sale_end: string | null
          sale_start: string | null
          seat_map_section_id: string | null
          sold_count: number
          sort_order: number
          tier_type: Database["public"]["Enums"]["ticket_tier_type"]
          total_capacity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          dynamic_pricing_enabled?: boolean
          event_id: string
          hidden_until?: string | null
          id?: string
          is_active?: boolean
          is_visible?: boolean
          max_per_order?: number
          metadata?: Json | null
          min_per_order?: number
          name: string
          price?: number
          requires_access_code?: boolean
          reserved_count?: number
          sale_end?: string | null
          sale_start?: string | null
          seat_map_section_id?: string | null
          sold_count?: number
          sort_order?: number
          tier_type?: Database["public"]["Enums"]["ticket_tier_type"]
          total_capacity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          dynamic_pricing_enabled?: boolean
          event_id?: string
          hidden_until?: string | null
          id?: string
          is_active?: boolean
          is_visible?: boolean
          max_per_order?: number
          metadata?: Json | null
          min_per_order?: number
          name?: string
          price?: number
          requires_access_code?: boolean
          reserved_count?: number
          sale_end?: string | null
          sale_start?: string | null
          seat_map_section_id?: string | null
          sold_count?: number
          sort_order?: number
          tier_type?: Database["public"]["Enums"]["ticket_tier_type"]
          total_capacity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tiers_seat_map_section_fk"
            columns: ["seat_map_section_id"]
            isOneToOne: false
            referencedRelation: "seat_map_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          event_id: string
          first_scanned_at: string | null
          holder_email: string
          holder_name: string | null
          id: string
          idx_in_item: number
          last_scanned_at: string | null
          order_id: string
          order_item_id: string
          refunded_at: string | null
          scan_count: number
          scanned_by: string | null
          seat_id: string | null
          secret: string
          status: string
          ticket_code: string
          ticket_tier_id: string | null
          transferred_to_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          first_scanned_at?: string | null
          holder_email: string
          holder_name?: string | null
          id?: string
          idx_in_item: number
          last_scanned_at?: string | null
          order_id: string
          order_item_id: string
          refunded_at?: string | null
          scan_count?: number
          scanned_by?: string | null
          seat_id?: string | null
          secret?: string
          status?: string
          ticket_code: string
          ticket_tier_id?: string | null
          transferred_to_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          first_scanned_at?: string | null
          holder_email?: string
          holder_name?: string | null
          id?: string
          idx_in_item?: number
          last_scanned_at?: string | null
          order_id?: string
          order_item_id?: string
          refunded_at?: string | null
          scan_count?: number
          scanned_by?: string | null
          seat_id?: string | null
          secret?: string
          status?: string
          ticket_code?: string
          ticket_tier_id?: string | null
          transferred_to_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_access_codes: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          id: string
          is_active: boolean
          max_uses: number | null
          ticket_tier_id: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          ticket_tier_id: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          ticket_tier_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tier_access_codes_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_progression_log: {
        Row: {
          created_at: string
          from_tier: string
          id: string
          metadata: Json
          organisation_id: string
          reason: string
          to_tier: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          from_tier: string
          id?: string
          metadata?: Json
          organisation_id: string
          reason: string
          to_tier: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          from_tier?: string
          id?: string
          metadata?: Json
          organisation_id?: string
          reason?: string
          to_tier?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tier_progression_log_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_progression_log_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          organisation_id: string
          postal_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          organisation_id: string
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          organisation_id?: string
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_queue: {
        Row: {
          admitted_at: string | null
          created_at: string
          event_id: string
          expires_at: string | null
          id: string
          ip_address: unknown
          position: number
          position_token: string
          session_id: string | null
          status: Database["public"]["Enums"]["queue_status"]
          user_id: string | null
        }
        Insert: {
          admitted_at?: string | null
          created_at?: string
          event_id: string
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          position: number
          position_token: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          user_id?: string | null
        }
        Update: {
          admitted_at?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          position?: number
          position_token?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          converted_at: string | null
          created_at: string
          event_id: string
          expired_at: string | null
          id: string
          notified_at: string | null
          position: number
          quantity_requested: number
          status: Database["public"]["Enums"]["waitlist_status"]
          ticket_tier_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          event_id: string
          expired_at?: string | null
          id?: string
          notified_at?: string | null
          position: number
          quantity_requested?: number
          status?: Database["public"]["Enums"]["waitlist_status"]
          ticket_tier_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          event_id?: string
          expired_at?: string | null
          id?: string
          notified_at?: string | null
          position?: number
          quantity_requested?: number
          status?: Database["public"]["Enums"]["waitlist_status"]
          ticket_tier_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_notifications: {
        Row: {
          converted: boolean
          converted_at: string | null
          email_sent: boolean
          expires_at: string
          id: string
          notified_at: string
          waitlist_id: string
        }
        Insert: {
          converted?: boolean
          converted_at?: string | null
          email_sent?: boolean
          expires_at: string
          id?: string
          notified_at?: string
          waitlist_id: string
        }
        Update: {
          converted?: boolean
          converted_at?: string | null
          email_sent?: boolean
          expires_at?: string
          id?: string
          notified_at?: string
          waitlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_notifications_waitlist_id_fkey"
            columns: ["waitlist_id"]
            isOneToOne: false
            referencedRelation: "waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admit_queue_batch: {
        Args: {
          p_admission_window_minutes?: number
          p_batch_size?: number
          p_event_id: string
        }
        Returns: number
      }
      confirm_order: { Args: { p_order_id: string }; Returns: boolean }
      create_refund_request: {
        Args: {
          p_actor_id: string
          p_buyer_message?: string
          p_initiator: Database["public"]["Enums"]["refund_initiator"]
          p_order_id: string
          p_reason: Database["public"]["Enums"]["refund_reason"]
          p_ticket_ids: string[]
        }
        Returns: {
          amount_cents: number
          currency: string
          payment_intent_id: string
          refund_id: string
        }[]
      }
      create_reservation: {
        Args: {
          p_event_id: string
          p_items?: Json
          p_session_id?: string
          p_ttl_minutes?: number
          p_user_id?: string
        }
        Returns: Json
      }
      create_seat_reservation: {
        Args: {
          p_event_id: string
          p_seat_ids: string[]
          p_ttl_minutes?: number
          p_user_id: string
        }
        Returns: Json
      }
      disburse_payout: {
        Args: {
          p_actor?: string
          p_amount_cents?: number
          p_currency: string
          p_organisation_id: string
        }
        Returns: Json
      }
      enter_queue: {
        Args: {
          p_event_id: string
          p_ip_address: unknown
          p_position_token: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      events_within_distance: {
        Args: { p_lat: number; p_lng: number; p_radius_km: number }
        Returns: {
          age_restriction_min: number | null
          category_id: string | null
          city_primary: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          community_primary: string | null
          description: string | null
          end_date: string
          event_type: Database["public"]["Enums"]["event_type"]
          fee_pass_type: Database["public"]["Enums"]["fee_pass_type"]
          gallery_urls: Json | null
          genre_slug: string | null
          has_reserved_seating: boolean
          id: string
          is_age_restricted: boolean
          is_featured: boolean
          is_free: boolean | null
          is_high_demand: boolean
          is_multi_day: boolean
          is_recurring: boolean
          max_capacity: number | null
          metadata: Json | null
          organisation_id: string
          parent_event_id: string | null
          published_at: string | null
          queue_admission_window_minutes: number
          recurrence_rule: string | null
          scheduled_publish_at: string | null
          seat_map_id: string | null
          slug: string
          squad_booking_enabled: boolean
          squad_timeout_hours: number
          start_date: string
          status: Database["public"]["Enums"]["event_status"]
          sub_community: string | null
          subgenre_slug: string | null
          suburb_primary: string | null
          summary: string | null
          tags: Json | null
          thumbnail_url: string | null
          timezone: string
          title: string
          updated_at: string
          venue_address: string | null
          venue_city: string | null
          venue_country: string | null
          venue_id: string | null
          venue_latitude: number | null
          venue_longitude: number | null
          venue_name: string | null
          venue_place_id: string | null
          venue_postal_code: string | null
          venue_state: string | null
          virtual_url: string | null
          visibility: Database["public"]["Enums"]["event_visibility"]
          waitlist_enabled: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_stale_queue_admissions: { Args: never; Returns: number }
      expire_stale_reservations: { Args: never; Returns: number }
      expire_stale_squads: {
        Args: never
        Returns: {
          event_id: string
          reservation_id: string
          share_token: string
          squad_id: string
          ticket_tier_id: string
          total_spots: number
        }[]
      }
      expire_waitlist_notifications: { Args: never; Returns: number }
      gen_ticket_code: { Args: never; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      get_current_tier_price: { Args: { p_tier_id: string }; Returns: number }
      issue_tickets_for_order: { Args: { p_order_id: string }; Returns: number }
      join_waitlist: {
        Args: {
          p_event_id: string
          p_quantity?: number
          p_ticket_tier_id: string
          p_user_id: string
        }
        Returns: Json
      }
      materialize_seats: {
        Args: { p_event_id: string; p_seat_map_id: string }
        Returns: number
      }
      organiser_available_balance: {
        Args: { p_currency: string; p_organisation_id: string }
        Returns: number
      }
      promote_waitlist: {
        Args: {
          p_event_id: string
          p_notification_window_minutes?: number
          p_quantity_available: number
          p_ticket_tier_id: string
        }
        Returns: number
      }
      reconcile_refund: {
        Args: {
          p_charge_id: string
          p_refund_amount_cents: number
          p_stripe_refund_id: string
        }
        Returns: string
      }
      release_holds: { Args: never; Returns: number }
      scan_ticket: {
        Args: { p_event_id: string; p_secret: string; p_ticket_code: string }
        Returns: {
          first_scanned_at: string | null
          holder_name: string | null
          result: string
        }[]
      }
      transition_payment_status: {
        Args: {
          p_gateway_data?: Json
          p_new_status: Database["public"]["Enums"]["payment_status"]
          p_payment_id: string
        }
        Returns: boolean
      }
      void_payout: {
        Args: { p_payout_id: string; p_reason?: string; p_status?: string }
        Returns: Json
      }
    }
    Enums: {
      admin_role: "super_admin" | "admin" | "support" | "moderator"
      discount_type: "percentage" | "fixed_amount"
      event_status:
        | "draft"
        | "scheduled"
        | "published"
        | "paused"
        | "postponed"
        | "cancelled"
        | "completed"
      event_type: "in_person" | "virtual" | "hybrid"
      event_visibility: "public" | "private" | "unlisted"
      fee_pass_type: "absorb" | "pass_to_buyer"
      order_status:
        | "pending"
        | "confirmed"
        | "partially_refunded"
        | "refunded"
        | "cancelled"
        | "expired"
      org_member_role: "owner" | "admin" | "manager" | "member"
      org_status: "pending" | "active" | "suspended" | "deactivated"
      payment_gateway: "stripe" | "paystack" | "flutterwave" | "paypal"
      payment_status:
        | "initiated"
        | "processing"
        | "requires_action"
        | "completed"
        | "failed"
        | "expired"
        | "cancelled"
        | "refund_pending"
        | "refunded"
        | "refund_failed"
      queue_status: "waiting" | "admitted" | "expired" | "abandoned"
      refund_initiator: "buyer" | "organiser" | "admin" | "system"
      refund_reason:
        | "requested_by_buyer"
        | "duplicate"
        | "fraudulent"
        | "event_cancelled"
        | "cannot_attend"
        | "other"
      refund_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      reservation_status: "active" | "converted" | "expired" | "cancelled"
      seat_status:
        | "available"
        | "reserved"
        | "sold"
        | "held"
        | "blocked"
        | "accessible"
      seat_type:
        | "standard"
        | "premium"
        | "accessible"
        | "companion"
        | "restricted_view"
        | "obstructed"
      squad_member_status: "invited" | "paid" | "declined" | "timed_out"
      squad_status: "forming" | "completed" | "expired" | "cancelled"
      ticket_tier_type:
        | "general_admission"
        | "vip"
        | "vvip"
        | "early_bird"
        | "group"
        | "student"
        | "table_booth"
        | "donation"
        | "free"
      user_role: "attendee" | "organiser" | "admin" | "super_admin"
      waitlist_status:
        | "waiting"
        | "notified"
        | "converted"
        | "expired"
        | "removed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_role: ["super_admin", "admin", "support", "moderator"],
      discount_type: ["percentage", "fixed_amount"],
      event_status: [
        "draft",
        "scheduled",
        "published",
        "paused",
        "postponed",
        "cancelled",
        "completed",
      ],
      event_type: ["in_person", "virtual", "hybrid"],
      event_visibility: ["public", "private", "unlisted"],
      fee_pass_type: ["absorb", "pass_to_buyer"],
      order_status: [
        "pending",
        "confirmed",
        "partially_refunded",
        "refunded",
        "cancelled",
        "expired",
      ],
      org_member_role: ["owner", "admin", "manager", "member"],
      org_status: ["pending", "active", "suspended", "deactivated"],
      payment_gateway: ["stripe", "paystack", "flutterwave", "paypal"],
      payment_status: [
        "initiated",
        "processing",
        "requires_action",
        "completed",
        "failed",
        "expired",
        "cancelled",
        "refund_pending",
        "refunded",
        "refund_failed",
      ],
      queue_status: ["waiting", "admitted", "expired", "abandoned"],
      refund_initiator: ["buyer", "organiser", "admin", "system"],
      refund_reason: [
        "requested_by_buyer",
        "duplicate",
        "fraudulent",
        "event_cancelled",
        "cannot_attend",
        "other",
      ],
      refund_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      reservation_status: ["active", "converted", "expired", "cancelled"],
      seat_status: [
        "available",
        "reserved",
        "sold",
        "held",
        "blocked",
        "accessible",
      ],
      seat_type: [
        "standard",
        "premium",
        "accessible",
        "companion",
        "restricted_view",
        "obstructed",
      ],
      squad_member_status: ["invited", "paid", "declined", "timed_out"],
      squad_status: ["forming", "completed", "expired", "cancelled"],
      ticket_tier_type: [
        "general_admission",
        "vip",
        "vvip",
        "early_bird",
        "group",
        "student",
        "table_booth",
        "donation",
        "free",
      ],
      user_role: ["attendee", "organiser", "admin", "super_admin"],
      waitlist_status: [
        "waiting",
        "notified",
        "converted",
        "expired",
        "removed",
      ],
    },
  },
} as const
// BEGIN LEGACY ALIASES (handwritten, not regenerated)
// ============================================================================
// Convenience aliases the codebase imports by name. The previous handwritten
// src/types/database.ts exposed these as inline string-literal unions and
// standalone interfaces; the Supabase type generator does not emit them.
// Each alias here resolves to the canonical Database['public']... shape or
// Postgres enum so the consuming import surface stays ergonomic while the
// source of truth remains the live schema.
//
// CI guard: .github/workflows/ci.yml > types-drift-guard regenerates the
// types from the live DB on every CI run and diffs against the committed
// generated section. This appendix is BELOW the BEGIN LEGACY ALIASES marker
// so the guard strips it before diffing and append-only changes here do not
// cause false-positive drift alerts. Modifying anything ABOVE the marker
// requires a corresponding live-schema change.
//
// Maintenance rules:
//   1. Row-shape aliases derive from Database['public']['Tables'][X]['Row'].
//      They auto-sync; nothing to maintain.
//   2. Enum aliases derive from Database['public']['Enums'][X]. They
//      auto-sync; nothing to maintain.
//   3. TEXT + CHECK column aliases are pinned as explicit string-literal
//      unions, each with a comment naming the table.column.check_name the
//      union MUST stay in sync with. Adding a value to the CHECK in a
//      migration requires updating the matching alias below or a runtime
//      cast will widen-silently. The CI guard does not catch this class;
//      review the migration diff manually when CHECK lists change.
// ============================================================================

// --- Row-shape aliases ------------------------------------------------------

export type Event         = Database['public']['Tables']['events']['Row']
export type Order         = Database['public']['Tables']['orders']['Row']
export type OrderItem     = Database['public']['Tables']['order_items']['Row']
export type Payment       = Database['public']['Tables']['payments']['Row']
export type TicketTier    = Database['public']['Tables']['ticket_tiers']['Row']
export type EventAddon    = Database['public']['Tables']['event_addons']['Row']
export type EventCategory = Database['public']['Tables']['event_categories']['Row']
export type Organisation  = Database['public']['Tables']['organisations']['Row']
export type DiscountCode  = Database['public']['Tables']['discount_codes']['Row']
export type Squad         = Database['public']['Tables']['squads']['Row']
export type SquadMember   = Database['public']['Tables']['squad_members']['Row']

// --- Enum aliases (real Postgres enums, auto-derived) -----------------------

export type EventStatus        = Database['public']['Enums']['event_status']
export type EventVisibility    = Database['public']['Enums']['event_visibility']
export type EventType          = Database['public']['Enums']['event_type']
export type FeePassType        = Database['public']['Enums']['fee_pass_type']
export type TicketTierType     = Database['public']['Enums']['ticket_tier_type']
export type SquadStatus        = Database['public']['Enums']['squad_status']
export type SquadMemberStatus  = Database['public']['Enums']['squad_member_status']

// --- TEXT + CHECK column aliases (manually pinned, see header rule 3) ------

// public.payouts.status (TEXT column, CHECK constraint payouts_status_check).
// Live constraint (verified via pg_constraint on 2026-05-29):
//   CHECK (status = ANY (ARRAY['pending','in_transit','paid','failed','canceled']))
// Note 'canceled' (US spelling) is the Stripe-API value; AU spelling is not
// used for this column because the payouts table mirrors Stripe payout states.
export type PayoutRecordStatus =
  | 'pending'
  | 'in_transit'
  | 'paid'
  | 'failed'
  | 'canceled'

// ============================================================================
// END LEGACY ALIASES
// ============================================================================
