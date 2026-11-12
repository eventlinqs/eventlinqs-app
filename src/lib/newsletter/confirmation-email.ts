import { renderNotice } from '@/lib/email/notice'
import { sendEmail } from '@/lib/email/send'
import { CONFIRM_LINK_DAYS } from './confirm-token'

/**
 * THE ONE EMAIL BEFORE A CITY GUIDE BEGINS (Release 2, item 8: double opt in). Sent only in reply to the person's own
 * request on the newsletter panel, to the address they typed, once per request. It carries no marketing at all: no
 * events, no offer, no promotion; only what they asked for, the button that confirms it, and what happens if it was not
 * them. That is the line ACMA draws ("You cannot send an electronic message to ask for consent, because this is a
 * marketing message": acma.gov.au/avoid-sending-spam, last updated 29 November 2024): the consent is the form they
 * filled in; this confirms the address is theirs before the first edition goes.
 * Declared as 'newsletter_confirmation' to the prospect role (src/lib/notifications/recipient-matrix.ts) and classified
 * transactional (src/lib/consent/send-paths.ts).
 */

export function confirmationEmail(input: { readonly cityName: string; readonly url: string }): {
  subject: string
  html: string
  text: string
} {
  const { html, text } = renderNotice({
    name: null,
    title: `Confirm your weekly ${input.cityName} guide`,
    lines: [
      `You asked for ${input.cityName}'s best events weekly on EventLinqs. Press the button to confirm this is your address, and the guide starts with the next edition.`,
      `If you did not ask for this, you need do nothing: without your confirmation, this address gets no guide.`,
    ],
    cta: { label: 'Confirm my weekly guide', url: input.url },
    footnote: `The button works for ${CONFIRM_LINK_DAYS} days.`,
  })
  return { subject: `Confirm your weekly ${input.cityName} guide`, html, text }
}

export async function sendConfirmationEmail(input: { readonly to: string; readonly cityName: string; readonly url: string }): Promise<{ id: string }> {
  const mail = confirmationEmail({ cityName: input.cityName, url: input.url })
  return sendEmail({
    to: input.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    messageType: 'newsletter_confirmation',
    recipientRole: 'prospect',
  })
}
