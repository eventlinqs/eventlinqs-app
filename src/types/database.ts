export type UserRole = 'attendee' | 'organiser' | 'admin' | 'super_admin'
export type OrgStatus = 'pending' | 'active' | 'suspended' | 'deactivated'
export type OrgMemberRole = 'owner' | 'admin' | 'manager' | 'member'
export type EventStatus = 'draft' | 'scheduled' | 'published' | 'paused' | 'postponed' | 'cancelled' | 'completed'
export type EventVisibility = 'public' | 'private' | 'unlisted'
export type EventType = 'in_person' | 'virtual' | 'hybrid'
export type TicketTierType = 'general_admission' | 'vip' | 'vvip' | 'early_bird' | 'group' | 'student' | 'table_booth' | 'donation' | 'free'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  display_name: string | null
  avatar_url: string | null
  phone: string | null
  role: UserRole
  is_verified: boolean
  onboarding_completed: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Organisation {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  website: string | null
  email: string | null
  phone: string | null
  status: OrgStatus
  owner_id: string
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OrganisationMember {
  id: string
  organisation_id: string
  user_id: string
  role: OrgMemberRole
  invited_by: string | null
  joined_at: string
  updated_at: string
}

export interface EventCategory {
  id: string
  name: string
  slug: string
  icon: string | null
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface Event {
  id: string
  title: string
  slug: string
  description: string | null
  summary: string | null
  organisation_id: string
  created_by: string
  category_id: string | null
  start_date: string
  end_date: string
  timezone: string
  is_multi_day: boolean
  is_recurring: boolean
  recurrence_rule: string | null
  parent_event_id: string | null
  event_type: EventType
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  venue_postal_code: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  venue_place_id: string | null
  virtual_url: string | null
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: string[]
  status: EventStatus
  visibility: EventVisibility
  published_at: string | null
  scheduled_publish_at: string | null
  is_age_restricted: boolean
  age_restriction_min: number | null
  max_capacity: number | null
  tags: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined data
  category?: EventCategory
  organisation?: Organisation
  ticket_tiers?: TicketTier[]
}

export interface TicketTier {
  id: string
  event_id: string
  name: string
  description: string | null
  tier_type: TicketTierType
  price: number
  currency: string
  total_capacity: number
  sold_count: number
  reserved_count: number
  sale_start: string | null
  sale_end: string | null
  min_per_order: number
  max_per_order: number
  sort_order: number
  is_visible: boolean
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EventAddon {
  id: string
  event_id: string
  name: string
  description: string | null
  price: number
  currency: string
  total_capacity: number | null
  sold_count: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
