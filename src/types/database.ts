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

export type PayoutTier = 'tier_1' | 'tier_2' | 'tier_3'
export type PayoutSchedule = 'post_event_only' | 'scheduled_plus_on_demand'
export type RiskTier = 'standard' | 'elevated' | 'high'
export type PayoutStatus = 'active' | 'on_hold' | 'restricted'

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
  stripe_account_country: string | null
  stripe_charges_enabled: boolean
  stripe_payouts_enabled: boolean
  stripe_capabilities: Record<string, unknown>
  stripe_requirements: Record<string, unknown>
  payout_tier: PayoutTier
  payout_schedule: PayoutSchedule
  payout_destination: string | null
  refund_window_days: number
  risk_tier: RiskTier
  hold_amount_cents: number
  total_event_count: number
  total_volume_cents: number
  payout_status: PayoutStatus
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
  // M4: Reserved seating
  has_reserved_seating: boolean
  venue_id: string | null
  seat_map_id: string | null
  // M4 Phase 3: Waitlist
  waitlist_enabled: boolean
  // M4 Phase 4: Squad booking
  squad_booking_enabled: boolean
  squad_timeout_hours: number
  // M4 Phase 3C: Virtual queue
  is_high_demand: boolean
  queue_admission_rate: number
  queue_admission_window_minutes: number
  queue_open_at: string | null
  // Joined data
  category?: EventCategory
  organisation?: Organisation
  ticket_tiers?: TicketTier[]
}

