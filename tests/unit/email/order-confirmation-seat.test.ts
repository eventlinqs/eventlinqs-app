import { describe, it, expect } from 'vitest'
import {
  buildConfirmationEmailHtml,
  buildConfirmationEmailText,
} from '@/lib/email/order-confirmation'

/**
 * Reserved seating on the confirmation email: every seated ticket block
 * carries its full seat line (section, row, seat) in BOTH the HTML and the
 * plain-text builds, exactly as the door and the ticket page render it.
 */

const order = { order_number: 'EL-SEAT01', total_cents: 5000, currency: 'AUD' }
const event = {
  title: 'Cellar Comedy Night',
  start_date: '2026-08-21T09:30:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'The Cellar Comedy Room',
  venue_city: 'Geelong',
  venue_country: 'Australia',
}
const tickets = [
  {
    ticket_code: 'TKTSEAT01',
    secret: 'a-secret',
    holder_name: 'Test User',
    status: 'valid',
    seat: { row_label: 'B', seat_number: '3', section: { name: 'Main room' } },
  },
  {
    ticket_code: 'TKTSEAT02',
    secret: 'b-secret',
    holder_name: 'Test User',
    status: 'valid',
    seat: { row_label: 'Table 1', seat_number: '5', section: { name: 'Gala floor' } },
  },
  {
    ticket_code: 'TKTGA01',
    secret: 'c-secret',
    holder_name: 'Test User',
    status: 'valid',
    seat: null,
  },
]

describe('order confirmation email carries the seat', () => {
  it('HTML: seated tickets show section, row and seat; tables read naturally; GA shows none', () => {
    const html = buildConfirmationEmailHtml(order, event, tickets as never, null, 'Test')
    expect(html).toContain('Main room, Row B, Seat 3')
    expect(html).toContain('Gala floor, Table 1, Seat 5')
    expect(html).not.toContain('Row Table 1')
    // The GA ticket block renders with no seat line at all.
    const gaBlock = html.split('TKTGA01')[0].split('TKTSEAT02')[1]
    expect(gaBlock).not.toContain('Seat ')
  })

  it('text: seat lines present per seated ticket', () => {
    const text = buildConfirmationEmailText(order, event, tickets as never, null, 'Test')
    expect(text).toContain('Main room, Row B, Seat 3')
    expect(text).toContain('Gala floor, Table 1, Seat 5')
  })
})
