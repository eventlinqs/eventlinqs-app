/**
 * Stripe idempotency-key composition for the checkout money path.
 *
 * P2-8: the previous key was a bare `order_id`. A bare order id is a weak
 * idempotency key - it has no amount dimension (a corrected amount would
 * replay the stale intent or hard-error on key reuse) and no attempt
 * dimension (a deliberate fresh attempt for the same order cannot get a
 * fresh intent). This helper composes `(orderId, amountCents, attempt)` so
 * both checkout flows (standard + seat) cannot drift, and so a future
 * persisted attempt counter flows through without another signature change.
 *
 * The composite is also written to `payments.idempotency_key` for
 * traceability between the DB row and the Stripe intent.
 */

export interface PaymentIntentIdempotencyInput {
  orderId: string
  amountCents: number
  /** Defaults to 1. Reserved for a future persisted retry counter. */
  attempt?: number
}

export function buildPaymentIntentIdempotencyKey(
  input: PaymentIntentIdempotencyInput
): string {
  const attempt = input.attempt ?? 1
  if (!input.orderId) {
    throw new Error('buildPaymentIntentIdempotencyKey: orderId is required')
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    throw new Error(
      `buildPaymentIntentIdempotencyKey: amountCents must be a non-negative integer (got ${input.amountCents})`
    )
  }
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error(
      `buildPaymentIntentIdempotencyKey: attempt must be a positive integer (got ${attempt})`
    )
  }
  return `pi:${input.orderId}:${input.amountCents}:a${attempt}`
}
