import { describe, it, expect } from 'vitest'
import {
  rankEventsByAffinity,
  hasAnyAffinitySignal,
  AFFINITY_WEIGHTS,
  type AffinitySignals,
} from '@/lib/events/affinity'
import type { PublicEventRow } from '@/lib/events/types'

// Fixed clock so recency and the upcoming/expired cut are deterministic.
const NOW = new Date('2026-06-24T00:00:00.000Z')

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

function evt(over: Partial<PublicEventRow> & { id: string }): PublicEventRow {
  return {
    id: over.id,
    slug: over.slug ?? `slug-${over.id}`,
    title: over.title ?? `Event ${over.id}`,
    summary: null,
    description: null,
    cover_image_url: over.cover_image_url ?? 'https://cdn.example/cover.avif',
    thumbnail_url: null,
    gallery_urls: null,
    start_date: over.start_date ?? daysFromNow(10),
    end_date: over.end_date ?? daysFromNow(10),
    venue_name: over.venue_name ?? 'Venue',
    venue_city: over.venue_city ?? 'Sydney',
    venue_country: over.venue_country ?? 'AU',
    venue_latitude: null,
    venue_longitude: null,
    created_at: NOW.toISOString(),
    is_free: false,
    category: over.category ?? { id: 'cat-music', name: 'Music', slug: 'music' },
    organisation: over.organisation ?? { id: 'org-x', name: 'Org X', slug: 'org-x' },
    ticket_tiers: over.ticket_tiers ?? [],
    badge: null,
  }
}

function emptySignals(): AffinitySignals {
  return {
    followedOrganisationIds: new Set(),
    savedCategoryIds: new Set(),
    followedArtistEventIds: new Set(),
    followedSceneSlugs: new Set(),
    savedEventCategoryIds: new Set(),
    preferredCity: null,
  }
}

