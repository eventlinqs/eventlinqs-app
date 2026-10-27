import { describe, expect, it } from 'vitest'
import {
  alsoOn,
  bookingLinksSql,
  buttonOf,
  priceToShow,
  providerOf,
  sameEvent,
  type BookingLink,
  type ListingKey,
} from '@/lib/events/booking-links'

/*
 * WI3, ONE EVENT, EVERY PLACE IT SELLS (the project manager's 12:30 of 27 October 2026; docs/walk-in/WI3-DECISION.md).
 * The tests the 12:30 asks first, for this half: two sources, one event; three platforms, one button and the rest
 * "Also on"; the primary dead, the button re-picks; all sold out, no dead button; the claimed organiser's order wins.
 * The database's own event_booking_button holds the same order (supabase/migrations/20261027130001).
 */

const link = (id: string, over: Partial<BookingLink> = {}): BookingLink => ({
  id,
  provider: 'humanitix',
  url: `https://events.humanitix.com/${id}`,
  kind: 'tickets',
  availability: 'on_sale',
  priceFromCents: null,
  priceCheckedAt: null,
  isPrimary: false,
  setBy: 'curated',
  pointedToByOrganiser: false,
  position: 0,
  createdAt: '2026-10-27T01:00:00Z',
  ...over,
})

describe('which platform a link is on', () => {
  it('reads the host alone, and names nothing it does not know', () => {
    expect(providerOf('https://events.humanitix.com/jazz-at-beavs')).toBe('humanitix')
    expect(providerOf('https://www.eventbrite.com.au/e/jazz-123')).toBe('eventbrite')
    expect(providerOf('https://www.trybooking.com/BXYZ')).toBe('trybooking')
    expect(providerOf('https://www.moshtix.com.au/v2/event/x/1')).toBe('moshtix')
    expect(providerOf('https://dice.fm/event/abc')).toBe('dice')
    expect(providerOf('https://beavsbar.com.au/whats-on')).toBe('other')
    expect(providerOf('https://humanitix.com.evil.example/x')).toBe('other')
    expect(providerOf('not a url')).toBe('other')
  })
})

describe('the one button', () => {
  it('three platforms: one button, the rest Also on, on sale before sold out, then the first found', () => {
    const links = [
      link('m', { provider: 'moshtix', availability: 'sold_out', position: 0 }),
      link('e', { provider: 'eventbrite', position: 2 }),
      link('h', { provider: 'humanitix', position: 1 }),
    ]
    expect(buttonOf(links)?.id).toBe('h')
    expect(alsoOn(links).map((l) => l.id)).toEqual(['e', 'm'])
  })

  it('the link the organiser\'s own pages point to before the first found', () => {
    const links = [link('a', { position: 0 }), link('b', { position: 1, pointedToByOrganiser: true })]
    expect(buttonOf(links)?.id).toBe('b')
  })

  it('a claimed organiser\'s own choice wins over everything but a dead link', () => {
    const links = [
      link('pointed', { pointedToByOrganiser: true }),
      link('own', { isPrimary: true, setBy: 'organiser', availability: 'sold_out', position: 5 }),
    ]
    expect(buttonOf(links)?.id).toBe('own')
    expect(buttonOf([link('own', { isPrimary: true, setBy: 'organiser', availability: 'dead' }), link('next')])?.id).toBe('next')
  })

  it('the primary dead: the button re-picks; never by what pays EventLinqs (no such field exists)', () => {
    const links = [link('p', { pointedToByOrganiser: true, availability: 'dead' }), link('q', { position: 3 })]
    expect(buttonOf(links)?.id).toBe('q')
    expect(alsoOn(links)).toEqual([])
  })

  it('all sold out: the button says sold out on its platform; every link dead: no button at all', () => {
    const sold = [link('s1', { availability: 'sold_out' }), link('s2', { availability: 'sold_out', position: 1 })]
    expect(buttonOf(sold)?.availability).toBe('sold_out')
    expect(buttonOf([link('d', { availability: 'dead' })])).toBeNull()
  })

  it('a price is shown only when checked within the last day', () => {
    const now = new Date('2026-10-27T12:00:00Z')
    expect(priceToShow(link('x', { priceFromCents: 2850, priceCheckedAt: '2026-10-27T01:00:00Z' }), now)).toBe(2850)
    expect(priceToShow(link('x', { priceFromCents: 2850, priceCheckedAt: '2026-10-26T11:00:00Z' }), now)).toBeNull()
    expect(priceToShow(link('x'), now)).toBeNull()
  })
})

describe('two sources, one event', () => {
  const key = (over: Partial<ListingKey> = {}): ListingKey => ({
    venueId: null,
    venueName: "Beav's Bar",
    venueAddress: '77 Moorabool Street, Geelong',
    title: "Jazz at Beav's",
    startsAt: '2026-11-07T09:00:00Z',
    ...over,
  })

  it('the same venue, a start within two hours and titles alike are one event', () => {
    expect(sameEvent(key(), key({ title: "Jazz at Beav's Bar, Friday", startsAt: '2026-11-07T10:30:00Z' }))).toBe(true)
    expect(sameEvent(key({ venueId: 'v1' }), key({ venueId: 'v1', venueName: 'Beavs', title: "JAZZ at Beav's" }))).toBe(true)
  })

  it('another night, another venue or another act stays its own event', () => {
    expect(sameEvent(key(), key({ startsAt: '2026-11-07T12:00:00Z' }))).toBe(false)
    expect(sameEvent(key(), key({ venueName: 'The Barwon Club' }))).toBe(false)
    expect(sameEvent(key({ venueId: 'v1' }), key({ venueId: 'v2' }))).toBe(false)
    expect(sameEvent(key(), key({ title: 'Comedy Open Mic' }))).toBe(false)
  })
})

describe('the import\'s writer', () => {
  it('writes curated links only, never over what an organiser set, a price only with its check', () => {
    const sql = bookingLinksSql('v_event', [
      { url: 'https://events.humanitix.com/jazz', priceFromCents: 2850, priceCheckedAt: '2026-10-27T01:00:00Z' },
      { url: "https://www.eventbrite.com.au/e/jazz-'1", availability: 'sold_out' },
    ])
    expect(sql).toContain("'humanitix', 'https://events.humanitix.com/jazz', 'tickets', 'on_sale', 2850, '2026-10-27T01:00:00Z'::timestamptz")
    expect(sql).toContain("'https://www.eventbrite.com.au/e/jazz-''1'")
    expect(sql.match(/where public\.event_booking_links\.set_by = 'curated'/g)).toHaveLength(2)
    expect(sql).not.toMatch(/is_primary/)
    expect(() => bookingLinksSql('v_event', [{ url: 'http://insecure.example/x' }])).toThrow(/https/)
    expect(() => bookingLinksSql('v_event', [{ url: 'https://x.example/y', priceFromCents: 100 }])).toThrow(/checked/)
  })
})
