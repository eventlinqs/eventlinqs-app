/**
 * The ticket transfer email: a ticket has been sent to you. Pure, so the letter test renders it with fixture data
 * (tests/unit/email/every-letter-greets.test.ts). Moved out of src/app/actions/transfer-ticket.ts, a server action
 * file that may export only async functions, on 31 October 2026 (gap 3: every letter greets and signs off).
 */
import { escapeHtml } from '@/lib/email/escape'
import { greetingHtml, greetingText, signOffHtml, signOffText } from '@/lib/email/letter'

export function renderTicketTransferEmail(input: { name: string; title: string; link: string; contact: string }): {
  subject: string
  html: string
  text: string
} {
  const { name, title, link, contact } = input
  return {
    subject: `You have been sent a ticket to ${title}`,
    html: `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:#ffffff;border:1px solid #e7e9ee;border-radius:14px;padding:28px">
      ${greetingHtml(name)}
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#0A1628">A ticket to ${escapeHtml(title)} has been transferred to you. Your ticket and QR code are at the link below. The previous code no longer works.</p>
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#0A1628;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">View your ticket</a>
      ${signOffHtml()}
    </div>
    <p style="margin:18px 4px 0;font-size:11px;color:#8b919c">EventLinqs, ${escapeHtml(contact)}</p>
  </div></body></html>`,
    text: `${greetingText(name)}A ticket to ${title} has been transferred to you. View your ticket and QR code: ${link}\nThe previous code no longer works.${signOffText()}\n\nEventLinqs, ${contact}`,
  }
}