describe('rankEventsByAffinity', () => {
  it('ranks a followed-organiser event above an unrelated event', () => {
    const followed = evt({ id: 'a', organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' } })
    const unrelated = evt({ id: 'b', organisation: { id: 'org-rand', name: 'Rand', slug: 'rand' }, category: null })

    const signals = emptySignals()
    signals.followedOrganisationIds = new Set(['org-fav'])

    const ranked = rankEventsByAffinity([unrelated, followed], signals, NOW)

    // Unrelated event has zero affinity, so it is dropped entirely; the
    // followed-organiser event is the only result and ranks first.
    expect(ranked.map(r => r.event.id)).toEqual(['a'])
    expect(ranked[0].reasons).toContain('followed-organiser')
  })

  it('keeps a directly-followed event above a city-only match', () => {
    const followedOrg = evt({
      id: 'a',
      organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' },
      venue_city: 'Brisbane',
      category: null,
    })
    const cityOnly = evt({
      id: 'b',
      organisation: { id: 'org-rand', name: 'Rand', slug: 'rand' },
      venue_city: 'Melbourne',
      category: null,
    })

    const signals = emptySignals()
    signals.followedOrganisationIds = new Set(['org-fav'])
    signals.preferredCity = 'Melbourne'

    const ranked = rankEventsByAffinity([cityOnly, followedOrg], signals, NOW)

    expect(ranked.map(r => r.event.id)).toEqual(['a', 'b'])
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })

  it('boosts events in the preferred city (ilike-style containment)', () => {
    const inCity = evt({ id: 'a', venue_city: 'Melbourne, VIC', category: null, organisation: { id: 'o1', name: 'A', slug: 'a' } })
    const otherCity = evt({ id: 'b', venue_city: 'Perth', category: null, organisation: { id: 'o2', name: 'B', slug: 'b' } })

    const signals = emptySignals()
    signals.preferredCity = 'Melbourne'

    const ranked = rankEventsByAffinity([otherCity, inCity], signals, NOW)

    // Only the city match carries a signal; the other is dropped.
    expect(ranked.map(r => r.event.id)).toEqual(['a'])
    expect(ranked[0].reasons).toContain('preferred-city')
  })

  it('excludes past and expired events', () => {
    const past = evt({ id: 'past', start_date: daysFromNow(-5), organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' } })
    const future = evt({ id: 'future', start_date: daysFromNow(3), organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' } })

    const signals = emptySignals()
    signals.followedOrganisationIds = new Set(['org-fav'])

    const ranked = rankEventsByAffinity([past, future], signals, NOW)

    expect(ranked.map(r => r.event.id)).toEqual(['future'])
  })

  it('breaks affinity ties by soonest start date', () => {
    const soon = evt({ id: 'soon', start_date: daysFromNow(2), organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' } })
    const later = evt({ id: 'later', start_date: daysFromNow(40), organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' } })

    const signals = emptySignals()
    signals.followedOrganisationIds = new Set(['org-fav'])

    const ranked = rankEventsByAffinity([later, soon], signals, NOW)

    // Same affinity weight (both followed org), recency lifts the sooner one.
    expect(ranked.map(r => r.event.id)).toEqual(['soon', 'later'])
  })

  it('the recency tie-break never lifts an unrelated event above a followed one', () => {
    // A followed event that is far out (40 days) must still beat a soon
    // city-only event, proving recency cannot cross affinity bands.
    const followedFar = evt({
      id: 'followed',
      start_date: daysFromNow(40),
      venue_city: 'Hobart',
      category: null,
      organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' },
    })
    const cityNear = evt({
      id: 'city',
      start_date: daysFromNow(1),
      venue_city: 'Sydney',
      category: null,
      organisation: { id: 'org-rand', name: 'Rand', slug: 'rand' },
    })

    const signals = emptySignals()
    signals.followedOrganisationIds = new Set(['org-fav'])
    signals.preferredCity = 'Sydney'

    const ranked = rankEventsByAffinity([cityNear, followedFar], signals, NOW)

    expect(ranked[0].event.id).toBe('followed')
  })

  it('returns an empty ranking when the graph has no signals (fallback handled by caller)', () => {
    const events = [evt({ id: 'a' }), evt({ id: 'b' })]
    const ranked = rankEventsByAffinity(events, emptySignals(), NOW)
    expect(ranked).toEqual([])
  })

  it('produces a stable order across runs (deterministic id tie-break)', () => {
    const e1 = evt({ id: 'zzz', start_date: daysFromNow(10), organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' } })
    const e2 = evt({ id: 'aaa', start_date: daysFromNow(10), organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' } })

    const signals = emptySignals()
    signals.followedOrganisationIds = new Set(['org-fav'])

    const first = rankEventsByAffinity([e1, e2], signals, NOW).map(r => r.event.id)
    const second = rankEventsByAffinity([e2, e1], signals, NOW).map(r => r.event.id)

    expect(first).toEqual(second)
    expect(first).toEqual(['aaa', 'zzz'])
  })

  it('adds artist and scene/category signals on top of each other', () => {
    const stacked = evt({
      id: 'stacked',
      organisation: { id: 'org-fav', name: 'Fav', slug: 'fav' },
      category: { id: 'cat-fav', name: 'Music', slug: 'music' },
    })
    const single = evt({
      id: 'single',
      organisation: { id: 'org-rand', name: 'Rand', slug: 'rand' },
      category: { id: 'cat-fav', name: 'Music', slug: 'music' },
    })

    const signals = emptySignals()
    signals.followedOrganisationIds = new Set(['org-fav'])
    signals.savedCategoryIds = new Set(['cat-fav'])
    signals.followedArtistEventIds = new Set(['stacked'])

    const ranked = rankEventsByAffinity([single, stacked], signals, NOW)

    expect(ranked[0].event.id).toBe('stacked')
    // stacked = organiser + category + artist; single = category only.
    const stackedScore = ranked.find(r => r.event.id === 'stacked')!.score
    const singleScore = ranked.find(r => r.event.id === 'single')!.score
    expect(stackedScore - singleScore).toBeGreaterThanOrEqual(
      AFFINITY_WEIGHTS.followedOrganiser + AFFINITY_WEIGHTS.followedArtist - 1,
    )
  })
})

describe('hasAnyAffinitySignal', () => {
  it('is false for a fully empty graph', () => {
    expect(hasAnyAffinitySignal(emptySignals())).toBe(false)
  })

  it('is true when any single signal is present', () => {
    const s = emptySignals()
    s.preferredCity = 'Sydney'
    expect(hasAnyAffinitySignal(s)).toBe(true)
  })
})
