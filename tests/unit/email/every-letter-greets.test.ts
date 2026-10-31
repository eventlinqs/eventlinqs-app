import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import senders from '@/lib/email/letter-senders.json'
import { firstNameOf, greetingLine, letterProblems, visibleLines } from '@/lib/email/letter'
import { renderTicketTransferEmail } from '@/lib/email/templates/ticket-transfer'
import { renderSeatChangeEmail } from '@/lib/email/templates/seat-change'
import { renderFoundingInvitationEmail } from '@/lib/email/templates/founding-invitation'
import { buildRefundConfirmationHtml, buildRefundConfirmationText } from '@/lib/email/templates/refund-confirmation'
import { buildConfirmationEmailHtml, buildConfirmationEmailText } from '@/lib/email/order-confirmation'
import { __authEmailTemplates } from '@/lib/email/auth-emails'
import { renderRefundNotice } from '@/lib/refunds/notify'
import { buildReminderEmail } from '@/lib/walk-in/reminder-messages'
import { buildDigestEmailHtml } from '@/lib/broadcast/digest'
import { buildWaitlistConfirmationEmail } from '@/lib/waitlist/confirmation-email'
import { marketplaceEmailHtml, marketplaceEmailText } from '@/lib/marketplace/notify'
import { alertEmailHtml, alertEmailText } from '@/lib/notifications/dispatch'
import { buildEventPublishedEmail } from '@/lib/notifications/organiser-event-notify'
import { wrap as moneyNotice } from '@/lib/notifications/organiser-money-notify'
import { buildSaleEmail } from '@/lib/notifications/organiser-sale-notify'
import { buildDigestEmail as buildSalesDigestEmail } from '@/lib/notifications/organiser-sales-digest'
import { claimEmail } from '@/lib/listings/claim'
import { buildKitEmail } from '@/lib/launch/kit-email'
import { compose, composeOffer } from '@/lib/fillrate/message'
import { buildEmail as buildPayoutEmail } from '@/lib/payouts/email'

/*
 * EVERY EMAIL TO A PERSON GREETS THEM AND SIGNS OFF (the CONTROLLER's 08:58 gap 3, 31 October 2026; communication
 * law 3). Every customer- and organiser-facing template is rendered here with fixture data and read the way a person
 * reads it (src/lib/email/letter.ts): the first line is 'Hi <first name>,' or 'Hi there,', and 'Kind regards,' is
 * followed at once by 'The EventLinqs team'. The files rendered here are exactly the list in
 * src/lib/email/letter-senders.json, and scripts/guards/every-letter-greets.mjs fails the build when a file in src/
 * sends to a person and is not on that list, so a new sender cannot reach a person without its letter being judged.
 */

type Rendered = { html?: string | null; text?: string | null }
const NAMED = 'Amara Okafor'
const URL = 'https://staging.eventlinqs.com/x'

const refundProps = {
  buyerName: NAMED,
  orderNumber: 'ORD-1',
  eventTitle: 'Pasifika Festival',
  ticketCount: 2,
  refundAmountCents: 12500,
  currency: 'AUD',
  customMessage: null,
  organiserName: 'Pasifika Inc.',
  organiserContactEmail: 'hello@pasifika.example',
}
const order = { id: '00000000-0000-4000-8000-000000000001', order_number: 'EL-1', total_cents: 5000, currency: 'AUD' }
const event = {
  title: 'Cellar Comedy Night',
  start_date: '2026-08-21T09:30:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'The Cellar Comedy Room',
  venue_city: 'Geelong',
  venue_country: 'Australia',
}
const tickets = [{ ticket_code: 'TKT1', secret: 's', holder_name: NAMED, status: 'valid', seat: null }]
const fill = {
  slotName: 'Friday spin class',
  slotAt: '2026-11-06T08:00:00Z',
  slotTimezone: 'Australia/Melbourne',
  category: 'fitness',
  inventoryClass: null,
  currency: 'AUD',
  unsubscribeUrl: URL,
  organiserName: 'Northside Gym',
  signature: 'EventLinqs, the place events get made',
  signOff: ['Kind regards,', 'The EventLinqs team'],
}
const payout = { amountCents: 40000, currency: 'AUD', arrivalDate: '2026-11-03T00:00:00Z', failureReason: 'closed account', eventTitle: 'Gala' }

