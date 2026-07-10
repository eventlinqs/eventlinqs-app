import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'

/**
 * M6 payout disbursement, application layer. The data model + RPCs live in
 * supabase/migrations/20260531000003_m6_payout_disbursement.sql.
 *
 * ARCHITECTURE (funds-holding model): under separate charges and transfers the
 * organiser is paid by a platform->connected TRANSFER after the event (see
 * event-transfer.ts / disburse_transfer). This module retains the complementary
 * primitives: the connected-account PAYOUT helper (createPayout, connected
 * balance -> organiser bank), the failed-payout/transfer compensation
 * (voidPayoutById), and the matured-reserve release (runReserveRelease).
 * createPayout is no longer the disbursement path; the post-event transfer is.
 *
 * organiser_balance_ledger is the authoritative accounting. disburse_payout
 * atomically claims an available amount (under a row lock, refusing overpay)
 * and writes the negative `payout` ledger entry BEFORE any Stripe call. This
 * module then moves the money and back-fills stripe_payout_id, or compensates
 * via void_payout on failure. The final paid/failed state arrives on the
 * Connect webhook (payout.paid / payout.failed).
 *
 * All four RPCs are service_role only, so every function here takes a
 * service-role (admin) SupabaseClient, mirroring connect-ledger.ts.
 */

const STRIPE_API_VERSION = '2026-03-25.dahlia' as const

let cachedClient: Stripe | null = null

/**
 * Lazily builds and caches the platform Stripe client. The route / webhook
 * layer obtains it here and passes it into createPayout, so the Stripe seam is
 * explicit and unit-testable.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  cachedClient = new Stripe(key, { apiVersion: STRIPE_API_VERSION })
  return cachedClient
}

/**
 * Test-only seam: lets unit tests reset the cached client. Production callers
 * never use this.
 */
export function __setStripeClientForTests(client: Stripe | null): void {
  cachedClient = client
}

type AdminClient = SupabaseClient

export interface CreatePayoutParams {
  organisationId: string
  currency: string
  /**
   * Optional explicit amount in the smallest currency unit. When omitted or
   * null, disburse_payout pays out the full available ledger balance.
   */
  amountCents?: number | null
  /** admin_users.id of the operator initiating this payout. */
  actor?: string | null
  /** Extra Stripe payout metadata, merged into the platform-set keys. */
  metadata?: Record<string, string>
}

// Structured errors returned by the disburse_payout RPC, surfaced unchanged.
export type DisburseError =
  | 'organisation_not_found'
  | 'payouts_not_active'
  | 'nothing_to_disburse'
  | 'exceeds_available'

export type CreatePayoutError =
  | DisburseError
  | 'invalid_input'
  | 'stripe_account_not_set'
  | 'exceeds_stripe_balance'

export interface CreatePayoutSuccess {
  success: true
  payoutId: string
  stripePayoutId: string
  amountCents: number
  availableBeforeCents: number
  availableAfterCents: number
}

export interface CreatePayoutFailure {
  success: false
  error: CreatePayoutError
  /** Optional context echoed from the RPC or validation (available_cents, etc). */
  detail?: Record<string, unknown>
}

export type CreatePayoutResult = CreatePayoutSuccess | CreatePayoutFailure

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
 * Orchestrates one operator-initiated disbursement. Order matters: the ledger
 * claim (disburse_payout) happens BEFORE the Stripe payout, and the Stripe
 * payout uses the claimed payout id as its idempotency key. A failure after
 * the claim compensates the ledger via void_payout so no money is stranded.
 */
