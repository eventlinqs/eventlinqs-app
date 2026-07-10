import 'server-only'
import { sendEmail } from '@/lib/email/send'
import { logAi } from './logging'
import type { ChatMessage } from './sanitise'

/**
 * Human handoff via the existing Resend path. When an assistant raises the
 * handoff flag, the route calls this to deliver the conversation to the
 * support inbox so a person can pick it up. The transcript goes in the
 * email (that is the point of a support ticket); it is still never logged.
 */

function getSupportInbox(): string {
  return process.env.SUPPORT_INBOX_EMAIL || 'hello@eventlinqs.com'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendHandoffEmail(opts: {
  assistant: string
  transcript: ChatMessage[]
  /** Reply-to address for the user, when known (signed in or user-provided). */
  userEmail: string | null
  who: string
}): Promise<boolean> {
  const { assistant, transcript, userEmail, who } = opts

  const rows = transcript
    .map(
      m =>
        `<tr><td style="padding:6px 10px;vertical-align:top;font-weight:600;color:#0A1628;">${
          m.role === 'user' ? 'User' : 'Assistant'
        }</td><td style="padding:6px 10px;color:#1f2937;">${escapeHtml(m.content)}</td></tr>`
    )
    .join('')

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;">
    <h2 style="color:#0A1628;">Assistant handoff: a user needs human support</h2>
    <p><strong>Assistant:</strong> ${escapeHtml(assistant)}<br/>
       <strong>User email:</strong> ${userEmail ? escapeHtml(userEmail) : 'not provided (guest)'}<br/>
       <strong>Reference:</strong> ${escapeHtml(who)}</p>
    <table style="border-collapse:collapse;border:1px solid #e5e7eb;width:100%;">${rows}</table>
    <p style="color:#6b7280;font-size:12px;">Sent automatically by the EventLinqs support assistant when it judged the conversation needs a person.</p>
  </div>`

  const text = transcript
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  try {
    const { id } = await sendEmail({
      to: getSupportInbox(),
      subject: `Support handoff from the ${assistant} assistant`,
      html,
      text: `Assistant: ${assistant}\nUser email: ${userEmail ?? 'not provided'}\nReference: ${who}\n\n${text}`,
    })
    // The Resend id lets delivery be verified against the Resend API.
    logAi({ evt: 'ai.handoff', assistant, who, ok: true, resendId: id })
    return true
  } catch (err) {
    logAi({
      evt: 'ai.handoff',
      assistant,
      who,
      ok: false,
      errorType: err instanceof Error ? err.constructor.name : 'Unknown',
      // The delivery-provider error message is operational (a Resend
      // validation string), never user content, so it is safe to log and
      // it makes a failed handoff diagnosable.
      errorDetail: err instanceof Error ? err.message.slice(0, 200) : undefined,
    })
    return false
  }
}
