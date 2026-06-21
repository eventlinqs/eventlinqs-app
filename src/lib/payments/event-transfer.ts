import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'
import { getCurrencyForCountry } from './application-fee'
import { getPayoutScheduleDays } from './pricing-rules'
import type { TransferGateway } from './gateway'

/**
 * Funds-holding disbursement (docs/PAYMENTS-FUNDS-HOLDING.md Stage 4).
 *
 * Funds are HELD in the platform balance from sale until the event ends. The
 * organiser is then paid by a platform->connected Transfer of their event-scoped
 * available ledger balance (net of fee, net of any still-held reserve and any
 * open chargeback hold). disburse_transfer claims the amount atomically (writing
 * the negative `payout` ledger entry BEFORE any Stripe call); this module then
 * moves the money and back-fills stripe_transfer_id, or compensates via
 * void_payout on failure.
 *
 * Option A launch default (design doc 6.2): the transfer draws from the
 * platform's available balance with NO source_transaction. A sourceTransactionId
 * can be passed to opt into Option B per charge.
 */

// Untyped client (like payout.ts) so the new disburse_transfer / void_payout
// RPCs resolve before database.ts is regenerated.
type AdminClient = SupabaseClient

export interface CreateEventTransferParams {
  organisationId: string
  eventId: string
  currency: string
  /** Connected (organiser) account that receives the transfer. */
  destinationAccountId: string
  /** Explicit amount; null/undefined disburses the full event-scoped available. */
  amountCents?: number | null
  actor?: string | null
  /** Option B only: ties the transfer to a specific charge. Null under Option A. */
  sourceTransactionId?: string | null
  metadata?: Record<string, string>
}

export type EventTransferError =
  | 'organisation_not_found'
  | 'payouts_not_active'
  | 'nothing_to_disburse'
  | 'exceeds_available'
  | 'open_chargeback_hold'
  | 'invalid_input'
  | 'exceeds_platform_balance'

export interface CreateEventTransferSuccess {
  success: true
  payoutId: string
  stripeTransferId: string
  amountCents: number
  availableBeforeCents: number
  availableAfterCents: number
}

export interface CreateEventTransferFailure {
  success: false
  error: EventTransferError
  detail?: Record<string, unknown>
}

export type CreateEventTransferResult = CreateEventTransferSuccess | CreateEventTransferFailure

interface DisburseRpcResult {
  success: boolean
  error?: string
  payout_id?: string
  amount_cents?: number
  available_before_cents?: number
  available_after_cents?: number
  [k: string]: unknown
}

/**
 * Disburses one event's held funds to its organiser. Order: ledger claim
 * (disburse_transfer) BEFORE the Stripe transfer; the transfer uses the claimed
 * payout id as its idempotency key. A failure after the claim compensates via
 * void_payout so no funds are stranded. Caps the claim at the platform's real
 * Stripe available balance (Option A draws from platform balance).
 */