/** Every template, by the send-site file it serves, with each variant it draws. */
const RENDERS: Record<string, Record<string, () => Rendered>> = {
  'src/app/actions/transfer-ticket.ts': {
    'ticket transfer': () => renderTicketTransferEmail({ name: NAMED, title: 'Gala', link: URL, contact: 'hello@eventlinqs.com' }),
  },
  'src/app/(dashboard)/dashboard/events/[id]/seats/actions.ts': {
    'seat updated': () => renderSeatChangeEmail({ kind: 'updated', holderName: NAMED, eventTitle: 'Gala', toLabel: 'Row B, Seat 3', fromLabel: 'Row A, Seat 1' }),
    'seat assigned, no name': () => renderSeatChangeEmail({ kind: 'assigned', holderName: null, eventTitle: 'Gala', toLabel: 'Row B, Seat 3' }),
  },
  'src/app/admin/(authed)/network/actions.ts': {
    'founding invitation': () => renderFoundingInvitationEmail({ fullName: NAMED, cityName: 'Geelong', inviteUrl: URL, unsubscribeUrl: URL }),
  },
  'src/app/api/cron/weekly-digest/route.ts': {
    'weekly digest': () =>
      buildDigestEmailHtml({
        cityName: 'Geelong',
        events: [{ title: 'Jazz Night', dateLabel: 'Fri 6 Nov, 8pm', venueLabel: 'The Barwon Club', priceLabel: 'Free entry', url: URL }] as never,
        origin: 'https://staging.eventlinqs.com',
        unsubscribeUrl: URL,
      }),
  },
  'src/app/waitlist/actions.ts': {
    'waitlist confirmation': () =>
      buildWaitlistConfirmationEmail({ cityName: 'Geelong', fullName: NAMED, role: 'attendee' as never, foundingCandidate: false, unsubscribeUrl: URL, marketingOptIn: false }),
  },
  'src/app/api/webhooks/stripe/route.ts': {
    'refund confirmation': () => ({ html: buildRefundConfirmationHtml(refundProps), text: buildRefundConfirmationText(refundProps) }),
    'refund confirmation, no name': () => ({
      html: buildRefundConfirmationHtml({ ...refundProps, buyerName: null }),
      text: buildRefundConfirmationText({ ...refundProps, buyerName: null }),
    }),
  },
  'src/lib/email/order-confirmation.ts': {
    'order confirmation and ticket': () => ({
      html: buildConfirmationEmailHtml(order, event, tickets as never, null, 'Amara'),
      text: buildConfirmationEmailText(order, event, tickets as never, null, 'Amara'),
    }),
    'order confirmation, no name': () => ({
      html: buildConfirmationEmailHtml(order, event, tickets as never, null, null),
      text: buildConfirmationEmailText(order, event, tickets as never, null, null),
    }),
  },
  'src/lib/email/auth-emails.ts': Object.fromEntries(
    (['CONFIRM_SIGNUP', 'RESET_PASSWORD', 'MAGIC_LINK'] as const).map((k) => [
      k,
      () => ({
        html: __authEmailTemplates.authEmailHtml(__authEmailTemplates[k], URL),
        text: __authEmailTemplates.authEmailText(__authEmailTemplates[k], URL),
      }),
    ]),
  ),
  'src/lib/refunds/notify.ts': {
    'refund requested, to the organiser': () => renderRefundNotice(NAMED, 'A refund has been requested', ['One line.'], { label: 'Review the request', url: URL }),
    'refund decision, to the buyer': () => renderRefundNotice(null, 'Your refund was approved', ['One line.'], { label: 'View your order', url: URL }),
  },
  'src/lib/walk-in/reminder-store.ts': Object.fromEntries(
    (['program', 'day_before', 'called_off'] as const).map((kind) => [
      `walk-in ${kind}`,
      () =>
        buildReminderEmail({
          kind,
          origin: 'https://staging.eventlinqs.com',
          token: 'tok',
          event: { title: 'Kaze Karaoke', slug: 'kaze', venueName: 'Kaze', venueCity: 'Geelong', directionsUrl: URL },
          organiserName: 'Kaze',
          days: [],
        }),
    ]),
  ),
  'src/lib/marketplace/notify.ts': {
    'marketplace notice': () => ({
      html: marketplaceEmailHtml({ title: 'A gig matches you', body: 'One line.', url: URL }, 'See the gig', URL, NAMED),
      text: marketplaceEmailText({ body: 'One line.', url: URL }, URL, NAMED),
    }),
  },
  'src/lib/notifications/dispatch.ts': {
    'event alert': () => ({
      html: alertEmailHtml({ title: 'Just announced', body: 'One line.', url: URL }, URL, null),
      text: alertEmailText({ body: 'One line.', url: URL }, URL, null),
    }),
  },
  'src/lib/notifications/organiser-event-notify.ts': {
    'event published': () => buildEventPublishedEmail({ eventTitle: 'Gala', eventSlug: 'gala', firstName: 'Amara' }),
  },
  'src/lib/notifications/organiser-money-notify.ts': {
    'money notice': () => moneyNotice('Amara', 'A refund has settled on your event', ['One line.', ''], { label: 'See your payouts', url: URL }),
    'money notice, no name': () => moneyNotice(null, 'Action needed', ['One line.']),
  },
  'src/lib/notifications/organiser-sale-notify.ts': {
    'first sale': () =>
      buildSaleEmail('send_first_sale' as never, { eventTitle: 'Gala', eventSlug: 'gala', orderNumber: 'EL-1', totalCents: 5000, currency: 'AUD', ticketCount: 2, firstName: 'Amara' }),
    sale: () => buildSaleEmail('send_sale' as never, { eventTitle: 'Gala', eventSlug: 'gala', orderNumber: 'EL-1', totalCents: 5000, currency: 'AUD', ticketCount: 1 }),
  },
  'src/lib/notifications/organiser-sales-digest.ts': {
    'sales digest': () =>
      buildSalesDigestEmail({ day: 'Fri 30 Oct', rows: [{ eventTitle: 'Gala', orderNumber: 'EL-1', totalCents: 5000, currency: 'AUD' }] as never, grossCents: 5000, currency: 'AUD', firstName: 'Amara' }),
  },
  'src/lib/listings/claim.ts': {
    'listing claim code': () => claimEmail({ hostName: "Beav's Bar", claimantName: 'Sam', claimantRole: 'Manager', code: '042917' }),
  },
  'src/lib/launch/kit-email.ts': {
    'launch kit': () => buildKitEmail({ title: 'Gala', url: URL }),
  },
  'src/lib/fillrate/engine.ts': {
    'checkout recovery': () => compose({ ...fill, unitAmountCents: 2500, messageNumber: 1, resumeUrl: URL }),
    'waiting list offer': () => composeOffer({ ...fill, units: 1, expiresAt: '2026-11-05T08:00:00Z', claimUrl: URL }),
  },
  'src/lib/payouts/email.ts': Object.fromEntries(
    (['payout_initiated', 'payout_paid', 'payout_failed', 'reserve_released'] as const).map((kind) => [
      kind,
      () => buildPayoutEmail(kind, 'Pasifika Inc.', payout as never, 'Amara'),
    ]),
  ),
}

