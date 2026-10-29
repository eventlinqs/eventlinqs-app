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
          available_for_booking: boolean
          bio: string | null
          city_slug: string | null
          created_at: string
          draw_consent: boolean
          genres: string[]
          id: string
          image_url: string | null
          links: Json
          mentor_open: boolean
          name: string
          owner_user_id: string | null
          pay_expectation: string | null
          performance_types: string[]
          showcase_embeds: Json
          slug: string
          updated_at: string
        }
        Insert: {
          available_for_booking?: boolean
          bio?: string | null
          city_slug?: string | null
          created_at?: string
          draw_consent?: boolean
          genres?: string[]
          id?: string
          image_url?: string | null
          links?: Json
          mentor_open?: boolean
          name: string
          owner_user_id?: string | null
          pay_expectation?: string | null
          performance_types?: string[]
          showcase_embeds?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          available_for_booking?: boolean
          bio?: string | null
          city_slug?: string | null
          created_at?: string
          draw_consent?: boolean
          genres?: string[]
          id?: string
          image_url?: string | null
          links?: Json
          mentor_open?: boolean
          name?: string
          owner_user_id?: string | null
          pay_expectation?: string | null
          performance_types?: string[]
          showcase_embeds?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artists_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
        ]
      }
      audience_members: {
        Row: {
          arrival_device: string | null
          arrival_referrer_host: string | null
          arrival_utm_campaign: string | null
          arrival_utm_medium: string | null
          arrival_utm_source: string | null
          category_slugs: string[]
          city_slugs: string[]
          community_slugs: string[]
          consent_at: string
          consent_channel: string
          consent_source: string
          consent_state: boolean
          consent_text: string
          consent_version: string
          created_at: string
          display_name: string | null
          email: string
          first_order_at: string
          id: string
          last_category_slug: string | null
          last_city_slug: string | null
          last_event_id: string | null
          last_order_at: string
          last_order_id: string | null
          lifetime_spend_cents: number
          order_count: number
          postcode: string | null
          price_band: string
          refreshed_at: string
          user_id: string | null
        }
        Insert: {
          arrival_device?: string | null
          arrival_referrer_host?: string | null
          arrival_utm_campaign?: string | null
          arrival_utm_medium?: string | null
          arrival_utm_source?: string | null
          category_slugs?: string[]
          city_slugs?: string[]
          community_slugs?: string[]
          consent_at: string
          consent_channel?: string
          consent_source: string
          consent_state?: boolean
          consent_text: string
          consent_version: string
          created_at?: string
          display_name?: string | null
          email: string
          first_order_at: string
          id?: string
          last_category_slug?: string | null
          last_city_slug?: string | null
          last_event_id?: string | null
          last_order_at: string
          last_order_id?: string | null
          lifetime_spend_cents?: number
          order_count?: number
          postcode?: string | null
          price_band: string
          refreshed_at?: string
          user_id?: string | null
        }
        Update: {
          arrival_device?: string | null
          arrival_referrer_host?: string | null
          arrival_utm_campaign?: string | null
          arrival_utm_medium?: string | null
          arrival_utm_source?: string | null
          category_slugs?: string[]
          city_slugs?: string[]
          community_slugs?: string[]
          consent_at?: string
          consent_channel?: string
          consent_source?: string
          consent_state?: boolean
          consent_text?: string
          consent_version?: string
          created_at?: string
          display_name?: string | null
          email?: string
          first_order_at?: string
          id?: string
          last_category_slug?: string | null
          last_city_slug?: string | null
          last_event_id?: string | null
          last_order_at?: string
          last_order_id?: string | null
          lifetime_spend_cents?: number
          order_count?: number
          postcode?: string | null
          price_band?: string
          refreshed_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audience_members_last_event_id_fkey"
            columns: ["last_event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_members_last_event_id_fkey"
            columns: ["last_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_members_last_order_id_fkey"
            columns: ["last_order_id"]
            isOneToOne: false
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_members_last_order_id_fkey"
            columns: ["last_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      booking_requests: {
        Row: {
          application_id: string | null
          artist_id: string
          created_at: string
          event_id: string | null
          from_artist_id: string | null
          gig_id: string | null
          id: string
          kind: string
          note: string
          organisation_id: string | null
          pay_amount_cents: number | null
          pay_note: string | null
          pay_type: string | null
          proposed_date: string | null
          responded_at: string | null
          sent_by: string | null
          status: string
          subject: string
        }
        Insert: {
          application_id?: string | null
          artist_id: string
          created_at?: string
          event_id?: string | null
          from_artist_id?: string | null
          gig_id?: string | null
          id?: string
          kind?: string
          note?: string
          organisation_id?: string | null
          pay_amount_cents?: number | null
          pay_note?: string | null
          pay_type?: string | null
          proposed_date?: string | null
          responded_at?: string | null
          sent_by?: string | null
          status?: string
          subject: string
        }
        Update: {
          application_id?: string | null
          artist_id?: string
          created_at?: string
          event_id?: string | null
          from_artist_id?: string | null
          gig_id?: string | null
          id?: string
          kind?: string
          note?: string
          organisation_id?: string | null
          pay_amount_cents?: number | null
          pay_note?: string | null
          pay_type?: string | null
          proposed_date?: string | null
          responded_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "gig_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_from_artist_id_fkey"
            columns: ["from_artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          country: string
          created_at: string
          description: string | null
          display_order: number
          free_guide: boolean
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
          timezone: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          description?: string | null
          display_order?: number
          free_guide?: boolean
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
          timezone: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          description?: string | null
          display_order?: number
          free_guide?: boolean
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
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      city_waitlist_signups: {
        Row: {
          city_slug: string
          consent_text: string
          consent_version: string
          created_at: string
          email: string
          founding_candidate: boolean
          full_name: string
          id: string
          marketing_opt_in: boolean
          role: string
          source: string
          unsubscribe_token: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          city_slug: string
          consent_text: string
          consent_version?: string
          created_at?: string
          email: string
          founding_candidate?: boolean
          full_name: string
          id?: string
          marketing_opt_in?: boolean
          role: string
          source?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          city_slug?: string
          consent_text?: string
          consent_version?: string
          created_at?: string
          email?: string
          founding_candidate?: boolean
          full_name?: string
          id?: string
          marketing_opt_in?: boolean
          role?: string
          source?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
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
      community_contributions: {
        Row: {
          amount_cents: number
          city: string | null
          created_at: string
          currency: string
          event_id: string | null
          id: string
          order_id: string
        }
        Insert: {
          amount_cents: number
          city?: string | null
          created_at?: string
          currency?: string
          event_id?: string | null
          id?: string
          order_id: string
        }
        Update: {
          amount_cents?: number
          city?: string | null
          created_at?: string
          currency?: string
          event_id?: string | null
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_contributions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_contributions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_contributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_contributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      community_tag_map: {
        Row: {
          community_slug: string
          tokens: string[]
        }
        Insert: {
          community_slug: string
          tokens: string[]
        }
        Update: {
          community_slug?: string
          tokens?: string[]
        }
        Relationships: []
      }
      connect_requirement_watch: {
        Row: {
          bucket: string
          first_seen_at: string
          last_seen_at: string
          requirement: string
          stripe_account_id: string
        }
        Insert: {
          bucket: string
          first_seen_at?: string
          last_seen_at?: string
          requirement: string
          stripe_account_id: string
        }
        Update: {
          bucket?: string
          first_seen_at?: string
          last_seen_at?: string
          requirement?: string
          stripe_account_id?: string
        }
        Relationships: []
      }
      consent_events: {
        Row: {
          capture_surface: string
          channel_scope: string
          city_slug: string | null
          created_at: string
          decision: string
          id: string
          ip_or_session_ref: string | null
          occurred_at: string
          purpose: string
          subject_email: string
          subject_mobile_hash: string | null
          suppression_scope: string
          tenant_id: string
          third_party_scope: string
          wording: string
          wording_version: string
        }
        Insert: {
          capture_surface: string
          channel_scope: string
          city_slug?: string | null
          created_at?: string
          decision: string
          id?: string
          ip_or_session_ref?: string | null
          occurred_at?: string
          purpose: string
          subject_email: string
          subject_mobile_hash?: string | null
          suppression_scope: string
          tenant_id: string
          third_party_scope: string
          wording: string
          wording_version: string
        }
        Update: {
          capture_surface?: string
          channel_scope?: string
          city_slug?: string | null
          created_at?: string
          decision?: string
          id?: string
          ip_or_session_ref?: string | null
          occurred_at?: string
          purpose?: string
          subject_email?: string
          subject_mobile_hash?: string | null
          suppression_scope?: string
          tenant_id?: string
          third_party_scope?: string
          wording?: string
          wording_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "consent_events_purpose_fkey"
            columns: ["purpose"]
            isOneToOne: false
            referencedRelation: "consent_purposes"
            referencedColumns: ["purpose"]
          },
          {
            foreignKeyName: "consent_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "marketing_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_policy: {
        Row: {
          id: boolean
          max_age_months: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          max_age_months?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          max_age_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      consent_purposes: {
        Row: {
          covers: string[]
          created_at: string
          facilitates_third_parties: boolean
          name: string
          purpose: string
        }
        Insert: {
          covers?: string[]
          created_at?: string
          facilitates_third_parties?: boolean
          name: string
          purpose: string
        }
        Update: {
          covers?: string[]
          created_at?: string
          facilitates_third_parties?: boolean
          name?: string
          purpose?: string
        }
        Relationships: []
      }
      consent_wordings: {
        Row: {
          body: string
          channel_scope: string
          created_at: string
          effective_from: string
          id: string
          label: string
          purpose: string
          suppression_scope: string
          third_party_scope: string
          version: string
        }
        Insert: {
          body: string
          channel_scope: string
          created_at?: string
          effective_from?: string
          id?: string
          label: string
          purpose: string
          suppression_scope: string
          third_party_scope: string
          version: string
        }
        Update: {
          body?: string
          channel_scope?: string
          created_at?: string
          effective_from?: string
          id?: string
          label?: string
          purpose?: string
          suppression_scope?: string
          third_party_scope?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_wordings_purpose_fkey"
            columns: ["purpose"]
            isOneToOne: false
            referencedRelation: "consent_purposes"
            referencedColumns: ["purpose"]
          },
        ]
      }
      digest_sends: {
        Row: {
          audience_count: number
          city_slug: string
          completed_at: string | null
          event_count: number
          id: string
          period_end: string
          period_start: string
          recipient_count: number
          sent_at: string
        }
        Insert: {
          audience_count?: number
          city_slug: string
          completed_at?: string | null
          event_count?: number
          id?: string
          period_end: string
          period_start: string
          recipient_count?: number
          sent_at?: string
        }
        Update: {
          audience_count?: number
          city_slug?: string
          completed_at?: string | null
          event_count?: number
          id?: string
          period_end?: string
          period_start?: string
          recipient_count?: number
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digest_sends_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
        ]
      }
      discount_code_claims: {
        Row: {
          claimed_at: string
          discount_code_id: string
          reservation_id: string
        }
        Insert: {
          claimed_at?: string
          discount_code_id: string
          reservation_id: string
        }
        Update: {
          claimed_at?: string
          discount_code_id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_code_claims_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_code_claims_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "api_v1_orders"
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
          reserved_uses: number
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
          reserved_uses?: number
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
          reserved_uses?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
          invite_token: string | null
          status: string
        }
        Insert: {
          artist_id: string
          billing_order?: number
          created_at?: string
          event_id: string
          id?: string
          invite_token?: string | null
          status?: string
        }
        Update: {
          artist_id?: string
          billing_order?: number
          created_at?: string
          event_id?: string
          id?: string
          invite_token?: string | null
          status?: string
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
            referencedRelation: "api_v1_events"
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
      event_booking_links: {
        Row: {
          availability: string
          created_at: string
          event_id: string
          id: string
          is_primary: boolean
          kind: string
          pointed_to_by_organiser: boolean
          position: number
          price_checked_at: string | null
          price_from_cents: number | null
          provider: string
          set_by: string
          updated_at: string
          url: string
        }
        Insert: {
          availability?: string
          created_at?: string
          event_id: string
          id?: string
          is_primary?: boolean
          kind?: string
          pointed_to_by_organiser?: boolean
          position?: number
          price_checked_at?: string | null
          price_from_cents?: number | null
          provider: string
          set_by: string
          updated_at?: string
          url: string
        }
        Update: {
          availability?: string
          created_at?: string
          event_id?: string
          id?: string
          is_primary?: boolean
          kind?: string
          pointed_to_by_organiser?: boolean
          position?: number
          price_checked_at?: string | null
          price_from_cents?: number | null
          provider?: string
          set_by?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_booking_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_booking_links_event_id_fkey"
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
      event_collaborators: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          asked_at: string
          asked_by: string | null
          event_id: string
          id: string
          organisation_id: string
          role: string
          status: string
          venue_id: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          asked_at?: string
          asked_by?: string | null
          event_id: string
          id?: string
          organisation_id: string
          role?: string
          status?: string
          venue_id: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          asked_at?: string
          asked_by?: string | null
          event_id?: string
          id?: string
          organisation_id?: string
          role?: string
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_collaborators_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_collaborators_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_collaborators_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_collaborators_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_group_rates: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          min_group_size: number
          ticket_tier_id: string
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          min_group_size?: number
          ticket_tier_id: string
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          min_group_size?: number
          ticket_tier_id?: string
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_group_rates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_group_rates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_group_rates_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: true
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guides: {
        Row: {
          access_notes: string | null
          at_a_glance: Json
          cover_credit: string | null
          created_at: string
          days: Json
          event_id: string
          getting_there: string | null
          highlights: Json
          highlights_note: string | null
          photo_credit: string | null
          photos_heading: string | null
          program_note: string | null
          program_published_at: string | null
          quote_attribution: string | null
          quote_text: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          at_a_glance?: Json
          cover_credit?: string | null
          created_at?: string
          days?: Json
          event_id: string
          getting_there?: string | null
          highlights?: Json
          highlights_note?: string | null
          photo_credit?: string | null
          photos_heading?: string | null
          program_note?: string | null
          program_published_at?: string | null
          quote_attribution?: string | null
          quote_text?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          at_a_glance?: Json
          cover_credit?: string | null
          created_at?: string
          days?: Json
          event_id?: string
          getting_there?: string | null
          highlights?: Json
          highlights_note?: string | null
          photo_credit?: string | null
          photos_heading?: string | null
          program_note?: string | null
          program_published_at?: string | null
          quote_attribution?: string | null
          quote_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_guides_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guides_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_image_rights: {
        Row: {
          derived_at: string
          event_id: string
          image_role: string
          image_url: string
          provenance: string
          rights_expire_at: string | null
          rights_state: string
          social_asset_id: string | null
        }
        Insert: {
          derived_at?: string
          event_id: string
          image_role: string
          image_url: string
          provenance: string
          rights_expire_at?: string | null
          rights_state: string
          social_asset_id?: string | null
        }
        Update: {
          derived_at?: string
          event_id?: string
          image_role?: string
          image_url?: string
          provenance?: string
          rights_expire_at?: string | null
          rights_state?: string
          social_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_image_rights_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_image_rights_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_image_rights_social_asset_id_fkey"
            columns: ["social_asset_id"]
            isOneToOne: false
            referencedRelation: "social_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminder_sends: {
        Row: {
          claimed_at: string
          error: string | null
          id: string
          kind: string
          provider_message_id: string | null
          reminder_id: string
          sent_at: string | null
        }
        Insert: {
          claimed_at?: string
          error?: string | null
          id?: string
          kind: string
          provider_message_id?: string | null
          reminder_id: string
          sent_at?: string | null
        }
        Update: {
          claimed_at?: string
          error?: string | null
          id?: string
          kind?: string
          provider_message_id?: string | null
          reminder_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reminder_sends_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "event_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminders: {
        Row: {
          consent_text: string
          consent_version: string
          created_at: string
          email: string
          event_id: string
          id: string
          requested_at: string
          unsubscribe_token: string
          unsubscribed_at: string | null
        }
        Insert: {
          consent_text: string
          consent_version: string
          created_at?: string
          email: string
          event_id: string
          id?: string
          requested_at?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Update: {
          consent_text?: string
          consent_version?: string
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          requested_at?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          age_restriction_min: number | null
          anchor_date: string
          booking_links: Json
          category_id: string | null
          created_at: string
          day: number
          donation_optional: boolean
          ends_at: string | null
          id: string
          instagram_post_url: string | null
          last_checked_on: string | null
          listing_source: string
          name: string
          organisation_id: string
          rule: string
          skip_dates: string[]
          starts_at: string
          status: string
          summary: string
          timezone: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          age_restriction_min?: number | null
          anchor_date: string
          booking_links?: Json
          category_id?: string | null
          created_at?: string
          day: number
          donation_optional?: boolean
          ends_at?: string | null
          id?: string
          instagram_post_url?: string | null
          last_checked_on?: string | null
          listing_source?: string
          name: string
          organisation_id: string
          rule: string
          skip_dates?: string[]
          starts_at: string
          status?: string
          summary: string
          timezone: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          age_restriction_min?: number | null
          anchor_date?: string
          booking_links?: Json
          category_id?: string | null
          created_at?: string
          day?: number
          donation_optional?: boolean
          ends_at?: string | null
          id?: string
          instagram_post_url?: string | null
          last_checked_on?: string | null
          listing_source?: string
          name?: string
          organisation_id?: string
          rule?: string
          skip_dates?: string[]
          starts_at?: string
          status?: string
          summary?: string
          timezone?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_series_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_stream_links: {
        Row: {
          event_id: string
          updated_at: string
          url: string
        }
        Insert: {
          event_id: string
          updated_at?: string
          url: string
        }
        Update: {
          event_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_stream_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_stream_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tombstones: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          event_id: string
          organisation_id: string | null
          slug: string
          status_at_delete: Database["public"]["Enums"]["event_status"]
          title: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          event_id: string
          organisation_id?: string | null
          slug: string
          status_at_delete: Database["public"]["Enums"]["event_status"]
          title: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          event_id?: string
          organisation_id?: string | null
          slug?: string
          status_at_delete?: Database["public"]["Enums"]["event_status"]
          title?: string
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
          allow_seat_self_service: boolean
          archived_at: string | null
          archived_by: string | null
          archived_from_status:
            | Database["public"]["Enums"]["event_status"]
            | null
          category_id: string | null
          city_primary: string | null
          community_primary: string | null
          cover_image_alt: string | null
          cover_image_blur: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          entry_mode: string
          event_type: Database["public"]["Enums"]["event_type"]
          external_ticket_url: string | null
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
          is_seed_data: boolean
          listing_fresh_until: string | null
          listing_series_id: string | null
          listing_source: string
          max_capacity: number | null
          metadata: Json | null
          occurrence_date: string | null
          organisation_id: string
          organiser_assigns_seats: boolean
          parent_event_id: string | null
          postponed_at: string | null
          previous_start_date: string | null
          published_at: string | null
          queue_admission_window_minutes: number
          recurrence_rule: string | null
          refund_policy_absorb_fee: boolean
          refund_policy_days: number
          refund_policy_self_service: boolean
          refund_policy_type: string
          rescheduled_at: string | null
          scheduled_publish_at: string | null
          seat_map_id: string | null
          slug: string
          squad_booking_enabled: boolean
          squad_timeout_hours: number
          start_date: string
          status: Database["public"]["Enums"]["event_status"]
          stream_geo_allow: string[] | null
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
          venue_geocode_source:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
          venue_geocoded_at: string | null
          venue_id: string | null
          venue_latitude: number | null
          venue_longitude: number | null
          venue_name: string | null
          venue_place_id: string | null
          venue_postal_code: string | null
          venue_state: string | null
          video_provider: string | null
          video_url: string | null
          virtual_url: string | null
          visibility: Database["public"]["Enums"]["event_visibility"]
          waitlist_enabled: boolean
        }
        Insert: {
          age_restriction_min?: number | null
          allow_seat_self_service?: boolean
          archived_at?: string | null
          archived_by?: string | null
          archived_from_status?:
            | Database["public"]["Enums"]["event_status"]
            | null
          category_id?: string | null
          city_primary?: string | null
          community_primary?: string | null
          cover_image_alt?: string | null
          cover_image_blur?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date: string
          entry_mode?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          external_ticket_url?: string | null
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
          is_seed_data?: boolean
          listing_fresh_until?: string | null
          listing_series_id?: string | null
          listing_source?: string
          max_capacity?: number | null
          metadata?: Json | null
          occurrence_date?: string | null
          organisation_id: string
          organiser_assigns_seats?: boolean
          parent_event_id?: string | null
          postponed_at?: string | null
          previous_start_date?: string | null
          published_at?: string | null
          queue_admission_window_minutes?: number
          recurrence_rule?: string | null
          refund_policy_absorb_fee?: boolean
          refund_policy_days?: number
          refund_policy_self_service?: boolean
          refund_policy_type?: string
          rescheduled_at?: string | null
          scheduled_publish_at?: string | null
          seat_map_id?: string | null
          slug: string
          squad_booking_enabled?: boolean
          squad_timeout_hours?: number
          start_date: string
          status?: Database["public"]["Enums"]["event_status"]
          stream_geo_allow?: string[] | null
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
          venue_geocode_source?:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
          venue_geocoded_at?: string | null
          venue_id?: string | null
          venue_latitude?: number | null
          venue_longitude?: number | null
          venue_name?: string | null
          venue_place_id?: string | null
          venue_postal_code?: string | null
          venue_state?: string | null
          video_provider?: string | null
          video_url?: string | null
          virtual_url?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
          waitlist_enabled?: boolean
        }
        Update: {
          age_restriction_min?: number | null
          allow_seat_self_service?: boolean
          archived_at?: string | null
          archived_by?: string | null
          archived_from_status?:
            | Database["public"]["Enums"]["event_status"]
            | null
          category_id?: string | null
          city_primary?: string | null
          community_primary?: string | null
          cover_image_alt?: string | null
          cover_image_blur?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string
          entry_mode?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          external_ticket_url?: string | null
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
          is_seed_data?: boolean
          listing_fresh_until?: string | null
          listing_series_id?: string | null
          listing_source?: string
          max_capacity?: number | null
          metadata?: Json | null
          occurrence_date?: string | null
          organisation_id?: string
          organiser_assigns_seats?: boolean
          parent_event_id?: string | null
          postponed_at?: string | null
          previous_start_date?: string | null
          published_at?: string | null
          queue_admission_window_minutes?: number
          recurrence_rule?: string | null
          refund_policy_absorb_fee?: boolean
          refund_policy_days?: number
          refund_policy_self_service?: boolean
          refund_policy_type?: string
          rescheduled_at?: string | null
          scheduled_publish_at?: string | null
          seat_map_id?: string | null
          slug?: string
          squad_booking_enabled?: boolean
          squad_timeout_hours?: number
          start_date?: string
          status?: Database["public"]["Enums"]["event_status"]
          stream_geo_allow?: string[] | null
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
          venue_geocode_source?:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
          venue_geocoded_at?: string | null
          venue_id?: string | null
          venue_latitude?: number | null
          venue_longitude?: number | null
          venue_name?: string | null
          venue_place_id?: string | null
          venue_postal_code?: string | null
          venue_state?: string | null
          video_provider?: string | null
          video_url?: string | null
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
            foreignKeyName: "events_community_primary_fkey"
            columns: ["community_primary"]
            isOneToOne: false
            referencedRelation: "communities"
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
            foreignKeyName: "events_genre_slug_fkey"
            columns: ["genre_slug"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "events_listing_series_id_fkey"
            columns: ["listing_series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
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
            referencedRelation: "api_v1_events"
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
      faster_payout_grants: {
        Row: {
          buffer_days: number
          granted_at: string
          granted_by: string
          id: string
          note: string | null
          organisation_id: string
          revoked_at: string | null
        }
        Insert: {
          buffer_days: number
          granted_at?: string
          granted_by: string
          id?: string
          note?: string | null
          organisation_id: string
          revoked_at?: string | null
        }
        Update: {
          buffer_days?: number
          granted_at?: string
          granted_by?: string
          id?: string
          note?: string | null
          organisation_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faster_payout_grants_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string
          enabled: boolean
          flag: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string
          enabled?: boolean
          flag: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string
          enabled?: boolean
          flag?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      forecast_runs: {
        Row: {
          capacity: number
          city_slug: string | null
          costs_cents: number
          created_at: string
          days_until_event: number
          email: string | null
          email_consent_at: string | null
          email_consent_text: string | null
          event_type: string | null
          fee_pass_type: string
          has_run_an_event_before: boolean | null
          id: string
          method: string
          outputs: Json
          referrer_host: string | null
          source_parameters: Json
          src: string | null
          ticket_price_cents: number
        }
        Insert: {
          capacity: number
          city_slug?: string | null
          costs_cents?: number
          created_at?: string
          days_until_event?: number
          email?: string | null
          email_consent_at?: string | null
          email_consent_text?: string | null
          event_type?: string | null
          fee_pass_type?: string
          has_run_an_event_before?: boolean | null
          id?: string
          method: string
          outputs: Json
          referrer_host?: string | null
          source_parameters: Json
          src?: string | null
          ticket_price_cents: number
        }
        Update: {
          capacity?: number
          city_slug?: string | null
          costs_cents?: number
          created_at?: string
          days_until_event?: number
          email?: string | null
          email_consent_at?: string | null
          email_consent_text?: string | null
          event_type?: string | null
          fee_pass_type?: string
          has_run_an_event_before?: boolean | null
          id?: string
          method?: string
          outputs?: Json
          referrer_host?: string | null
          source_parameters?: Json
          src?: string | null
          ticket_price_cents?: number
        }
        Relationships: []
      }
      founding_invites: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          accepted_org_id: string | null
          city_slug: string
          code: string
          created_at: string
          id: string
          invitee_email: string | null
          inviter_kind: string
          inviter_name: string
          inviter_org_id: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          accepted_org_id?: string | null
          city_slug: string
          code: string
          created_at?: string
          id?: string
          invitee_email?: string | null
          inviter_kind: string
          inviter_name: string
          inviter_org_id?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          accepted_org_id?: string | null
          city_slug?: string
          code?: string
          created_at?: string
          id?: string
          invitee_email?: string | null
          inviter_kind?: string
          inviter_name?: string
          inviter_org_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "founding_invites_accepted_org_id_fkey"
            columns: ["accepted_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "founding_invites_inviter_org_id_fkey"
            columns: ["inviter_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
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
      gig_applications: {
        Row: {
          applicant_user_id: string
          artist_id: string
          created_at: string
          gig_id: string
          id: string
          note: string
          status: string
          updated_at: string
        }
        Insert: {
          applicant_user_id: string
          artist_id: string
          created_at?: string
          gig_id: string
          id?: string
          note?: string
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_user_id?: string
          artist_id?: string
          created_at?: string
          gig_id?: string
          id?: string
          note?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gig_applications_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      gigs: {
        Row: {
          application_deadline: string
          city_slug: string
          created_at: string
          created_by: string | null
          description: string
          event_date: string
          event_id: string | null
          id: string
          organisation_id: string
          pay_amount_cents: number | null
          pay_note: string | null
          pay_type: string
          performance_type: string
          status: string
          title: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          application_deadline: string
          city_slug: string
          created_at?: string
          created_by?: string | null
          description?: string
          event_date: string
          event_id?: string | null
          id?: string
          organisation_id: string
          pay_amount_cents?: number | null
          pay_note?: string | null
          pay_type: string
          performance_type: string
          status?: string
          title: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          application_deadline?: string
          city_slug?: string
          created_at?: string
          created_by?: string | null
          description?: string
          event_date?: string
          event_id?: string | null
          id?: string
          organisation_id?: string
          pay_amount_cents?: number | null
          pay_note?: string | null
          pay_type?: string
          performance_type?: string
          status?: string
          title?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gigs_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "gigs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      go_presses: {
        Row: {
          day: string
          id: string
          piece_id: string
          pressed_at: string
          via: string
          visitor: string
        }
        Insert: {
          day: string
          id?: string
          piece_id: string
          pressed_at?: string
          via: string
          visitor: string
        }
        Update: {
          day?: string
          id?: string
          piece_id?: string
          pressed_at?: string
          via?: string
          visitor?: string
        }
        Relationships: [
          {
            foreignKeyName: "go_presses_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "social_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_poster_downloads: {
        Row: {
          downloaded_at: string
          event_id: string | null
          id: string
          organisation_id: string | null
        }
        Insert: {
          downloaded_at?: string
          event_id?: string | null
          id?: string
          organisation_id?: string | null
        }
        Update: {
          downloaded_at?: string
          event_id?: string | null
          id?: string
          organisation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kit_poster_downloads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_poster_downloads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_poster_downloads_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_cents: number | null
          attended: number | null
          buyer_hash: string | null
          contact_email: string | null
          created_at: string
          days_out: number | null
          demand_action:
            | Database["public"]["Enums"]["ledger_demand_action"]
            | null
          device: string | null
          fill_percent: number | null
          final_revenue_cents: number | null
          final_sold: number | null
          id: number
          inventory_action:
            | Database["public"]["Enums"]["ledger_inventory_action"]
            | null
          inventory_class: string | null
          inventory_class_ref: string | null
          kind: Database["public"]["Enums"]["ledger_entry_kind"]
          new_price_cents: number | null
          no_shows: number | null
          occurred_at: string
          occurrence_key: string
          old_price_cents: number | null
          organisation_id: string
          quantity: number | null
          referrer: string | null
          returning_buyer: boolean | null
          slot_id: string
          source_system: string
          unit_amount_cents: number | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_hash: string | null
        }
        Insert: {
          amount_cents?: number | null
          attended?: number | null
          buyer_hash?: string | null
          contact_email?: string | null
          created_at?: string
          days_out?: number | null
          demand_action?:
            | Database["public"]["Enums"]["ledger_demand_action"]
            | null
          device?: string | null
          fill_percent?: number | null
          final_revenue_cents?: number | null
          final_sold?: number | null
          id?: never
          inventory_action?:
            | Database["public"]["Enums"]["ledger_inventory_action"]
            | null
          inventory_class?: string | null
          inventory_class_ref?: string | null
          kind: Database["public"]["Enums"]["ledger_entry_kind"]
          new_price_cents?: number | null
          no_shows?: number | null
          occurred_at?: string
          occurrence_key: string
          old_price_cents?: number | null
          organisation_id: string
          quantity?: number | null
          referrer?: string | null
          returning_buyer?: boolean | null
          slot_id: string
          source_system?: string
          unit_amount_cents?: number | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_hash?: string | null
        }
        Update: {
          amount_cents?: number | null
          attended?: number | null
          buyer_hash?: string | null
          contact_email?: string | null
          created_at?: string
          days_out?: number | null
          demand_action?:
            | Database["public"]["Enums"]["ledger_demand_action"]
            | null
          device?: string | null
          fill_percent?: number | null
          final_revenue_cents?: number | null
          final_sold?: number | null
          id?: never
          inventory_action?:
            | Database["public"]["Enums"]["ledger_inventory_action"]
            | null
          inventory_class?: string | null
          inventory_class_ref?: string | null
          kind?: Database["public"]["Enums"]["ledger_entry_kind"]
          new_price_cents?: number | null
          no_shows?: number | null
          occurred_at?: string
          occurrence_key?: string
          old_price_cents?: number | null
          organisation_id?: string
          quantity?: number | null
          referrer?: string | null
          returning_buyer?: boolean | null
          slot_id?: string
          source_system?: string
          unit_amount_cents?: number | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "ledger_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_slots: {
        Row: {
          capacity: number | null
          category: string
          closed_at: string | null
          created_at: string
          id: string
          on_sale_at: string | null
          on_sale_days_before: number | null
          organisation_id: string
          postcode: string | null
          recovery_enabled: boolean
          slot_at: string
          source_ref: string
          source_system: string
          subcategory: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          category: string
          closed_at?: string | null
          created_at?: string
          id?: string
          on_sale_at?: string | null
          on_sale_days_before?: number | null
          organisation_id: string
          postcode?: string | null
          recovery_enabled?: boolean
          slot_at: string
          source_ref: string
          source_system?: string
          subcategory: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          on_sale_at?: string | null
          on_sale_days_before?: number | null
          organisation_id?: string
          postcode?: string | null
          recovery_enabled?: boolean
          slot_at?: string
          source_ref?: string
          source_system?: string
          subcategory?: string
          updated_at?: string
        }
        Relationships: []
      }
      listing_candidates: {
        Row: {
          change: string | null
          confidence: string
          decided_by: string
          description: string | null
          ends_at: string | null
          event_id: string | null
          found_at: string
          id: string
          image_url: string | null
          kind: string
          links: Json
          page_url: string
          published_series_id: string | null
          reasons: string[]
          refused_because: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string
          starts_at: string
          status: string
          title: string
          venue_address: string | null
          venue_name: string
        }
        Insert: {
          change?: string | null
          confidence?: string
          decided_by?: string
          description?: string | null
          ends_at?: string | null
          event_id?: string | null
          found_at?: string
          id?: string
          image_url?: string | null
          kind: string
          links?: Json
          page_url: string
          published_series_id?: string | null
          reasons?: string[]
          refused_because?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id: string
          starts_at: string
          status?: string
          title: string
          venue_address?: string | null
          venue_name: string
        }
        Update: {
          change?: string | null
          confidence?: string
          decided_by?: string
          description?: string | null
          ends_at?: string | null
          event_id?: string | null
          found_at?: string
          id?: string
          image_url?: string | null
          kind?: string
          links?: Json
          page_url?: string
          published_series_id?: string | null
          reasons?: string[]
          refused_because?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string
          starts_at?: string
          status?: string
          title?: string
          venue_address?: string | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_candidates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_candidates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_candidates_published_series_id_fkey"
            columns: ["published_series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "listing_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_checks: {
        Row: {
          checked_at: string
          id: string
          import_file: string
          outcome: string
          reuse_basis: string
          series_id: string
          source_date: string
          source_url: string
        }
        Insert: {
          checked_at?: string
          id?: string
          import_file: string
          outcome: string
          reuse_basis?: string
          series_id: string
          source_date: string
          source_url: string
        }
        Update: {
          checked_at?: string
          id?: string
          import_file?: string
          outcome?: string
          reuse_basis?: string
          series_id?: string
          source_date?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_checks_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_claims: {
        Row: {
          attempts: number
          claimant_name: string
          claimant_role: string
          claimant_user_id: string
          code_hash: string | null
          created_at: string
          email_used: string | null
          event_id: string | null
          expires_at: string | null
          id: string
          method: string
          permission_authority: boolean | null
          permission_given_at: string | null
          permission_scope: string | null
          permission_words: string | null
          status: string
          target_organisation_id: string | null
          venue_id: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          claimant_name: string
          claimant_role: string
          claimant_user_id: string
          code_hash?: string | null
          created_at?: string
          email_used?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          method: string
          permission_authority?: boolean | null
          permission_given_at?: string | null
          permission_scope?: string | null
          permission_words?: string | null
          status?: string
          target_organisation_id?: string | null
          venue_id?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          claimant_name?: string
          claimant_role?: string
          claimant_user_id?: string
          code_hash?: string | null
          created_at?: string
          email_used?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          method?: string
          permission_authority?: boolean | null
          permission_given_at?: string | null
          permission_scope?: string | null
          permission_words?: string | null
          status?: string
          target_organisation_id?: string | null
          venue_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_claims_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_claims_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_claims_target_organisation_id_fkey"
            columns: ["target_organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_claims_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_source_runs: {
        Row: {
          accepted_by_rule: number
          found: number
          http_status: number | null
          id: string
          landed: number
          outcome: string
          queued: number
          ran_at: string
          source_id: string
          succeeded: boolean
        }
        Insert: {
          accepted_by_rule?: number
          found?: number
          http_status?: number | null
          id?: string
          landed?: number
          outcome: string
          queued?: number
          ran_at?: string
          source_id: string
          succeeded: boolean
        }
        Update: {
          accepted_by_rule?: number
          found?: number
          http_status?: number | null
          id?: string
          landed?: number
          outcome?: string
          queued?: number
          ran_at?: string
          source_id?: string
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "listing_source_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "listing_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_sources: {
        Row: {
          acquisition_order: number | null
          category_id: string | null
          changes: string
          city_slug: string | null
          collection: string
          contact: string | null
          created_at: string
          id: string
          kind: string
          last_checked_at: string | null
          last_outcome: string | null
          last_success_at: string | null
          licence_owner: string | null
          may_redistribute_facts: string
          may_redistribute_facts_quote: string | null
          may_redistribute_facts_read_on: string | null
          may_redistribute_facts_url: string | null
          may_reuse_media: string
          may_reuse_media_quote: string | null
          may_reuse_media_read_on: string | null
          may_reuse_media_url: string | null
          may_scrape: string
          may_scrape_quote: string | null
          may_scrape_read_on: string | null
          may_scrape_url: string | null
          may_subscribe: string
          may_subscribe_quote: string | null
          may_subscribe_read_on: string | null
          may_subscribe_url: string | null
          may_use_dataset: string
          may_use_dataset_quote: string | null
          may_use_dataset_read_on: string | null
          may_use_dataset_url: string | null
          name: string
          notes: string | null
          organisation_id: string | null
          page_url: string
          permits_descriptions: boolean
          permits_facts: boolean
          permits_images: boolean
          permits_links: boolean
          source_type: string
          terms_quote: string | null
          terms_read_on: string | null
          terms_url: string | null
          updated_at: string
          venue_id: string | null
          verification: string
          verified_on: string | null
        }
        Insert: {
          acquisition_order?: number | null
          category_id?: string | null
          changes?: string
          city_slug?: string | null
          collection: string
          contact?: string | null
          created_at?: string
          id?: string
          kind: string
          last_checked_at?: string | null
          last_outcome?: string | null
          last_success_at?: string | null
          licence_owner?: string | null
          may_redistribute_facts?: string
          may_redistribute_facts_quote?: string | null
          may_redistribute_facts_read_on?: string | null
          may_redistribute_facts_url?: string | null
          may_reuse_media?: string
          may_reuse_media_quote?: string | null
          may_reuse_media_read_on?: string | null
          may_reuse_media_url?: string | null
          may_scrape?: string
          may_scrape_quote?: string | null
          may_scrape_read_on?: string | null
          may_scrape_url?: string | null
          may_subscribe?: string
          may_subscribe_quote?: string | null
          may_subscribe_read_on?: string | null
          may_subscribe_url?: string | null
          may_use_dataset?: string
          may_use_dataset_quote?: string | null
          may_use_dataset_read_on?: string | null
          may_use_dataset_url?: string | null
          name: string
          notes?: string | null
          organisation_id?: string | null
          page_url: string
          permits_descriptions?: boolean
          permits_facts?: boolean
          permits_images?: boolean
          permits_links?: boolean
          source_type?: string
          terms_quote?: string | null
          terms_read_on?: string | null
          terms_url?: string | null
          updated_at?: string
          venue_id?: string | null
          verification?: string
          verified_on?: string | null
        }
        Update: {
          acquisition_order?: number | null
          category_id?: string | null
          changes?: string
          city_slug?: string | null
          collection?: string
          contact?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_checked_at?: string | null
          last_outcome?: string | null
          last_success_at?: string | null
          licence_owner?: string | null
          may_redistribute_facts?: string
          may_redistribute_facts_quote?: string | null
          may_redistribute_facts_read_on?: string | null
          may_redistribute_facts_url?: string | null
          may_reuse_media?: string
          may_reuse_media_quote?: string | null
          may_reuse_media_read_on?: string | null
          may_reuse_media_url?: string | null
          may_scrape?: string
          may_scrape_quote?: string | null
          may_scrape_read_on?: string | null
          may_scrape_url?: string | null
          may_subscribe?: string
          may_subscribe_quote?: string | null
          may_subscribe_read_on?: string | null
          may_subscribe_url?: string | null
          may_use_dataset?: string
          may_use_dataset_quote?: string | null
          may_use_dataset_read_on?: string | null
          may_use_dataset_url?: string | null
          name?: string
          notes?: string | null
          organisation_id?: string | null
          page_url?: string
          permits_descriptions?: boolean
          permits_facts?: boolean
          permits_images?: boolean
          permits_links?: boolean
          source_type?: string
          terms_quote?: string | null
          terms_read_on?: string | null
          terms_url?: string | null
          updated_at?: string
          venue_id?: string | null
          verification?: string
          verified_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_sources_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_sources_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_sources_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_submissions: {
        Row: {
          authority_confirmed: boolean
          booking_url: string
          city_slug: string
          created_at: string
          description: string | null
          email: string
          ends_at: string | null
          entry: string
          id: string
          name: string
          permission_given_at: string
          permission_words: string
          photo_owned: boolean
          photo_path: string | null
          price_from_cents: number | null
          refused_because: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role: string
          starts_at: string
          status: string
          title: string
          venue_address: string
          venue_name: string
        }
        Insert: {
          authority_confirmed: boolean
          booking_url: string
          city_slug: string
          created_at?: string
          description?: string | null
          email: string
          ends_at?: string | null
          entry: string
          id?: string
          name: string
          permission_given_at: string
          permission_words: string
          photo_owned?: boolean
          photo_path?: string | null
          price_from_cents?: number | null
          refused_because?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role: string
          starts_at: string
          status?: string
          title: string
          venue_address: string
          venue_name: string
        }
        Update: {
          authority_confirmed?: boolean
          booking_url?: string
          city_slug?: string
          created_at?: string
          description?: string | null
          email?: string
          ends_at?: string | null
          entry?: string
          id?: string
          name?: string
          permission_given_at?: string
          permission_words?: string
          photo_owned?: boolean
          photo_path?: string | null
          price_from_cents?: number | null
          refused_because?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: string
          starts_at?: string
          status?: string
          title?: string
          venue_address?: string
          venue_name?: string
        }
        Relationships: []
      }
      marketing_attribution: {
        Row: {
          billable: boolean
          campaign_id: string | null
          candidate_clicks: Json
          channel_code: string | null
          click_id: string | null
          confidence: number
          decision: string
          explanation: string
          forwarded: boolean
          model_name: string
          model_version: string
          order_id: string
          partner_id: string | null
          reason: string | null
          recipient_id: string | null
          resolved_at: string
          rung: number
        }
        Insert: {
          billable?: boolean
          campaign_id?: string | null
          candidate_clicks?: Json
          channel_code?: string | null
          click_id?: string | null
          confidence: number
          decision: string
          explanation: string
          forwarded?: boolean
          model_name: string
          model_version: string
          order_id: string
          partner_id?: string | null
          reason?: string | null
          recipient_id?: string | null
          resolved_at?: string
          rung: number
        }
        Update: {
          billable?: boolean
          campaign_id?: string | null
          candidate_clicks?: Json
          channel_code?: string | null
          click_id?: string | null
          confidence?: number
          decision?: string
          explanation?: string
          forwarded?: boolean
          model_name?: string
          model_version?: string
          order_id?: string
          partner_id?: string | null
          reason?: string | null
          recipient_id?: string | null
          resolved_at?: string
          rung?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_attribution_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_attribution_click_id_fkey"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "marketing_click"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "marketing_partner"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "marketing_recipient"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_attribution_config: {
        Row: {
          attribution_window_days: number
          click_cookie_days: number
          id: boolean
          link_code_length: number
          model_name: string
          model_version: string
          rung_four_confidence: number
          updated_at: string
        }
        Insert: {
          attribution_window_days: number
          click_cookie_days: number
          id?: boolean
          link_code_length: number
          model_name: string
          model_version: string
          rung_four_confidence: number
          updated_at?: string
        }
        Update: {
          attribution_window_days?: number
          click_cookie_days?: number
          id?: boolean
          link_code_length?: number
          model_name?: string
          model_version?: string
          rung_four_confidence?: number
          updated_at?: string
        }
        Relationships: []
      }
      marketing_attribution_reversal: {
        Row: {
          actor_user_id: string | null
          id: string
          order_id: string
          reason: string
          reversed_amount_cents: number
          reversed_at: string
          source: string
        }
        Insert: {
          actor_user_id?: string | null
          id?: string
          order_id: string
          reason: string
          reversed_amount_cents: number
          reversed_at?: string
          source: string
        }
        Update: {
          actor_user_id?: string | null
          id?: string
          order_id?: string
          reason?: string
          reversed_amount_cents?: number
          reversed_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_attribution_reversal_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_reversal_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaign: {
        Row: {
          attribution_window_days: number
          created_at: string
          event_id: string
          id: string
          name: string
          opening_line: string | null
          organisation_id: string
          reference: string
          sequence_id: string | null
          signature: string | null
          state: string
          tenant_id: string
          volume_cap: number
        }
        Insert: {
          attribution_window_days?: number
          created_at?: string
          event_id: string
          id?: string
          name: string
          opening_line?: string | null
          organisation_id: string
          reference: string
          sequence_id?: string | null
          signature?: string | null
          state?: string
          tenant_id: string
          volume_cap?: number
        }
        Update: {
          attribution_window_days?: number
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          opening_line?: string | null
          organisation_id?: string
          reference?: string
          sequence_id?: string | null
          signature?: string | null
          state?: string
          tenant_id?: string
          volume_cap?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "marketing_sequence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "marketing_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigner_config: {
        Row: {
          default_volume_cap: number
          id: boolean
          mode: string
          proof_page_enabled: boolean
          test_domain: string
          unsubscribe_path: string
          updated_at: string
        }
        Insert: {
          default_volume_cap: number
          id?: boolean
          mode: string
          proof_page_enabled?: boolean
          test_domain: string
          unsubscribe_path: string
          updated_at?: string
        }
        Update: {
          default_volume_cap?: number
          id?: boolean
          mode?: string
          proof_page_enabled?: boolean
          test_domain?: string
          unsubscribe_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_capture_answer: {
        Row: {
          created_at: string
          placement: string
          reservation_id: string
          ticked: boolean
          wording: string
          wording_purpose: string
          wording_version: string
        }
        Insert: {
          created_at?: string
          placement: string
          reservation_id: string
          ticked: boolean
          wording: string
          wording_purpose: string
          wording_version: string
        }
        Update: {
          created_at?: string
          placement?: string
          reservation_id?: string
          ticked?: boolean
          wording?: string
          wording_purpose?: string
          wording_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_capture_answer_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_capture_answer_wording_purpose_fkey"
            columns: ["wording_purpose"]
            isOneToOne: false
            referencedRelation: "consent_purposes"
            referencedColumns: ["purpose"]
          },
        ]
      }
      marketing_capture_placement: {
        Row: {
          created_at: string
          decided_by: string | null
          effective_from: string
          id: string
          placement: string
          reason: string
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          effective_from?: string
          id?: string
          placement: string
          reason: string
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          effective_from?: string
          id?: string
          placement?: string
          reason?: string
        }
        Relationships: []
      }
      marketing_channel: {
        Row: {
          code: string
          cost_per_send_cents: number | null
          created_at: string
          display_name: string
        }
        Insert: {
          code: string
          cost_per_send_cents?: number | null
          created_at?: string
          display_name: string
        }
        Update: {
          code?: string
          cost_per_send_cents?: number | null
          created_at?: string
          display_name?: string
        }
        Relationships: []
      }
      marketing_click: {
        Row: {
          campaign_id: string
          channel_code: string
          cookie_was_present: boolean
          degraded_reason: string | null
          forwarded_suspected: boolean
          id: string
          link_code: string
          occurred_at: string
          partner_id: string | null
          recipient_id: string | null
          referrer_host: string | null
          user_agent_class: string
        }
        Insert: {
          campaign_id: string
          channel_code: string
          cookie_was_present?: boolean
          degraded_reason?: string | null
          forwarded_suspected?: boolean
          id?: string
          link_code: string
          occurred_at?: string
          partner_id?: string | null
          recipient_id?: string | null
          referrer_host?: string | null
          user_agent_class: string
        }
        Update: {
          campaign_id?: string
          channel_code?: string
          cookie_was_present?: boolean
          degraded_reason?: string | null
          forwarded_suspected?: boolean
          id?: string
          link_code?: string
          occurred_at?: string
          partner_id?: string | null
          recipient_id?: string | null
          referrer_host?: string | null
          user_agent_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_click_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_click_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_click_link_code_fkey"
            columns: ["link_code"]
            isOneToOne: false
            referencedRelation: "marketing_link"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_click_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "marketing_partner"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_click_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "marketing_recipient"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_consents: {
        Row: {
          city_slug: string | null
          consent_text: string
          consent_version: string
          declined_at: string | null
          email: string
          granted_at: string | null
          id: string
          revoked_at: string | null
          revoked_source: string | null
          source: string
          status: string
          unsubscribe_token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          city_slug?: string | null
          consent_text: string
          consent_version?: string
          declined_at?: string | null
          email: string
          granted_at?: string | null
          id?: string
          revoked_at?: string | null
          revoked_source?: string | null
          source?: string
          status?: string
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          city_slug?: string | null
          consent_text?: string
          consent_version?: string
          declined_at?: string | null
          email?: string
          granted_at?: string | null
          id?: string
          revoked_at?: string | null
          revoked_source?: string | null
          source?: string
          status?: string
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_consents_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
        ]
      }
      marketing_link: {
        Row: {
          campaign_id: string
          channel_code: string
          code: string
          created_at: string
          is_active: boolean
          partner_id: string | null
          recipient_id: string | null
          target_path: string
        }
        Insert: {
          campaign_id: string
          channel_code: string
          code: string
          created_at?: string
          is_active?: boolean
          partner_id?: string | null
          recipient_id?: string | null
          target_path: string
        }
        Update: {
          campaign_id?: string
          channel_code?: string
          code?: string
          created_at?: string
          is_active?: boolean
          partner_id?: string | null
          recipient_id?: string | null
          target_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_link_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_link_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_link_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "marketing_partner"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_link_recipient_belongs_to_campaign"
            columns: ["recipient_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_recipient"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      marketing_match_config: {
        Row: {
          id: boolean
          max_recipients_per_run: number
          method_name: string
          method_version: string
          minimum_score_floor: number
          price_band_tolerance: number
          recency_half_life_days: number
          send_cooldown_days: number
          updated_at: string
          weight_sum_tolerance: number
        }
        Insert: {
          id?: boolean
          max_recipients_per_run: number
          method_name: string
          method_version: string
          minimum_score_floor: number
          price_band_tolerance: number
          recency_half_life_days: number
          send_cooldown_days: number
          updated_at?: string
          weight_sum_tolerance?: number
        }
        Update: {
          id?: boolean
          max_recipients_per_run?: number
          method_name?: string
          method_version?: string
          minimum_score_floor?: number
          price_band_tolerance?: number
          recency_half_life_days?: number
          send_cooldown_days?: number
          updated_at?: string
          weight_sum_tolerance?: number
        }
        Relationships: []
      }
      marketing_match_postcode_bands: {
        Row: {
          band: number
          fit: number
          label: string
          shared_prefix: number
        }
        Insert: {
          band: number
          fit: number
          label: string
          shared_prefix: number
        }
        Update: {
          band?: number
          fit?: number
          label?: string
          shared_prefix?: number
        }
        Relationships: []
      }
      marketing_match_run: {
        Row: {
          actor_user_id: string | null
          audience_considered: number
          config_snapshot: Json
          event_id: string
          finished_at: string | null
          id: string
          method_name: string
          method_version: string
          requested_cap: number
          returned_count: number
          started_at: string
          suppressed_by_reason: Json
          truncated: boolean
        }
        Insert: {
          actor_user_id?: string | null
          audience_considered?: number
          config_snapshot: Json
          event_id: string
          finished_at?: string | null
          id?: string
          method_name: string
          method_version: string
          requested_cap: number
          returned_count?: number
          started_at?: string
          suppressed_by_reason?: Json
          truncated?: boolean
        }
        Update: {
          actor_user_id?: string | null
          audience_considered?: number
          config_snapshot?: Json
          event_id?: string
          finished_at?: string | null
          id?: string
          method_name?: string
          method_version?: string
          requested_cap?: number
          returned_count?: number
          started_at?: string
          suppressed_by_reason?: Json
          truncated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "marketing_match_run_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_match_run_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_match_score: {
        Row: {
          audience_member_id: string
          breakdown: Json
          created_at: string
          id: string
          rank: number
          run_id: string
          score: number
        }
        Insert: {
          audience_member_id: string
          breakdown: Json
          created_at?: string
          id?: string
          rank: number
          run_id: string
          score: number
        }
        Update: {
          audience_member_id?: string
          breakdown?: Json
          created_at?: string
          id?: string
          rank?: number
          run_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_match_score_audience_member_id_fkey"
            columns: ["audience_member_id"]
            isOneToOne: false
            referencedRelation: "audience_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_match_score_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "marketing_match_run"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_match_weights: {
        Row: {
          component: string
          sentence: string
          weight: number
        }
        Insert: {
          component: string
          sentence: string
          weight: number
        }
        Update: {
          component?: string
          sentence?: string
          weight?: number
        }
        Relationships: []
      }
      marketing_order_signal: {
        Row: {
          campaign_id: string | null
          captured_at: string
          click_id: string | null
          cookie_present: boolean
          link_code: string | null
          order_id: string
          query_identifiers: Json
        }
        Insert: {
          campaign_id?: string | null
          captured_at?: string
          click_id?: string | null
          cookie_present?: boolean
          link_code?: string | null
          order_id: string
          query_identifiers?: Json
        }
        Update: {
          campaign_id?: string | null
          captured_at?: string
          click_id?: string | null
          cookie_present?: boolean
          link_code?: string | null
          order_id?: string
          query_identifiers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketing_order_signal_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_order_signal_click_id_fkey"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "marketing_click"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_order_signal_link_code_fkey"
            columns: ["link_code"]
            isOneToOne: false
            referencedRelation: "marketing_link"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_order_signal_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_order_signal_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_partner: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          reference: string
          revenue_share_basis: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          reference: string
          revenue_share_basis: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          reference?: string
          revenue_share_basis?: string
        }
        Relationships: []
      }
      marketing_proof_snapshot: {
        Row: {
          campaign_id: string
          figures: Json
          id: string
          period_end: string
          period_start: string
          sources: Json
          taken_at: string
        }
        Insert: {
          campaign_id: string
          figures: Json
          id?: string
          period_end: string
          period_start: string
          sources: Json
          taken_at?: string
        }
        Update: {
          campaign_id?: string
          figures?: Json
          id?: string
          period_end?: string
          period_start?: string
          sources?: Json
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_proof_snapshot_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_recipient: {
        Row: {
          audience_member_id: string
          campaign_id: string
          channel_code: string
          created_at: string
          id: string
        }
        Insert: {
          audience_member_id: string
          campaign_id: string
          channel_code: string
          created_at?: string
          id?: string
        }
        Update: {
          audience_member_id?: string
          campaign_id?: string
          channel_code?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_recipient_audience_member_id_fkey"
            columns: ["audience_member_id"]
            isOneToOne: false
            referencedRelation: "audience_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_recipient_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_recipient_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
        ]
      }
      marketing_recipient_allowlist: {
        Row: {
          admitted_at: string
          audience_member_id: string
          campaign_id: string
          channel_code: string
          consent_at: string
          consent_channel_scope: string
          consent_state: boolean
          consent_wording_version: string
          id: string
          match_run_id: string | null
        }
        Insert: {
          admitted_at?: string
          audience_member_id: string
          campaign_id: string
          channel_code: string
          consent_at: string
          consent_channel_scope: string
          consent_state: boolean
          consent_wording_version: string
          id?: string
          match_run_id?: string | null
        }
        Update: {
          admitted_at?: string
          audience_member_id?: string
          campaign_id?: string
          channel_code?: string
          consent_at?: string
          consent_channel_scope?: string
          consent_state?: boolean
          consent_wording_version?: string
          id?: string
          match_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_recipient_allowlist_audience_member_id_fkey"
            columns: ["audience_member_id"]
            isOneToOne: false
            referencedRelation: "audience_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_recipient_allowlist_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_recipient_allowlist_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_recipient_allowlist_match_run_id_fkey"
            columns: ["match_run_id"]
            isOneToOne: false
            referencedRelation: "marketing_match_run"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_send: {
        Row: {
          allowlist_id: string
          bounced_at: string | null
          campaign_id: string
          channel_code: string
          complained_at: string | null
          created_at: string
          delivered_at: string | null
          destination: string
          id: string
          link_code: string | null
          provider_message_id: string | null
          queued_at: string | null
          rendered_body: string
          rendered_html: string
          rendered_subject: string
          segment_fingerprint: string
          sender_identity_id: string
          sent_at: string | null
          sequence_step_id: string | null
          state: string
          template_key: string
          unsubscribe_token: string
        }
        Insert: {
          allowlist_id: string
          bounced_at?: string | null
          campaign_id: string
          channel_code: string
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          destination: string
          id?: string
          link_code?: string | null
          provider_message_id?: string | null
          queued_at?: string | null
          rendered_body: string
          rendered_html?: string
          rendered_subject: string
          segment_fingerprint: string
          sender_identity_id: string
          sent_at?: string | null
          sequence_step_id?: string | null
          state?: string
          template_key: string
          unsubscribe_token: string
        }
        Update: {
          allowlist_id?: string
          bounced_at?: string | null
          campaign_id?: string
          channel_code?: string
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          destination?: string
          id?: string
          link_code?: string | null
          provider_message_id?: string | null
          queued_at?: string | null
          rendered_body?: string
          rendered_html?: string
          rendered_subject?: string
          segment_fingerprint?: string
          sender_identity_id?: string
          sent_at?: string | null
          sequence_step_id?: string | null
          state?: string
          template_key?: string
          unsubscribe_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_send_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_send_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_send_link_code_fkey"
            columns: ["link_code"]
            isOneToOne: false
            referencedRelation: "marketing_link"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_send_recipient_is_allowlisted"
            columns: ["allowlist_id", "campaign_id", "channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_recipient_allowlist"
            referencedColumns: ["id", "campaign_id", "channel_code"]
          },
          {
            foreignKeyName: "marketing_send_sender_identity_id_fkey"
            columns: ["sender_identity_id"]
            isOneToOne: false
            referencedRelation: "marketing_sender_identity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_send_sequence_step_id_fkey"
            columns: ["sequence_step_id"]
            isOneToOne: false
            referencedRelation: "marketing_sequence_step"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_send_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "marketing_template"
            referencedColumns: ["key"]
          },
        ]
      }
      marketing_send_approval: {
        Row: {
          approved_at: string
          approved_sample: string
          approver_user_id: string | null
          campaign_id: string
          id: string
          segment_fingerprint: string
        }
        Insert: {
          approved_at?: string
          approved_sample: string
          approver_user_id?: string | null
          campaign_id: string
          id?: string
          segment_fingerprint: string
        }
        Update: {
          approved_at?: string
          approved_sample?: string
          approver_user_id?: string | null
          campaign_id?: string
          id?: string
          segment_fingerprint?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_send_approval_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_send_skip: {
        Row: {
          allowlist_id: string
          campaign_id: string
          channel_code: string
          detail: string | null
          id: string
          occurred_at: string
          reason: string
          sequence_step_id: string | null
        }
        Insert: {
          allowlist_id: string
          campaign_id: string
          channel_code: string
          detail?: string | null
          id?: string
          occurred_at?: string
          reason: string
          sequence_step_id?: string | null
        }
        Update: {
          allowlist_id?: string
          campaign_id?: string
          channel_code?: string
          detail?: string | null
          id?: string
          occurred_at?: string
          reason?: string
          sequence_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_send_skip_allowlist_id_fkey"
            columns: ["allowlist_id"]
            isOneToOne: false
            referencedRelation: "marketing_recipient_allowlist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_send_skip_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_send_skip_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_send_skip_sequence_step_id_fkey"
            columns: ["sequence_step_id"]
            isOneToOne: false
            referencedRelation: "marketing_sequence_step"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_sender_identity: {
        Row: {
          created_at: string
          from_name: string
          id: string
          identity_line: string
          is_verified: boolean
          organisation_id: string
          reply_to: string
        }
        Insert: {
          created_at?: string
          from_name: string
          id?: string
          identity_line: string
          is_verified?: boolean
          organisation_id: string
          reply_to: string
        }
        Update: {
          created_at?: string
          from_name?: string
          id?: string
          identity_line?: string
          is_verified?: boolean
          organisation_id?: string
          reply_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_sender_identity_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_sequence: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          reference: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          reference: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          reference?: string
          version?: string
        }
        Relationships: []
      }
      marketing_sequence_step: {
        Row: {
          channel_code: string
          days_remaining_max: number
          days_remaining_min: number
          id: string
          min_hours_since_previous_send: number
          sequence_id: string
          step_order: number
          template_key: string
        }
        Insert: {
          channel_code: string
          days_remaining_max: number
          days_remaining_min: number
          id?: string
          min_hours_since_previous_send: number
          sequence_id: string
          step_order: number
          template_key: string
        }
        Update: {
          channel_code?: string
          days_remaining_max?: number
          days_remaining_min?: number
          id?: string
          min_hours_since_previous_send?: number
          sequence_id?: string
          step_order?: number
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_sequence_step_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_sequence_step_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "marketing_sequence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_sequence_step_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "marketing_template"
            referencedColumns: ["key"]
          },
        ]
      }
      marketing_template: {
        Row: {
          body_template: string
          channel_code: string
          created_at: string
          key: string
          subject_template: string
        }
        Insert: {
          body_template: string
          channel_code: string
          created_at?: string
          key: string
          subject_template: string
        }
        Update: {
          body_template?: string
          channel_code?: string
          created_at?: string
          key?: string
          subject_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_template_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
        ]
      }
      marketing_tenants: {
        Row: {
          created_at: string
          id: string
          is_platform: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_platform?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_platform?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      marketplace_blocks: {
        Row: {
          artist_id: string
          created_at: string
          created_by: string | null
          id: string
          organisation_id: string
          reason: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id: string
          reason?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_blocks_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_blocks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reports: {
        Row: {
          created_at: string
          id: string
          note: string
          reason: string
          reporter_user_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          reason: string
          reporter_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          reason?: string
          reporter_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
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
          subject_id: string | null
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
          subject_id?: string | null
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
          subject_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "api_v1_orders"
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
          destination_account_id: string | null
          destination_recorded_at: string | null
          discount_cents: number
          discount_code_id: string | null
          event_id: string
          expires_at: string | null
          fee_pass_type: Database["public"]["Enums"]["fee_pass_type"]
          founding_fee_waived_cents: number
          guest_email: string | null
          guest_name: string | null
          id: string
          metadata: Json
          order_number: string
          organisation_id: string
          organiser_amount_due_cents: number | null
          platform_fee_cents: number
          platform_fee_retained_cents: number | null
          processing_fee_cents: number
          reservation_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_processing_estimate_cents: number | null
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
          destination_account_id?: string | null
          destination_recorded_at?: string | null
          discount_cents?: number
          discount_code_id?: string | null
          event_id: string
          expires_at?: string | null
          fee_pass_type?: Database["public"]["Enums"]["fee_pass_type"]
          founding_fee_waived_cents?: number
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          metadata?: Json
          order_number: string
          organisation_id: string
          organiser_amount_due_cents?: number | null
          platform_fee_cents?: number
          platform_fee_retained_cents?: number | null
          processing_fee_cents?: number
          reservation_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_processing_estimate_cents?: number | null
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
          destination_account_id?: string | null
          destination_recorded_at?: string | null
          discount_cents?: number
          discount_code_id?: string | null
          event_id?: string
          expires_at?: string | null
          fee_pass_type?: Database["public"]["Enums"]["fee_pass_type"]
          founding_fee_waived_cents?: number
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          metadata?: Json
          order_number?: string
          organisation_id?: string
          organiser_amount_due_cents?: number | null
          platform_fee_cents?: number
          platform_fee_retained_cents?: number | null
          processing_fee_cents?: number
          reservation_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_processing_estimate_cents?: number | null
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
            referencedRelation: "api_v1_events"
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
          abn: string | null
          created_at: string
          description: string | null
          email: string | null
          founding_bonus_months: number
          founding_city: string | null
          founding_fee_free_until: string | null
          founding_since: string | null
          gst_registered: boolean
          hold_amount_cents: number
          id: string
          instagram_handle: string | null
          is_founding: boolean
          legal_name: string | null
          logo_url: string | null
          metadata: Json | null
          name: string
          owner_id: string
          payout_destination: string | null
          payout_schedule: string
          payout_status: string
          payout_tier: string
          phone: string | null
          referral_credited_at: string | null
          referred_by_organisation_id: string | null
          refund_window_days: number
          risk_tier: string
          sales_notification_mode: string
          short_name: string | null
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          stripe_account_country: string | null
          stripe_account_id: string | null
          stripe_capabilities: Json
          stripe_charges_enabled: boolean
          stripe_onboarding_complete: boolean
          stripe_payouts_enabled: boolean
          stripe_requirements: Json
          stripe_status_verified_at: string | null
          total_event_count: number
          total_volume_cents: number
          updated_at: string
          website: string | null
        }
        Insert: {
          abn?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          founding_bonus_months?: number
          founding_city?: string | null
          founding_fee_free_until?: string | null
          founding_since?: string | null
          gst_registered?: boolean
          hold_amount_cents?: number
          id?: string
          instagram_handle?: string | null
          is_founding?: boolean
          legal_name?: string | null
          logo_url?: string | null
          metadata?: Json | null
          name: string
          owner_id: string
          payout_destination?: string | null
          payout_schedule?: string
          payout_status?: string
          payout_tier?: string
          phone?: string | null
          referral_credited_at?: string | null
          referred_by_organisation_id?: string | null
          refund_window_days?: number
          risk_tier?: string
          sales_notification_mode?: string
          short_name?: string | null
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          stripe_account_country?: string | null
          stripe_account_id?: string | null
          stripe_capabilities?: Json
          stripe_charges_enabled?: boolean
          stripe_onboarding_complete?: boolean
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json
          stripe_status_verified_at?: string | null
          total_event_count?: number
          total_volume_cents?: number
          updated_at?: string
          website?: string | null
        }
        Update: {
          abn?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          founding_bonus_months?: number
          founding_city?: string | null
          founding_fee_free_until?: string | null
          founding_since?: string | null
          gst_registered?: boolean
          hold_amount_cents?: number
          id?: string
          instagram_handle?: string | null
          is_founding?: boolean
          legal_name?: string | null
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          owner_id?: string
          payout_destination?: string | null
          payout_schedule?: string
          payout_status?: string
          payout_tier?: string
          phone?: string | null
          referral_credited_at?: string | null
          referred_by_organisation_id?: string | null
          refund_window_days?: number
          risk_tier?: string
          sales_notification_mode?: string
          short_name?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          stripe_account_country?: string | null
          stripe_account_id?: string | null
          stripe_capabilities?: Json
          stripe_charges_enabled?: boolean
          stripe_onboarding_complete?: boolean
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json
          stripe_status_verified_at?: string | null
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
          {
            foreignKeyName: "organisations_referred_by_organisation_id_fkey"
            columns: ["referred_by_organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organiser_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          name: string
          organisation_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          organisation_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          organisation_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "organiser_api_keys_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organiser_balance_ledger: {
        Row: {
          created_at: string
          currency: string
          delta_cents: number
          event_id: string | null
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
          event_id?: string | null
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
          event_id?: string | null
          id?: string
          metadata?: Json
          organisation_id?: string
          reason?: string
          reference_id?: string | null
          reference_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "organiser_balance_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_balance_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_balance_ledger_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organiser_contacts: {
        Row: {
          address: string
          basis: string
          basis_recorded_at: string | null
          basis_recorded_by: string | null
          channel: string
          consent_wording: string | null
          created_at: string
          created_by: string
          evidence_file: string | null
          hubspot_contact_id: string | null
          id: string
          no_marketing_statement_checked: boolean
          organiser_id: string
          person_name: string | null
          published_on_url: string | null
          relevance: string | null
          role: string
          seen_on: string | null
          unsubscribe_token: string
        }
        Insert: {
          address: string
          basis?: string
          basis_recorded_at?: string | null
          basis_recorded_by?: string | null
          channel: string
          consent_wording?: string | null
          created_at?: string
          created_by: string
          evidence_file?: string | null
          hubspot_contact_id?: string | null
          id?: string
          no_marketing_statement_checked?: boolean
          organiser_id: string
          person_name?: string | null
          published_on_url?: string | null
          relevance?: string | null
          role: string
          seen_on?: string | null
          unsubscribe_token?: string
        }
        Update: {
          address?: string
          basis?: string
          basis_recorded_at?: string | null
          basis_recorded_by?: string | null
          channel?: string
          consent_wording?: string | null
          created_at?: string
          created_by?: string
          evidence_file?: string | null
          hubspot_contact_id?: string | null
          id?: string
          no_marketing_statement_checked?: boolean
          organiser_id?: string
          person_name?: string | null
          published_on_url?: string | null
          relevance?: string | null
          role?: string
          seen_on?: string | null
          unsubscribe_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organiser_contacts_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_contacts_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "outreach_pipeline"
            referencedColumns: ["organiser_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "organiser_marketing_consents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_marketing_consents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_marketing_consents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_marketing_consents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_marketing_consents_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organiser_night_reports: {
        Row: {
          event_id: string
          figures: Json
          id: string
          night_ended_at: string
          organisation_id: string
          read_at: string
          sent_at: string | null
          sent_by: string | null
        }
        Insert: {
          event_id: string
          figures: Json
          id?: string
          night_ended_at: string
          organisation_id: string
          read_at?: string
          sent_at?: string | null
          sent_by?: string | null
        }
        Update: {
          event_id?: string
          figures?: Json
          id?: string
          night_ended_at?: string
          organisation_id?: string
          read_at?: string
          sent_at?: string | null
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organiser_night_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_night_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_night_reports_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organiser_permissions: {
        Row: {
          channel: string
          claim_id: string | null
          event_id: string | null
          evidence_file: string | null
          granted_at: string
          host_name: string
          id: string
          logged_at: string
          logged_by: string
          organisation_id: string | null
          scope: string
          withdrawn_at: string | null
          withdrawn_reason: string | null
          wording: string
        }
        Insert: {
          channel: string
          claim_id?: string | null
          event_id?: string | null
          evidence_file?: string | null
          granted_at: string
          host_name: string
          id?: string
          logged_at?: string
          logged_by: string
          organisation_id?: string | null
          scope: string
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
          wording: string
        }
        Update: {
          channel?: string
          claim_id?: string | null
          event_id?: string | null
          evidence_file?: string | null
          granted_at?: string
          host_name?: string
          id?: string
          logged_at?: string
          logged_by?: string
          organisation_id?: string | null
          scope?: string
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
          wording?: string
        }
        Relationships: [
          {
            foreignKeyName: "organiser_permissions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "listing_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_permissions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_permissions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_permissions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organiser_sales_digest_sends: {
        Row: {
          currency: string
          digest_date: string
          gross_cents: number
          organisation_id: string
          sale_count: number
          sent_at: string
        }
        Insert: {
          currency?: string
          digest_date: string
          gross_cents?: number
          organisation_id: string
          sale_count?: number
          sent_at?: string
        }
        Update: {
          currency?: string
          digest_date?: string
          gross_cents?: number
          organisation_id?: string
          sale_count?: number
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organiser_sales_digest_sends_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organiser_venues: {
        Row: {
          linked_at: string
          linked_by: string
          organiser_id: string
          venue_id: string
        }
        Insert: {
          linked_at?: string
          linked_by: string
          organiser_id: string
          venue_id: string
        }
        Update: {
          linked_at?: string
          linked_by?: string
          organiser_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organiser_venues_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organiser_venues_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "outreach_pipeline"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "organiser_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      organisers: {
        Row: {
          created_at: string
          created_by: string
          found_on: string | null
          id: string
          instagram_handle: string | null
          name: string
          name_key: string | null
          notes: string | null
          organisation_id: string | null
          website_key: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          found_on?: string | null
          id?: string
          instagram_handle?: string | null
          name: string
          name_key?: string | null
          notes?: string | null
          organisation_id?: string | null
          website_key?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          found_on?: string | null
          id?: string
          instagram_handle?: string | null
          name?: string
          name_key?: string | null
          notes?: string | null
          organisation_id?: string | null
          website_key?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisers_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_delivery_events: {
        Row: {
          detail: string | null
          id: string
          kind: string
          logged_at: string
          occurred_at: string
          source: string
          source_message_id: string | null
          touch_id: string
        }
        Insert: {
          detail?: string | null
          id?: string
          kind: string
          logged_at?: string
          occurred_at: string
          source: string
          source_message_id?: string | null
          touch_id: string
        }
        Update: {
          detail?: string | null
          id?: string
          kind?: string
          logged_at?: string
          occurred_at?: string
          source?: string
          source_message_id?: string | null
          touch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_delivery_events_touch_id_fkey"
            columns: ["touch_id"]
            isOneToOne: false
            referencedRelation: "outreach_touches"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_plays: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cap_max: number
          cap_start: number
          cap_step: number
          cohort_rule: Json
          created_at: string
          created_by: string
          id: string
          name: string
          paused_at: string | null
          paused_reason: string | null
          state: string
          step1_template_id: string
          step2_template_id: string | null
          step3_template_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cap_max?: number
          cap_start?: number
          cap_step?: number
          cohort_rule: Json
          created_at?: string
          created_by: string
          id?: string
          name: string
          paused_at?: string | null
          paused_reason?: string | null
          state?: string
          step1_template_id: string
          step2_template_id?: string | null
          step3_template_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cap_max?: number
          cap_start?: number
          cap_step?: number
          cohort_rule?: Json
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          paused_at?: string | null
          paused_reason?: string | null
          state?: string
          step1_template_id?: string
          step2_template_id?: string | null
          step3_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_plays_step1_template_id_fkey"
            columns: ["step1_template_id"]
            isOneToOne: false
            referencedRelation: "outreach_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_plays_step2_template_id_fkey"
            columns: ["step2_template_id"]
            isOneToOne: false
            referencedRelation: "outreach_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_plays_step3_template_id_fkey"
            columns: ["step3_template_id"]
            isOneToOne: false
            referencedRelation: "outreach_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_replies: {
        Row: {
          action_taken: string | null
          classified_by: string
          confidence: number | null
          contact_id: string
          id: string
          logged_at: string
          logged_by: string
          needs_lawal: boolean
          outcome: string
          received_at: string
          source_message_id: string | null
          touch_id: string | null
          wording: string
        }
        Insert: {
          action_taken?: string | null
          classified_by?: string
          confidence?: number | null
          contact_id: string
          id?: string
          logged_at?: string
          logged_by: string
          needs_lawal?: boolean
          outcome: string
          received_at: string
          source_message_id?: string | null
          touch_id?: string | null
          wording: string
        }
        Update: {
          action_taken?: string | null
          classified_by?: string
          confidence?: number | null
          contact_id?: string
          id?: string
          logged_at?: string
          logged_by?: string
          needs_lawal?: boolean
          outcome?: string
          received_at?: string
          source_message_id?: string | null
          touch_id?: string | null
          wording?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_replies_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "organiser_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_replies_touch_id_fkey"
            columns: ["touch_id"]
            isOneToOne: false
            referencedRelation: "outreach_touches"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_sender: {
        Row: {
          changed_at: string
          changed_by: string | null
          dns_checked_at: string | null
          dns_ok: boolean
          dns_result: Json | null
          from_address: string
          id: boolean
          mode: string
          test_domain: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          dns_checked_at?: string | null
          dns_ok?: boolean
          dns_result?: Json | null
          from_address?: string
          id?: boolean
          mode?: string
          test_domain?: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          dns_checked_at?: string | null
          dns_ok?: boolean
          dns_result?: Json | null
          from_address?: string
          id?: boolean
          mode?: string
          test_domain?: string
        }
        Relationships: []
      }
      outreach_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string
          id: string
          key: string
          purpose: string
          source: string
          step: number | null
          subject: string | null
          version: number
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by: string
          id?: string
          key: string
          purpose: string
          source: string
          step?: number | null
          subject?: string | null
          version: number
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string
          id?: string
          key?: string
          purpose?: string
          source?: string
          step?: number | null
          subject?: string | null
          version?: number
        }
        Relationships: []
      }
      outreach_touches: {
        Row: {
          basis_at_send: Json | null
          body: string
          contact_id: string
          drafted_at: string
          drafted_by: string
          failed_reason: string | null
          held_because: string[]
          id: string
          in_reply_to: string | null
          internet_message_id: string | null
          play_id: string | null
          provider: string | null
          purpose: string
          scheduled_for: string | null
          sending_at: string | null
          sent_at: string | null
          sent_by: string | null
          state: string
          step: number | null
          subject: string | null
          template_id: string | null
          tracked_link: string | null
          void_reason: string | null
        }
        Insert: {
          basis_at_send?: Json | null
          body: string
          contact_id: string
          drafted_at?: string
          drafted_by: string
          failed_reason?: string | null
          held_because?: string[]
          id?: string
          in_reply_to?: string | null
          internet_message_id?: string | null
          play_id?: string | null
          provider?: string | null
          purpose?: string
          scheduled_for?: string | null
          sending_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          state?: string
          step?: number | null
          subject?: string | null
          template_id?: string | null
          tracked_link?: string | null
          void_reason?: string | null
        }
        Update: {
          basis_at_send?: Json | null
          body?: string
          contact_id?: string
          drafted_at?: string
          drafted_by?: string
          failed_reason?: string | null
          held_because?: string[]
          id?: string
          in_reply_to?: string | null
          internet_message_id?: string | null
          play_id?: string | null
          provider?: string | null
          purpose?: string
          scheduled_for?: string | null
          sending_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          state?: string
          step?: number | null
          subject?: string | null
          template_id?: string | null
          tracked_link?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_touches_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "organiser_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_touches_play_id_fkey"
            columns: ["play_id"]
            isOneToOne: false
            referencedRelation: "outreach_plays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_touches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "outreach_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_unsubscribes: {
        Row: {
          comment: string | null
          created_at: string
          email: string | null
          hubspot_contact_id: string | null
          id: string
          reason: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          email?: string | null
          hubspot_contact_id?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          email?: string | null
          hubspot_contact_id?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      partner_enquiries: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          created_at: string
          email: string
          id: string
          kind: string
          message: string
          name: string
          organisation: string
          status: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          email: string
          id?: string
          kind: string
          message: string
          name: string
          organisation: string
          status?: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          email?: string
          id?: string
          kind?: string
          message?: string
          name?: string
          organisation?: string
          status?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          name: string
          slug: string
          status: string
          summary: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: string
          name: string
          slug: string
          status?: string
          summary: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          name?: string
          slug?: string
          status?: string
          summary?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
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
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
          event_id: string | null
          failure_reason: string | null
          id: string
          initiated_by: string | null
          kind: string
          metadata: Json
          organisation_id: string
          reversed_at: string | null
          source_transaction_id: string | null
          status: string
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          arrival_date?: string | null
          created_at?: string
          currency: string
          event_id?: string | null
          failure_reason?: string | null
          id?: string
          initiated_by?: string | null
          kind?: string
          metadata?: Json
          organisation_id: string
          reversed_at?: string | null
          source_transaction_id?: string | null
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          arrival_date?: string | null
          created_at?: string
          currency?: string
          event_id?: string | null
          failure_reason?: string | null
          id?: string
          initiated_by?: string | null
          kind?: string
          metadata?: Json
          organisation_id?: string
          reversed_at?: string | null
          source_transaction_id?: string | null
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
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
      platform_notifications: {
        Row: {
          actor_label: string | null
          actor_user_id: string | null
          admin_path: string
          attempts: number
          channel: string | null
          created_at: string
          dedupe_key: string
          delivery_state: Database["public"]["Enums"]["platform_notification_state"]
          detail: Json
          event_id: string | null
          event_title: string | null
          id: string
          kind: Database["public"]["Enums"]["platform_notification_kind"]
          last_attempt_at: string | null
          last_error: string | null
          occurred_at: string
          order_id: string | null
          organisation_id: string | null
          organisation_name: string | null
          sent_at: string | null
          summary: string
        }
        Insert: {
          actor_label?: string | null
          actor_user_id?: string | null
          admin_path: string
          attempts?: number
          channel?: string | null
          created_at?: string
          dedupe_key: string
          delivery_state?: Database["public"]["Enums"]["platform_notification_state"]
          detail?: Json
          event_id?: string | null
          event_title?: string | null
          id?: string
          kind: Database["public"]["Enums"]["platform_notification_kind"]
          last_attempt_at?: string | null
          last_error?: string | null
          occurred_at?: string
          order_id?: string | null
          organisation_id?: string | null
          organisation_name?: string | null
          sent_at?: string | null
          summary: string
        }
        Update: {
          actor_label?: string | null
          actor_user_id?: string | null
          admin_path?: string
          attempts?: number
          channel?: string | null
          created_at?: string
          dedupe_key?: string
          delivery_state?: Database["public"]["Enums"]["platform_notification_state"]
          detail?: Json
          event_id?: string | null
          event_title?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["platform_notification_kind"]
          last_attempt_at?: string | null
          last_error?: string | null
          occurred_at?: string
          order_id?: string | null
          organisation_id?: string | null
          organisation_name?: string | null
          sent_at?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_notifications_organisation_id_fkey"
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
          referred_by: string | null
          role: Database["public"]["Enums"]["user_role"]
          signup_heard_from: string | null
          signup_heard_from_other: string | null
          signup_landing_path: string | null
          signup_referrer_host: string | null
          signup_src: string | null
          signup_utm: Json | null
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
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          signup_heard_from?: string | null
          signup_heard_from_other?: string | null
          signup_landing_path?: string | null
          signup_referrer_host?: string | null
          signup_src?: string | null
          signup_utm?: Json | null
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
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          signup_heard_from?: string | null
          signup_heard_from_other?: string | null
          signup_landing_path?: string | null
          signup_referrer_host?: string | null
          signup_src?: string | null
          signup_utm?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_offers: {
        Row: {
          currency: string
          description: string
          id: string
          key: string
          kind: string
          name: string
          placement: string | null
          price_cents: number | null
          slots: number | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          currency?: string
          description: string
          id?: string
          key: string
          kind: string
          name: string
          placement?: string | null
          price_cents?: number | null
          slots?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          currency?: string
          description?: string
          id?: string
          key?: string
          kind?: string
          name?: string
          placement?: string | null
          price_cents?: number | null
          slots?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      promotion_orders: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          done_at: string | null
          done_by: string | null
          ends_at: string | null
          event_id: string | null
          id: string
          offer_id: string
          ordered_by: string
          organisation_id: string
          paid_at: string | null
          starts_at: string | null
          status: string
          stripe_checkout_session_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          done_at?: string | null
          done_by?: string | null
          ends_at?: string | null
          event_id?: string | null
          id?: string
          offer_id: string
          ordered_by: string
          organisation_id: string
          paid_at?: string | null
          starts_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          done_at?: string | null
          done_by?: string | null
          ends_at?: string | null
          event_id?: string | null
          id?: string
          offer_id?: string
          ordered_by?: string
          organisation_id?: string
          paid_at?: string | null
          starts_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "promotion_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_orders_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
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
      recovery_contacts: {
        Row: {
          contact_email: string
          created_at: string
          id: number
          source_system: string
          token: string
        }
        Insert: {
          contact_email: string
          created_at?: string
          id?: never
          source_system?: string
          token?: string
        }
        Update: {
          contact_email?: string
          created_at?: string
          id?: never
          source_system?: string
          token?: string
        }
        Relationships: []
      }
      recovery_holds: {
        Row: {
          claimed_at: string | null
          contact_email: string
          demand_entry_id: number
          expires_at: string
          id: number
          inventory_class: string | null
          offered_at: string
          organisation_id: string
          released_at: string | null
          slot_id: string
          source_system: string
          units: number
        }
        Insert: {
          claimed_at?: string | null
          contact_email: string
          demand_entry_id: number
          expires_at: string
          id?: never
          inventory_class?: string | null
          offered_at?: string
          organisation_id: string
          released_at?: string | null
          slot_id: string
          source_system?: string
          units?: number
        }
        Update: {
          claimed_at?: string | null
          contact_email?: string
          demand_entry_id?: number
          expires_at?: string
          id?: never
          inventory_class?: string | null
          offered_at?: string
          organisation_id?: string
          released_at?: string | null
          slot_id?: string
          source_system?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "recovery_holds_demand_entry_id_fkey"
            columns: ["demand_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_holds_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "ledger_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_sends: {
        Row: {
          contact_email: string
          demand_entry_id: number
          id: number
          inventory_class: string | null
          message_number: number
          organisation_id: string
          sent_at: string
          slot_id: string
          source_system: string
          unit_amount_cents: number | null
        }
        Insert: {
          contact_email: string
          demand_entry_id: number
          id?: never
          inventory_class?: string | null
          message_number: number
          organisation_id: string
          sent_at?: string
          slot_id: string
          source_system?: string
          unit_amount_cents?: number | null
        }
        Update: {
          contact_email?: string
          demand_entry_id?: number
          id?: never
          inventory_class?: string | null
          message_number?: number
          organisation_id?: string
          sent_at?: string
          slot_id?: string
          source_system?: string
          unit_amount_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recovery_sends_demand_entry_id_fkey"
            columns: ["demand_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_sends_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "ledger_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_suppressions: {
        Row: {
          contact_email: string
          created_at: string
          id: number
          reason: Database["public"]["Enums"]["recovery_suppression_reason"]
          source_system: string
          token: string
        }
        Insert: {
          contact_email: string
          created_at?: string
          id?: never
          reason: Database["public"]["Enums"]["recovery_suppression_reason"]
          source_system?: string
          token?: string
        }
        Update: {
          contact_email?: string
          created_at?: string
          id?: never
          reason?: Database["public"]["Enums"]["recovery_suppression_reason"]
          source_system?: string
          token?: string
        }
        Relationships: []
      }
      refund_request_tickets: {
        Row: {
          request_id: string
          ticket_id: string
        }
        Insert: {
          request_id: string
          ticket_id: string
        }
        Update: {
          request_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_request_tickets_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "refund_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_request_tickets_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "api_v1_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_request_tickets_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_requests: {
        Row: {
          auto_approved: boolean
          auto_decision_reason: string | null
          buyer_message: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          decline_reason: string | null
          event_id: string
          id: string
          order_id: string
          organisation_id: string
          refund_id: string | null
          requester_email: string
          requester_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auto_approved?: boolean
          auto_decision_reason?: string | null
          buyer_message?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          decline_reason?: string | null
          event_id: string
          id?: string
          order_id: string
          organisation_id: string
          refund_id?: string | null
          requester_email: string
          requester_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auto_approved?: boolean
          auto_decision_reason?: string | null
          buyer_message?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          decline_reason?: string | null
          event_id?: string
          id?: string
          order_id?: string
          organisation_id?: string
          refund_id?: string | null
          requester_email?: string
          requester_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "api_v1_attendees"
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
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
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
      removal_requests: {
        Row: {
          actioned_at: string | null
          created_at: string
          event_id: string | null
          id: string
          note: string | null
          reason: string
          requester_email: string | null
          requester_name: string | null
          series_id: string | null
          status: string
          venue_id: string | null
        }
        Insert: {
          actioned_at?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          note?: string | null
          reason: string
          requester_email?: string | null
          requester_name?: string | null
          series_id?: string | null
          status?: string
          venue_id?: string | null
        }
        Update: {
          actioned_at?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          note?: string | null
          reason?: string
          requester_email?: string | null
          requester_name?: string | null
          series_id?: string | null
          status?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "removal_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_requests_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      roundup_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          city_slug: string
          event_count: number
          id: string
          period_start: string
          whatsapp_text: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          city_slug: string
          event_count: number
          id?: string
          period_start: string
          whatsapp_text: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          city_slug?: string
          event_count?: number
          id?: string
          period_start?: string
          whatsapp_text?: string
        }
        Relationships: []
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
      seat_section_views: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          photo_url: string
          seat_map_id: string
          section_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          photo_url: string
          seat_map_id: string
          section_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          photo_url?: string
          seat_map_id?: string
          section_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_section_views_seat_map_id_fkey"
            columns: ["seat_map_id"]
            isOneToOne: false
            referencedRelation: "seat_maps"
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
          note: string | null
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
          note?: string | null
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
          note?: string | null
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
      share_link_events: {
        Row: {
          booking_link_id: string | null
          id: string
          kind: string
          link_id: string
          occurred_at: string
          order_id: string | null
          provider: string | null
          visitor_hash: string | null
        }
        Insert: {
          booking_link_id?: string | null
          id?: string
          kind: string
          link_id: string
          occurred_at?: string
          order_id?: string | null
          provider?: string | null
          visitor_hash?: string | null
        }
        Update: {
          booking_link_id?: string | null
          id?: string
          kind?: string
          link_id?: string
          occurred_at?: string
          order_id?: string | null
          provider?: string | null
          visitor_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_link_events_booking_link_id_fkey"
            columns: ["booking_link_id"]
            isOneToOne: false
            referencedRelation: "event_booking_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_link_events_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_link_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_link_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          artist_id: string | null
          channel: string
          code: string
          collaborator_id: string | null
          created_at: string
          created_by: string | null
          destination_url: string | null
          draft_code: string | null
          event_id: string | null
          id: string
          retired_at: string | null
        }
        Insert: {
          artist_id?: string | null
          channel: string
          code: string
          collaborator_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_url?: string | null
          draft_code?: string | null
          event_id?: string | null
          id?: string
          retired_at?: string | null
        }
        Update: {
          artist_id?: string | null
          channel?: string
          code?: string
          collaborator_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_url?: string | null
          draft_code?: string | null
          event_id?: string | null
          id?: string
          retired_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_links_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "event_collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      social_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          draft_id: string
          id: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          draft_id: string
          id?: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          draft_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_approvals_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "social_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_assets: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          archival: boolean
          asset_state: string
          asset_type: string
          asset_url: string
          attribution_text: string
          created_at: string
          created_by: string | null
          event_id: string | null
          evidence_file: string | null
          expires_at: string | null
          focal_x: number | null
          focal_y: number | null
          id: string
          lead_rank: number | null
          original_file: string | null
          permission_evidence: string | null
          permission_id: string | null
          permitted_uses: string | null
          received_on: string | null
          replaced_by: string | null
          restrictions: string | null
          rights_holder: string
          scope: string
          source_height: number | null
          source_url: string
          source_width: number | null
          withdrawal_reason: string | null
          withdrawal_status: string
          withdrawn_at: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archival?: boolean
          asset_state: string
          asset_type: string
          asset_url: string
          attribution_text: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          evidence_file?: string | null
          expires_at?: string | null
          focal_x?: number | null
          focal_y?: number | null
          id?: string
          lead_rank?: number | null
          original_file?: string | null
          permission_evidence?: string | null
          permission_id?: string | null
          permitted_uses?: string | null
          received_on?: string | null
          replaced_by?: string | null
          restrictions?: string | null
          rights_holder: string
          scope: string
          source_height?: number | null
          source_url: string
          source_width?: number | null
          withdrawal_reason?: string | null
          withdrawal_status?: string
          withdrawn_at?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archival?: boolean
          asset_state?: string
          asset_type?: string
          asset_url?: string
          attribution_text?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          evidence_file?: string | null
          expires_at?: string | null
          focal_x?: number | null
          focal_y?: number | null
          id?: string
          lead_rank?: number | null
          original_file?: string | null
          permission_evidence?: string | null
          permission_id?: string | null
          permitted_uses?: string | null
          received_on?: string | null
          replaced_by?: string | null
          restrictions?: string | null
          rights_holder?: string
          scope?: string
          source_height?: number | null
          source_url?: string
          source_width?: number | null
          withdrawal_reason?: string | null
          withdrawal_status?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_assets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_assets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_assets_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "organiser_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_assets_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "social_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      social_cadence_rules: {
        Row: {
          basis: string
          created_at: string
          floor_posts: number
          format: string
          gap_hours: number
          id: string
          learned_from: number
          platform: string | null
          reason: string
          set_at: string
          set_by: string
          settle_hours: number
          slots: number[]
          version: number
        }
        Insert: {
          basis: string
          created_at?: string
          floor_posts: number
          format: string
          gap_hours: number
          id?: string
          learned_from?: number
          platform?: string | null
          reason: string
          set_at: string
          set_by: string
          settle_hours: number
          slots?: number[]
          version: number
        }
        Update: {
          basis?: string
          created_at?: string
          floor_posts?: number
          format?: string
          gap_hours?: number
          id?: string
          learned_from?: number
          platform?: string | null
          reason?: string
          set_at?: string
          set_by?: string
          settle_hours?: number
          slots?: number[]
          version?: number
        }
        Relationships: []
      }
      social_campaign_exclusions: {
        Row: {
          campaign_id: string
          event_id: string
          excluded_at: string
          excluded_by: string
          id: string
          reason: string
        }
        Insert: {
          campaign_id: string
          event_id: string
          excluded_at?: string
          excluded_by: string
          id?: string
          reason: string
        }
        Update: {
          campaign_id?: string
          event_id?: string
          excluded_at?: string
          excluded_by?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_campaign_exclusions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "social_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_campaign_exclusions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_campaign_exclusions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      social_campaigns: {
        Row: {
          id: string
          planned_at: string
          planned_by: string | null
          week_start: string
        }
        Insert: {
          id?: string
          planned_at?: string
          planned_by?: string | null
          week_start: string
        }
        Update: {
          id?: string
          planned_at?: string
          planned_by?: string | null
          week_start?: string
        }
        Relationships: []
      }
      social_drafts: {
        Row: {
          caption: string
          drafted_at: string
          id: string
          post_id: string
          version: number
          written_by: string
          written_by_user: string | null
        }
        Insert: {
          caption: string
          drafted_at?: string
          id?: string
          post_id: string
          version: number
          written_by: string
          written_by_user?: string | null
        }
        Update: {
          caption?: string
          drafted_at?: string
          id?: string
          post_id?: string
          version?: number
          written_by?: string
          written_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_drafts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_image_requests: {
        Row: {
          campaign_id: string
          drafted_at: string
          event_id: string
          host_name: string
          id: string
          message: string | null
        }
        Insert: {
          campaign_id: string
          drafted_at?: string
          event_id: string
          host_name: string
          id?: string
          message?: string | null
        }
        Update: {
          campaign_id?: string
          drafted_at?: string
          event_id?: string
          host_name?: string
          id?: string
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_image_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "social_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_image_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_image_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      social_piece_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          id: string
          piece_id: string
          revision: number
        }
        Insert: {
          approved_at?: string
          approved_by: string
          id?: string
          piece_id: string
          revision: number
        }
        Update: {
          approved_at?: string
          approved_by?: string
          id?: string
          piece_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "social_piece_approvals_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "social_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_piece_decisions: {
        Row: {
          decided_at: string
          decided_by: string | null
          decision: string
          id: string
          piece_id: string
          reason: string
          revision: number
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          piece_id: string
          reason: string
          revision: number
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          piece_id?: string
          reason?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "social_piece_decisions_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "social_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_piece_figures: {
        Row: {
          entered_at: string
          entered_by: string
          id: string
          metric: string
          piece_id: string
          platform: string
          read_at: string
          value: number
        }
        Insert: {
          entered_at?: string
          entered_by: string
          id?: string
          metric: string
          piece_id: string
          platform: string
          read_at: string
          value: number
        }
        Update: {
          entered_at?: string
          entered_by?: string
          id?: string
          metric?: string
          piece_id?: string
          platform?: string
          read_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "social_piece_figures_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "social_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_piece_postings: {
        Row: {
          approval_id: string
          id: string
          piece_id: string
          post_url: string
          posted_at: string
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          approval_id: string
          id?: string
          piece_id: string
          post_url: string
          posted_at: string
          recorded_at?: string
          recorded_by: string
        }
        Update: {
          approval_id?: string
          id?: string
          piece_id?: string
          post_url?: string
          posted_at?: string
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_piece_postings_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: true
            referencedRelation: "social_piece_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_piece_postings_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: true
            referencedRelation: "social_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_piece_revisions: {
        Row: {
          caption: string
          event_ids: string[]
          id: string
          made_at: string
          made_by: string
          made_by_user: string | null
          message: string | null
          mode: string
          picks: Json
          piece_id: string
          slides: Json
          version: number
          versions: Json
        }
        Insert: {
          caption: string
          event_ids?: string[]
          id?: string
          made_at?: string
          made_by: string
          made_by_user?: string | null
          message?: string | null
          mode: string
          picks: Json
          piece_id: string
          slides: Json
          version: number
          versions: Json
        }
        Update: {
          caption?: string
          event_ids?: string[]
          id?: string
          made_at?: string
          made_by?: string
          made_by_user?: string | null
          message?: string | null
          mode?: string
          picks?: Json
          piece_id?: string
          slides?: Json
          version?: number
          versions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "social_piece_revisions_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "social_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_piece_schedules: {
        Row: {
          approval_id: string
          created_at: string
          go_at: string
          held_reason: string | null
          id: string
          piece_id: string
          platform: string
          published_at: string | null
          published_ref: string | null
          state: string
        }
        Insert: {
          approval_id: string
          created_at?: string
          go_at: string
          held_reason?: string | null
          id?: string
          piece_id: string
          platform: string
          published_at?: string | null
          published_ref?: string | null
          state?: string
        }
        Update: {
          approval_id?: string
          created_at?: string
          go_at?: string
          held_reason?: string | null
          id?: string
          piece_id?: string
          platform?: string
          published_at?: string | null
          published_ref?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_piece_schedules_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "social_piece_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_piece_schedules_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "social_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_pieces: {
        Row: {
          audience: string
          campaign_id: string
          city: string
          format: string
          id: string
          kind: string
          link: string
          next_step: string
          objective: string
          outcome: string
          partner_name: string | null
          planned_at: string
          purpose: string
          share_link_id: string | null
        }
        Insert: {
          audience: string
          campaign_id: string
          city: string
          format: string
          id?: string
          kind: string
          link: string
          next_step: string
          objective: string
          outcome: string
          partner_name?: string | null
          planned_at?: string
          purpose: string
          share_link_id?: string | null
        }
        Update: {
          audience?: string
          campaign_id?: string
          city?: string
          format?: string
          id?: string
          kind?: string
          link?: string
          next_step?: string
          objective?: string
          outcome?: string
          partner_name?: string | null
          planned_at?: string
          purpose?: string
          share_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_pieces_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "social_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_pieces_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: true
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      social_postings: {
        Row: {
          approval_id: string
          id: string
          post_id: string
          post_url: string
          posted_at: string
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          approval_id: string
          id?: string
          post_id: string
          post_url: string
          posted_at: string
          recorded_at?: string
          recorded_by: string
        }
        Update: {
          approval_id?: string
          id?: string
          post_id?: string
          post_url?: string
          posted_at?: string
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_postings_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: true
            referencedRelation: "social_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_postings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          audience: string
          event_id: string
          facts: string[]
          format: string
          id: string
          link: string
          next_step: string
          objective: string
          outcome: string
          planned_at: string
          planned_by: string | null
          platform: string
          purpose: string
          share_link_id: string
        }
        Insert: {
          audience?: string
          event_id: string
          facts: string[]
          format: string
          id?: string
          link: string
          next_step?: string
          objective?: string
          outcome?: string
          planned_at?: string
          planned_by?: string | null
          platform: string
          purpose?: string
          share_link_id: string
        }
        Update: {
          audience?: string
          event_id?: string
          facts?: string[]
          format?: string
          id?: string
          link?: string
          next_step?: string
          objective?: string
          outcome?: string
          planned_at?: string
          planned_by?: string | null
          platform?: string
          purpose?: string
          share_link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: true
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      social_report_decisions: {
        Row: {
          campaign_id: string
          decided_at: string
          decided_by: string
          decision: string
          evidence: Json
          id: string
          recommendation: string
          rule: string
        }
        Insert: {
          campaign_id: string
          decided_at?: string
          decided_by: string
          decision: string
          evidence: Json
          id?: string
          recommendation: string
          rule: string
        }
        Update: {
          campaign_id?: string
          decided_at?: string
          decided_by?: string
          decision?: string
          evidence?: Json
          id?: string
          recommendation?: string
          rule?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_report_decisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "social_campaigns"
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
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
      stream_messages: {
        Row: {
          answer_body: string | null
          answered_at: string | null
          answered_by: string | null
          author_kind: string
          author_name: string
          body: string
          created_at: string
          event_id: string
          hidden_at: string | null
          id: string
          kind: string
          ticket_id: string | null
        }
        Insert: {
          answer_body?: string | null
          answered_at?: string | null
          answered_by?: string | null
          author_kind: string
          author_name: string
          body: string
          created_at?: string
          event_id: string
          hidden_at?: string | null
          id?: string
          kind: string
          ticket_id?: string | null
        }
        Update: {
          answer_body?: string | null
          answered_at?: string | null
          answered_by?: string | null
          author_kind?: string
          author_name?: string
          body?: string
          created_at?: string
          event_id?: string
          hidden_at?: string | null
          id?: string
          kind?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "api_v1_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
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
      suppression_events: {
        Row: {
          channel: string
          created_at: string
          id: string
          occurred_at: string
          reason: string
          request_source: string
          scope: string
          subject_email: string
          subject_mobile_hash: string | null
          tenant_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          occurred_at?: string
          reason: string
          request_source: string
          scope: string
          subject_email: string
          subject_mobile_hash?: string | null
          tenant_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          occurred_at?: string
          reason?: string
          request_source?: string
          scope?: string
          subject_email?: string
          subject_mobile_hash?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "marketing_tenants"
            referencedColumns: ["id"]
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
      ticket_price_history: {
        Row: {
          currency: string
          event_id: string
          id: string
          percent_sold: number | null
          previous_price_cents: number | null
          price_cents: number
          reason: string
          recorded_at: string
          ticket_tier_id: string | null
          tier_name: string
        }
        Insert: {
          currency?: string
          event_id: string
          id?: string
          percent_sold?: number | null
          previous_price_cents?: number | null
          price_cents: number
          reason: string
          recorded_at?: string
          ticket_tier_id?: string | null
          tier_name: string
        }
        Update: {
          currency?: string
          event_id?: string
          id?: string
          percent_sold?: number | null
          previous_price_cents?: number | null
          price_cents?: number
          reason?: string
          recorded_at?: string
          ticket_tier_id?: string | null
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_price_history_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_price_history_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_price_history_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_scans: {
        Row: {
          client_scan_id: string | null
          device_id: string | null
          device_info: Json
          device_scanned_at: string | null
          event_id: string
          id: string
          result: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          scanned_at: string
          scanned_by: string | null
          scanned_offline: boolean
          ticket_id: string | null
        }
        Insert: {
          client_scan_id?: string | null
          device_id?: string | null
          device_info?: Json
          device_scanned_at?: string | null
          event_id: string
          id?: string
          result: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scanned_at?: string
          scanned_by?: string | null
          scanned_offline?: boolean
          ticket_id?: string | null
        }
        Update: {
          client_scan_id?: string | null
          device_id?: string | null
          device_info?: Json
          device_scanned_at?: string | null
          event_id?: string
          id?: string
          result?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scanned_at?: string
          scanned_by?: string | null
          scanned_offline?: boolean
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_scans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "api_v1_attendees"
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
          access_mode: Database["public"]["Enums"]["tier_access_mode"]
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
          access_mode?: Database["public"]["Enums"]["tier_access_mode"]
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
          access_mode?: Database["public"]["Enums"]["tier_access_mode"]
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
      ticket_transfers: {
        Row: {
          created_at: string
          event_id: string
          from_email: string
          from_user_id: string | null
          id: string
          ticket_id: string
          to_email: string
        }
        Insert: {
          created_at?: string
          event_id: string
          from_email: string
          from_user_id?: string | null
          id?: string
          ticket_id: string
          to_email: string
        }
        Update: {
          created_at?: string
          event_id?: string
          from_email?: string
          from_user_id?: string | null
          id?: string
          ticket_id?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_transfers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "api_v1_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
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
          released_seat_id: string | null
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
          released_seat_id?: string | null
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
          released_seat_id?: string | null
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "api_v1_orders"
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
            foreignKeyName: "tickets_released_seat_id_fkey"
            columns: ["released_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
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
      venue_enrolments: {
        Row: {
          action: string
          actor_admin_id: string | null
          created_at: string
          id: string
          metadata: Json
          note: string | null
          share_percentage: number | null
          venue_id: string
        }
        Insert: {
          action: string
          actor_admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          share_percentage?: number | null
          venue_id: string
        }
        Update: {
          action?: string
          actor_admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          share_percentage?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_enrolments_actor_admin_id_fkey"
            columns: ["actor_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_enrolments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_merges: {
        Row: {
          dropped_venue_id: string
          id: string
          kept_venue_id: string
          merged_at: string
          merged_by: string
          moved: Json
          reason: string
        }
        Insert: {
          dropped_venue_id: string
          id?: string
          kept_venue_id: string
          merged_at?: string
          merged_by: string
          moved: Json
          reason: string
        }
        Update: {
          dropped_venue_id?: string
          id?: string
          kept_venue_id?: string
          merged_at?: string
          merged_by?: string
          moved?: Json
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_merges_dropped_venue_id_fkey"
            columns: ["dropped_venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_merges_kept_venue_id_fkey"
            columns: ["kept_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_payouts: {
        Row: {
          amount_cents: number
          arrival_date: string | null
          created_at: string
          currency: string
          destination_account_id: string | null
          event_id: string | null
          id: string
          initiated_by: string | null
          metadata: Json
          status: string
          stripe_transfer_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          amount_cents: number
          arrival_date?: string | null
          created_at?: string
          currency: string
          destination_account_id?: string | null
          event_id?: string | null
          id?: string
          initiated_by?: string | null
          metadata?: Json
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          amount_cents?: number
          arrival_date?: string | null
          created_at?: string
          currency?: string
          destination_account_id?: string | null
          event_id?: string | null
          id?: string
          initiated_by?: string | null
          metadata?: Json
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_payouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_share_ledger: {
        Row: {
          created_at: string
          currency: string
          delta_cents: number
          event_id: string | null
          id: string
          metadata: Json
          order_id: string | null
          platform_fee_cents: number | null
          reason: string
          reference_id: string | null
          reference_type: string
          share_percentage: number | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          delta_cents: number
          event_id?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          platform_fee_cents?: number | null
          reason: string
          reference_id?: string | null
          reference_type: string
          share_percentage?: number | null
          venue_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          delta_cents?: number
          event_id?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          platform_fee_cents?: number | null
          reason?: string
          reference_id?: string | null
          reference_type?: string
          share_percentage?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_share_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_share_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_share_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_share_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_share_ledger_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          city_slug: string | null
          claimed_at: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          instagram_handle: string | null
          is_active: boolean
          latitude: number | null
          listing_source: string
          longitude: number | null
          name: string
          organisation_id: string
          postal_code: string | null
          published_email: string | null
          removed_at: string | null
          revenue_share_enrolled_at: string | null
          revenue_share_status: string
          revenue_share_unenrolled_at: string | null
          slug: string | null
          state: string | null
          stripe_account_country: string | null
          stripe_account_id: string | null
          stripe_payouts_enabled: boolean
          suburb: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          city_slug?: string | null
          claimed_at?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          instagram_handle?: string | null
          is_active?: boolean
          latitude?: number | null
          listing_source?: string
          longitude?: number | null
          name: string
          organisation_id: string
          postal_code?: string | null
          published_email?: string | null
          removed_at?: string | null
          revenue_share_enrolled_at?: string | null
          revenue_share_status?: string
          revenue_share_unenrolled_at?: string | null
          slug?: string | null
          state?: string | null
          stripe_account_country?: string | null
          stripe_account_id?: string | null
          stripe_payouts_enabled?: boolean
          suburb?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          city_slug?: string | null
          claimed_at?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          instagram_handle?: string | null
          is_active?: boolean
          latitude?: number | null
          listing_source?: string
          longitude?: number | null
          name?: string
          organisation_id?: string
          postal_code?: string | null
          published_email?: string | null
          removed_at?: string | null
          revenue_share_enrolled_at?: string | null
          revenue_share_status?: string
          revenue_share_unenrolled_at?: string | null
          slug?: string | null
          state?: string | null
          stripe_account_country?: string | null
          stripe_account_id?: string | null
          stripe_payouts_enabled?: boolean
          suburb?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_city_slug_fkey"
            columns: ["city_slug"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["slug"]
          },
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
      api_v1_attendees: {
        Row: {
          checked_in: boolean | null
          created_at: string | null
          event_id: string | null
          event_title: string | null
          first_scanned_at: string | null
          holder_email: string | null
          holder_name: string | null
          id: string | null
          last_scanned_at: string | null
          order_id: string | null
          order_number: string | null
          organisation_id: string | null
          scan_count: number | null
          status: string | null
          ticket_code: string | null
          ticket_tier_id: string | null
          ticket_tier_name: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "api_v1_orders"
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
            foreignKeyName: "tickets_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      api_v1_events: {
        Row: {
          category_id: string | null
          city_primary: string | null
          community_primary: string | null
          cover_image_url: string | null
          created_at: string | null
          end_date: string | null
          event_type: Database["public"]["Enums"]["event_type"] | null
          id: string | null
          is_free: boolean | null
          max_capacity: number | null
          organisation_id: string | null
          published_at: string | null
          slug: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["event_status"] | null
          summary: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
          venue_city: string | null
          venue_country: string | null
          venue_name: string | null
          venue_state: string | null
          visibility: Database["public"]["Enums"]["event_visibility"] | null
        }
        Insert: {
          category_id?: string | null
          city_primary?: string | null
          community_primary?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["event_type"] | null
          id?: string | null
          is_free?: boolean | null
          max_capacity?: number | null
          organisation_id?: string | null
          published_at?: string | null
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["event_status"] | null
          summary?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          venue_city?: string | null
          venue_country?: string | null
          venue_name?: string | null
          venue_state?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"] | null
        }
        Update: {
          category_id?: string | null
          city_primary?: string | null
          community_primary?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["event_type"] | null
          id?: string | null
          is_free?: boolean | null
          max_capacity?: number | null
          organisation_id?: string | null
          published_at?: string | null
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["event_status"] | null
          summary?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          venue_city?: string | null
          venue_country?: string | null
          venue_name?: string | null
          venue_state?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"] | null
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
            foreignKeyName: "events_community_primary_fkey"
            columns: ["community_primary"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_v1_orders: {
        Row: {
          addon_total_cents: number | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string | null
          currency: string | null
          discount_cents: number | null
          event_id: string | null
          fee_pass_type: Database["public"]["Enums"]["fee_pass_type"] | null
          founding_fee_waived_cents: number | null
          guest_email: string | null
          guest_name: string | null
          id: string | null
          order_number: string | null
          organisation_id: string | null
          platform_fee_cents: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal_cents: number | null
          tax_cents: number | null
          total_cents: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          addon_total_cents?: number | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          currency?: string | null
          discount_cents?: number | null
          event_id?: string | null
          fee_pass_type?: Database["public"]["Enums"]["fee_pass_type"] | null
          founding_fee_waived_cents?: number | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string | null
          order_number?: string | null
          organisation_id?: string | null
          platform_fee_cents?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_cents?: number | null
          tax_cents?: number | null
          total_cents?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          addon_total_cents?: number | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          currency?: string | null
          discount_cents?: number | null
          event_id?: string | null
          fee_pass_type?: Database["public"]["Enums"]["fee_pass_type"] | null
          founding_fee_waived_cents?: number | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string | null
          order_number?: string | null
          organisation_id?: string | null
          platform_fee_cents?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal_cents?: number | null
          tax_cents?: number | null
          total_cents?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
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
        ]
      }
      marketing_attribution_invariant_breaches: {
        Row: {
          breach: string | null
          detail: string | null
          order_id: string | null
          order_reference: string | null
        }
        Relationships: []
      }
      marketing_attribution_invoice_ready: {
        Row: {
          billable: boolean | null
          campaign_id: string | null
          candidate_clicks: Json | null
          channel_code: string | null
          click_id: string | null
          confidence: number | null
          decision: string | null
          event_id: string | null
          explanation: string | null
          forwarded: boolean | null
          model_name: string | null
          model_version: string | null
          order_id: string | null
          order_number: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          partner_id: string | null
          reason: string | null
          recipient_id: string | null
          resolved_at: string | null
          rung: number | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_attribution_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "marketing_channel"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketing_attribution_click_id_fkey"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "marketing_click"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "api_v1_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "marketing_partner"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_attribution_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "marketing_recipient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "api_v1_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_match_invariant_breaches: {
        Row: {
          audience_member_id: string | null
          breach: string | null
          detail: string | null
          run_id: string | null
        }
        Relationships: []
      }
      marketing_send_invariant_breaches: {
        Row: {
          breach: string | null
          campaign_reference: string | null
          detail: string | null
          send_id: string | null
        }
        Relationships: []
      }
      outreach_pipeline: {
        Row: {
          contacts: number | null
          first_sent_at: string | null
          last_outcome: string | null
          last_reply_at: string | null
          last_sent_at: string | null
          name: string | null
          next_due_on: string | null
          organisation_id: string | null
          organiser_id: string | null
          qualified_contacts: number | null
          stage: string | null
          steps_sent: number | null
          venues: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organisers_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      stored_aggregate_drift: {
        Row: {
          column_name: string | null
          key: string | null
          stored: string | null
          truth: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_founding_invite: {
        Args: {
          p_code: string
          p_offer_open: boolean
          p_org_id: string
          p_user_id: string
        }
        Returns: {
          already_founding: boolean
          consumed: boolean
          offer_closed: boolean
          referral_recorded: boolean
          spot_number: number
        }[]
      }
      admin_set_founding_waiver: {
        Args: {
          p_membership?: string
          p_org_id: string
          p_override?: boolean
          p_until: string
        }
        Returns: string
      }
      admit_queue_batch: {
        Args: {
          p_admission_window_minutes?: number
          p_batch_size?: number
          p_event_id: string
        }
        Returns: number
      }
      assign_order_seats: { Args: { p_order_id: string }; Returns: number }
      audience_consent_is_live: {
        Args: { p_email: string }
        Returns: {
          consent_at: string
          permitted: boolean
          source: string
          wording: string
          wording_version: string
        }[]
      }
      audience_price_band: { Args: { p_unit_cents: number }; Returns: string }
      claim_discount_use: {
        Args: { p_code_id: string; p_reservation_id: string }
        Returns: boolean
      }
      claim_founding_spot: {
        Args: { p_city_slug: string; p_org_id: string }
        Returns: number
      }
      confirm_order: { Args: { p_order_id: string }; Returns: boolean }
      connect_watch_guards: {
        Args: never
        Returns: {
          guard: string
          holds: boolean
        }[]
      }
      consent_permits: {
        Args: {
          p_channel: string
          p_email: string
          p_now?: string
          p_purpose: string
          p_tenant_slug: string
        }
        Returns: {
          deciding_event_id: string
          permitted: boolean
          reason: string
        }[]
      }
      convert_discount_claim: {
        Args: { p_reservation_id: string }
        Returns: boolean
      }
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
          p_session_id?: string
          p_ttl_minutes?: number
          p_user_id: string
        }
        Returns: Json
      }
      credit_founding_referral: {
        Args: { p_order_id: string; p_org_id: string }
        Returns: string
      }
      derive_event_image_rights: {
        Args: { p_event: string }
        Returns: undefined
      }
      directory_artists_ranked_by_draw: {
        Args: {
          p_available_only?: boolean
          p_city_slug?: string
          p_limit?: number
          p_mentor_only?: boolean
          p_performance_type?: string
        }
        Returns: {
          artist_id: string
          published_tickets: number
        }[]
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
      disburse_transfer: {
        Args: {
          p_actor?: string
          p_amount_cents?: number
          p_currency: string
          p_event_id: string
          p_organisation_id: string
        }
        Returns: Json
      }
      disburse_venue_share: {
        Args: {
          p_actor?: string
          p_amount_cents?: number
          p_currency: string
          p_event_id: string
          p_venue_id: string
        }
        Returns: Json
      }
      door_realtime_enabled: { Args: never; Returns: boolean }
      door_staff_for_event: { Args: { p_event_id: string }; Returns: boolean }
      door_validation_set: {
        Args: { p_after_code?: string; p_event_id: string; p_limit?: number }
        Returns: {
          first_scanned_at: string
          holder_name: string
          seat_label: string
          secret_hash: string
          status: string
          ticket_code: string
          ticket_id: string
          tier_name: string
        }[]
      }
      el_any_member_organisation_ids: { Args: never; Returns: string[] }
      el_member_organisation_ids: { Args: never; Returns: string[] }
      el_owned_organisation_ids: { Args: never; Returns: string[] }
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
      event_booking_button: { Args: { p_event: string }; Returns: string }
      event_booking_provider_of: { Args: { p_url: string }; Returns: string }
      event_image_right: {
        Args: { p_at: string; p_event: string; p_org: string; p_url: string }
        Returns: {
          provenance: string
          rights_expire_at: string
          rights_state: string
          social_asset_id: string
        }[]
      }
      event_lifecycle_guards: { Args: never; Returns: Json }
      event_money_record_counts: { Args: { p_event_id: string }; Returns: Json }
      event_money_record_counts_many: {
        Args: { p_event_ids: string[] }
        Returns: Json
      }
      event_referencing_tables: { Args: never; Returns: Json }
      event_seat_status_counts: { Args: { p_event_id: string }; Returns: Json }
      event_seat_status_counts_many: {
        Args: { p_event_ids: string[] }
        Returns: Json
      }
      event_tags_normalised: { Args: { tags: Json }; Returns: boolean }
      events_within_distance: {
        Args: { p_lat: number; p_lng: number; p_radius_km: number }
        Returns: {
          age_restriction_min: number | null
          allow_seat_self_service: boolean
          archived_at: string | null
          archived_by: string | null
          archived_from_status:
            | Database["public"]["Enums"]["event_status"]
            | null
          category_id: string | null
          city_primary: string | null
          community_primary: string | null
          cover_image_alt: string | null
          cover_image_blur: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          entry_mode: string
          event_type: Database["public"]["Enums"]["event_type"]
          external_ticket_url: string | null
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
          is_seed_data: boolean
          listing_fresh_until: string | null
          listing_series_id: string | null
          listing_source: string
          max_capacity: number | null
          metadata: Json | null
          occurrence_date: string | null
          organisation_id: string
          organiser_assigns_seats: boolean
          parent_event_id: string | null
          postponed_at: string | null
          previous_start_date: string | null
          published_at: string | null
          queue_admission_window_minutes: number
          recurrence_rule: string | null
          refund_policy_absorb_fee: boolean
          refund_policy_days: number
          refund_policy_self_service: boolean
          refund_policy_type: string
          rescheduled_at: string | null
          scheduled_publish_at: string | null
          seat_map_id: string | null
          slug: string
          squad_booking_enabled: boolean
          squad_timeout_hours: number
          start_date: string
          status: Database["public"]["Enums"]["event_status"]
          stream_geo_allow: string[] | null
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
          venue_geocode_source:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
          venue_geocoded_at: string | null
          venue_id: string | null
          venue_latitude: number | null
          venue_longitude: number | null
          venue_name: string | null
          venue_place_id: string | null
          venue_postal_code: string | null
          venue_state: string | null
          video_provider: string | null
          video_url: string | null
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
      faster_payout_check: {
        Args: { p_org: string }
        Returns: {
          buffer_days: number
          qualifies: boolean
          reason: string
        }[]
      }
      faster_payout_unproven: { Args: { p_org: string }; Returns: string }
      founding_add_months: {
        Args: { p_months: number; p_ts: string }
        Returns: string
      }
      freeze_chargeback: {
        Args: {
          p_dispute_amount_cents: number
          p_dispute_id: string
          p_order_id: string
        }
        Returns: Json
      }
      gen_ticket_code: { Args: never; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      get_current_tier_price: { Args: { p_tier_id: string }; Returns: number }
      group_rate_floor_cents: {
        Args: {
          p_country_code: string
          p_currency: string
          p_event_id: string
          p_organisation_id: string
        }
        Returns: number
      }
      increment_discount_uses: { Args: { p_code_id: string }; Returns: boolean }
      increment_sold_count: {
        Args: { p_quantity: number; p_tier_id: string }
        Returns: boolean
      }
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
      ledger_guards: {
        Args: never
        Returns: {
          detail: string
          installed: boolean
          name: string
        }[]
      }
      listing_claim_check: {
        Args: {
          p_at: string
          p_claim: string
          p_code_hash: string
          p_organisation: string
        }
        Returns: string
      }
      listing_fresh_until_for: {
        Args: { p_checked_on: string; p_timezone: string }
        Returns: string
      }
      listing_horizon: {
        Args: { p_now?: string; p_starts_at: string }
        Returns: string
      }
      listing_publish_partner_night: {
        Args: { p_candidate: string }
        Returns: string
      }
      marketing_attribution_default_window: { Args: never; Returns: number }
      marketing_attribution_is_billable: {
        Args: { p_decision: string; p_order_id: string; p_rung: number }
        Returns: boolean
      }
      marketing_campaigner_default_cap: { Args: never; Returns: number }
      marketing_proof_every_figure_is_sourced: {
        Args: { p_figures: Json; p_sources: Json }
        Returns: boolean
      }
      materialize_seats: {
        Args: { p_event_id: string; p_seat_map_id: string }
        Returns: number
      }
      organiser_available_balance: {
        Args: { p_currency: string; p_organisation_id: string }
        Returns: number
      }
      organiser_event_available_balance: {
        Args: {
          p_currency: string
          p_event_id: string
          p_organisation_id: string
        }
        Returns: number
      }
      organiser_media_add: {
        Args: {
          p_asset_url: string
          p_attribution: string
          p_event: string
          p_kind: string
          p_original_name: string
          p_restrictions: string
          p_user: string
        }
        Returns: string
      }
      organiser_media_path: { Args: { p_url: string }; Returns: string }
      organiser_media_replace: {
        Args: {
          p_asset: string
          p_asset_url: string
          p_original_name: string
          p_user: string
        }
        Returns: Json
      }
      organiser_media_withdraw: {
        Args: { p_asset: string; p_reason: string; p_user: string }
        Returns: string[]
      }
      organiser_permission_evidence: {
        Args: {
          p: Database["public"]["Tables"]["organiser_permissions"]["Row"]
        }
        Returns: string
      }
      organiser_permission_for: {
        Args: { p_event: string }
        Returns: {
          channel: string
          claim_id: string | null
          event_id: string | null
          evidence_file: string | null
          granted_at: string
          host_name: string
          id: string
          logged_at: string
          logged_by: string
          organisation_id: string | null
          scope: string
          withdrawn_at: string | null
          withdrawn_reason: string | null
          wording: string
        }
        SetofOptions: {
          from: "*"
          to: "organiser_permissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      organiser_permission_give: {
        Args: { p_claim: string; p_user: string; p_words: string }
        Returns: string
      }
      organiser_permission_withdraw: {
        Args: { p_permission: string; p_reason: string; p_user: string }
        Returns: string[]
      }
      organiser_runs_night: {
        Args: { p_event: string; p_user: string }
        Returns: boolean
      }
      organiser_series_keep: {
        Args: { p_keep: boolean; p_series: string; p_user: string }
        Returns: string
      }
      organiser_yes_takes_native_shares: {
        Args: {
          v_perm: Database["public"]["Tables"]["organiser_permissions"]["Row"]
        }
        Returns: undefined
      }
      outreach_close_stuck_sends: {
        Args: { p_minutes?: number }
        Returns: number
      }
      outreach_contact_refusal: { Args: { p_contact: string }; Returns: string }
      outreach_contact_refusal_for: {
        Args: { p_contact: string; p_purpose: string; p_template_key: string }
        Returns: string
      }
      outreach_play_cap_today: { Args: { p_play: string }; Returns: number }
      outreach_play_health: {
        Args: { p_play: string }
        Returns: {
          complaints: number
          hard_bounces: number
          healthy: boolean
          over: string
          sends: number
        }[]
      }
      outreach_unsubscribe_by_token: {
        Args: { p_comment?: string; p_reason?: string; p_token: string }
        Returns: string
      }
      platform_notification_guards: { Args: never; Returns: Json }
      platform_trigger_on: {
        Args: { p_table: string; p_trigger: string }
        Returns: boolean
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
      purge_walk_in_reminders: { Args: { p_days: number }; Returns: number }
      reassign_ticket_seat: {
        Args: { p_new_seat_id: string; p_ticket_id: string }
        Returns: Json
      }
      reconcile_refund: {
        Args: {
          p_charge_id: string
          p_refund_amount_cents: number
          p_stripe_refund_id: string
        }
        Returns: string
      }
      record_ledger_entry: {
        Args: { p_entry: Json; p_slot: Json }
        Returns: number
      }
      record_marketing_decline: {
        Args: {
          p_at?: string
          p_consent_text: string
          p_consent_version: string
          p_email: string
          p_source: string
        }
        Returns: boolean
      }
      record_platform_notification: {
        Args: {
          p_actor_label?: string
          p_actor_user_id?: string
          p_admin_path: string
          p_dedupe_key: string
          p_detail?: Json
          p_event_id?: string
          p_event_title?: string
          p_kind: Database["public"]["Enums"]["platform_notification_kind"]
          p_order_id?: string
          p_organisation_id?: string
          p_organisation_name?: string
          p_summary: string
        }
        Returns: undefined
      }
      record_tier_price_history: {
        Args: { p_hint: string; p_tier_id: string }
        Returns: undefined
      }
      recovery_guards: {
        Args: never
        Returns: {
          detail: string
          installed: boolean
          name: string
        }[]
      }
      redeem_tier_access_codes: {
        Args: { p_code: string; p_tier_ids: string[] }
        Returns: {
          ticket_tier_id: string
        }[]
      }
      refresh_audience_member: { Args: { p_email: string }; Returns: undefined }
      refund_policy_is_looser_or_equal: {
        Args: {
          p_new_absorb: boolean
          p_new_days: number
          p_new_self: boolean
          p_new_type: string
          p_old_absorb: boolean
          p_old_days: number
          p_old_self: boolean
          p_old_type: string
        }
        Returns: boolean
      }
      release_discount_claim: {
        Args: { p_reservation_id: string }
        Returns: boolean
      }
      release_expired_discount_claims: { Args: never; Returns: number }
      release_expired_seat_reservations: { Args: never; Returns: number }
      release_holds: { Args: never; Returns: number }
      rematerialize_seats_additive: {
        Args: { p_event_id: string; p_seat_map_id: string }
        Returns: Json
      }
      resolve_chargeback: {
        Args: { p_dispute_id: string; p_outcome: string }
        Returns: Json
      }
      resolve_pricing_value: {
        Args: {
          p_country_code: string
          p_currency: string
          p_event_id: string
          p_organisation_id: string
          p_rule_type: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "pricing_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_scan_review: {
        Args: { p_note?: string; p_scan_id: string }
        Returns: boolean
      }
      save_dynamic_pricing: {
        Args: { p_enabled: boolean; p_steps: Json; p_tier_id: string }
        Returns: number
      }
      save_event_ticket_tiers: {
        Args: { p_event_id: string; p_tiers: Json }
        Returns: Json
      }
      scan_ticket: {
        Args: {
          p_device_id?: string
          p_event_id: string
          p_secret: string
          p_ticket_code: string
        }
        Returns: {
          first_scanned_at: string
          holder_name: string
          result: string
          seat_label: string
        }[]
      }
      social_asset_usable: {
        Args: { p_at: string; p_event: string; p_url: string }
        Returns: boolean
      }
      social_asset_usable_row: {
        Args: {
          a: Database["public"]["Tables"]["social_assets"]["Row"]
          p_at: string
          p_event: string
        }
        Returns: boolean
      }
      social_brand_images: {
        Args: { p_at: string }
        Returns: {
          asset_id: string
          asset_url: string
          attribution_text: string
          focal_x: number
          focal_y: number
          source_height: number
          source_width: number
        }[]
      }
      social_cadence_at: {
        Args: { p_at: string; p_format: string; p_platform: string }
        Returns: {
          basis: string
          created_at: string
          floor_posts: number
          format: string
          gap_hours: number
          id: string
          learned_from: number
          platform: string | null
          reason: string
          set_at: string
          set_by: string
          settle_hours: number
          slots: number[]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "social_cadence_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      social_event_sold_out: { Args: { p_event: string }; Returns: boolean }
      social_log_organiser_yes: {
        Args: {
          p_channel: string
          p_event: string
          p_evidence_file?: string
          p_granted_at: string
          p_host: string
          p_logged_by: string
          p_scope: string
          p_wording: string
        }
        Returns: string
      }
      social_usable_images: {
        Args: { p_at: string; p_events: string[] }
        Returns: {
          asset_id: string
          asset_url: string
          attribution_text: string
          event_id: string
          focal_x: number
          focal_y: number
          source_height: number
          source_width: number
        }[]
      }
      sync_offline_scans: {
        Args: { p_event_id: string; p_scans: Json }
        Returns: Json
      }
      transfer_ticket: {
        Args: { p_ticket_id: string; p_to_email: string; p_to_name: string }
        Returns: {
          event_title: string
          new_secret: string
          ticket_code: string
        }[]
      }
      transfer_ticket_for_order: {
        Args: {
          p_order_id: string
          p_ticket_id: string
          p_to_email: string
          p_to_name: string
        }
        Returns: {
          event_title: string
          new_secret: string
          ticket_code: string
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
      venue_event_share_balance: {
        Args: { p_currency: string; p_event_id: string; p_venue_id: string }
        Returns: number
      }
      venue_merge: {
        Args: { p_by: string; p_drop: string; p_keep: string; p_reason: string }
        Returns: string
      }
      void_payout: {
        Args: { p_payout_id: string; p_reason?: string; p_status?: string }
        Returns: Json
      }
      void_venue_payout: {
        Args: { p_payout_id: string; p_reason?: string; p_status?: string }
        Returns: Json
      }
      walk_in_reminders_due: {
        Args: {
          p_event_id?: string
          p_kind: string
          p_limit?: number
          p_local_hour?: number
          p_now?: string
        }
        Returns: {
          email: string
          event_id: string
          first_day: string
          reminder_id: string
          timezone: string
          unsubscribe_token: string
        }[]
      }
      write_pricing_rule: {
        Args: {
          p_country_code: string
          p_created_by: string
          p_currency: string
          p_event_id?: string
          p_organisation_id?: string
          p_rule_type: string
          p_value_cents?: number
          p_value_integer?: number
          p_value_percentage?: number
          p_value_type: string
        }
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
        | "archived"
      event_type: "in_person" | "virtual" | "hybrid"
      event_visibility: "public" | "private" | "unlisted"
      fee_pass_type: "absorb" | "pass_to_buyer"
      ledger_demand_action:
        | "page_view"
        | "checkout_started"
        | "checkout_abandoned"
        | "waitlist_join"
        | "sold_out_view"
        | "calendar_add"
        | "share"
        | "follow"
      ledger_entry_kind:
        | "sale"
        | "price_change"
        | "inventory"
        | "refund"
        | "demand"
        | "close"
      ledger_inventory_action:
        | "open"
        | "close"
        | "hold"
        | "release"
        | "capacity_change"
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
      platform_notification_kind:
        | "organiser_created"
        | "connect_onboarding_started"
        | "connect_charges_enabled"
        | "event_published"
        | "order_paid"
      platform_notification_state:
        | "pending"
        | "sent"
        | "held_for_digest"
        | "escalated"
        | "failed"
      queue_status: "waiting" | "admitted" | "expired" | "abandoned"
      recovery_suppression_reason:
        | "unsubscribed"
        | "complained"
        | "bounced"
        | "organiser_disabled"
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
      squad_member_status:
        | "invited"
        | "paid"
        | "declined"
        | "timed_out"
        | "refunded"
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
      tier_access_mode: "in_person" | "virtual"
      user_role: "attendee" | "organiser" | "admin" | "super_admin"
      venue_geocode_source: "places" | "geocoding" | "manual"
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
        "archived",
      ],
      event_type: ["in_person", "virtual", "hybrid"],
      event_visibility: ["public", "private", "unlisted"],
      fee_pass_type: ["absorb", "pass_to_buyer"],
      ledger_demand_action: [
        "page_view",
        "checkout_started",
        "checkout_abandoned",
        "waitlist_join",
        "sold_out_view",
        "calendar_add",
        "share",
        "follow",
      ],
      ledger_entry_kind: [
        "sale",
        "price_change",
        "inventory",
        "refund",
        "demand",
        "close",
      ],
      ledger_inventory_action: [
        "open",
        "close",
        "hold",
        "release",
        "capacity_change",
      ],
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
      platform_notification_kind: [
        "organiser_created",
        "connect_onboarding_started",
        "connect_charges_enabled",
        "event_published",
        "order_paid",
      ],
      platform_notification_state: [
        "pending",
        "sent",
        "held_for_digest",
        "escalated",
        "failed",
      ],
      queue_status: ["waiting", "admitted", "expired", "abandoned"],
      recovery_suppression_reason: [
        "unsubscribed",
        "complained",
        "bounced",
        "organiser_disabled",
      ],
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
      squad_member_status: [
        "invited",
        "paid",
        "declined",
        "timed_out",
        "refunded",
      ],
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
      tier_access_mode: ["in_person", "virtual"],
      user_role: ["attendee", "organiser", "admin", "super_admin"],
      venue_geocode_source: ["places", "geocoding", "manual"],
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
// public.venue_geocode_source, a real enum since 20260905000003. It was a TEXT
// column under a CHECK before that, and its union was hand-written INSIDE the
// generated section, which the types-drift guard rightly reported as drift on
// 5 September 2026. The database enforces the three values now, the generator
// emits them, and this alias is the one name the code imports.
export type VenueGeocodeSource = Database['public']['Enums']['venue_geocode_source']

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
