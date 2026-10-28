import { describe, expect, it } from 'vitest'
import { heroSaleWords, ticketPanelOf, type TicketPanel } from '@/lib/listings/ticket-panel'
import type { BookingLink } from '@/lib/events/booking-links'

/*
 * WI3's page, the project manager's 12:30 of 27 October 2026, point 4, and its
 * TESTS FIRST: three platforms, one button plus "Also on"; primary dead, the
 * button re-picks; all sold out, no dead button. The order is WI3's buttonOf.
 */

const NOW = new Date('2026-10-27T12:00:00+11:00')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
let n = 0
const link = (over: Partial<BookingLink>): BookingLink => ({
  id: `l${++n}`,
  provider: 'humanitix',
  url: 'https://events.humanitix.com/gig',
  kind: 'tickets',
  availability: 'on_sale',
  priceFromCents: null,
  priceCheckedAt: null,
  isPrimary: false,
  setBy: 'curated',
  pointedToByOrganiser: false,
  position: n,
  createdAt: hoursAgo(48 - n),
  ...over,
})

describe('ticketPanelOf', () => {
  it('three platforms: one button, and the other two in one quiet line', () => {
    const p = ticketPanelOf('gig', [
      link({ position: 0 }),
      link({ provider: 'eventbrite', url: 'https://www.eventbrite.com.au/e/1', position: 1 }),
      link({ provider: 'moshtix', url: 'https://www.moshtix.com.au/v2/event/1', position: 2 }),
    ], NOW)
    expect(p.button).toMatchObject({ label: 'View tickets at Humanitix', href: `/out/gig?to=${encodeURIComponent('https://events.humanitix.com/gig')}`, host: 'events.humanitix.com' })
    expect(p.also.map((a) => a.name)).toEqual(['Eventbrite', 'Moshtix'])
    expect(p.soldOut).toBeNull()
  })

  it('the primary dead: the button re-picks the next one selling', () => {
    const p = ticketPanelOf('gig', [
      link({ availability: 'dead', position: 0 }),
      link({ provider: 'eventbrite', url: 'https://www.eventbrite.com.au/e/1', position: 1 }),
    ], NOW)
    expect(p.button?.label).toBe('View tickets at Eventbrite')
    expect(p.also).toEqual([])
  })

  it('a sold out site is never in the quiet line', () => {
    const p = ticketPanelOf('gig', [link({ position: 0 }), link({ provider: 'oztix', url: 'https://www.oztix.com.au/x', availability: 'sold_out', position: 1 })], NOW)
    expect(p.also).toEqual([])
  })

  it('all sold out: "Sold out on Humanitix" and no button at all', () => {
    const p = ticketPanelOf('gig', [link({ availability: 'sold_out', position: 0 }), link({ provider: 'eventbrite', url: 'https://www.eventbrite.com.au/e/1', availability: 'sold_out', position: 1 })], NOW)
    expect(p.button).toBeNull()
    expect(p.soldOut).toBe('Sold out on Humanitix')
  })

  it('every link dead: nothing at all', () => {
    expect(ticketPanelOf('gig', [link({ availability: 'dead' })], NOW)).toEqual({ button: null, also: [], soldOut: null })
  })

  it('a free registration says so', () => {
    expect(ticketPanelOf('gig', [link({ kind: 'free_register' })], NOW).button?.label).toBe('Register free on Humanitix')
  })

  it('a price, including fees, only when read in the last 24 hours', () => {
    expect(ticketPanelOf('gig', [link({ priceFromCents: 3550, priceCheckedAt: hoursAgo(3) })], NOW).button?.price).toBe('From $35.50')
    expect(ticketPanelOf('gig', [link({ priceFromCents: 4000, priceCheckedAt: hoursAgo(3) })], NOW).button?.price).toBe('From $40')
    expect(ticketPanelOf('gig', [link({ priceFromCents: 3550, priceCheckedAt: hoursAgo(25) })], NOW).button?.price).toBeNull()
  })

  it("names a venue's own booking page plainly", () => {
    expect(ticketPanelOf('gig', [link({ provider: 'venue', url: 'https://beavsbar.com.au/book' })], NOW).button?.label).toBe('View tickets at beavsbar.com.au')
  })

  it("the organiser's own choice gets the button", () => {
    const p = ticketPanelOf('gig', [
      link({ position: 0 }),
      link({ provider: 'eventbrite', url: 'https://www.eventbrite.com.au/e/1', isPrimary: true, setBy: 'organiser', position: 5 }),
    ], NOW)
    expect(p.button?.label).toBe('View tickets at Eventbrite')
    expect(p.also.map((a) => a.name)).toEqual(['Humanitix'])
  })
})

describe("the hero's words for an event sold elsewhere (WI3, heroSaleWords)", () => {
  const panel = (over: Partial<TicketPanel> = {}): TicketPanel => ({
    button: { href: 'https://humanitix.com/x', label: 'View tickets at Humanitix', host: 'humanitix.com', price: 'From $35.50' },
    also: [],
    soldOut: null,
    ...over,
  })
  const base = { externalUrl: 'https://humanitix.com/x', panel: panel(), isFree: false, saleBlocked: true, isSoldOut: false, priceLabel: null }

  it('names the one button and its fresh price, never "Not on sale yet", "Free entry" or our checkout', () => {
    expect(heroSaleWords(base)).toEqual({ cta: 'View tickets at Humanitix', price: 'From $35.50', trustSignals: false })
  })

  it('a stale price is not shown, a free registration says free, and sold out says where', () => {
    expect(heroSaleWords({ ...base, panel: panel({ button: { ...panel().button!, price: null } }) }).price).toBeNull()
    expect(heroSaleWords({ ...base, isFree: true, panel: panel({ button: { ...panel().button!, label: 'Register free on Eventbrite', price: null } }) })).toEqual({
      cta: 'Register free on Eventbrite',
      price: 'Free',
      trustSignals: false,
    })
    expect(heroSaleWords({ ...base, panel: panel({ button: null, soldOut: 'Sold out on Humanitix' }) }).cta).toBe('Sold out on Humanitix')
  })

  it('with no links read it names the site from the address alone', () => {
    expect(heroSaleWords({ ...base, panel: null }).cta).toBe('View tickets at Humanitix')
  })

  it("an event sold here keeps the words it had", () => {
    const here = { externalUrl: null, panel: null, isFree: false, saleBlocked: false, isSoldOut: false, priceLabel: 'From $20' }
    expect(heroSaleWords(here)).toEqual({ cta: 'Get tickets', price: 'From $20', trustSignals: true })
    expect(heroSaleWords({ ...here, saleBlocked: true }).cta).toBe('Not on sale yet')
    expect(heroSaleWords({ ...here, isSoldOut: true }).cta).toBe('Join the waitlist')
    /* The checklist's E6: never free because no price is stored. */
    expect(heroSaleWords({ ...here, priceLabel: null }).price).toBe(null)
    expect(heroSaleWords({ ...here, priceLabel: null, isFree: true }).price).toBe('Free entry')
  })
})
