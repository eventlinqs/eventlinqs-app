import { describe, expect, it } from 'vitest'
import { judgeReach, reachQueries, resultSlugs, seasonKey, seasonsByName, type ReachEvent } from '@/lib/search/reach'

// Colours of Asia's 22 November row as production holds it (read 22 November 2026, 05:11): a listing, its host in
// metadata.host_name, its organisation the listings organisation that no page shows.
const coa: ReachEvent = {
  id: '8a1a1b49-3f23-489e-950f-4d7d7e24197c',
  slug: 'colours-of-asia-garden-of-wonders-asia-oasis-2026-11-22',
  title: 'Colours of Asia: Garden of Wonders',
  venue_name: 'Alexandra Gardens',
  listing_source: 'eventlinqs',
  metadata: { host_name: 'Asia Oasis' },
  organisation: { name: 'EventLinqs listings', slug: 'eventlinqs-listings', short_name: null },
}

const listingAtVenue: ReachEvent = {
  id: 'b',
  slug: 'front-bar-trivia-the-local-2026-11-24',
  title: 'Front Bar Trivia',
  venue_name: 'The Local',
  listing_source: 'eventlinqs',
  metadata: {},
  organisation: { name: 'EventLinqs listings', slug: 'eventlinqs-listings', short_name: null },
}

const organisersOwn: ReachEvent = {
  id: 'c',
  slug: 'harbourline-live-2026-12-01',
  title: 'Harbourline Live',
  venue_name: 'The Espy',
  listing_source: 'organiser',
  metadata: null,
  organisation: { name: 'Harbourline Presents', slug: 'harbourline', short_name: 'Harbourline' },
}

describe('search reach: the three names a page shows are the three queries', () => {
  it("a listing's organiser query is its host, never the listings organisation (the asia oasis defect)", () => {
    expect(reachQueries(coa)).toEqual([
      { kind: 'title', q: 'Colours of Asia: Garden of Wonders' },
      { kind: 'organiser', q: 'Asia Oasis' },
      { kind: 'venue', q: 'Alexandra Gardens' },
    ])
  })

  it('a listing with no host names its venue as organiser, as its page does', () => {
    expect(reachQueries(listingAtVenue).map((q) => q.q)).toEqual(['Front Bar Trivia', 'The Local', 'The Local'])
  })

  it("an organiser's own event is searched by its organisation's name", () => {
    expect(reachQueries(organisersOwn).find((q) => q.kind === 'organiser')?.q).toBe('Harbourline Presents')
  })

  it('a placeholder name is never searched', () => {
    const noVenue = { ...listingAtVenue, venue_name: null }
    expect(reachQueries(noVenue).map((q) => q.kind)).toEqual(['title'])
  })
})

describe('search reach: the judgement', () => {
  const live = [coa, listingAtVenue, organisersOwn]
  const seasonOf = new Map(live.map((e) => [e.slug, seasonKey(e)]))
  const counts = seasonsByName(live)

  it('RED ON THE DEFECT: asia oasis answering no results is a miss', () => {
    const v = judgeReach(coa, { kind: 'organiser', q: 'Asia Oasis' }, [], seasonOf, counts)
    expect(v).toMatchObject({ found: false, needed: 'top3', at: null })
  })

  it('found in the top three passes; fourth place fails a title', () => {
    expect(judgeReach(coa, { kind: 'title', q: coa.title }, ['x', coa.slug], seasonOf, counts)).toMatchObject({ found: true, at: 2 })
    expect(judgeReach(coa, { kind: 'title', q: coa.title }, ['w', 'x', 'y', coa.slug], seasonOf, counts)).toMatchObject({ found: false, at: 4 })
  })

  it("another dated row of the same season counts as the event's own", () => {
    const sister = 'colours-of-asia-garden-of-wonders-asia-oasis-2026-11-21'
    const withSister = new Map([...seasonOf, [sister, seasonKey(coa)]])
    expect(judgeReach(coa, { kind: 'title', q: coa.title }, [sister], withSister, counts).found).toBe(true)
  })

  it('a name holding more than three seasons needs the first page, not the top three', () => {
    const crowded = new Map([['the local', 12]])
    const v = judgeReach(listingAtVenue, { kind: 'venue', q: 'The Local' }, ['a', 'b', 'c', 'd', listingAtVenue.slug], seasonOf, crowded)
    expect(v).toMatchObject({ found: true, needed: 'first page', at: 5 })
  })
})

describe('search reach: reading a results page', () => {
  it('takes the event pages in order, once each, never a browse page', () => {
    const html = '<a href="/events/b-1">x</a><a href="/events/browse/geelong">g</a><a href="/events/a-2">y</a><a href="/events/b-1">z</a>'
    expect(resultSlugs(html)).toEqual(['b-1', 'a-2'])
  })
})
