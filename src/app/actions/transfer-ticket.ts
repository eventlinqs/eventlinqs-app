'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { verifyOrderAccessToken } from '@/lib/orders/order-access'
import { contactAddress } from '@/lib/email/sender'
import { renderTicketTransferEmail } from '@/lib/email/templates/ticket-transfer'

export type TransferResult = { ok: true } | { error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Transfers a ticket to a new holder by email.
 *
 * TWO IDENTITIES, because a guest has none of the first kind.
 *
 *   SIGNED IN: identity is the cookie session and the transfer_ticket RPC
 *   authorises it from auth.uid() (the caller owns the order, or their account
 *   email is the current holder).
 *
 *   GUEST, WITH THE SIGNED LINK: guest checkout creates no account, so
 *   auth.uid() is null and transfer_ticket raises not_authenticated. Journey 5,
 *   28 August 2026: the buyer could see the ticket and could not move it. The
 *   signed order-access link from their own confirmation email IS their
 *   identity, exactly as it is for the refund half. It is verified here, in
 *   constant time and scoped to one order, and only then does the service-role
 *   path call transfer_ticket_for_order, which authorises solely on the ticket
 *   belonging to that order and is unreachable from a browser.
 *
 * Either way the RPC refuses a non-valid ticket, locks the row, rotates the
 * secret so the old QR dies, reassigns the holder and logs the transfer.
 * Consent is not inherited. On success the new holder is emailed the fresh
 * bearer link (best-effort; the transfer is already committed).
 */
export async function transferTicket(
  ticketId: string,
  toEmail: string,
  toName: string,
  /** The guest's proof: the order this ticket sits on, and the link's token. */
  guestAccess?: { orderId: string; accessToken: string | null },
): Promise<TransferResult> {
  const email = toEmail.trim().toLowerCase()
  const name = toName.trim()
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address for the new holder.' }
  if (!name) return { error: 'Enter the new holder name.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const viaLink =
    !!guestAccess && verifyOrderAccessToken(guestAccess.orderId, guestAccess.accessToken)

  if (!user && !viaLink) {
    return {
      error:
        'We could not tell that this ticket is yours. Open the link in your confirmation email, which signs you in to this order, or sign in with the email you bought with.',
    }
  }

  const { data, error } = viaLink && !user
    ? await createAdminClient().rpc('transfer_ticket_for_order', {
        p_ticket_id: ticketId,
        p_order_id: guestAccess!.orderId,
        p_to_email: email,
        p_to_name: name,
      })
    : await supabase.rpc('transfer_ticket', {
        p_ticket_id: ticketId,
        p_to_email: email,
        p_to_name: name,
      })

  if (error) {
    const m = error.message
    const msg = m.includes('not_authorised')
      ? 'You can only transfer your own ticket.'
      : m.includes('not_transferable')
        ? 'This ticket cannot be transferred. It may already be used, refunded, or transferred.'
        : m.includes('not_found')
          ? 'Ticket not found.'
          : m.includes('Could not find the function')
            ? 'Ticket transfer is not available on this deployment yet. Migration 20260829000002 has not been applied.'
            : 'Transfer failed. Try again.'
    return { error: msg }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (row?.ticket_code && row?.new_secret) {
    const base = getSiteUrl().replace(/\/$/, '')
    const link = `${base}/t/${row.ticket_code}?k=${row.new_secret}`
    const title = row.event_title ?? 'your event'
    try {
      await sendEmail({
        to: email,
        ...renderTicketTransferEmail({ name, title, link, contact: contactAddress('hello') }),
        messageType: 'ticket_transfer_received',
        recipientRole: 'ticket_holder',
      })
    } catch {
      // The transfer is committed; a failed notification email is non-fatal.
    }
  }

  return { ok: true }
}
