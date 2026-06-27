import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'
import { getCurrencyForCountry } from './application-fee'
import { getPayoutScheduleDays } from './pricing-rules'
import type { TransferGateway } from './gateway'

/**
 * Venue Revenue Sharing Program disbursement. The venue analogue of
 * event-transfer.ts: after an event ends (event_end + buffer), the enrolled
 * venue is paid its accumulated net share with a platform->connected Transfer,
 * exactly the proven organiser path. disburse_venue_share claims the amount
 * atomically (writing the negative `payout` venue-ledger entry BEFORE any Stripe
 * call); this module then moves the money and back-fills stripe_transfer_id, or
 * compensates via void_venue_payout on failure.
 *
 * Money comes from EventLinqs's retained platform-fee margin (already in the
 * platform Stripe balance), so the venue transfer never touches the organiser
 * ledger or the organiser's funds. Untyped client (like event-transfer.ts) so
 * the new RPCs/tables resolve before database.ts is regenerated.
 */
type AdminClient = SupabaseClient

export interface CreateVenueTransferParams {
  venueId: string
  eventId: string
  currency: string
  /** Connected (venue) account that receives the transfer. */
  destinationAccountId: string
  /** Explicit amount; null/undefined disburses the full event-scoped share. */
  amountCents?: number | null
  actor?: string | null
  metadata?: Record<string, string>
}

export type VenueTransferError =
  | 'venue_not_found'
  | 'nothing_to_disburse'
  | 'exceeds_available'
  | 'invalid_input'
  | 'exceeds_platform_balance'

export interface CreateVenueTransferSuccess {
  success: true
  payoutId: string
  stripeTransferId: string
  amountCents: number
  availableBeforeCents: number
  availableAfterCents: number
}

export interface CreateVenueTransferFailure {
  success: false
  error: VenueTransferError
  detail?: Record<string, unknown>
}

export type CreateVenueTransferResult = CreateVenueTransferSuccess | CreateVenueTransferFailure

interface DisburseVenueRpcResult {
  success: boolean
  error?: string
  payout_id?: string
  amount_cents?: number
  available_before_cents?: number
  available_after_cents?: number
  [k: string]: unknown
}

/**
 * Disburses one event's accrued venue share to the enrolled venue. Order:
 * ledger claim (disburse_venue_share) BEFORE the Stripe transfer; the transfer
 * uses the claimed payout id as its idempotency key. A failure after the claim
 * compensates via void_venue_payout so no share is stranded. Caps the claim at
 * the platform's real Stripe available balance.
 */
export async function createVenueTransfer(
  adminClient: AdminClient,
  transferGateway: TransferGateway,
  stripe: Stripe,
  params: CreateVenueTransferParams
): Promise<CreateVenueTransferResult> {
  const { venueId, eventId, currency, destinationAccountId } = params
  if (!venueId || !eventId || !currency || !destinationAccountId) {
    return {
      success: false,
      error: 'invalid_input',
      detail: { reason: 'venueId, eventId, currency and destinationAccountId are required' },
    }
  }
  const amountProvided = params.amountCents !== undefined && params.amountCents !== null
  if (amountProvided && (!Number.isInteger(params.amountCents) || (params.amountCents as number) <= 0)) {
    return {
      success: false,
      error: 'invalid_input',
      detail: { reason: `amountCents must be a positive integer (got ${params.amountCents})` },
    }
  }
  const currencyLower = currency.toLowerCase()

  // The platform balance holds the retained margin. Read its real available so a
  // claim can never exceed what we can actually transfer.
  const balance = await stripe.balance.retrieve()
  const platformAvailableCents = (balance.available ?? [])
    .filter((b) => b.currency === currencyLower)
    .reduce((sum, b) => sum + b.amount, 0)

  // Atomic event-scoped claim. Writes the negative `payout` venue-ledger entry
  // before any Stripe call. Returns the structured error unchanged on refusal.
  const { data: claimData, error: claimError } = await adminClient.rpc('disburse_venue_share', {
    p_venue_id: venueId,
    p_event_id: eventId,
    p_currency: currency,
    p_amount_cents: amountProvided ? params.amountCents : null,
    p_actor: params.actor ?? null,
  })
  if (claimError) {
    captureException(claimError, {
      scope: 'payments-venue-transfer',
      handler: 'disburse-venue-share-rpc',
      venue_id: venueId,
      event_id: eventId,
    })
    throw claimError
  }
  const claim = claimData as DisburseVenueRpcResult
  if (!claim?.success) {
    return {
      success: false,
      error: (claim?.error as VenueTransferError) ?? 'nothing_to_disburse',
      detail: claim,
    }
  }

  const payoutId = claim.payout_id as string
  const claimedAmount = claim.amount_cents as number

  if (claimedAmount > platformAvailableCents) {
    await voidClaim(adminClient, payoutId, `exceeds_platform_balance: claimed ${claimedAmount} > platform available ${platformAvailableCents}`)
    return {
      success: false,
      error: 'exceeds_platform_balance',
      detail: { claimedAmountCents: claimedAmount, platformAvailableCents },
    }
  }

  let transfer: { transfer_id: string }
  try {
    transfer = await transferGateway.createTransfer({
      amount_cents: claimedAmount,
      currency,
      destination_account_id: destinationAccountId,
      transfer_group: `venue_${venueId}_event_${eventId}`,
      idempotency_key: payoutId,
      metadata: {
        venue_payout_id: payoutId,
        venue_id: venueId,
        event_id: eventId,
        source: 'venue_revenue_share',
        ...(params.metadata ?? {}),
      },
    })
  } catch (err) {
    captureException(err, {
      scope: 'payments-venue-transfer',
      handler: 'stripe-transfers-create',
      venue_id: venueId,
      event_id: eventId,
      payout_id: payoutId,
      amount_cents: claimedAmount,
    })
    await voidClaim(adminClient, payoutId, err instanceof Error ? err.message : 'stripe_transfer_create_failed')
    throw err
  }

  // Success: the platform->venue transfer completed. Mark the row paid + record id.
  const nowIso = new Date().toISOString()
  const { error: backfillError } = await adminClient
    .from('venue_payouts')
    .update({
      stripe_transfer_id: transfer.transfer_id,
      status: 'paid',
      arrival_date: nowIso,
      updated_at: nowIso,
    })
    .eq('id', payoutId)
  if (backfillError) {
    // The Stripe transfer already exists (idempotency key = payout id) so we must
    // NOT void here. Capture loudly; a re-run of this exact claim is idempotent.
    captureException(backfillError, {
      scope: 'payments-venue-transfer',
      handler: 'transfer-id-backfill',
      venue_id: venueId,
      event_id: eventId,
      payout_id: payoutId,
      stripe_transfer_id: transfer.transfer_id,
    })
  }

  return {
    success: true,
    payoutId,
    stripeTransferId: transfer.transfer_id,
    amountCents: claimedAmount,
    availableBeforeCents: (claim.available_before_cents as number) ?? 0,
    availableAfterCents: (claim.available_after_cents as number) ?? 0,
  }
}

