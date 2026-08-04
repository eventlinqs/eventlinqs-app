import { describe, it, expect } from 'vitest'
import {
  buildConfirmationEmailHtml,
  buildConfirmationEmailText,
} from '@/lib/email/order-confirmation'

// The confirmation email is the buyer's self-contained ticket. For a reserved
// seat it MUST carry the seat (section, row, seat number) - the same query the
// live mailer runs (tickets -> seat -> section). These pin "the seat is on the
// email" so a design change to the seat surfaces can never silently drop it.

const order = { order_number: 'EL-SEATPROOF', total_cents: 0, currency: 'AUD' }
const event = {
  title: 'Cellar Comedy Night',
  start_date: '2026-08-28T09:30:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'The Cellar Comedy Room',
  venue_city: 'Geelong',
  venue_country: 'Australia',
}

const seatedTicket = {
  ticket_code: 'TCK-SEATED-1',
  secret: 'secret-abc',
  holder_name: 'Seat Proof Guest',
  status: 'valid',
  seat: {
    row_label: 'D',
    seat_number: '6',
    note: 'Enter via Door G',
    section: { name: 'Main room' },
  },
}

describe('seated order confirmation email', () => {
  it('renders the seat (section, row, seat number) in the HTML', () => {
    const html = buildConfirmationEmailHtml(order, event, [seatedTicket], null, 'Seat')
    expect(html).toContain('Main room')
    expect(html).toContain('D')
    expect(html).toContain('6')
    // The organiser seat note rides along on the emailed ticket.
    expect(html).toContain('Enter via Door G')
  })

  it('renders the seat in the plain-text alternative', () => {
    const text = buildConfirmationEmailText(order, event, [seatedTicket], null, 'Seat')
    expect(text).toMatch(/Main room/)
    expect(text).toMatch(/\bD\b/)
    expect(text).toMatch(/6/)
    expect(text).toContain('Enter via Door G')
  })

  it('omits any seat line for a general-admission ticket (no seat)', () => {
    const gaTicket = { ...seatedTicket, ticket_code: 'TCK-GA-1', seat: null }
    const html = buildConfirmationEmailHtml(order, event, [gaTicket], null, 'Seat')
    expect(html).not.toContain('Enter via Door G')
  })
})
