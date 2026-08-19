'use server'

import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { settleUnfulfilledOrder } from '@/lib/admin/unfulfilled-orders'

const Input = z.object({ orderId: z.string().uuid() })

export type SettleActionResult = { ok: true; message: string } | { ok: false; error: string }

/**
 * Refund a buyer who was charged and never got a ticket, and close the order.
 *
 * Same authorisation as every other refund action: an admin session plus the
 * `admin.refunds.process` capability, and it is audit-logged either way. The audit
 * entry is written on FAILURE as well as success, because "an admin tried to refund
 * this and it did not work" is exactly the trail somebody needs when a buyer rings up
 * still out of pocket.
 */
export async function settleUnfulfilled(input: { orderId: string }): Promise<SettleActionResult> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const session = await requireAdminSession()
  assertCan(session, 'admin.refunds.process')

  const result = await settleUnfulfilledOrder(parsed.data.orderId, session.userId)

  await recordAuditEvent({
    action: result.ok ? 'admin.order.unfulfilled.settled' : 'admin.order.unfulfilled.settle_failed',
    session,
    targetType: 'order',
    targetId: parsed.data.orderId,
    metadata: result.ok
      ? { refund_id: result.refundId, amount_cents: result.amountCents }
      : { error: result.error },
  })

  if (!result.ok) return { ok: false, error: result.error }

  /*
   * NO revalidatePath HERE, AND IT IS NOT AN OVERSIGHT.
   *
   * It was written with one, and the drill caught what that costs. The listing
   * page is `dynamic = 'force-dynamic'` with `revalidate = 0`, so there is no
   * cache entry for a revalidate to invalidate: it buys the operator nothing. What
   * it DOES do is make Next re-render the route as part of this action's response.
   * The settled order is no longer outstanding, so its row goes, the button that
   * is holding the confirmation message unmounts with it, and the operator is left
   * looking at a page that emptied itself the instant they pressed a money button.
   *
   * Refreshing is the operator's decision, taken from the confirmation, through
   * the control the button renders once it has something to report.
   */
  return {
    ok: true,
    message: `Refunded ${(result.amountCents / 100).toFixed(2)} to the buyer and closed the order.`,
  }
}
