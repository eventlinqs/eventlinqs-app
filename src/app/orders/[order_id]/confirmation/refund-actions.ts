'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { verifyOrderAccessToken } from '@/lib/orders/order-access'
import { createRefundRequest } from '@/lib/refunds/request-service'
import { sendRefundRequestedToOrganiser, sendRefundDecisionToBuyer } from '@/lib/refunds/notify'
import { captureException } from '@/lib/observability/sentry'

/**
 * THE BUYER'S REFUND REQUEST, from the order confirmation screen.
 *
 * This is where Eventbrite and Humanitix both put it: Eventbrite on the order in
 * the attendee's Tickets, Humanitix behind the "manage order" button on the
 * confirmation email. The buyer arrives here from both the email and their ticket
 * list, so it is the one surface that serves both routes.
 */

const Schema = z.object({
  orderId: z.string().uuid(),
  ticketIds: z.array(z.string().uuid()).max(50),
  message: z.string().max(1000).optional().nullable(),
})

export type SubmitBuyerRefundResult =
  | { ok: true; status: string; autoApproved: boolean; message: string }
  | { ok: false; message: string }

export async function submitBuyerRefundRequest(input: {
  orderId: string
  ticketIds: string[]
  message?: string | null
  /** The signed link from the confirmation email. A guest has no other identity. */
  accessToken?: string | null
}): Promise<SubmitBuyerRefundResult> {
  const parsed = Schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'That request did not look right. Reload the page and try again.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  /*
   * KEYED BY THE USER, NOT THE ADDRESS, for a signed-in buyer. A household or an
   * office behind one address must not share a refund-request budget: that is the
   * CGNAT bucket this platform has already been bitten by twice (launch-artefact,
   * launch-compose-daily). A guest has no user id, so the address is all there is,
   * and that is stated rather than silently defaulted.
   */
  const limited = await actionRateLimit('refund-request', user?.id)
  if (!limited.ok) {
    return {
      ok: false,
      message: 'You have submitted several refund requests in a short time. Wait a few minutes and try again, or contact the organiser directly.',
    }
  }

  const admin = createAdminClient()

  // OWNERSHIP. A refund request is about somebody's money, so the order must
  // belong to the caller. A guest order is matched on the email it was placed
  // with, which is the only identity a guest has.
  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, guest_email')
    .eq('id', parsed.data.orderId)
    .maybeSingle()
  if (!order) return { ok: false, message: 'We could not find that order.' }

  /*
   * THREE WAYS TO BE THE OWNER, and the third is the one that was missing.
   *
   * A guest has no account, so the first two can never be true for them. Until
   * 29 August the refusal below told a guest to "sign in with the email you
   * used", which is impossible: guest checkout creates no account. The button
   * was offered, the form took a reason, and the press could never succeed.
   *
   * The signed link from their own confirmation email IS their identity. It is
   * scoped to this order and verified in constant time; see
   * src/lib/orders/order-access.ts for why it carries no expiry.
   */
  const viaLink = verifyOrderAccessToken(parsed.data.orderId, input.accessToken ?? null)
  const isOwner =
    viaLink || (user ? order.user_id === user.id || (order.guest_email && order.guest_email === user.email) : false)
  if (!isOwner) {
    return {
      ok: false,
      message:
        'We could not tell that this order is yours. Open the link in your confirmation email, which signs you in to this order, or sign in with the email you bought with.',
    }
  }

  const requesterEmail = (user?.email ?? order.guest_email ?? '').trim()
  if (!requesterEmail) {
    return { ok: false, message: 'This order has no email on it, so we cannot send you an update. Contact the organiser directly.' }
  }

  try {
    const res = await createRefundRequest(admin, {
      orderId: parsed.data.orderId,
      ticketIds: parsed.data.ticketIds,
      requesterId: user?.id ?? null,
      requesterEmail,
      buyerMessage: parsed.data.message ?? null,
    })

    if (!res.ok) return { ok: false, message: res.message }

    /*
     * THE ORGANISER GETS AN EMAIL AND A DASHBOARD ITEM, not one or the other.
     * The dashboard item is the refund_requests row, already written. The email
     * is best-effort and must never fail the request: a buyer whose request was
     * recorded should not be told it failed because a mail server was slow.
     */
    try {
      if (res.status === 'submitted') {
        await sendRefundRequestedToOrganiser(admin, res.requestId)
      } else {
        await sendRefundDecisionToBuyer(admin, res.requestId)
      }
    } catch (mailErr) {
      captureException(mailErr, { scope: 'refund-request-notify', request_id: res.requestId })
    }

    revalidatePath(`/orders/${parsed.data.orderId}/confirmation`)
    return { ok: true, status: res.status, autoApproved: res.autoApproved, message: res.message }
  } catch (err) {
    captureException(err, { scope: 'buyer-refund-request', order_id: parsed.data.orderId })
    return {
      ok: false,
      message: 'We could not submit your request just then. Nothing has changed on your order. Try again in a moment, and contact the organiser if it keeps happening.',
    }
  }
}

/*
 * getRefundPanelState USED TO LIVE HERE AND MUST NOT COME BACK.
 *
 * Every export of a 'use server' module is a callable endpoint. A read that takes
 * an order id and returns that order's refund state had no auth check, so it was
 * reachable by anybody who could guess a uuid. Caught by
 * scripts/security/entrypoint-authz-audit.mjs on the first run after it was
 * written. It now lives in src/lib/refunds/panel-state.ts, which is a plain server
 * module with no endpoint to protect.
 */
