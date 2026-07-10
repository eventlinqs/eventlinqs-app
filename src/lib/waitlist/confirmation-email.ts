import type { WaitlistRole } from './city-waitlist'

/**
 * The city waitlist confirmation email.
 *
 * Sent once on joining (Spam Act: this is the transactional confirmation of
 * the signup itself, carrying the promise wording and the one-click
 * unsubscribe link, which otherwise would never reach the subscriber). Navy
 * and gold, table-based HTML for broad client support, with a hand-tuned
 * plain-text part for deliverability. Australian English; no competitor
 * named; no exclamation marks.
 */
export function buildWaitlistConfirmationEmail(input: {
  cityName: string
  fullName: string
  role: WaitlistRole
  foundingCandidate: boolean
  unsubscribeUrl: string
  marketingOptIn: boolean
}): { subject: string; html: string; text: string } {
  const { cityName, fullName, role, foundingCandidate, unsubscribeUrl, marketingOptIn } = input
  const firstName = fullName.split(' ')[0] || fullName

  const subject = `You are on the ${cityName} waitlist`

  const foundingLine =
    foundingCandidate && role === 'organiser'
      ? `You are registered as a founding candidate. Founding Organiser invitations are limited to the first 50 organisers across Geelong and Melbourne: 6 months fee-free, plus 3 more months for every organiser you refer. Invitations go out personally.`
      : role === 'organiser'
        ? `You registered as an organiser, so when ${cityName} opens you will be first in line for onboarding. Until then the platform already works Australia-wide: you can build your event, map your room, and get your complete promo kit today, free.`
        : `We will email you the moment ${cityName} opens. One email, no noise.`

  const optInLine = marketingOptIn
    ? 'You also ticked the box for occasional EventLinqs updates: new cities, new tools, and organiser offers.'
    : 'You will receive the city-opening notification and nothing else.'

  const text = [
    `Hi ${firstName},`,
    '',
    `You are on the ${cityName} waitlist.`,
    '',
    foundingLine,
    '',
    optInLine,
    '',
    `Leave the waitlist any time with one click: ${unsubscribeUrl}`,
    '',
    'EventLinqs',
    'The ticketing platform built for every community.',
  ].join('\n')

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F4;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E5E5E0;">
      <tr>
        <td style="background:#0A1628;padding:20px 28px;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;letter-spacing:2px;color:#FFFFFF;">EVENTLINQS</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#8A6D1E;margin:0 0 10px;">The waitlist</p>
          <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.2;color:#0A1628;margin:0 0 14px;">You are on the ${cityName} waitlist.</h1>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#333333;margin:0 0 14px;">Hi ${firstName},</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#333333;margin:0 0 14px;">${foundingLine}</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#666666;margin:0 0 20px;">${optInLine}</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background:#D4A017;border-radius:999px;">
              <a href="https://eventlinqs.com/events" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0A1628;text-decoration:none;">Browse events across Australia</a>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 24px;border-top:1px solid #EFEFEA;">
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#888888;margin:0;">
            EventLinqs, the ticketing platform built for every community.<br/>
            Change your mind? <a href="${unsubscribeUrl}" style="color:#8A6D1E;">Leave the waitlist</a> with one click.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`

  return { subject, html, text }
}
