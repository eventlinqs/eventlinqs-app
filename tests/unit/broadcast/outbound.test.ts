// The outbound press (/out/[slug]?to=<destination>, src/lib/broadcast/outbound.ts; window 6, 27 October 2026).
//
// Every button that leaves a listing names this route and its destination (src/lib/listings/outbound.ts outboundHref).
// Pinned over fake reads and writes: the destination followed only when it is this event's own (a live booking link,
// one of its host's pages, its external ticket address), never an open redirect; a dead or unknown one lands on the
// one button; each press counted with its booking link and platform, a host page with its platform alone, on the
// arrival link when it is this event's; never a crawler; and a lost count never strands anyone.

import { describe, expect, test } from 'vitest'
import { destinationsOf, followOutbound, type OutboundDeps, type OutboundEvent, type OutboundLink } from '@/lib/broadcast/outbound'
import type { BookingLink } from '@/lib/events/booking-links'
import type { ListingPages } from '@/lib/listings/outbound'

const EVENT: OutboundEvent = { id: 'ev-1', slug: 'beavs-bar-trivia', externalTicketUrl: null, listing: { id: 'ev-1' } }
const PERSON = { to: null as string | null, cookieCode: null as string | null, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', ip: '203.0.113.7' }

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
const HOST: ListingPages = { websiteUrl: 'https://www.beavsbar.com.au/' }

function deps(over: Partial<OutboundDeps> & { event?: OutboundEvent | null; links?: BookingLink[]; pages?: ListingPages; arrived?: OutboundLink | null } = {}) {
  const recorded: { linkId: string; bookingLinkId: string | null; provider: string }[] = []
  const minted: string[] = []
  const event = over.event === undefined ? EVENT : over.event
  const d: OutboundDeps = {
    findEvent: async (slug) => (event?.slug === slug ? event : null),
    linksOf: async () => over.links ?? [HUMANITIX, DICE],
    pagesOf: async () => over.pages ?? {},
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

describe('a press out of a listing', () => {
  test('goes to the one button\'s link, counted with that link and its platform on the arrival link', async () => {
    const { d, recorded, minted } = deps({ arrived: { id: 'ig-link', event_id: 'ev-1' } })
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, cookieCode: 'beavs-bar-trivia-ig' }, d)).toEqual({ kind: 'out', location: HUMANITIX.url, bookingLinkId: 'bl-hx', counted: true })
    expect(recorded).toEqual([{ linkId: 'ig-link', bookingLinkId: 'bl-hx', provider: 'humanitix' }])
    expect(minted).toEqual([])
  })

  test('goes to the "Also on" destination it names, and counts that platform', async () => {
    const { d, recorded } = deps()
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, to: DICE.url }, d)).toMatchObject({ kind: 'out', location: DICE.url, bookingLinkId: 'bl-dice' })
    expect(recorded).toEqual([{ linkId: 'own-ev-1', bookingLinkId: 'bl-dice', provider: 'dice' }])
  })

  test('goes to a free night\'s host page, counted with no booking link and the platform its address names', async () => {
    const { d, recorded } = deps({ links: [], pages: HOST })
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, to: HOST.websiteUrl as string }, d)).toMatchObject({ kind: 'out', location: HOST.websiteUrl, bookingLinkId: null })
    expect(recorded).toEqual([{ linkId: 'own-ev-1', bookingLinkId: null, provider: 'other' }])
  })

  test('is never an open redirect: a destination not this event\'s lands on its own button', async () => {
    const { d } = deps()
    for (const to of ['https://evil.example/phish', 'javascript:alert(1)', 'https://dice.fm/event/someone-else']) {
      expect(await followOutbound({ slug: EVENT.slug, ...PERSON, to }, d)).toMatchObject({ kind: 'out', location: HUMANITIX.url })
    }
  })

  test('lands on the button\'s live link when the one named went dead', async () => {
    const dead = link('bl-dead', 'eventbrite', 'https://www.eventbrite.com.au/e/beavs', { availability: 'dead' })
    const { d } = deps({ links: [HUMANITIX, DICE, dead] })
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, to: dead.url }, d)).toMatchObject({ kind: 'out', location: HUMANITIX.url })
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
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, userAgent: 'facebookexternalhit/1.1' }, d)).toMatchObject({ kind: 'out', counted: false })
    expect(recorded).toEqual([])
  })

  test('a QA press is counted as a test even from a crawler agent; an unverified marker is counted as neither (20261029220001)', async () => {
    const seen: { linkId: string; isTest: boolean | undefined }[] = []
    const record: OutboundDeps['record'] = async (linkId, _visitor, _pressed, isTest) => {
      seen.push({ linkId, isTest })
    }
    const crawler = { ...PERSON, userAgent: 'EventLinqs-QA crawler' }
    expect(await followOutbound({ slug: EVENT.slug, ...crawler, qa: 'test' }, deps({ record }).d)).toMatchObject({ kind: 'out', counted: true })
    expect(seen).toEqual([{ linkId: `own-${EVENT.id}`, isTest: true }])

    seen.length = 0
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, qa: 'refused' }, deps({ record }).d)).toMatchObject({ kind: 'out', counted: false })
    expect(seen).toEqual([])

    expect(await followOutbound({ slug: EVENT.slug, ...PERSON, qa: 'none' }, deps({ record }).d)).toMatchObject({ kind: 'out', counted: true })
    expect(seen).toEqual([{ linkId: `own-${EVENT.id}`, isTest: false }])
  })

  test('sends the visitor to the event page where nothing it holds passes the hop\'s own rule', async () => {
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

describe('the destinations an event holds', () => {
  test('the one button first, then every live link, then the host\'s pages and ticket address, each once', () => {
    const dead = link('bl-dead', 'eventbrite', 'https://www.eventbrite.com.au/e/beavs', { availability: 'dead' })
    expect(destinationsOf([DICE, dead, HUMANITIX], { sourceUrl: HUMANITIX.url, websiteUrl: HOST.websiteUrl }, 'https://www.beavsbar.com.au/').map((x) => x.url)).toEqual([
      HUMANITIX.url,
      DICE.url,
      'https://www.beavsbar.com.au/',
    ])
  })
})
