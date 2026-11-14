/**
 * The Founding Organiser invitation, sent from the admin network screen to an organiser on a city waitlist. Pure, so
 * the letter test renders it with fixture data (tests/unit/email/every-letter-greets.test.ts). Moved out of the admin
 * server action file on 31 October 2026 (gap 3: every letter greets and signs off); on the way the waitlister's name
 * and the city are escaped in the html.
 *
 * LAW 24 as ruled (26 September 2026): the offer is rendered from the one module that holds it, and nothing here says
 * the recipient needs this email to receive it. "Founding Organisers also get their first event set up with the
 * founder" was removed: it cannot hold for every organiser.
 *
 * LAW 24 IS RETIRED (Lawal, 15 November 2026): the letter promises no fee-free months. It says what the organiser
 * gets, in the same words as the invite landing (src/app/join/[code]/page.tsx).
 */
import { escapeHtml } from '@/lib/email/escape'
import { greetingHtml, greetingLine, signOffHtml, SIGN_OFF, SIGNATURE } from '@/lib/email/letter'
import { FOUNDING_OFFER_SCOPE } from '@/lib/payments/founding-waiver'

const WHAT_YOU_GET = 'Create your organiser account, publish your event and sell straight away: your sales are paid to you after your event, and free events cost nothing to run.'
const THE_KIT = 'Every event gets the full launch kit: a live page, a QR poster, share cards and live reach.'

export function renderFoundingInvitationEmail(input: {
  fullName: string
  cityName: string
  inviteUrl: string
  unsubscribeUrl: string
}): { subject: string; html: string; text: string } {
  const { fullName, cityName, inviteUrl, unsubscribeUrl } = input
  const city = escapeHtml(cityName)
  return {
    subject: `EventLinqs is open in ${cityName}`,
    text: [
      greetingLine(fullName),
      '',
      `EventLinqs is open in ${cityName}, and everywhere else in ${FOUNDING_OFFER_SCOPE}.`,
      '',
      WHAT_YOU_GET,
      '',
      THE_KIT,
      '',
      `Create your organiser account: ${inviteUrl}`,
      '',
      SIGN_OFF,
      SIGNATURE,
      '',
      `You are receiving this because you joined the ${cityName} waitlist as an organiser. Leave the waitlist any time: ${unsubscribeUrl}`,
    ].join('\n'),
    html: `${greetingHtml(fullName)}<p><strong>EventLinqs is open in ${city}</strong>, and everywhere else in ${FOUNDING_OFFER_SCOPE}.</p><p>${WHAT_YOU_GET}</p><p>${THE_KIT}</p><p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#D4A017;color:#0A1628;padding:11px 22px;border-radius:999px;font-weight:bold;text-decoration:none;">Create your organiser account</a></p>${signOffHtml()}<p style="font-size:12px;color:#888;">You are receiving this because you joined the ${city} waitlist as an organiser. <a href="${escapeHtml(unsubscribeUrl)}">Leave the waitlist</a> any time.</p>`,
  }
}
