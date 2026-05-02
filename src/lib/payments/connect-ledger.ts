import type { SupabaseClient } from '@supabase/supabase-js'
import { getReservePercentage, getPayoutScheduleDays } from './pricing-rules'

type AdminClient = SupabaseClient

interface OrderLedgerInputs {
  id: string
  organisation_id: string
  event_id: string | null
  status: string
  total_cents: number
  platform_fee_cents: number
  processing_fee_cents: number
  currency: string
}

interface OrgLedgerInputs {
  stripe_account_country: string | null
}

interface EventLedgerInputs {
  end_date: string | null
}

export interface RecordOrderConfirmedLedgerParams {
  orderId: string
  stripePaymentIntentId: string
  stripeChargeId: string | null
}

export interface RecordOrderConfirmedLedgerResult {
  status: 'written' | 'skipped_already_recorded' | 'skipped_free_event' | 'skipped_unconfirmed_order'
  organiserShareCents?: number
  reserveCents?: number
  applicationFeeCents?: number
}

/**
 * Adds N business days to the given date, skipping Saturday and Sunday.
 * Public-holiday awareness is out of scope for Phase 3; the Phase 4 release
 * scheduler may refine this.
 */
export function addBusinessDays(date: Date, businessDays: number): Date {
  const next = new Date(date.getTime())
  if (businessDays <= 0) return next
  let added = 0
  while (added < businessDays) {
    next.setUTCDate(next.getUTCDate() + 1)
    const dow = next.getUTCDay()
    if (dow !== 0 && dow !== 6) added += 1
  }
  return next
}

/**
 * Backward-compatible wrapper retained for existing tests. Prefer
 * `addBusinessDays(date, n)` for new call sites.
 */
export function addThreeBusinessDays(date: Date): Date {
  return addBusinessDays(date, 3)
}

/**
 * Writes the M6 destination-charge ledger entries for a confirmed order:
 *
 * 1. `order_confirmed` ledger row (positive credit of organiser share).
 * 2. `payout_holds` reserve row pinned to the event.
 * 3. `reserve_hold` ledger row mirroring the reserve (negative debit).
 * 4. Increment `organisations.hold_amount_cents`, `total_volume_cents`, and
 *    (on first confirmed order for the event) `total_event_count`.
 *
 * Idempotent: returns `skipped_already_recorded` if an `order_confirmed`
 * ledger row already exists for this order. Safe to call on every webhook
 * delivery, including Stripe retries.
 *
 * Skips and returns `skipped_free_event` for free orders (total_cents === 0).
 * These should not reach this code path (no PaymentIntent is created), but
 * the guard keeps the function safe to call unconditionally.
 *
 * Logs and returns `skipped_unconfirmed_order` if the order row is missing
 * or not in `confirmed` status — the caller (webhook handler) is responsible
 * for confirm_order() succeeding before this is invoked.
 */
export async function recordOrderConfirmedLedger(
  adminClient: AdminClient,
  params: RecordOrderConfirmedLedgerParams
): Promise<RecordOrderConfirmedLedgerResult> {
  // Idempotency guard: skip if we've already written for this order.
  const { data: existing, error: existingError } = await adminClient
    .from('organiser_balance_ledger')
    .select('id')
    .eq('reference_type', 'order')
    .eq('reference_id', params.orderId)
    .eq('reason', 'order_confirmed')
    .limit(1)
    .maybeSingle()
  if (existingError) {
    console.error('[connect-ledger] existing-row check failed', {
      orderId: params.orderId,
      error: existingError,
    })
  }
  if (existing) return { status: 'skipped_already_recorded' }

  const order = await loadOrder(adminClient, params.orderId)
  if (!order) {
    console.error('[connect-ledger] order not found', { orderId: params.orderId })
    return { status: 'skipped_unconfirmed_order' }
  }
  if (order.total_cents <= 0) return { status: 'skipped_free_event' }
  if (order.status !== 'confirmed') {
    console.warn('[connect-ledger] order not in confirmed status; ledger write skipped', {
      orderId: params.orderId,
      status: order.status,
    })
    return { status: 'skipped_unconfirmed_order' }
  }

  const org = await loadOrg(adminClient, order.organisation_id)
  if (!org) {
    console.error('[connect-ledger] organisation not found', {
      orderId: params.orderId,
      organisationId: order.organisation_id,
    })
    return { status: 'skipped_unconfirmed_order' }
  }

  const event = order.event_id ? await loadEvent(adminClient, order.event_id) : null

  const orgCountryCode = (org.stripe_account_country ?? 'GLOBAL').toUpperCase()
  const applicationFeeCents = order.platform_fee_cents + order.processing_fee_cents
  const organiserShareCents = order.total_cents - applicationFeeCents

  const [reservePercent, payoutScheduleDays] = await Promise.all([
    getReservePercentage(orgCountryCode, order.currency, order.organisation_id),
    getPayoutScheduleDays(orgCountryCode, order.currency, order.organisation_id),
  ])
  const reserveCents = organiserShareCents > 0
    ? Math.floor((organiserShareCents * reservePercent) / 100)
    : 0
  const releaseAt = computeReleaseAt(event?.end_date ?? null, payoutScheduleDays)

  const ledgerMetaBase = {
    stripe_payment_intent_id: params.stripePaymentIntentId,
    stripe_charge_id: params.stripeChargeId,
  }

  // 1. Positive credit for the organiser share.
  const { error: creditError } = await adminClient
    .from('organiser_balance_ledger')
    .insert({
      organisation_id: order.organisation_id,
      delta_cents: organiserShareCents,
      currency: order.currency,
      reason: 'order_confirmed',
      reference_type: 'order',
      reference_id: params.orderId,
      metadata: {
        ...ledgerMetaBase,
        application_fee_cents: applicationFeeCents,
      },
    })
  if (creditError) {
    console.error('[connect-ledger] order_confirmed insert failed', {
      orderId: params.orderId,
      error: creditError,
    })
    return { status: 'skipped_unconfirmed_order' }
  }

  // 2. Reserve hold row + 3. Mirror debit ledger entry.
  if (reserveCents > 0) {
    const { data: holdRow, error: holdError } = await adminClient
      .from('payout_holds')
      .insert({
        organisation_id: order.organisation_id,
        event_id: order.event_id,
        hold_type: 'reserve',
        amount_cents: reserveCents,
        currency: order.currency,
        release_at: releaseAt.toISOString(),
        metadata: {
          ...ledgerMetaBase,
          source: 'auto_reserve',
          reserve_percent: reservePercent,
          payout_schedule_days: payoutScheduleDays,
          order_id: params.orderId,
        },
      })
      .select('id')
      .single()

    if (holdError || !holdRow) {
      console.error('[connect-ledger] payout_holds insert failed', {
        orderId: params.orderId,
        error: holdError,
      })
    } else {
      const { error: debitError } = await adminClient
        .from('organiser_balance_ledger')
        .insert({
          organisation_id: order.organisation_id,
          delta_cents: -reserveCents,
          currency: order.currency,
          reason: 'reserve_hold',
          reference_type: 'hold',
          reference_id: holdRow.id,
          metadata: {
            ...ledgerMetaBase,
            order_id: params.orderId,
          },
        })
      if (debitError) {
        console.error('[connect-ledger] reserve_hold insert failed', {
          orderId: params.orderId,
          holdId: holdRow.id,
          error: debitError,
        })
      }
    }
  }

  // 4. Counters on the organisation row.
  await incrementOrgCounters(adminClient, {
    organisationId: order.organisation_id,
    eventId: order.event_id,
    grossRevenueCents: order.total_cents - order.processing_fee_cents,
    reserveCents,
    orderId: params.orderId,
  })

  return {
    status: 'written',
    applicationFeeCents,
    organiserShareCents,
    reserveCents,
  }
}