export async function createPayout(
  adminClient: AdminClient,
  stripe: Stripe,
  params: CreatePayoutParams
): Promise<CreatePayoutResult> {
  // 1. Validate input.
  const { organisationId, currency } = params
  if (!organisationId || !currency) {
    return { success: false, error: 'invalid_input', detail: { reason: 'organisationId and currency are required' } }
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

  // 2. Read the org's connected account and confirm it is set.
  const { data: orgRow, error: orgError } = await adminClient
    .from('organisations')
    .select('stripe_account_id')
    .eq('id', organisationId)
    .maybeSingle()
  if (orgError) {
    captureException(orgError, {
      scope: 'payments-payout',
      handler: 'org-load',
      organisation_id: organisationId,
    })
    throw orgError
  }
  const stripeAccountId = (orgRow as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null
  if (!stripeAccountId) {
    return { success: false, error: 'stripe_account_not_set' }
  }

  // 3. Read the connected account's REAL Stripe available balance. This is the
  //    hard cap that protects against a refund that reversed a transfer but is
  //    not yet mirrored in the ledger (see migration HARD INVARIANT).
  const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId })
  const stripeAvailableCents = (balance.available ?? [])
    .filter((b) => b.currency === currencyLower)
    .reduce((sum, b) => sum + b.amount, 0)

  // 4. Atomically claim. If the RPC refuses, return the structured error
  //    unchanged with no Stripe call made.
  const { data: claimData, error: claimError } = await adminClient.rpc('disburse_payout', {
    p_organisation_id: organisationId,
    p_currency: currency,
    p_amount_cents: amountProvided ? params.amountCents : null,
    p_actor: params.actor ?? null,
  })
  if (claimError) {
    captureException(claimError, {
      scope: 'payments-payout',
      handler: 'disburse-payout-rpc',
      organisation_id: organisationId,
    })
    throw claimError
  }
  const claim = claimData as DisburseRpcResult
  if (!claim?.success) {
    return {
      success: false,
      error: (claim?.error as CreatePayoutError) ?? 'nothing_to_disburse',
      detail: claim,
    }
  }

  const payoutId = claim.payout_id as string
  const claimedAmount = claim.amount_cents as number

  // 5. The claimed amount (already capped at ledger available by the RPC) must
  //    additionally fit within the real Stripe balance. If not, void the claim
  //    and return: the ledger is compensated and no money moves.
  if (claimedAmount > stripeAvailableCents) {
    await voidClaim(adminClient, payoutId, `exceeds_stripe_balance: claimed ${claimedAmount} > stripe available ${stripeAvailableCents}`)
    return {
      success: false,
      error: 'exceeds_stripe_balance',
      detail: { claimedAmountCents: claimedAmount, stripeAvailableCents },
    }
  }

  // Create the Stripe payout ON the connected account. idempotencyKey = the DB
  // payout id, so a retry of this exact claim never creates a second payout.
  let stripePayout: Stripe.Payout
  try {
    stripePayout = await stripe.payouts.create(
      {
        amount: claimedAmount,
        currency: currencyLower,
        metadata: {
          payout_id: payoutId,
          organisation_id: organisationId,
          source: 'operator_disbursement',
          ...(params.metadata ?? {}),
        },
      },
      { stripeAccount: stripeAccountId, idempotencyKey: payoutId }
    )
  } catch (err) {
    // 7. Stripe-side failure is money-movement-critical: capture with context,
    //    compensate the ledger via void_payout, then rethrow (matching
    //    refund.ts's rethrow convention so the caller still handles it).
    captureException(err, {
      scope: 'payments-payout',
      handler: 'stripe-payouts-create',
      organisation_id: organisationId,
      payout_id: payoutId,
      amount_cents: claimedAmount,
    })
    await voidClaim(adminClient, payoutId, err instanceof Error ? err.message : 'stripe_payout_create_failed')
    throw err
  }

  // 6. On success: back-fill stripe_payout_id and move the row to in_transit.
  //    The final paid/failed state arrives on the Connect webhook.
  const { error: backfillError } = await adminClient
    .from('payouts')
    .update({
      stripe_payout_id: stripePayout.id,
      status: 'in_transit',
      updated_at: new Date().toISOString(),
    })
    .eq('id', payoutId)
  if (backfillError) {
    // The Stripe payout already exists (idempotency key = payout id) so we must
    // NOT void here - the money is moving. Capture loudly; the webhook reconciles
    // the final state and a re-run of this exact claim is idempotent on Stripe.
    captureException(backfillError, {
      scope: 'payments-payout',
      handler: 'stripe-payout-id-backfill',
      organisation_id: organisationId,
      payout_id: payoutId,
      stripe_payout_id: stripePayout.id,
    })
  }

  return {
    success: true,
    payoutId,
    stripePayoutId: stripePayout.id,
    amountCents: claimedAmount,
    availableBeforeCents: (claim.available_before_cents as number) ?? 0,
    availableAfterCents: (claim.available_after_cents as number) ?? 0,
  }
}

/** Internal helper: compensate a claimed-but-unpaid payout. Best-effort; logs on error. */
async function voidClaim(adminClient: AdminClient, payoutId: string, reason: string): Promise<void> {
  const { error } = await adminClient.rpc('void_payout', {
    p_payout_id: payoutId,
    p_status: 'failed',
    p_reason: reason,
  })
  if (error) {
    captureException(error, {
      scope: 'payments-payout',
      handler: 'void-claim',
      payout_id: payoutId,
    })
  }
}

export interface VoidPayoutResult {
  success: boolean
  reversed?: boolean
  already_reversed?: boolean
  error?: string
  payout_id?: string
  amount_cents?: number
  [k: string]: unknown
}

/**
 * Thin wrapper over the void_payout RPC for the failure/cancel path used by the
 * Connect webhook handler and admin tooling. Idempotent via reversed_at:
 * a second call returns `already_reversed`. Returns the RPC result unchanged.
 */
export async function voidPayoutById(
  adminClient: AdminClient,
  payoutId: string,
  status: 'failed' | 'canceled' = 'failed',
  reason: string | null = null
): Promise<VoidPayoutResult> {
  const { data, error } = await adminClient.rpc('void_payout', {
    p_payout_id: payoutId,
    p_status: status,
    p_reason: reason,
  })
  if (error) {
    captureException(error, {
      scope: 'payments-payout',
      handler: 'void-payout',
      payout_id: payoutId,
    })
    throw error
  }
  return data as VoidPayoutResult
}

/**
 * Runs the matured-reserve release. The cron route (CRON_SECRET-gated) invokes
 * this; release_holds() is concurrency-safe and idempotent, so repeated runs
 * are harmless. Returns the number of holds released.
 */
export async function runReserveRelease(adminClient: AdminClient): Promise<number> {
  const { data, error } = await adminClient.rpc('release_holds')
  if (error) {
    captureException(error, { scope: 'payments-payout', handler: 'release-holds' })
    throw error
  }
  return (data as number) ?? 0
}
