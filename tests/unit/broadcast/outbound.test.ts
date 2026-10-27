// The outbound press (/out/[slug], src/lib/broadcast/outbound.ts; window 6, 27 October 2026).
//
// Lawal, 27 October: a curated listing shows "ONE clear button to the organiser's own page or booking site",
// counted. These tests pin where a press goes and on which link it is counted, over fake reads and writes, so each
// rule is read alone: the arrival link credited when it is this event's, the event's own 'other' link otherwise, never
// a crawler, never a destination the hop's own rule refuses, and a lost count never strands the visitor.

import { describe, expect, test } from 'vitest'
import { followOutbound, type OutboundDeps, type OutboundEvent, type OutboundLink } from '@/lib/broadcast/outbound'

const EVENT: OutboundEvent = { id: 'ev-1', slug: 'beavs-bar-trivia', destination: 'https://www.humanitix.com/au/events/beavs-trivia' }
const PERSON = { cookieCode: null as string | null, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', ip: '203.0.113.7' }

function deps(over: Partial<OutboundDeps> & { event?: OutboundEvent | null; arrived?: OutboundLink | null } = {}) {
  const recorded: string[] = []
  const minted: string[] = []
  const d: OutboundDeps = {
    findEvent: async (slug) => ((over.event === undefined ? EVENT : over.event)?.slug === slug ? (over.event === undefined ? EVENT : over.event) : null),
    arrivedBy: async (code) => (code ? (over.arrived ?? null) : null),
    ownLink: async (event) => {
      minted.push(event.id)
      return { id: `own-${event.id}`, event_id: event.id }
    },
    record: async (linkId) => {
      recorded.push(linkId)
    },
    counting: async () => true,
    ...over,
  }
  return { d, recorded, minted }
}

describe('a press out of a curated listing', () => {
  test('goes to the organiser\'s own site and is credited to the link the visitor arrived by, when that link is this event\'s', async () => {
    const { d, recorded, minted } = deps({ arrived: { id: 'ig-link', event_id: 'ev-1' } })
    const answer = await followOutbound({ slug: EVENT.slug, ...PERSON, cookieCode: 'beavs-bar-trivia-ig' }, d)
    expect(answer).toEqual({ kind: 'out', location: 'https://www.humanitix.com/au/events/beavs-trivia', counted: true })
    expect(recorded).toEqual(['ig-link'])
    expect(minted).toEqual([])
  })

  test('is counted on the event\'s own link when the visitor came another way, or by another event\'s link', async () => {
    for (const arrived of [null, { id: 'other-event-link', event_id: 'ev-2' }]) {
      const { d, recorded, minted } = deps({ arrived })
      const answer = await followOutbound({ slug: EVENT.slug, ...PERSON, cookieCode: arrived ? 'someone-elses-ig' : null }, d)
      expect(answer).toMatchObject({ kind: 'out', counted: true })
      expect(recorded).toEqual(['own-ev-1'])
      expect(minted).toEqual(['ev-1'])
    }
  })

  test('is never counted for a preview crawler, which still goes out', async () => {
    const { d, recorded } = deps()
    const answer = await followOutbound({ slug: EVENT.slug, ...PERSON, userAgent: 'facebookexternalhit/1.1' }, d)
    expect(answer).toEqual({ kind: 'out', location: EVENT.destination, counted: false })
    expect(recorded).toEqual([])
  })

  test('sends the visitor to the event page, uncounted, where the destination fails the hop\'s own rule', async () => {
    for (const destination of [null, 'http://insecure.example.com/tickets', 'javascript:alert(1)', 'https://www.eventlinqs.com.au/events/x']) {
      const { d, recorded } = deps({ event: { ...EVENT, destination } })
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
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON }, failing.d)).toEqual({ kind: 'out', location: EVENT.destination, counted: false })
    const off = deps({ counting: async () => false })
    expect(await followOutbound({ slug: EVENT.slug, ...PERSON }, off.d)).toEqual({ kind: 'out', location: EVENT.destination, counted: false })
    expect(off.recorded).toEqual([])
  })
})
