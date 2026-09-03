import { describe, expect, test, beforeAll } from 'vitest'
import { buildConfirmationEmailHtml, buildConfirmationEmailText } from '@/lib/email/order-confirmation'

/**
 * THE CONFIRMATION EMAIL AND THE LIVESTREAM (Scope v5, 3.11).
 *
 * A livestream ticket carries a Join the livestream link. An in-person ticket
 * on the same hybrid event does not. Every ticket on a virtual event does. And
 * the email NEVER carries the stream address itself: the link is the watch
 * page, which re-verifies the bearer pair, the tier and the viewer's country
 * on every visit, so a forwarded email cannot hand the stream to a stranger.
 */
const order = { id: 'ord-1', order_number: 'EL-STREAM01', total_cents: 0, currency: 'AUD' }

const hybrid = {
  title: 'Geelong Sessions Live',
  start_date: '2026-10-10T09:00:00.000Z',
  timezone: 'Australia/Melbourne',
  event_type: 'hybrid' as const,
  venue_name: 'The Wool Exchange',
  venue_city: 'Geelong',
  venue_country: 'Australia',
  is_free: true,
}

const livestreamTicket = {
  ticket_code: 'EL-LIVE-0001',
  secret: 'secret-live',
  holder_name: 'Tom Akana',
  status: 'valid',
  tier: { access_mode: 'virtual' as const },
  seat: null,
}
const doorTicket = {
  ticket_code: 'EL-DOOR-0001',
  secret: 'secret-door',
  holder_name: 'Mei Ling',
  status: 'valid',
  tier: { access_mode: 'in_person' as const },
  seat: null,
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.eventlinqs.com.au'
})

describe('the confirmation email and the livestream', () => {
  test('a livestream tier on a hybrid event carries Join the livestream; the door tier does not', () => {
    const html = buildConfirmationEmailHtml(order, hybrid, [livestreamTicket, doorTicket], null, 'Tom')
    const text = buildConfirmationEmailText(order, hybrid, [livestreamTicket, doorTicket], null, 'Tom')

    expect(html).toContain('/t/EL-LIVE-0001/watch?k=secret-live')
    expect(html).toContain('Join the livestream')
    expect(html).not.toContain('/t/EL-DOOR-0001/watch')
    expect(html).toContain('/t/EL-DOOR-0001?k=secret-door')

    expect(text).toContain('Join the livestream: ')
    expect(text).toContain('/t/EL-LIVE-0001/watch?k=secret-live')
    expect(text).not.toContain('/t/EL-DOOR-0001/watch')
  })

  test('every ticket on a virtual event carries the link, whatever its tier says', () => {
    const virtual = { ...hybrid, event_type: 'virtual' as const }
    const html = buildConfirmationEmailHtml(order, virtual, [doorTicket], null, null)
    expect(html).toContain('/t/EL-DOOR-0001/watch?k=secret-door')
  })

  test('a refunded livestream ticket carries no link', () => {
    const html = buildConfirmationEmailHtml(order, hybrid, [{ ...livestreamTicket, status: 'refunded' }], null, null)
    expect(html).not.toContain('/watch?k=')
    expect(html).toContain('refunded and is no longer valid')
  })

  test('the email never contains a stream address, only the gated watch page', () => {
    const html = buildConfirmationEmailHtml(order, hybrid, [livestreamTicket], null, null)
    const text = buildConfirmationEmailText(order, hybrid, [livestreamTicket], null, null)
    for (const out of [html, text]) {
      expect(out).not.toMatch(/youtube|zoom\.us|streamyard|rtmp:/i)
      expect(out.match(/\/watch\?k=/g)?.length).toBe(1)
    }
  })

  test('an in-person event carries no livestream copy at all', () => {
    const inPerson = { ...hybrid, event_type: 'in_person' as const }
    const html = buildConfirmationEmailHtml(order, inPerson, [doorTicket], null, null)
    expect(html).not.toContain('livestream')
  })
})