// M4: Venue
export interface Venue {
  id: string
  organisation_id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  capacity: number | null
  description: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// M4: Seat map
export interface SeatMap {
  id: string
  venue_id: string
  name: string
  description: string | null
  layout: Record<string, unknown>
  total_seats: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// M4: Seat status / type enums
export type SeatStatus = 'available' | 'reserved' | 'sold' | 'held' | 'blocked' | 'accessible'
export type SeatType = 'standard' | 'premium' | 'accessible' | 'companion' | 'restricted_view' | 'obstructed'

export interface Seat {
  id: string
  event_id: string
  seat_map_section_id: string | null
  ticket_tier_id: string | null
  row_label: string
  seat_number: string
  seat_type: SeatType
  status: SeatStatus
  x: number | null
  y: number | null
  price_cents: number | null
  reservation_id: string | null
  order_item_id: string | null
  held_by_user_id: string | null
  held_reason: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
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
  // M4 columns
  dynamic_pricing_enabled: boolean
  hidden_until: string | null
  requires_access_code: boolean
  seat_map_section_id: string | null
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

// ─── M3: Checkout & Payments ───────────────────────────────────────────────

export type OrderStatus = 'pending' | 'confirmed' | 'partially_refunded' | 'refunded' | 'cancelled' | 'expired'

export type PaymentStatus = 'initiated' | 'processing' | 'requires_action' | 'completed' | 'failed' | 'expired' | 'cancelled' | 'refund_pending' | 'refunded' | 'refund_failed'

export type PaymentGatewayType = 'stripe' | 'paystack' | 'flutterwave' | 'paypal'

export type ReservationStatus = 'active' | 'converted' | 'expired' | 'cancelled'

export type DiscountType = 'percentage' | 'fixed_amount'

export type FeePassType = 'absorb' | 'pass_to_buyer'

export interface Order {
  id: string
  order_number: string
  event_id: string
  organisation_id: string
  user_id: string | null
  guest_email: string | null
  guest_name: string | null
  status: OrderStatus
  subtotal_cents: number
  addon_total_cents: number
  platform_fee_cents: number
  processing_fee_cents: number
  tax_cents: number
  discount_cents: number
  total_cents: number
  currency: string
  fee_pass_type: FeePassType
  discount_code_id: string | null
  reservation_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  expires_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  ticket_tier_id: string | null
  addon_id: string | null
  item_type: 'ticket' | 'addon'
  item_name: string
  quantity: number
  unit_price_cents: number
  total_cents: number
  attendee_first_name: string | null
  attendee_last_name: string | null
  attendee_email: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Payment {
  id: string
  order_id: string
  gateway: PaymentGatewayType
  gateway_payment_id: string | null
  status: PaymentStatus
  amount_cents: number
  currency: string
  client_secret: string | null
  receipt_url: string | null
  failure_reason: string | null
  gateway_response: Record<string, unknown>
  idempotency_key: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Reservation {
  id: string
  event_id: string
  user_id: string | null
  session_id: string | null
  status: ReservationStatus
  items: ReservationItem[]
  expires_at: string
  created_at: string
  converted_at: string | null
}

export interface ReservationItem {
  ticket_tier_id: string
  quantity: number
  addon_id?: string
}

// ─── M4 Phase 3: Waitlist ──────────────────────────────────────────────────

export type WaitlistStatus = 'waiting' | 'notified' | 'converted' | 'expired' | 'removed'

export interface WaitlistEntry {
  id: string
  event_id: string
  ticket_tier_id: string | null
  user_id: string
  quantity_requested: number
  status: WaitlistStatus
  position: number
  created_at: string
  notified_at: string | null
  converted_at: string | null
  expired_at: string | null
}

export interface WaitlistNotification {
  id: string
  waitlist_id: string
  notified_at: string
  expires_at: string
  converted: boolean
  converted_at: string | null
  email_sent: boolean
}

// ─── M4 Phase 4: Squad Booking ────────────────────────────────────────────────

export type SquadStatus = 'forming' | 'completed' | 'expired' | 'cancelled'
export type SquadMemberStatus = 'invited' | 'paid' | 'declined' | 'timed_out'

export interface Squad {
  id: string
  event_id: string
  leader_user_id: string
  ticket_tier_id: string
  reservation_id: string | null
  total_spots: number
  status: SquadStatus
  share_token: string
  extended_once: boolean
  created_at: string
  expires_at: string
  completed_at: string | null
  cancelled_at: string | null
  // Joined data
  event?: Event
  ticket_tier?: TicketTier
  squad_members?: SquadMember[]
}

export interface SquadMember {
  id: string
  squad_id: string
  user_id: string | null
  guest_email: string | null
  attendee_first_name: string | null
  attendee_last_name: string | null
  attendee_email: string | null
  status: SquadMemberStatus
  order_id: string | null
  position: number
  created_at: string
  paid_at: string | null
  // Joined data
  squad?: Squad
}

// ─── M4 Phase 3C: Virtual Queue ──────────────────────────────────────────────

export type QueueStatus = 'waiting' | 'admitted' | 'expired' | 'abandoned'

export interface QueueEntry {
  id: string
  event_id: string
  user_id: string | null
  session_id: string | null
  ip_address: string | null
  position: number
  status: QueueStatus
  position_token: string
  admitted_at: string | null
  expires_at: string | null
  created_at: string
}

export interface DiscountCode {
  id: string
  event_id: string
  organisation_id: string
  code: string
  discount_type: DiscountType
  discount_value: number
  currency: string | null
  max_uses: number | null
  max_uses_per_user: number
  current_uses: number
  min_order_amount_cents: number | null
  applicable_tier_ids: string[] | null
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── M5: Personalisation (saved entities) ─────────────────────────────────

export interface SavedEvent {
  id: string
  user_id: string
  event_id: string
  created_at: string
}

export interface SavedOrganiser {
  id: string
  user_id: string
  organisation_id: string
  created_at: string
}

export interface SavedCategory {
  id: string
  user_id: string
  category_id: string
  created_at: string
}

// =====================================================================
// M6 Stripe Connect: tiered payout system
// See docs/m6/m6-implementation-plan.md
// =====================================================================

export type PayoutRecordStatus = 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'

export interface Payout {
  id: string
  organisation_id: string
  stripe_payout_id: string
  amount_cents: number
  currency: string
  arrival_date: string | null
  status: PayoutRecordStatus
  failure_reason: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type PayoutHoldType =
  | 'reserve'
  | 'chargeback'
  | 'admin_manual'
  | 'negative_balance'
  | 'new_organiser'

export interface PayoutHold {
  id: string
  organisation_id: string
  event_id: string | null
  hold_type: PayoutHoldType
  amount_cents: number
  currency: string
  release_at: string
  released_at: string | null
  reason_text: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type LedgerReason =
  | 'order_confirmed'
  | 'refund_from_balance'
  | 'refund_from_reserve'
  | 'refund_from_gateway'
  | 'refund_platform_float'
  | 'chargeback'
  | 'chargeback_fee'
  | 'payout'
  | 'reserve_hold'
  | 'reserve_release'
  | 'instant_payout_fee'
  | 'adjustment'

export type LedgerReferenceType = 'order' | 'payout' | 'hold' | 'dispute' | 'adjustment'

export interface OrganiserBalanceLedger {
  id: string
  organisation_id: string
  delta_cents: number
  currency: string
  reason: LedgerReason
  reference_type: LedgerReferenceType
  reference_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type TierProgressionReason =
  | 'auto_promotion'
  | 'admin_promotion'
  | 'chargeback_demotion'
  | 'negative_balance_demotion'
  | 'admin_demotion'

export interface TierProgressionLog {
  id: string
  organisation_id: string
  from_tier: PayoutTier
  to_tier: PayoutTier
  reason: TierProgressionReason
  triggered_by: string | null
  metadata: Record<string, unknown>
  created_at: string
}