describe('every email to a person greets them and signs off', () => {
  for (const [file, variants] of Object.entries(RENDERS)) {
    for (const [name, render] of Object.entries(variants)) {
      it(`${name} (${file})`, () => {
        const message = render()
        // LOOK, DO NOT DESCRIBE: with LETTER_DUMP_DIR set, each letter is written out so a person can look at it.
        const dump = process.env.LETTER_DUMP_DIR
        if (dump) {
          mkdirSync(dump, { recursive: true })
          const slug = `${file}--${name}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
          if (message.html) writeFileSync(join(dump, `${slug}.html`), message.html)
          if (message.text) writeFileSync(join(dump, `${slug}.txt`), message.text)
        }
        expect(message.html ?? message.text, 'the template rendered nothing').toBeTruthy()
        expect(letterProblems(message)).toEqual([])
      })
    }
  }

  it('the greeting uses the first name only, and says there when no name is held', () => {
    expect(greetingLine('Amara Okafor')).toBe('Hi Amara,')
    expect(greetingLine(null)).toBe('Hi there,')
    expect(greetingLine('   ')).toBe('Hi there,')
    expect(greetingLine('amara@example.com')).toBe('Hi there,')
    expect(firstNameOf('Sam <b>')).toBe('Sam')
  })

  it('the check refuses a letter that opens with anything else, or signs off any other way', () => {
    expect(letterProblems({ html: '<p>Your order is confirmed</p><p>Kind regards,<br>The EventLinqs team</p>' })).toHaveLength(1)
    expect(letterProblems({ html: '<p>Hi Amara,</p><p>The EventLinqs team</p>' })).toHaveLength(1)
    expect(letterProblems({ text: 'Hi Amara,\n\nBody.\n\nKind regards,\nEventLinqs' })).toHaveLength(1)
    expect(letterProblems({ html: '<p>EVENTLINQS</p><p>Hi there,</p><p>Kind regards,<br>The EventLinqs team</p>' })).toEqual([])
    expect(visibleLines('<div style="display:none">preheader</div><p>Hi there,</p>')[0]).toBe('Hi there,')
  })
})

describe('the letter list and this test agree', () => {
  it('every file on the list is rendered here, and nothing else is', () => {
    expect(Object.keys(RENDERS).sort()).toEqual([...senders.letters].sort())
  })

  it('every send to a person that is not a letter carries its reason', () => {
    for (const [file, reason] of Object.entries(senders.notLetters)) expect(reason.trim(), file).not.toBe('')
  })
})
