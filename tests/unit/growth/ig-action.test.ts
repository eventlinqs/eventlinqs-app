import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { igAction } from '@/lib/growth/ig'

/*
 * CAR U, U2 (the PM's 02:12 of 28 November 2026; the scorecard's conversion point 9). Red on main, where an event on /ig
 * led only to its own page: now each has one tap to its tickets or booking: "Get tickets" to the event page's ticket panel
 * for EventLinqs' own tickets, "Book" through the counted /out redirect to its own live booking link for a night sold
 * elsewhere, "Free, details" to its own page for a free night.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const PAGE = '/events/j-cole-rod-laver-arena-2026-11-28?utm_source=instagram'
const link = (url: string, primary = false, availability = 'on_sale') => ({ id: 'l', provider: 'x', url, kind: 'tickets', availability, price_from_cents: null, price_checked_at: null, is_primary: primary })
const row = (over: object) => ({ slug: 'j-cole-rod-laver-arena-2026-11-28', is_free: false, ticket_tiers: [], booking_links: [], ...over }) as never

describe('one tap from each event on /ig', () => {
  it('a free night: its own page', () => {
    expect(igAction(row({ is_free: true }), PAGE)).toEqual({ label: 'Free, details', href: PAGE })
  })
  it("EventLinqs' own tickets: the event page's ticket panel", () => {
    expect(igAction(row({ ticket_tiers: [{ id: 't' }] }), PAGE)).toEqual({ label: 'Get tickets', href: `${PAGE}#tickets` })
  })
  it('sold elsewhere: the counted redirect to its own live booking link, the primary first, never a dead one', () => {
    const a = igAction(row({ booking_links: [link('https://www.ticketek.com.au/old', false, 'dead'), link('https://www.ticketmaster.com.au/a'), link('https://www.ticketmaster.com.au/primary', true)] }), PAGE)
    expect(a).toEqual({ label: 'Book', href: '/out/j-cole-rod-laver-arena-2026-11-28?to=https%3A%2F%2Fwww.ticketmaster.com.au%2Fprimary' })
    expect(igAction(row({ booking_links: [link('https://x.example/dead', true, 'dead')] }), PAGE)).toEqual({ label: 'Book', href: PAGE })
  })
  it('the button sits under every card in both lists, the approved card unchanged', () => {
    const page = read('src/app/ig/page.tsx')
    expect(page.split('data-ig-action={item.action.label}').length - 1).toBe(2)
    expect(page.split('<MarketEventCard card={item.card} href={item.href} />').length - 1).toBe(2)
  })
})
