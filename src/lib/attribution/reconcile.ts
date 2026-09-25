import 'server-only'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'
import { reversalOwedForOrderState, REVERSAL_REASON } from './reversal'

/**
 * THE RECONCILER. READ ONLY against everything lane A owns.
 *
 * It reads the order state and the refund rows lane A maintains and writes a
 * reversal when an attributed sale is no longer chargeable. It does not edit
 * the Stripe webhook, the refund path, the payment intent or the slot ledger,
 * and it never writes to `orders` or `refunds`.
 *
 * THE BORDER, and why a hook would be cleaner. The honest place for this is the
 * Stripe webhook: `src/app/api/webhooks/stripe/route.ts` already knows the
 * instant a charge is refunded or disputed, and a hook there would write the
 * reversal in the same breath as the fact arriving, with no sweep and no lag.
 * That file is lane A's. The BORDER line naming it is in REVIEW-QUEUE-B.md, and
 * the reconciler is built around it rather than through it.
 *
 * WHAT THE LAG COSTS, stated rather than glossed: between a refund landing and
 * this sweep running, `billable` reads true on an order that has been given
 * back. The window is the sweep interval. It is a reporting lag and not a
 * billing error as long as the sweep runs before an invoice is drawn, which is
 * why the admin reader shows the last sweep time beside the number.
 *
 * A CHARGEBACK is not reachable from order state alone today: a Stripe dispute
 * does not by itself move an order out of `confirmed`. Disputes therefore reach
 * this table by the manual route or by the hook above once it exists, and the
 * reconciler does not pretend to detect them. Saying so is the point: a
 * reconciler that silently covers three of four cases is one somebody trusts
 * for the fourth.
 */

export interface ReconcileResult {
  attributionsRead: number
  reversalsWritten: number
  alreadyRecorded: number
  byReason: Record<string, number>
  ranAt: string
}

/** The one source string this sweep writes, so its rows can always be told apart. */
export const RECONCILER_SOURCE = 'order_state_reconciler'

export async function reconcileReversals(): Promise<ReconcileResult> {
  const admin = createAdminClient()
  const ranAt = new Date().toISOString()
  const result: ReconcileResult = {
    attributionsRead: 0,
    reversalsWritten: 0,
    alreadyRecorded: 0,
    byReason: {},
    ranAt,
  }

  /*
   * EVERY ATTRIBUTED ORDER. Reconciliation reverses the attributions whose
   * orders were refunded, so an order missing from this read keeps a billable
   * attribution against a refunded order: a charge for a sale that came back.
   */
  const attributions = await readEveryRow('the attributed orders', (from, to) =>
    admin
      .from('marketing_attribution')
      .select('order_id')
      .eq('decision', 'attributed')
      .order('order_id', { ascending: true })
      .range(from, to),
  )
  const orderIds = attributions.map(a => a.order_id)
  result.attributionsRead = orderIds.length
  if (orderIds.length === 0) return result

  const orders: { id: string; status: string; total_cents: number }[] = []
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data, error: ordersError } = await admin
      .from('orders')
      .select('id, status, total_cents')
      .in('id', orderIds.slice(i, i + 200))
      // Keyed by id, so at most the 200 asked for.
      .limit(200)
    if (ordersError) throw new Error(`orders read failed: ${ordersError.message}`)
    orders.push(...((data ?? []) as { id: string; status: string; total_cents: number }[]))
  }

  // Refunded amounts, summed from the refund rows lane A writes. Only refunds
  // that actually completed count: a pending one has taken no money back yet.
  const refundedByOrder = new Map<string, number>()
  for (let i = 0; i < orderIds.length; i += 200) {
    // An order can carry more than one completed refund, so the slice bounds
    // the orders and nothing bounds the rows: paged rather than limited.
    const data = await readEveryRow('the completed refunds', (from, to) =>
      admin
        .from('refunds')
        .select('order_id, amount_cents, status')
        .in('order_id', orderIds.slice(i, i + 200))
        .eq('status', 'completed')
        .order('id', { ascending: true })
        .range(from, to),
    )
    for (const row of data) {
      refundedByOrder.set(row.order_id, (refundedByOrder.get(row.order_id) ?? 0) + Number(row.amount_cents))
    }
  }

  for (const order of orders) {
    const owed = reversalOwedForOrderState({
      status: order.status,
      refundedCents: refundedByOrder.get(order.id) ?? 0,
      totalCents: Number(order.total_cents),
    })
    if (!owed) continue

    const { error: writeError } = await admin.from('marketing_attribution_reversal').insert({
      order_id: order.id,
      reason: owed.reason,
      reversed_amount_cents: owed.amountCents,
      source: RECONCILER_SOURCE,
    })
    if (writeError) {
      // 23505: this order already has a reversal from this sweep for this
      // reason. That is the sweep being idempotent, not a failure.
      if (writeError.code === '23505') {
        result.alreadyRecorded += 1
        continue
      }
      captureException(new Error(`reversal write failed for order ${order.id}: ${writeError.message}`))
      continue
    }
    result.reversalsWritten += 1
    result.byReason[owed.reason] = (result.byReason[owed.reason] ?? 0) + 1
  }

  return result
}

/**
 * A reversal an administrator records by hand. Separate from the sweep because
 * it needs an actor, and the database refuses a manual reversal that does not
 * name one.
 */
export async function recordManualReversal(params: {
  orderId: string
  reason: typeof REVERSAL_REASON.DUPLICATE | typeof REVERSAL_REASON.MANUAL | typeof REVERSAL_REASON.CHARGEBACK
  amountCents: number
  actorUserId: string
  source: string
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('marketing_attribution_reversal').insert({
    order_id: params.orderId,
    reason: params.reason,
    reversed_amount_cents: params.amountCents,
    source: params.source,
    actor_user_id: params.actorUserId,
  })
  if (error && error.code !== '23505') {
    throw new Error(`manual reversal failed for order ${params.orderId}: ${error.message}`)
  }
}