export async function createEventTransfer(
  adminClient: AdminClient,
  transferGateway: TransferGateway,
  stripe: Stripe,
  params: CreateEventTransferParams
): Promise<CreateEventTransferResult> {
  const { organisationId, eventId, currency, destinationAccountId } = params
  if (!organisationId || !eventId || !currency || !destinationAccountId) {
    return {
      success: false,
      error: 'invalid_input',
      detail: { reason: 'organisationId, eventId, currency and destinationAccountId are required' },
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

  // The platform balance HOLDS the funds. Read its real available balance so a
  // claim can never exceed what we can actually transfer.
  const balance = await stripe.balance.retrieve()
  const platformAvailableCents = (balance.available ?? [])
    .filter((b) => b.currency === currencyLower)
    .reduce((sum, b) => sum + b.amount, 0)

  // Atomic event-scoped claim. Writes the negative `payout` ledger entry before
  // any Stripe call. Returns the structured error unchanged on refusal.
  const { data: claimData, error: claimError } = await adminClient.rpc('disburse_transfer', {
    p_organisation_id: organisationId,
    p_event_id: eventId,
    p_currency: currency,
    p_amount_cents: amountProvided ? params.amountCents : null,
    p_actor: params.actor ?? null,
  })
  if (claimError) {
    captureException(claimError, {
      scope: 'payments-event-transfer',
      handler: 'disburse-transfer-rpc',
      organisation_id: organisationId,
      event_id: eventId,
    })
    throw claimError
  }
  const claim = claimData as DisburseRpcResult
  if (!claim?.success) {
    return {
      success: false,
      error: (claim?.error as EventTransferError) ?? 'nothing_to_disburse',
      detail: claim,
    }
  }

  const payoutId = claim.payout_id as string
  const claimedAmount = claim.amount_cents as number

  // The claimed amount (already capped at the event ledger available by the RPC)
  // must additionally fit within the platform's real Stripe balance.
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
      transfer_group: `event_${eventId}`,
      ...(params.sourceTransactionId ? { source_transaction: params.sourceTransactionId } : {}),
      idempotency_key: payoutId,
      metadata: {
        payout_id: payoutId,
        organisation_id: organisationId,
        event_id: eventId,
        source: 'event_disbursement',
        ...(params.metadata ?? {}),
      },
    })
  } catch (err) {
    captureException(err, {
      scope: 'payments-event-transfer',
      handler: 'stripe-transfers-create',
      organisation_id: organisationId,
      event_id: eventId,
      payout_id: payoutId,
      amount_cents: claimedAmount,
    })
    await voidClaim(adminClient, payoutId, err instanceof Error ? err.message : 'stripe_transfer_create_failed')
    throw err
  }

  // Success: the platform->connected transfer completed, so the organiser's
  // connected balance now holds the funds (the connected->bank payout then runs
  // on the connected account's own schedule). Mark the row paid + record the id.
  const nowIso = new Date().toISOString()
  const { error: backfillError } = await adminClient
    .from('payouts')
    .update({
      stripe_transfer_id: transfer.transfer_id,
      source_transaction_id: params.sourceTransactionId ?? null,
      status: 'paid',
      arrival_date: nowIso,
      updated_at: nowIso,
    })
    .eq('id', payoutId)
  if (backfillError) {
    // The Stripe transfer already exists (idempotency key = payout id) so we must
    // NOT void here. Capture loudly; transfer.created reconciles and a re-run of
    // this exact claim is idempotent on Stripe.
    captureException(backfillError, {
      scope: 'payments-event-transfer',
      handler: 'transfer-id-backfill',
      organisation_id: organisationId,
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
  const { error } = await adminClient.rpc('void_payout', {
    p_payout_id: payoutId,
    p_status: 'failed',
    p_reason: reason,
  })
  if (error) {
    captureException(error, {
      scope: 'payments-event-transfer',
      handler: 'void-claim',
      payout_id: payoutId,
    })
  }
}

export interface ReverseForRefundParams {
  organisationId: string
  eventId: string
  /** Organiser's share of the refund (refund_amount - proportional fees). */
  shareCents: number
  currency: string
  refundId: string
}

export interface ReverseForRefundResult {
  reversed: boolean
  stripeReversalId?: string
  amountCents?: number
  reason?: 'no_disbursement' | 'zero_share'
}

/**
 * Post-disbursement refund clawback. If the order's event was already disbursed
 * (a paid platform->connected transfer exists), reverse the organiser's
 * proportional share back to the platform balance and record the offsetting
 * +adjustment ledger entry so the event-scoped available nets to zero (organiser
 * square) instead of going negative. MUST be called AFTER reconcile_refund has
 * recorded its -refund_from_balance, so the available is never briefly positive
 * and re-disbursable. Pre-disbursement (the common case) this is a no-op: there
 * is no transfer to reverse and the ledger reduction alone is correct.
 */
export async function reverseOrganiserTransferForRefund(
  adminClient: AdminClient,
  transferGateway: TransferGateway,
  params: ReverseForRefundParams
): Promise<ReverseForRefundResult> {
  if (params.shareCents <= 0) return { reversed: false, reason: 'zero_share' }

  // An event may have been disbursed in multiple transfers (e.g. the non-reserve
  // share, then the reserve after release). Reverse greedily across the event's
  // paid transfers, newest first, until the refunded share is covered.
  const { data: transferRows } = await adminClient
    .from('payouts')
    .select('id, stripe_transfer_id, amount_cents')
    .eq('organisation_id', params.organisationId)
    .eq('event_id', params.eventId)
    .eq('kind', 'transfer')
    .not('stripe_transfer_id', 'is', null)
    .in('status', ['paid', 'in_transit'])
    .order('created_at', { ascending: false })

  const transfers = (transferRows ?? []) as Array<{ id: string; stripe_transfer_id: string; amount_cents: number }>
  if (transfers.length === 0) return { reversed: false, reason: 'no_disbursement' }

  let remaining = params.shareCents
  let totalReversed = 0
  let lastReversalId: string | undefined
  let lastPayoutId: string | undefined
  for (const t of transfers) {
    if (remaining <= 0) break
    const amt = Math.min(remaining, t.amount_cents)
    if (amt <= 0) continue
    const reversal = await transferGateway.reverseTransfer({
      transfer_id: t.stripe_transfer_id,
      amount_cents: amt,
      idempotency_key: `refund_reversal:${params.refundId}:${t.id}`,
      metadata: { refund_id: params.refundId, organisation_id: params.organisationId, event_id: params.eventId },
    })
    totalReversed += amt
    remaining -= amt
    lastReversalId = reversal.reversal_id
    lastPayoutId = t.id
  }
  if (totalReversed <= 0) return { reversed: false, reason: 'no_disbursement' }

  // One +adjustment for the total reversed: offsets reconcile_refund's
  // -refund_from_balance so the event-scoped available nets to zero.
  const { error: ledgerError } = await adminClient.from('organiser_balance_ledger').insert({
    organisation_id: params.organisationId,
    event_id: params.eventId,
    delta_cents: totalReversed,
    currency: params.currency,
    reason: 'adjustment',
    reference_type: 'adjustment',
    reference_id: lastPayoutId,
    metadata: {
      reversal_of_transfer: true,
      refund_id: params.refundId,
      stripe_reversal_id: lastReversalId,
      reversed_cents: totalReversed,
    },
  })
  if (ledgerError) {
    captureException(ledgerError, {
      scope: 'payments-event-transfer',
      handler: 'reversal-adjustment-insert',
      organisation_id: params.organisationId,
      event_id: params.eventId,
      refund_id: params.refundId,
    })
  }

  return { reversed: true, stripeReversalId: lastReversalId, amountCents: totalReversed }
}

export interface EventDisbursementSummary {
  considered: number
  transferred: number
  skipped: number
  failed: number
  results: Array<{
    eventId: string
    organisationId: string
    status: 'transferred' | 'skipped' | 'failed'
    amountCents?: number
    error?: string
  }>
}

interface EligibleEventRow {
  id: string
  organisation_id: string
  end_date: string | null
  organisations:
    | { stripe_account_id: string | null; stripe_account_country: string | null; payout_status: string }
    | { stripe_account_id: string | null; stripe_account_country: string | null; payout_status: string }[]
    | null
}

/**
 * Finds ended events past the disbursement buffer (event_end + buffer business
 * days, approximated in calendar days for the candidate scan) on payout-active
 * orgs, and disburses each event's held funds. Idempotent and safe to run
 * repeatedly (disburse_transfer returns nothing_to_disburse once an event is
 * paid, and reserve releases are picked up on the next run).
 */
export async function runEventDisbursements(
  adminClient: AdminClient,
  transferGateway: TransferGateway,
  stripe: Stripe,
  opts?: { organisationId?: string }
): Promise<EventDisbursementSummary> {
  // Launch buffer = the AU/AUD payout_schedule_days (founder-settable). Falls
  // back to 3 days if the pricing rule is unreachable.
  let bufferDays = 3
  try {
    bufferDays = await getPayoutScheduleDays('AU', 'AUD')
  } catch {
    bufferDays = 3
  }
  const cutoffIso = new Date(Date.now() - bufferDays * 24 * 60 * 60 * 1000).toISOString()

  let query = adminClient
    .from('events')
    .select('id, organisation_id, end_date, organisations!inner(stripe_account_id, stripe_account_country, payout_status)')
    .lte('end_date', cutoffIso)
    .eq('organisations.payout_status', 'active')
    .not('organisations.stripe_account_id', 'is', null)
    .limit(500)
  if (opts?.organisationId) {
    query = query.eq('organisation_id', opts.organisationId)
  }
  const { data: events, error } = await query
  if (error) {
    captureException(error, { scope: 'payments-event-transfer', handler: 'find-disbursable-events' })
    throw error
  }

  const summary: EventDisbursementSummary = { considered: 0, transferred: 0, skipped: 0, failed: 0, results: [] }

  for (const ev of (events ?? []) as EligibleEventRow[]) {
    summary.considered++
    const orgEmbed = Array.isArray(ev.organisations) ? ev.organisations[0] : ev.organisations
    const destinationAccountId = orgEmbed?.stripe_account_id ?? null
    const currency = getCurrencyForCountry(orgEmbed?.stripe_account_country ?? null) ?? 'AUD'
    if (!destinationAccountId) {
      summary.skipped++
      summary.results.push({ eventId: ev.id, organisationId: ev.organisation_id, status: 'skipped', error: 'no_connected_account' })
      continue
    }
    try {
      const res = await createEventTransfer(adminClient, transferGateway, stripe, {
        organisationId: ev.organisation_id,
        eventId: ev.id,
        currency,
        destinationAccountId,
        amountCents: null,
      })
      if (res.success) {
        summary.transferred++
        summary.results.push({ eventId: ev.id, organisationId: ev.organisation_id, status: 'transferred', amountCents: res.amountCents })
      } else if (res.error === 'nothing_to_disburse') {
        summary.skipped++
        summary.results.push({ eventId: ev.id, organisationId: ev.organisation_id, status: 'skipped', error: res.error })
      } else {
        summary.failed++
        summary.results.push({ eventId: ev.id, organisationId: ev.organisation_id, status: 'failed', error: res.error })
      }
    } catch (err) {
      summary.failed++
      summary.results.push({
        eventId: ev.id,
        organisationId: ev.organisation_id,
        status: 'failed',
        error: err instanceof Error ? err.message : 'unexpected_error',
      })
    }
  }

  return summary
}
