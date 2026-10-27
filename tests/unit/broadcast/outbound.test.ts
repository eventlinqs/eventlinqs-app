// The outbound press (/out/[slug]?l=<link id>, src/lib/broadcast/outbound.ts; window 6, 27 October 2026).
//
// Lawal, 27 October: a curated listing shows "ONE clear button to the organiser's own page or booking site", and the
// project manager's 12:37: each press records the booking link's provider, so the count per platform comes from one row
// each. These tests pin where a press goes and what is counted, over fake reads and writes, so each rule is read
// alone: the link named when it is this event's and live, else the one button's; the arrival link credited when it is
// this event's; never a crawler; never a destination the hop's own rule refuses; a lost count never strands anyone.

import { describe, expect, test } from 'vitest'
import { followOutbound, type OutboundDeps, type OutboundEvent, type OutboundLink } from '@/lib/broadcast/outbound'
import type { BookingLink } from '@/lib/events/booking-links'

const EVENT: OutboundEvent = { id: 'ev-1', slug: 'beavs-bar-trivia' }
const PERSON = { linkId: null as string | null, cookieCode: null as string | null, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', ip: '203.0.113.7' }

function link(id: string, provider: BookingLink['provider'], url: string, over: Partial<BookingLink> = {}): BookingLink {
  return {
    id,
    provider,
    url,
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
  }
}
const HUMANITIX = link('bl-hx', 'humanitix', 'https://events.humanitix.com/beavs-trivia', { pointedToByOrganiser: true })
const DICE = link('bl-dice', 'dice', 'https://dice.fm/event/beavs-trivia', { position: 1 })

function deps(over: Partial<OutboundDeps> & { event?: OutboundEvent | null; links?: BookingLink[]; arrived?: OutboundLink | null } = {}) {
  const recorded: { linkId: string; bookingLinkId: string; provider: string }[] = []
  const minted: string[] = []
  const event = over.event === undefined ? EVENT : over.event
  const d: OutboundDeps = {
    findEvent: async (slug) => (event?.slug === slug ? event : null),
    linksOf: async () => over.links ?? [HUMANITIX, DICE],
    arrivedBy: async (code) => (code ? (over.arrived ?? null) : null),
    ownLink: async (e) => {
      minted.push(e.id)
      return { id: `own-${e.id}`, event_id: e.id }
    },
    record: async (linkId, _visitor, pressed) => {
      recorded.push({ linkId, ...pressed })
    },
    counting: async () => true,
    ...over,
  }
  return { d, recorded, minted }
}

describe('a press out of a curated listing', () => {
  test('goes through the one button to the link it chose, counted with that link and its platform on the arrival link', async () => {
    const { d, recorded, minted } = deps({ arrived: { id: 'ig-link', event_id: 'ev-1' } })
    const answer = await followOutbound({ slug: EVENT.slug, ...PERSON, cookieCode: 'beavs-bar-trivia-ig' }, d)
    expect(answer).toEqual({ kind: 'out', location: HUMANITIX.url, bookingLinkId: 'bl-hx', counted: true })
    expect(recorded).toEqual([{ linkId: 'ig-link', bookingLinkId: 'bl-hx', provider: 'humanitix' }])
    expect(minted).toEqual([])
  })

  test('goes to the "Also on" link it names, and counts that platform', async () => {
    const { d, recorded } = deps()
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, linkId: 'bl-dice' }, d)).toMatchObject({ kind: 'out', location: DICE.url, bookingLinkId: 'bl-dice' })
    expect(recorded).toEqual([{ linkId: 'own-ev-1', bookingLinkId: 'bl-dice', provider: 'dice' }])
  })

  test('lands on the button\'s live link when the named one is dead or another event\'s', async () => {
    const dead = link('bl-dead', 'eventbrite', 'https://www.eventbrite.com.au/e/beavs', { availability: 'dead' })
    for (const linkId of ['bl-dead', 'bl-of-another-event']) {
      const { d } = deps({ links: [HUMANITIX, DICE, dead] })
      expect(await followOutbound({ slug: EVENT.slug, ...PERSON, linkId }, d)).toMatchObject({ kind: 'out', location: HUMANITIX.url, bookingLinkId: 'bl-hx' })
    }
  })

  test('is counted on the event\'s own link when the visitor came another way, or by another event\'s link', async () => {
    for (const arrived of [null, { id: 'other-event-link', event_id: 'ev-2' }]) {
      const { d, recorded, minted } = deps({ arrived })
      await followOutbound({ slug: EVENT.slug, ...PERSON, cookieCode: arrived ? 'someone-elses-ig' : null }, d)
      expect(recorded.map((r) => r.linkId)).toEqual(['own-ev-1'])
      expect(minted).toEqual(['ev-1'])
    }
  })

  test('is never counted for a preview crawler, which still goes out', async () => {
    const { d, recorded } = deps()
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, userAgent: 'facebookexternalhit/1.1' }, d)).toEqual({ kind: 'out', location: HUMANITIX.url, bookingLinkId: 'bl-hx', counted: false })
    expect(recorded).toEqual([])
  })

  test('sends the visitor to the event page, uncounted, where no live link passes the hop\'s own rule', async () => {
    for (const links of [[], [link('bl-x', 'other', 'https://example.com/x', { availability: 'dead' })], [link('bl-own', 'other', 'https://www.eventlinqs.com.au/events/x')]]) {
      const { d, recorded } = deps({ links })
      expect(await followOutbound({ slug: EVENT.slug, ...PERSON }, d)).toEqual({ kind: 'page', location: '/events/beavs-bar-trivia' })
      expect(recorded).toEqual([])
    }
  })

  test('answers missing for a listing the public cannot see', async () => {
    const { d } = deps({ event: null })
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON }, d)).toEqual({ kind: 'missing' })
  })

  test('still goes out when the count fails or counting is off, and says it was not counted', async () => {
    const failing = deps({
      record: async () => {
        throw new Error('the database blinked')
      },
    })
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON }, failing.d)).toMatchObject({ kind: 'out', counted: false })
    const off = deps({ counting: async () => false })
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON }, off.d)).toMatchObject({ kind: 'out', counted: false })
    expect(off.recorded).toEqual([])
  })
})
