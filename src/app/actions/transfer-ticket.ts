'use server'

import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'

export type TransferResult = { ok: true } | { error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}

/**
 * Transfers a ticket to a new holder by email. Identity is the signed-in user
 * (cookie session); the transfer_ticket RPC enforces authorisation (the caller
 * owns the order or is the current holder), refuses a non-valid ticket, rotates
 * the secret so the old QR dies, reassigns the holder, and logs the transfer.
 * Consent is not inherited. On success the new holder is emailed the fresh
 * bearer link (best-effort; the transfer is already committed).
 */
export async function transferTicket(ticketId: string, toEmail: string, toName: string): Promise<TransferResult> {
  const email = toEmail.trim().toLowerCase()
  const name = toName.trim()
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address for the new holder.' }
  if (!name) return { error: 'Enter the new holder name.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in to transfer a ticket.' }

  const { data, error } = await supabase.rpc('transfer_ticket', {
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
