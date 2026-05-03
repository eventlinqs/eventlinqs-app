import type { SupabaseClient } from '@supabase/supabase-js'
import { refundOrder, type RefundReason } from '@/lib/payments/refund'

/**
 * M6 Phase 5 - Stripe refund execution + persistence.
 *
 * Wraps the Phase 3 stateless `refundOrder` core in the lifecycle a
 * persisted refund row needs:
 *   1. Mark the refunds row 'processing' (optimistic write so a crash mid-call
 *      leaves a recoverable state).
 *   2. Resolve the order's payment_intent from the payments table.
 *   3. Call Stripe with reverse_transfer + refund_application_fee.
 *   4. Mark the refunds row 'completed' with stripe ids and processed_at,
 *      OR 'failed' with the failure reason on error.
 *
 * This module is the single bridge from a refunds row to Stripe. The
 * mutations layer (src/lib/refunds/mutations.ts) calls this; webhook
 * handlers reconcile state but do not initiate refunds.
 */

export interface ExecuteStripeRefundParams {
  refundId: string
  processedBy: string | null
}

export interface ExecuteStripeRefundResult {
  status: 'completed' | 'failed' | 'skipped_not_pending' | 'missing_payment_intent'
  stripeRefundId?: string
  failureReason?: string
}

interface RefundLoadShape {
  id: string
  order_id: string
  organisation_id: string
  amount_cents: number
  currency: string
  reason: RefundReason | string
  status: string
  initiator: string
}

interface PaymentLookup {
  gateway_payment_id: string | null
}

export async function executeStripeRefund(
  adminClient: SupabaseClient,
  params: ExecuteStripeRefundParams
): Promise<ExecuteStripeRefundResult> {
  const { data: refund, error: refundErr } = await adminClient
    .from('refunds')
    .select('id, order_id, organisation_id, amount_cents, currency, reason, status, initiator')
    .eq('id', params.refundId)
    .maybeSingle()

  if (refundErr) {
    console.error('[stripe-refunds] load refund failed', { refundId: params.refundId, error: refundErr })
    return { status: 'failed', failureReason: 'load_refund_failed' }
  }
  if (!refund) {
    return { status: 'failed', failureReason: 'refund_not_found' }
  }
  const r = refund as unknown as RefundLoadShape
  if (r.status !== 'pending') {
    return { status: 'skipped_not_pending' }
  }

  // Resolve payment intent
  const { data: paymentRow, error: paymentErr } = await adminClient
    .from('payments')
    .select('gateway_payment_id')
    .eq('order_id', r.order_id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (paymentErr) {
    console.error('[stripe-refunds] payment lookup failed', { refundId: r.id, error: paymentErr })
    await markFailed(adminClient, r.id, 'payment_lookup_failed', params.processedBy)
    return { status: 'failed', failureReason: 'payment_lookup_failed' }
  }

  const payment = paymentRow as PaymentLookup | null
  if (!payment?.gateway_payment_id) {
    await markFailed(adminClient, r.id, 'missing_payment_intent', params.processedBy)
    return { status: 'missing_payment_intent', failureReason: 'missing_payment_intent' }
  }

  // Optimistically transition to processing
  const { error: processingErr } = await adminClient
    .from('refunds')
    .update({ status: 'processing', processed_by: params.processedBy })
    .eq('id', r.id)
    .eq('status', 'pending')
  if (processingErr) {
    console.error('[stripe-refunds] processing transition failed', { refundId: r.id, error: processingErr })
    return { status: 'failed', failureReason: 'transition_failed' }
  }

  const initiatorMap: Record<string, 'buyer' | 'organiser' | 'admin' | 'system'> = {
    buyer: 'buyer',
    organiser: 'organiser',
    admin: 'admin',
    system: 'system',
  }
  const initiator = initiatorMap[r.initiator] ?? 'organiser'

  try {
    const result = await refundOrder({
      orderId: r.order_id,
      paymentIntentId: payment.gateway_payment_id,
      amountCents: r.amount_cents,
      reason: normaliseReason(r.reason),
      initiatedBy: initiator,
      metadata: { refund_row_id: r.id, organisation_id: r.organisation_id },
    })

    await adminClient
      .from('refunds')
      .update({
        status: 'completed',
        stripe_refund_id: result.stripeRefundId,
        processed_at: new Date().toISOString(),
        processed_by: params.processedBy,
      })
      .eq('id', r.id)

    return { status: 'completed', stripeRefundId: result.stripeRefundId }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'stripe_refund_failed'
    console.error('[stripe-refunds] Stripe call failed', { refundId: r.id, reason })
    await markFailed(adminClient, r.id, reason, params.processedBy)
    return { status: 'failed', failureReason: reason }
  }
}

async function markFailed(
  adminClient: SupabaseClient,
  refundId: string,
  reason: string,
  processedBy: string | null
): Promise<void> {
  await adminClient
    .from('refunds')
    .update({
      status: 'failed',
      failure_reason: reason,
      processed_by: processedBy,
      processed_at: new Date().toISOString(),
    })
    .eq('id', refundId)
}

function normaliseReason(raw: string): RefundReason {
  switch (raw) {
    case 'duplicate':
      return 'duplicate'
    case 'fraudulent':
      return 'fraudulent'
    case 'event_cancelled':
      return 'event_cancelled'
    case 'requested_by_buyer':
    case 'cannot_attend':
    case 'other':
    default:
      return 'requested_by_buyer'
  }
}