async function voidClaim(adminClient: AdminClient, payoutId: string, reason: string): Promise<void> {
  const { error } = await adminClient.rpc('void_venue_payout', {
    p_payout_id: payoutId,
    p_status: 'failed',
    p_reason: reason,
  })
  if (error) {
    captureException(error, {
      scope: 'payments-venue-transfer',
      handler: 'void-claim',
      payout_id: payoutId,
    })
  }
}

export interface VenueDisbursementSummary {
  considered: number
  transferred: number
  skipped: number
  failed: number
  results: Array<{
    eventId: string
    venueId: string
    status: 'transferred' | 'skipped' | 'failed'
    amountCents?: number
    error?: string
  }>
}

interface EligibleVenueEventRow {
  id: string
  venue_id: string | null
  end_date: string | null
  venues:
    | { id: string; stripe_account_id: string | null; stripe_account_country: string | null; stripe_payouts_enabled: boolean; revenue_share_status: string }
    | { id: string; stripe_account_id: string | null; stripe_account_country: string | null; stripe_payouts_enabled: boolean; revenue_share_status: string }[]
    | null
}

/**
 * Finds ended events past the disbursement buffer held at ENROLLED venues with a
 * payout-ready connected account, and pays each event's accrued venue share.
 * Idempotent and safe to run repeatedly (disburse_venue_share returns
 * nothing_to_disburse once an event's share is paid). Designed to run right after
 * the organiser disbursement in the same cron tick.
 */
export async function runVenueDisbursements(
  adminClient: AdminClient,
  transferGateway: TransferGateway,
  stripe: Stripe,
  opts?: { venueId?: string }
): Promise<VenueDisbursementSummary> {
  let bufferDays = 3
  try {
    bufferDays = await getPayoutScheduleDays('AU', 'AUD')
  } catch {
    bufferDays = 3
  }
  const cutoffIso = new Date(Date.now() - bufferDays * 24 * 60 * 60 * 1000).toISOString()

  let query = adminClient
    .from('events')
    .select('id, venue_id, end_date, venues!inner(id, stripe_account_id, stripe_account_country, stripe_payouts_enabled, revenue_share_status)')
    .lte('end_date', cutoffIso)
    .eq('venues.revenue_share_status', 'enrolled')
    .eq('venues.stripe_payouts_enabled', true)
    .not('venues.stripe_account_id', 'is', null)
    .limit(500)
  if (opts?.venueId) {
    query = query.eq('venue_id', opts.venueId)
  }
  const { data: events, error } = await query
  if (error) {
    captureException(error, { scope: 'payments-venue-transfer', handler: 'find-disbursable-venue-events' })
    throw error
  }

  const summary: VenueDisbursementSummary = { considered: 0, transferred: 0, skipped: 0, failed: 0, results: [] }

  for (const ev of (events ?? []) as EligibleVenueEventRow[]) {
    summary.considered++
    const venueEmbed = Array.isArray(ev.venues) ? ev.venues[0] : ev.venues
    const venueId = venueEmbed?.id ?? ev.venue_id ?? ''
    const destinationAccountId = venueEmbed?.stripe_account_id ?? null
    const currency = getCurrencyForCountry(venueEmbed?.stripe_account_country ?? null) ?? 'AUD'
    if (!destinationAccountId || !venueId) {
      summary.skipped++
      summary.results.push({ eventId: ev.id, venueId, status: 'skipped', error: 'no_connected_account' })
      continue
    }
    try {
      const res = await createVenueTransfer(adminClient, transferGateway, stripe, {
        venueId,
        eventId: ev.id,
        currency,
        destinationAccountId,
        amountCents: null,
      })
      if (res.success) {
        summary.transferred++
        summary.results.push({ eventId: ev.id, venueId, status: 'transferred', amountCents: res.amountCents })
      } else if (res.error === 'nothing_to_disburse') {
        summary.skipped++
        summary.results.push({ eventId: ev.id, venueId, status: 'skipped', error: res.error })
      } else {
        summary.failed++
        summary.results.push({ eventId: ev.id, venueId, status: 'failed', error: res.error })
      }
    } catch (err) {
      summary.failed++
      summary.results.push({
        eventId: ev.id,
        venueId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'unexpected_error',
      })
    }
  }

  return summary
}
