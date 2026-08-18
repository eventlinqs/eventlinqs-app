import type { SupabaseClient } from '@supabase/supabase-js'
import { refundOrder, type RefundReason, type RefundInitiator } from './refund'
import { resolveRefundScope } from './refund-scope'

/**
 * Phase A of the refund operator path: authorise, create the atomic refund
 * intent (create_refund_request RPC, which locks the order FOR UPDATE), then
 * fire the existing Stripe refund core under a per-refund-row idempotency key.
 *
 * No ledger, ticket, inventory, or hold change happens here. Those land in
 * Phase B (reconcile_refund, called by the Stripe webhook), the sole money
 * source of truth. On a Stripe failure the refund row is marked `failed`
 * (the DB trigger frees the claimed tickets) and the error is rethrown.
 */

export interface RequestTicketRefundInput {
  orderId: string
  ticketIds: string[]
  reason: RefundReason
  initiator: RefundInitiator
  actorId: string
  buyerMessage?: string | null
}

export interface RequestTicketRefundResult {
  refundId: string
  amountCents: number
  currency: string
  stripeRefundId: string
  status: 'processing'
}

export class RefundNotAuthorisedError extends Error {
  constructor(reason: string) {
    super(`refund not authorised: ${reason}`)
    this.name = 'RefundNotAuthorisedError'
  }
}

export class RefundRequestError extends Error {
  /**
   * The Postgres SQLSTATE the RPC raised with, preserved so callers classify on a
   * CODE rather than on prose. The refund RPCs raise with explicit ERRCODEs
   * (check_violation, no_data_found, insufficient_privilege), and throwing that
   * information away forced the only available fallback, which was matching the
   * message text. Same lesson as the GoTrue classification: read the code.
   *
   * It is not sufficient on its own: several distinct refusals in
   * create_refund_request share ERRCODE check_violation, so the message still has
   * to separate them. The difference is that those messages are OURS, written in
   * our own migration and stable under our control, not a third party's prose.
   */
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'RefundRequestError'
    this.code = code
  }
}

interface CreateRefundRequestRow {
  refund_id: string
  amount_cents: number
  currency: string
  payment_intent_id: string
}

export async function requestTicketRefund(
  admin: SupabaseClient,
  input: RequestTicketRefundInput,
): Promise<RequestTicketRefundResult> {
  const scope = await resolveRefundScope(admin, input.orderId, input.actorId)
  if (!scope.allowed) throw new RefundNotAuthorisedError(scope.reason)

  const { data, error } = await admin.rpc('create_refund_request', {
    p_order_id: input.orderId,
    p_ticket_ids: input.ticketIds,
    p_reason: input.reason,
    p_initiator: input.initiator,
    p_actor_id: input.actorId,
    p_buyer_message: input.buyerMessage ?? null,
  })
  if (error) throw new RefundRequestError(error.message, error.code)

  const row = (Array.isArray(data) ? data[0] : data) as CreateRefundRequestRow | undefined
  if (!row) throw new RefundRequestError('create_refund_request returned no row')

  const { refund_id, amount_cents, currency, payment_intent_id } = row

  try {
    const res = await refundOrder({
      orderId: input.orderId,
      paymentIntentId: payment_intent_id,
      amountCents: amount_cents,
      reason: input.reason,
      initiatedBy: input.initiator,
      idempotencyKey: `refund:${refund_id}`,
      metadata: { refund_id },
    })

    await admin
      .from('refunds')
      .update({ stripe_refund_id: res.stripeRefundId, processed_by: input.actorId })
      .eq('id', refund_id)

    return {
      refundId: refund_id,
      amountCents: amount_cents,
      currency,
      stripeRefundId: res.stripeRefundId,
      status: 'processing',
    }
  } catch (err) {
    await admin
      .from('refunds')
      .update({
        status: 'failed',
        failure_reason: err instanceof Error ? err.message : 'stripe_error',
      })
      .eq('id', refund_id)
    throw err
  }
}
