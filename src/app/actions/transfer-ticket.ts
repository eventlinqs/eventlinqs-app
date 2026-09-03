'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { verifyOrderAccessToken } from '@/lib/orders/order-access'

export type TransferResult = { ok: true } | { error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}

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
        subject: `You have been sent a ticket to ${title}`,
        html: `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:#ffffff;border:1px solid #e7e9ee;border-radius:14px;padding:28px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a7b1f;font-weight:700">Ticket transfer</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#0A1628">Hi ${escapeHtml(name)}, a ticket to ${escapeHtml(title)} has been transferred to you. Your ticket and QR code are at the link below. The previous code no longer works.</p>
      <a href="${escapeAttr(link)}" style="display:inline-block;background:#0A1628;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">View your ticket</a>
    </div>
    <p style="margin:18px 4px 0;font-size:11px;color:#8b919c">EventLinqs, hello@eventlinqs.com</p>
  </div></body></html>`,
        text: `Hi ${name}, a ticket to ${title} has been transferred to you. View your ticket and QR code: ${link}\nThe previous code no longer works.\n\nEventLinqs, hello@eventlinqs.com`,
      })
    } catch {
      // The transfer is committed; a failed notification email is non-fatal.
    }
  }

  return { ok: true }
}
