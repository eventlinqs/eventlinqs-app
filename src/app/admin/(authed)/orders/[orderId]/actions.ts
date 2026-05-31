'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCapability } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestTicketRefund, RefundNotAuthorisedError } from '@/lib/payments/refund-service'
import { recordAuditEvent } from '@/lib/admin/audit'

const SubmitRefundSchema = z.object({
  orderId: z.string().uuid(),
  ticketIds: z.array(z.string().uuid()).min(1),
  reason: z.enum(['requested_by_buyer', 'duplicate', 'fraudulent', 'event_cancelled', 'cannot_attend', 'other']),
  buyerMessage: z.string().max(1000).optional().nullable(),
})

export type SubmitAdminRefundResult =
  | { ok: true; refundId: string; amountCents: number; currency: string }
  | { ok: false; error: string }

/**
 * Admin-initiated refund. Authorised by the admin.refunds.process capability
 * AND, inside the service, by resolveRefundScope + the create_refund_request
 * RPC (defence in depth). Audited with who/amount/reason/tickets.
 */
export async function submitAdminRefund(input: {
  orderId: string
  ticketIds: string[]
  reason: string
  buyerMessage?: string | null
}): Promise<SubmitAdminRefundResult> {
  const session = await requireAdminSession()
  assertCapability(session.admin.role, 'admin.refunds.process')

  const parsed = SubmitRefundSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid refund request.' }

  const admin = createAdminClient()
  try {
    const res = await requestTicketRefund(admin, {
      orderId: parsed.data.orderId,
      ticketIds: parsed.data.ticketIds,
      reason: parsed.data.reason,
      initiator: 'admin',
      actorId: session.userId,
      buyerMessage: parsed.data.buyerMessage ?? null,
    })

    await recordAuditEvent({
      action: 'admin.refund.request',
      targetType: 'refund',
      targetId: res.refundId,
      metadata: {
        order_id: parsed.data.orderId,
        amount_cents: res.amountCents,
        reason: parsed.data.reason,
        ticket_ids: parsed.data.ticketIds,
      },
      session,
    })

    revalidatePath(`/admin/orders/${parsed.data.orderId}`)
    return { ok: true, refundId: res.refundId, amountCents: res.amountCents, currency: res.currency }
  } catch (err) {
    if (err instanceof RefundNotAuthorisedError) {
      return { ok: false, error: 'You are not authorised to refund this order.' }
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Refund could not be processed.' }
  }
}
