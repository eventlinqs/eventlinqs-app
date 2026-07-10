import type { SupabaseClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'
import { getVenueRevenueSharePercentage } from './pricing-rules'

/**
 * Venue Revenue Sharing Program: accrual + refund reversal of the venue's share
 * of the EventLinqs PLATFORM FEE (CLAUDE.md "Venue Revenue Sharing Program").
 *
 * The share is carved purely from the platform fee EventLinqs already keeps:
 *   venue_share = round(order.platform_fee_cents * rate / 100)
 * It NEVER touches the organiser share or the buyer total, and only events at an
 * ENROLLED venue (events.venue_id -> venues.revenue_share_status = 'enrolled')
 * generate a share. Free tickets carry no platform fee, so no share. The rate is
 * resolved through the ONE getPricingRule resolver (rule_type
 * 'venue_revenue_share_percentage'), never forked or hardcoded.
 *
 * Every accrual is one append-only row in venue_share_ledger, attributed to the
 * venue, event, and order. The organiser ledger is untouched; this is a separate
 * ledger funded from EventLinqs's retained margin.
 *
 * Untyped client (like event-transfer.ts): the new venue_share_ledger table and
 * its rows resolve before src/types/database.ts is regenerated post-migration.
 */
type AdminClient = SupabaseClient

/** Postgres unique-violation code (the accrual idempotency index). */
const UNIQUE_VIOLATION = '23505'

/**
 * Pure venue-share math. Floor-free rounding to the nearest cent so the venue
 * gets its fair 20% of the platform fee with standard half-up rounding, matching
 * the PaymentCalculator's Math.round fee math. Returns 0 for a non-positive
 * platform fee (free events) or a non-positive rate.
 */
export function computeVenueShareCents(platformFeeCents: number, sharePercentage: number): number {
  if (!Number.isFinite(platformFeeCents) || platformFeeCents <= 0) return 0
  if (!Number.isFinite(sharePercentage) || sharePercentage <= 0) return 0
  return Math.round((platformFeeCents * sharePercentage) / 100)
}

interface OrderShareInputs {
  id: string
  organisation_id: string
  event_id: string | null
  status: string
  total_cents: number
  platform_fee_cents: number
  currency: string
}

interface EventVenueInputs {
  id: string
  venue_id: string | null
}

interface VenueEnrolInputs {
  id: string
  revenue_share_status: string
  organisation_id: string
}

export type RecordVenueShareAccrualStatus =
  | 'written'
  | 'skipped_already_recorded'
  | 'skipped_free_or_unpriced'
  | 'skipped_unconfirmed_order'
  | 'skipped_no_event_or_venue'
  | 'skipped_venue_not_enrolled'
  | 'skipped_zero_share'

export interface RecordVenueShareAccrualResult {
  status: RecordVenueShareAccrualStatus
  venueId?: string
  shareCents?: number
  platformFeeCents?: number
  sharePercentage?: number
}

/**
 * Records the venue's accrued share for one confirmed, paid order, if and only
 * if the order's event is held at an ENROLLED venue. Idempotent: one accrual row
 * per order (guarded by the unique index and a pre-check). Safe to call on every
 * webhook delivery; MUST NOT throw out of the caller (the buyer's payment has
 * already succeeded), so the webhook wraps it and faults are captured.
 */
export async function recordVenueShareAccrual(
  adminClient: AdminClient,
  params: { orderId: string }
): Promise<RecordVenueShareAccrualResult> {
  // Idempotency pre-check: already accrued for this order?
  const { data: existing } = await adminClient
    .from('venue_share_ledger')
    .select('id')
    .eq('order_id', params.orderId)
    .eq('reason', 'accrual')
    .limit(1)
    .maybeSingle()
  if (existing) return { status: 'skipped_already_recorded' }

  const order = await loadOrder(adminClient, params.orderId)
  if (!order) return { status: 'skipped_unconfirmed_order' }
  if (order.status !== 'confirmed') return { status: 'skipped_unconfirmed_order' }
  // Free events carry no platform fee, so no venue share.
  if (order.total_cents <= 0 || order.platform_fee_cents <= 0) {
    return { status: 'skipped_free_or_unpriced' }
  }
  if (!order.event_id) return { status: 'skipped_no_event_or_venue' }

  const event = await loadEventVenue(adminClient, order.event_id)
  if (!event?.venue_id) return { status: 'skipped_no_event_or_venue' }

  const venue = await loadVenue(adminClient, event.venue_id)
  if (!venue || venue.revenue_share_status !== 'enrolled') {
    return { status: 'skipped_venue_not_enrolled' }
  }

  // Resolve the rate by the organiser's country + the order currency, the same
  // country logic the organiser ledger uses, through the single-source resolver.
  const orgCountryCode = await loadOrgCountry(adminClient, order.organisation_id)
  const sharePercentage = await getVenueRevenueSharePercentage(
    orgCountryCode,
    order.currency,
    null,
    order.event_id
  )
  const shareCents = computeVenueShareCents(order.platform_fee_cents, sharePercentage)
  if (shareCents <= 0) return { status: 'skipped_zero_share' }

  const { error: insertError } = await adminClient.from('venue_share_ledger').insert({
    venue_id: venue.id,
    event_id: order.event_id,
    order_id: order.id,
    delta_cents: shareCents,
    currency: order.currency,
    reason: 'accrual',
    reference_type: 'order',
    reference_id: order.id,
    platform_fee_cents: order.platform_fee_cents,
    share_percentage: sharePercentage,
    metadata: {
      organisation_id: order.organisation_id,
      venue_organisation_id: venue.organisation_id,
    },
  })
  if (insertError) {
    // A concurrent webhook redelivery raced us to the unique accrual index.
    if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
      return { status: 'skipped_already_recorded' }
    }
    captureException(insertError, {
      scope: 'payments-venue-share',
      handler: 'accrual-insert',
      order_id: order.id,
      venue_id: venue.id,
    })
    throw insertError
  }

  return {
    status: 'written',
    venueId: venue.id,
    shareCents,
    platformFeeCents: order.platform_fee_cents,
    sharePercentage,
  }
}

