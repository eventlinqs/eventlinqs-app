/**
 * Hand-maintained row types for the Venue Revenue Sharing Program tables, kept
 * in sync with migration 20260627000002_venue_revenue_program.sql. Mirrors the
 * src/lib/admin/types.ts convention: until the founder regenerates
 * src/types/database.ts after applying the migration to TEST, these are the
 * authoritative shapes the venue code reads through (the data-access modules use
 * an untyped Supabase client for the new tables/RPCs, exactly as
 * src/lib/payments/event-transfer.ts does for disburse_transfer).
 */

export type VenueRevenueShareStatus = 'not_enrolled' | 'enrolled' | 'suspended'

export type VenueEnrolmentAction = 'enrolled' | 'unenrolled' | 'suspended' | 'resumed'

export type VenueShareLedgerReason = 'accrual' | 'refund_reversal' | 'payout' | 'adjustment'

export type VenuePayoutStatus = 'pending' | 'paid' | 'failed'

export interface VenueRow {
  id: string
  organisation_id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  capacity: number | null
  image_url: string | null
  is_active: boolean
  stripe_account_id: string | null
  stripe_account_country: string | null
  stripe_payouts_enabled: boolean
  revenue_share_status: VenueRevenueShareStatus
  revenue_share_enrolled_at: string | null
  revenue_share_unenrolled_at: string | null
  created_at: string
  updated_at: string
}

export interface VenueEnrolmentRow {
  id: string
  venue_id: string
  action: VenueEnrolmentAction
  share_percentage: number | null
  actor_admin_id: string | null
  note: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface VenueShareLedgerRow {
  id: string
  venue_id: string
  event_id: string | null
  order_id: string | null
  delta_cents: number
  currency: string
  reason: VenueShareLedgerReason
  reference_type: 'order' | 'refund' | 'payout' | 'adjustment'
  reference_id: string | null
  platform_fee_cents: number | null
  share_percentage: number | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface VenuePayoutRow {
  id: string
  venue_id: string
  event_id: string | null
  amount_cents: number
  currency: string
  status: VenuePayoutStatus
  stripe_transfer_id: string | null
  destination_account_id: string | null
  arrival_date: string | null
  initiated_by: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
