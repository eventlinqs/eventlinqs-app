'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestTicketRefund, RefundNotAuthorisedError } from '@/lib/payments/refund-service'
import { toOrganiserRefundFailure } from '@/lib/payments/refund-failure'
import { captureException } from '@/lib/observability/sentry'

const SubmitRefundSchema = z.object({
  eventId: z.string().uuid(),
  orderId: z.string().uuid(),
  ticketIds: z.array(z.string().uuid()).min(1),
  reason: z.enum(['requested_by_buyer', 'duplicate', 'fraudulent', 'event_cancelled', 'cannot_attend', 'other']),
  buyerMessage: z.string().max(1000).optional().nullable(),
})

export type SubmitOrganiserRefundResult =
  | { ok: true; refundId: string; amountCents: number; currency: string }
  | { ok: false; error: string }

/**
 * Organiser-initiated refund for an order on one of their own events.
 * Authorisation is enforced by resolveRefundScope (inside requestTicketRefund)
 * and the create_refund_request RPC; an organiser can only refund orders for
 * organisations they own or manage. Audited as an organiser action.
 */
export async function submitOrganiserRefund(input: {
  eventId: string
  orderId: string
  ticketIds: string[]
  reason: string
  buyerMessage?: string | null
}): Promise<SubmitOrganiserRefundResult> {
  const parsed = SubmitRefundSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid refund request.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const admin = createAdminClient()
  try {
    const res = await requestTicketRefund(admin, {
      orderId: parsed.data.orderId,
      ticketIds: parsed.data.ticketIds,
      reason: parsed.data.reason,
      initiator: 'organiser',
      actorId: user.id,
      buyerMessage: parsed.data.buyerMessage ?? null,
    })

    await admin.from('audit_log').insert({
      actor_id: user.id,
      actor_email_snapshot: user.email ?? null,
      actor_role_snapshot: 'organiser',
      action: 'organiser.refund.request',
      target_type: 'refund',
      target_id: res.refundId,
      metadata: {
        order_id: parsed.data.orderId,
        event_id: parsed.data.eventId,
        amount_cents: res.amountCents,
        reason: parsed.data.reason,
        ticket_ids: parsed.data.ticketIds,
      },
    })

    revalidatePath(`/dashboard/events/${parsed.data.eventId}/orders/${parsed.data.orderId}`)
    return { ok: true, refundId: res.refundId, amountCents: res.amountCents, currency: res.currency }
  } catch (err) {
    if (err instanceof RefundNotAuthorisedError) {
      return {
        ok: false,
        error:
          'You are not authorised to refund this order. Ask an owner or a manager of this '
          + 'organisation to refund it, or to give you manager access.',
      }
    }
    /*
     * PLAIN WORDS ONLY (founder ruling 18 August 2026). This used to return
     * `err.message`, which put database and Stripe internals straight into the
     * organiser's refund dialog: "order not refundable in status pending", "no
     * payment intent for order", or a Stripe sentence naming a charge id. The
     * translation lives in one place so the organiser action and the admin action
     * cannot drift apart.
     *
     * The raw error is NOT lost. It is captured for Sentry with the order context
     * below, which is where an engineer looks; the organiser gets the sentence.
     */
    const failure = toOrganiserRefundFailure(err)
    captureException(err, {
      scope: 'organiser-refund',
      reason: failure.reason,
      order_id: parsed.data.orderId,
      event_id: parsed.data.eventId,
      actor_id: user.id,
    })
    return { ok: false, error: failure.message }
  }
}
