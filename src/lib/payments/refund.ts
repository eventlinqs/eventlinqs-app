import Stripe from 'stripe'
import { captureException } from '@/lib/observability/sentry'

/**
 * M6 Phase 3 refund core. Pure Stripe-side refund with reverse_transfer and
 * proportional application-fee refund. No DB writes, no four-source
 * cost-allocation: those land in Phase 4-5 when the allocator + ledger
 * extension ship.
 *
 * The function is intentionally narrow: callers (organiser dashboard refund
 * action, admin refund tool, charge.refunded webhook) handle persistence
 * and ledger writes. Phase 3 only exposes the Stripe call so the surface
 * is testable and the live mode cutover is risk-bounded.
 */

const STRIPE_API_VERSION = '2026-03-25.dahlia' as const

let cachedClient: Stripe | null = null

function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  cachedClient = new Stripe(key, { apiVersion: STRIPE_API_VERSION })
  return cachedClient
}

/**
 * Test-only seam: lets unit tests inject a stub Stripe client without
 * stubbing the env var. Production callers never use this.
 */
export function __setStripeClientForTests(client: Stripe | null): void {
  cachedClient = client
}

// Mirrors the public.refund_reason DB enum exactly so the full reason set is
// usable end to end (UI dropdown -> service -> Stripe metadata).
export type RefundReason =
  | 'requested_by_buyer'
  | 'duplicate'
  | 'fraudulent'
  | 'event_cancelled'
  | 'cannot_attend'
  | 'other'

export type RefundInitiator = 'buyer' | 'organiser' | 'admin' | 'system'

export interface RefundOrderInput {
  orderId: string
  paymentIntentId: string
  amountCents: number
  reason: RefundReason
  initiatedBy: RefundInitiator
  /**
   * Explicit Stripe idempotency key. When the caller owns a persistent refund
   * row, pass `refund:{refundId}` so each refund row is uniquely keyed and a
   * retry of the same row reuses the key. Falls back to the legacy
   * `refund:{orderId}:{amount}:{initiator}` key when omitted.
   */
  idempotencyKey?: string
  metadata?: Record<string, string>
}

export interface RefundResult {
  stripeRefundId: string
  status: Stripe.Refund['status']
  amountCents: number
  currency: string
}

/**
 * Maps the platform's refund reason to the Stripe API's narrower vocabulary.
 * `event_cancelled` falls back to `requested_by_customer` because Stripe has
 * no native equivalent; the platform reason is preserved in metadata.
 */
function mapStripeReason(reason: RefundReason): Stripe.RefundCreateParams.Reason | undefined {
  switch (reason) {
    case 'duplicate':
      return 'duplicate'
    case 'fraudulent':
      return 'fraudulent'
    case 'requested_by_buyer':
    case 'event_cancelled':
    case 'cannot_attend':
    case 'other':
      return 'requested_by_customer'
  }
}

/**
 * Refunds the buyer from the PLATFORM balance (funds-holding model). The buyer
 * charge is a platform charge (separate charges and transfers) with no
 * `transfer_data`, so `reverse_transfer` / `refund_application_fee` are NOT
 * passed here - they are only valid on a destination charge and would error.
 *
 * - Pre-disbursement (the common case): the organiser was never paid, so the
 *   ledger reconcile (reconcile_refund) simply reduces the held liability; no
 *   transfer clawback is needed.
 * - Post-disbursement: the organiser's share is clawed back by reversing the
 *   disbursement transfer (reverseOrganiserTransferForRefund), done in the
 *   webhook AFTER reconcile so the event balance never looks disbursable.
 *
 * `metadata` preserves the order id, initiator, and reason for Stripe Dashboard
 * traceability. Idempotency key defaults to
 * `refund:${orderId}:${amountCents}:${initiatedBy}`; callers with a persistent
 * refund row pass `refund:${refundId}`.
 */
export async function refundOrder(input: RefundOrderInput): Promise<RefundResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(`refundOrder amountCents must be a positive integer (got ${input.amountCents})`)
  }
  if (!input.paymentIntentId) {
    throw new Error('refundOrder paymentIntentId is required')
  }

  const stripe = getStripeClient()
  const idempotencyKey =
    input.idempotencyKey ?? `refund:${input.orderId}:${input.amountCents}:${input.initiatedBy}`

  let refund: Stripe.Refund
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountCents,
        reason: mapStripeReason(input.reason),
        metadata: {
          order_id: input.orderId,
          initiated_by: input.initiatedBy,
          platform_reason: input.reason,
          ...(input.metadata ?? {}),
        },
      },
      { idempotencyKey }
    )
  } catch (err) {
    // P3-1: a Stripe-side refund failure is money-movement-critical. Capture
    // with context before rethrowing so the caller still handles it and
    // Sentry also sees it. The PII scrub redacts ids; we keep them for
    // correlation (refund failures are operator-actioned).
    captureException(err, {
      scope: 'payments-refund',
      order_id: input.orderId,
      payment_intent_id: input.paymentIntentId,
      amount_cents: input.amountCents,
      initiated_by: input.initiatedBy,
      reason: input.reason,
    })
    throw err
  }

  return {
    stripeRefundId: refund.id,
    status: refund.status,
    amountCents: refund.amount,
    currency: refund.currency.toUpperCase(),
  }
}
