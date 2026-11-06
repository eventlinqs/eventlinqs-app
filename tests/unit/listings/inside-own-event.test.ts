import { describe, expect, it } from 'vitest'
import { judgeCandidate } from '@/lib/listings/judge'
import type { FoundEvent, KnownEvent } from '@/lib/listings/collect'

/*
 * A NIGHT INSIDE AN ORGANISER'S OWN EVENT IS THAT EVENT, NEVER A SECOND LISTING (WINDOW 5, 6 November 2026, the engine accuracy
 * sweep). The African Music and Cultural Festival's organiser lists it with us, one event, Fed Square, Friday 20 November 11:00
 * to Sunday 22 November 20:00. Fed Square's own feed states its three days at 'Federation Square'; on 5 November the collection
 * run's partner rule published the Saturday and the Sunday as new listings beside the organiser's event, so the festival was
 * held three times in production. A found night of the same title inside an organiser's own published event now waits for a
 * person (similar_listing), never published by the rule; a listing's own nights (a series) are judged as before.
 */
const own: KnownEvent = {
  eventId: 'amcf-own', venueId: null, venueName: 'Fed Square', venueAddress: 'Swanston St & Flinders St, Melbourne VIC 3000',
  title: 'African Music and Cultural Festival 2026', startsAt: '2026-11-20T00:00:00.000Z', endsAt: '2026-11-22T09:00:00.000Z',
  citySlug: 'melbourne', seriesId: null,
}
const found = (startsAt: string, title = 'African Music and Cultural Festival 2026'): FoundEvent => ({
  title, startsAt, endsAt: null, venueName: 'Federation Square', venueAddress: 'Swanston Street, Melbourne VIC 3000',
  pageUrl: 'https://fedsquare.com/events/african-music-and-cultural-festival', imageUrl: null, description: null,
  links: [{ url: 'https://fedsquare.com/events/african-music-and-cultural-festival', availability: 'on_sale', priceFromCents: 0 }],
})
const judge = (e: FoundEvent, known: KnownEvent[]) => judgeCandidate({ plan: { kind: 'new', event: e }, sourceVerified: true, known })

describe("a found night inside an organiser's own event", () => {
  it('waits for a person: Saturday and Sunday of the festival the organiser lists', () => {
    expect(judge(found('2026-11-20T23:00:00.000Z'), [own]).reasons).toContain('similar_listing')
    expect(judge(found('2026-11-21T23:00:00.000Z'), [own]).reasons).toContain('similar_listing')
  })

  it('a night after the organiser event ends, or another title, is judged as before', () => {
    expect(judge(found('2026-11-28T23:00:00.000Z'), [own])).toEqual({ confidence: 'high', reasons: [] })
    expect(judge(found('2026-11-21T23:00:00.000Z', 'Melbourne Jazz in the Square'), [own])).toEqual({ confidence: 'high', reasons: [] })
  })

  it("a listing's own nights (a series) are not an organiser's event", () => {
    expect(judge(found('2026-11-21T23:00:00.000Z'), [{ ...own, seriesId: 'listing-series' }])).toEqual({ confidence: 'high', reasons: [] })
  })
})
