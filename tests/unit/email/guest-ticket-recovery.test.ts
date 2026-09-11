import { describe, expect, test } from 'vitest'
import {
  buildConfirmationEmailHtml,
  buildConfirmationEmailText,
} from '@/lib/email/order-confirmation'

/**
 * A GUEST IS NEVER SENT TO A PAGE THAT ASKS THEM TO SIGN IN (close-out UX6.4).
 *
 * Found 9 September 2026, by the owner buying a real ticket on a phone. The
 * confirmation email ended with:
 *
 *     Lost this email? Your tickets are always at eventlinqs.com.au/tickets
 *     when you are signed in, or use a ticket link above.
 *
 * That purchase was a guest checkout. It created no account, so /tickets can
 * only bounce the buyer to /login?redirect=/tickets, and there is nothing for
 * them to log in to. Every buyer arriving from paid advertising is a guest, so
 * the sentence was wrong for the majority of the people reading it and wrong
 * at exactly the moment they were looking for a ticket they had paid for.
 *
 * The distinction the email now makes is `orders.user_id`: present means an
 * account exists and /tickets is the right answer; absent means a guest, and
 * they get the signed order link, which opens with no sign in and carries every
 * ticket on the order.
 */

const event = {
  title: 'Northcote Social Club Friday',
  start_date: '2026-10-10T09:00:00.000Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'Northcote Social Club',
  venue_city: 'Melbourne',
  venue_country: 'Australia',
  is_free: false,
}

const ticket = {
  ticket_code: 'EL-RDHV-JQY2',
  secret: 'bearer-secret-1',
  holder_name: 'Robin Ashe',
  status: 'valid',
  tier: null,
  seat: null,
}

const base = { order_number: 'EL-9HE57YNV', total_cents: 1800, currency: 'AUD' }
const guestOrder = { ...base, id: 'ord-guest', user_id: null }
const accountOrder = { ...base, id: 'ord-account', user_id: 'user-abc-123' }

describe('the confirmation email, for a buyer with no account', () => {
  test('never tells a guest their tickets are at /tickets when signed in', () => {
    const html = buildConfirmationEmailHtml(guestOrder, event, [ticket], null, 'Robin')
    const text = buildConfirmationEmailText(guestOrder, event, [ticket], null, 'Robin')
    expect(html).not.toContain('when you are signed in')
    expect(text).not.toContain('when you are signed in')
  })

  test('tells a guest plainly that no account is needed', () => {
    const html = buildConfirmationEmailHtml(guestOrder, event, [ticket], null, 'Robin')
    const text = buildConfirmationEmailText(guestOrder, event, [ticket], null, 'Robin')
    expect(html).toContain('no account is needed')
    expect(text).toContain('no account is needed')
  })

  test('gives a guest a ticket link that needs no sign in', () => {
    const text = buildConfirmationEmailText(guestOrder, event, [ticket], null, 'Robin')
    // The bearer link the QR also encodes: the code plus its secret, nothing else.
    expect(text).toContain(`/t/${ticket.ticket_code}?k=${ticket.secret}`)
  })

  test('points a guest at their own order, not at the wallet', () => {
    const html = buildConfirmationEmailHtml(guestOrder, event, [ticket], null, 'Robin')
    const text = buildConfirmationEmailText(guestOrder, event, [ticket], null, 'Robin')
    expect(html).toContain(`/orders/${guestOrder.id}`)
    expect(text).toContain(`/orders/${guestOrder.id}`)
  })
})

describe('the confirmation email, for a buyer who has an account', () => {
  test('still names the wallet, because for them it works', () => {
    const html = buildConfirmationEmailHtml(accountOrder, event, [ticket], null, 'Robin')
    const text = buildConfirmationEmailText(accountOrder, event, [ticket], null, 'Robin')
    expect(html).toContain('/tickets')
    expect(html).toContain('when you are signed in')
    expect(text).toContain('when you are signed in')
  })

  test('does not tell an account holder that no account is needed', () => {
    const text = buildConfirmationEmailText(accountOrder, event, [ticket], null, 'Robin')
    expect(text).not.toContain('no account is needed')
  })
})

describe('the two branches are decided by one field and nothing else', () => {
  test('the same order differs only by user_id', () => {
    const guest = buildConfirmationEmailText(guestOrder, event, [ticket], null, 'Robin')
    const account = buildConfirmationEmailText(
      { ...guestOrder, user_id: 'user-abc-123' },
      event,
      [ticket],
      null,
      'Robin',
    )
    expect(guest).not.toEqual(account)
    // and every ticket link is identical in both, because a bearer link never
    // depended on an account in the first place
    expect(guest).toContain(`/t/${ticket.ticket_code}?k=${ticket.secret}`)
    expect(account).toContain(`/t/${ticket.ticket_code}?k=${ticket.secret}`)
  })
})