export type ReverseVenueShareStatus =
  | 'reversed'
  | 'skipped_no_accrual'
  | 'skipped_already_reversed'
  | 'skipped_zero'

export interface ReverseVenueShareResult {
  status: ReverseVenueShareStatus
  reversedCents?: number
}

/**
 * Reverses (claws back) the venue's share in proportion to a refund, so the
 * venue is never paid on refunded money. A full-order refund reverses the full
 * remaining accrued share; a partial refund reverses the proportional slice
 * (by refunded amount / order total), capped at the remaining net so it can
 * never over-reverse. Idempotent per refund. Best-effort: the caller wraps it.
 */
export async function reverseVenueShareForRefund(
  adminClient: AdminClient,
  params: { orderId: string; refundId: string; refundedAmountCents: number }
): Promise<ReverseVenueShareResult> {
  // Idempotency: already reversed for this refund?
  const { data: existingReversal } = await adminClient
    .from('venue_share_ledger')
    .select('id')
    .eq('reason', 'refund_reversal')
    .eq('reference_type', 'refund')
    .eq('reference_id', params.refundId)
    .limit(1)
    .maybeSingle()
  if (existingReversal) return { status: 'skipped_already_reversed' }

  // The original accrual for this order (carries venue/event/currency + amount).
  const { data: accrual } = await adminClient
    .from('venue_share_ledger')
    .select('venue_id, event_id, currency, delta_cents')
    .eq('order_id', params.orderId)
    .eq('reason', 'accrual')
    .limit(1)
    .maybeSingle()
  if (!accrual) return { status: 'skipped_no_accrual' }

  const accrued = (accrual as { delta_cents: number }).delta_cents
  if (accrued <= 0) return { status: 'skipped_zero' }

  const order = await loadOrder(adminClient, params.orderId)
  const orderTotal = order?.total_cents ?? 0

  // Already-reversed total for this order (so partial refunds never over-reverse).
  const { data: priorRows } = await adminClient
    .from('venue_share_ledger')
    .select('delta_cents')
    .eq('order_id', params.orderId)
    .eq('reason', 'refund_reversal')
  const alreadyReversed = ((priorRows ?? []) as Array<{ delta_cents: number }>).reduce(
    (sum, r) => sum + Math.abs(r.delta_cents),
    0
  )
  const remaining = accrued - alreadyReversed
  if (remaining <= 0) return { status: 'skipped_zero' }

  // Full refund (or unknown total) reverses the remaining; partial reverses the
  // proportional slice, capped at remaining.
  let reverseCents: number
  if (orderTotal <= 0 || params.refundedAmountCents >= orderTotal) {
    reverseCents = remaining
  } else {
    reverseCents = Math.min(remaining, Math.round((accrued * params.refundedAmountCents) / orderTotal))
  }
  if (reverseCents <= 0) return { status: 'skipped_zero' }

  const venueId = (accrual as { venue_id: string }).venue_id
  const eventId = (accrual as { event_id: string | null }).event_id
  const currency = (accrual as { currency: string }).currency

  const { error: insertError } = await adminClient.from('venue_share_ledger').insert({
    venue_id: venueId,
    event_id: eventId,
    order_id: params.orderId,
    delta_cents: -reverseCents,
    currency,
    reason: 'refund_reversal',
    reference_type: 'refund',
    reference_id: params.refundId,
    metadata: { refunded_amount_cents: params.refundedAmountCents, order_total_cents: orderTotal },
  })
  if (insertError) {
    captureException(insertError, {
      scope: 'payments-venue-share',
      handler: 'refund-reversal-insert',
      order_id: params.orderId,
      refund_id: params.refundId,
    })
    throw insertError
  }

  return { status: 'reversed', reversedCents: reverseCents }
}

// ── Loaders ─────────────────────────────────────────────────────────────────

async function loadOrder(adminClient: AdminClient, orderId: string): Promise<OrderShareInputs | null> {
  const { data, error } = await adminClient
    .from('orders')
    .select('id, organisation_id, event_id, status, total_cents, platform_fee_cents, currency')
    .eq('id', orderId)
    .maybeSingle()
  if (error) return null
  return (data as OrderShareInputs | null) ?? null
}

async function loadEventVenue(adminClient: AdminClient, eventId: string): Promise<EventVenueInputs | null> {
  const { data, error } = await adminClient
    .from('events')
    .select('id, venue_id')
    .eq('id', eventId)
    .maybeSingle()
  if (error) return null
  return (data as EventVenueInputs | null) ?? null
}

async function loadVenue(adminClient: AdminClient, venueId: string): Promise<VenueEnrolInputs | null> {
  const { data, error } = await adminClient
    .from('venues')
    .select('id, revenue_share_status, organisation_id')
    .eq('id', venueId)
    .maybeSingle()
  if (error) return null
  return (data as VenueEnrolInputs | null) ?? null
}

async function loadOrgCountry(adminClient: AdminClient, organisationId: string): Promise<string> {
  const { data } = await adminClient
    .from('organisations')
    .select('stripe_account_country')
    .eq('id', organisationId)
    .maybeSingle()
  const country = (data as { stripe_account_country: string | null } | null)?.stripe_account_country
  return (country ?? 'GLOBAL').toUpperCase()
}
