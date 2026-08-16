import 'server-only'
import { sendEmail } from '@/lib/email/send'

/**
 * "Send this kit to myself": the optional email on the reveal.
 *
 * Founder ruling 0.2c, 9 August 2026: offered, never required. It is how the
 * kit becomes an email for the people who want one, without becoming a wall
 * for the people who do not.
 *
 * TWO THINGS THIS FILE IS CAREFUL ABOUT, because it is an unauthenticated
 * surface that sends real mail from a verified domain:
 *
 *   1. NOTHING THE VISITOR TYPED IS TRUSTED IN THE MARKUP. The only variable
 *      that reaches the body is the event title, and it is escaped. There is
 *      no free-text field, no note-to-recipient, and no way to address anyone
 *      but the single recipient given.
 *   2. THE LINK IS OURS, ALWAYS. The URL is composed here from the site origin
 *      and a validated code, never taken from the request, so this cannot be
 *      turned into a redirector that mails somebody else's destination under
 *      our domain.
 */

/** Conservative and deliberately not a full RFC 5322 parser. */
export function isPlausibleEmail(value: string): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length < 6 || trimmed.length > 254) return false
  if (/\s/.test(trimmed)) return false
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(trimmed)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildKitEmail(input: { title: string; url: string }): {
  subject: string
  html: string
  text: string
} {
  const title = escapeHtml(input.title)
  const url = escapeHtml(input.url)

  // Plain, short, and about THEIR event rather than about us. A promoter who
  // opens this should see their own night, not a product announcement.
  const subject = `Your kit for ${input.title}`

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background:#ffffff;border:1px solid #e4e6ea;border-radius:14px;padding:28px;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a6d1f;font-weight:700;">Your launch kit</p>
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0A1628;">${title}</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#414a56;">
        Everything you built is on this link: your event page, your poster, your cards and your captions. It keeps working for thirty days.
      </p>
      <a href="${url}" style="display:inline-block;background:#0A1628;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:999px;font-size:15px;font-weight:600;">Open your kit</a>
      <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#6b7480;word-break:break-all;">${url}</p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#8b929c;">You asked us to send this to you. We have not added you to anything.</p>
  </div>
</body>
</html>`

  const text = [
    `Your launch kit: ${input.title}`,
    '',
    'Everything you built is on this link: your event page, your poster, your cards and your captions. It keeps working for thirty days.',
    '',
    input.url,
    '',
    'You asked us to send this to you. We have not added you to anything.',
  ].join('\n')

  return { subject, html, text }
}

export async function sendKitEmail(input: {
  to: string
  title: string
  url: string
}): Promise<void> {
  const { subject, html, text } = buildKitEmail({ title: input.title, url: input.url })
  await sendEmail({ to: input.to.trim(), subject, html, text })
}