async function loadOrder(
  adminClient: AdminClient,
  orderId: string
): Promise<OrderLedgerInputs | null> {
  const { data, error } = await adminClient
    .from('orders')
    .select(
      'id, organisation_id, event_id, status, total_cents, platform_fee_cents, processing_fee_cents, currency'
    )
    .eq('id', orderId)
    .maybeSingle()
  if (error) {
    console.error('[connect-ledger] order load failed', { orderId, error })
    return null
  }
  return (data as OrderLedgerInputs | null) ?? null
}

async function loadOrg(
  adminClient: AdminClient,
  organisationId: string
): Promise<OrgLedgerInputs | null> {
  const { data, error } = await adminClient
    .from('organisations')
    .select('stripe_account_country')
    .eq('id', organisationId)
    .maybeSingle()
  if (error) {
    console.error('[connect-ledger] org load failed', { organisationId, error })
    return null
  }
  return (data as OrgLedgerInputs | null) ?? null
}

async function loadEvent(
  adminClient: AdminClient,
  eventId: string
): Promise<EventLedgerInputs | null> {
  const { data, error } = await adminClient
    .from('events')
    .select('end_date')
    .eq('id', eventId)
    .maybeSingle()
  if (error) {
    console.error('[connect-ledger] event load failed', { eventId, error })
    return null
  }
  return (data as EventLedgerInputs | null) ?? null
}

function computeReleaseAt(eventEndDateIso: string | null, businessDays: number): Date {
  // Fallback to "now + N business days" if the event has no end_date.
  // Reserve still releases on a deterministic schedule even for malformed events.
  const base = eventEndDateIso ? new Date(eventEndDateIso) : new Date()
  return addBusinessDays(base, businessDays)
}

interface IncrementCountersParams {
  organisationId: string
  eventId: string | null
  grossRevenueCents: number
  reserveCents: number
  orderId: string
}

async function incrementOrgCounters(
  adminClient: AdminClient,
  params: IncrementCountersParams
): Promise<void> {
  // Detect first confirmed order for this event.
  let isFirstConfirmedForEvent = false
  if (params.eventId) {
    const { count, error: countError } = await adminClient
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', params.eventId)
      .eq('status', 'confirmed')
      .neq('id', params.orderId)
    if (countError) {
      console.error('[connect-ledger] confirmed-order count failed', {
        eventId: params.eventId,
        error: countError,
      })
    } else {
      isFirstConfirmedForEvent = (count ?? 0) === 0
    }
  }

  const { data: orgRow, error: readError } = await adminClient
    .from('organisations')
    .select('hold_amount_cents, total_volume_cents, total_event_count')
    .eq('id', params.organisationId)
    .maybeSingle()

  if (readError || !orgRow) {
    console.error('[connect-ledger] org counters read failed', {
      organisationId: params.organisationId,
      error: readError,
    })
    return
  }

  const next = {
    hold_amount_cents: (orgRow.hold_amount_cents as number) + params.reserveCents,
    total_volume_cents: (orgRow.total_volume_cents as number) + params.grossRevenueCents,
    total_event_count:
      (orgRow.total_event_count as number) + (isFirstConfirmedForEvent ? 1 : 0),
    updated_at: new Date().toISOString(),
  }

  const { error: writeError } = await adminClient
    .from('organisations')
    .update(next)
    .eq('id', params.organisationId)
  if (writeError) {
    console.error('[connect-ledger] org counters update failed', {
      organisationId: params.organisationId,
      error: writeError,
    })
  }
}
