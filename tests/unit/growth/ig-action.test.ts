import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { igAction } from '@/lib/growth/ig'
import { ctaFor, GET_TICKETS } from '@/lib/events/cta'

/*
 * CAR U, U2 (the PM's 02:12 of 28 November 2026; the scorecard's conversion point 9). Red on main, where an event on /ig
 * led only to its own page: now each has one tap to its tickets or booking, in the platform's own words (the release
 * checklist's section E, src/lib/events/cta.ts; the gate's cta-five-states guard refused words of its own at 04:12):
 * EventLinqs' own tickets to the event page's ticket panel, a night sold elsewhere through the counted /out redirect to
 * the link the event page's own panel buttons, a free walk in or a night of unknown price to its own page.
 */

const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-28T00:00:00Z')
const PAGE = '/events/j-cole-rod-laver-arena-2026-11-28?utm_source=instagram'
const link = (url: string, over: object = {}) => ({
  id: url, provider: 'ticketmaster', url, kind: 'tickets', availability: 'on_sale', price_from_cents: null, price_checked_at: null,
  is_primary: false, set_by: 'curated', pointed_to_by_organiser: false, position: 0, created_at: '2026-11-01T00:00:00Z', ...over,
})
const row = (over: object) => ({ slug: 'j-cole-rod-laver-arena-2026-11-28', is_free: null, entry_mode: null, ticket_tiers: [], booking_links: [], ...over }) as never

describe('one tap from each event on /ig, in the platform own words', () => {
  it("EventLinqs' own tickets: the one call to action, to the event page's ticket panel", () => {
    const a = igAction(row({ ticket_tiers: [{ id: 't', price: 35, currency: 'AUD', sold_count: 0, reserved_count: 0, total_capacity: 10 }] }), PAGE, NOW)
    expect(a).toEqual({ label: GET_TICKETS, href: `${PAGE}#tickets` })
    const free = igAction(row({ ticket_tiers: [{ id: 't', price: 0, currency: 'AUD', sold_count: 0, reserved_count: 0, total_capacity: 10 }] }), PAGE, NOW)
    expect(free).toEqual({ label: ctaFor({ tiers: [{ price: 0 }] }).action, href: `${PAGE}#tickets` })
  })
  it("sold elsewhere: the event page's own panel button, through the counted /out redirect, never a dead link", () => {
    const a = igAction(row({ booking_links: [link('https://www.ticketmaster.com.au/a', { position: 1 }), link('https://www.ticketmaster.com.au/primary', { is_primary: true })] }), PAGE, NOW)
    expect(a.label).toBe('View tickets at Ticketmaster')
    expect(a.href).toBe('/out/j-cole-rod-laver-arena-2026-11-28?to=https%3A%2F%2Fwww.ticketmaster.com.au%2Fprimary')
    const dead = igAction(row({ booking_links: [link('https://x.example/dead', { is_primary: true, availability: 'sold_out', kind: 'sold_out' })] }), PAGE, NOW)
    expect(dead).toEqual({ label: 'View event details', href: PAGE })
  })
  it('a free walk in, or a night of unknown price: its own page', () => {
    expect(igAction(row({ entry_mode: 'walk_in' }), PAGE, NOW)).toEqual({ label: 'View event details', href: PAGE })
    expect(igAction(row({}), PAGE, NOW)).toEqual({ label: 'View event details', href: PAGE })
  })
  it('the button sits under every card in both lists, the approved card unchanged, and ig.ts writes no words of its own', () => {
    const page = read('src/app/ig/page.tsx')
    expect(page.split('data-ig-action={item.action.label}').length - 1).toBe(2)
    expect(page.split('<MarketEventCard card={item.card} href={item.href} />').length - 1).toBe(2)
    expect(read('src/lib/growth/ig.ts')).not.toMatch(/label: '[A-Z]/)
  })
})
