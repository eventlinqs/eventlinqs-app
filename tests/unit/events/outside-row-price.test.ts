import { describe, expect, it } from 'vitest'
import { OUTBOUND_LABEL, sourceLabel } from '@/lib/events/whats-on-directory'
import { PRICE_SHOWN_FOR_MS, priceToShow, toBookingLink, type BookingLinkRow } from '@/lib/events/booking-links'
import { bookingLine } from '@/components/features/city-guide/city-guide'

/*
 * THE CONTROLLER'S 08:50 (6), FROM THE 5 NOVEMBER AUDIT: an outside ticketed row in the guide said only 'Tickets at AXS',
 * though 331 of the 503 outside links on production carried a price read within 7 days
 * (C:\dev\EVIDENCE\AUDIT-5NOV\outside-prices.txt). A row shows 'From $X at <seller>' only when the seller's own link
 * carries a price above nothing, read in the last 7 days; else 'Tickets at <seller>' as before. The event page reads the
 * same rule (priceToShow), so a row and its page never disagree about a price.
 */
const NOW = new Date('2026-11-05T09:00:00Z')
const AXS = 'https://www.axs.com/au/events/1234/benson-boone-tickets'
const link = (over: Partial<BookingLinkRow> = {}): BookingLinkRow => ({
  id: 'l1', provider: 'other', url: AXS, kind: 'tickets', availability: 'on_sale', price_from_cents: 8990,
  price_checked_at: '2026-11-02T00:00:00Z', is_primary: true, set_by: 'curated', pointed_to_by_organiser: false,
  position: 0, created_at: '2026-11-01T00:00:00Z', ...over,
})
const paidOutside = (links: BookingLinkRow[]) => ({ ticket_tiers: [], external_ticket_url: AXS, is_free: false, entry_mode: 'ticketed', booking_links: links })

describe('an outside ticketed row names its price when it was read in the last 7 days', () => {
  it('reads "From $89.90 at AXS" for a price read three days ago', () => {
    expect(sourceLabel(paidOutside([link()]), NOW)).toBe('From $89.90 at AXS')
  })
  it('keeps "Tickets at AXS" for a price read eight days ago', () => {
    expect(sourceLabel(paidOutside([link({ price_checked_at: '2026-10-28T08:00:00Z' })]), NOW)).toBe('Tickets at AXS')
  })
  it('never says "From $0": a price of nothing is no price', () => {
    expect(sourceLabel(paidOutside([link({ price_from_cents: 0 })]), NOW)).toBe('Tickets at AXS')
  })
  it('takes the price only from the seller it names, never from another link', () => {
    expect(sourceLabel(paidOutside([link({ url: 'https://www.ticketek.com.au/shows/x' })]), NOW)).toBe('Tickets at AXS')
  })
  it('keeps "Tickets at AXS" with no links read and with no time given', () => {
    expect(sourceLabel(paidOutside([]), NOW)).toBe('Tickets at AXS')
    expect(sourceLabel(paidOutside([link()]))).toBe('Tickets at AXS')
  })
  it('carries the outbound mark, as every label that leaves EventLinqs does', () => {
    expect(OUTBOUND_LABEL.test('From $89.90 at AXS')).toBe(true)
    expect(bookingLine({ price: '', source: 'From $89.90 at AXS', free: false })).toEqual({ said: null, book: 'From $89.90 at AXS', outbound: true })
  })
})

describe('one window for a price, row and page alike (priceToShow)', () => {
  it('is 7 days', () => {
    expect(PRICE_SHOWN_FOR_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(priceToShow(toBookingLink(link({ price_checked_at: '2026-10-29T10:00:00Z' })), NOW)).toBe(8990)
    expect(priceToShow(toBookingLink(link({ price_checked_at: '2026-10-29T08:00:00Z' })), NOW)).toBeNull()
  })
})
