import Stripe from 'stripe'

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

export type RefundReason = 'requested_by_buyer' | 'duplicate' | 'fraudulent' | 'event_cancelled'

export type RefundInitiator = 'buyer' | 'organiser' | 'admin' | 'system'

export interface RefundOrderInput {
  orderId: string
  paymentIntentId: string
  amountCents: number
  reason: RefundReason
  initiatedBy: RefundInitiator
  metadata?: Record<string, string>
}

export interface RefundResult {
  stripeRefundId: string
  status: Stripe.Refund['status']
  amountCents: number
  currency: string
  reverseTransfer: true
  refundedApplicationFee: true
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
      return 'requested_by_customer'
  }
}

/**
 * Issues a Stripe refund against the destination charge identified by the
 * order's `payment_intent`.
 *
 * - `reverse_transfer: true` pulls the organiser's share back from the
 *   connected account.
 * - `refund_application_fee: true` refunds the platform fee proportionally
 *   to the refund amount, so partial refunds return a proportional fee.
 * - `metadata` preserves the platform's order id, initiator, and reason for
 *   traceability inside the Stripe Dashboard.
 *
 * Idempotency key is `refund:${orderId}:${amountCents}:${initiatedBy}` for
 * Phase 3. A persistent refund row with a stronger key is a Phase 4 follow-up
 * once the refunds table extension lands.
 */
export async function refundOrder(input: RefundOrderInput): Promise<RefundResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(`refundOrder amountCents must be a positive integer (got ${input.amountCents})`)
  }
  if (!input.paymentIntentId) {
    throw new Error('refundOrder paymentIntentId is required')
  }

  const stripe = getStripeClient()
  const idempotencyKey = `refund:${input.orderId}:${input.amountCents}:${input.initiatedBy}`

  const refund = await stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
      reason: mapStripeReason(input.reason),
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: {
        order_id: input.orderId,
        initiated_by: input.initiatedBy,
        platform_reason: input.reason,
        ...(input.metadata ?? {}),
      },
    },
    { idempotencyKey }
  )

  return {
    stripeRefundId: refund.id,
    status: refund.status,
    amountCents: refund.amount,
    currency: refund.currency.toUpperCase(),
    reverseTransfer: true,
    refundedApplicationFee: true,
  }
}
