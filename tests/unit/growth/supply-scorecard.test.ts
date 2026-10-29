import { describe, expect, it } from 'vitest'
import { MARKETS, supplyScorecard, type SupplyNight, type SupplyRows } from '@/lib/growth/supply-scorecard-math'

/**
 * D9, the weekly supply scorecard per city (the master mandate of 29 October 2026, section 9: verified upcoming, new,
 * expiring, cancelled, awaiting verification, with approved imagery, active and recurring suppliers, gaps by city and
 * category). Success is the count of accurate, useful, upcoming events, not one feed per city.
 */

const NOW = new Date('2026-10-29T11:00:00Z') // Thursday 29 October, 22:00 in Melbourne
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()
const LIB = 'https://x.supabase.co/storage/v1/object/public/event-images/stock/arts/gallery-day-1440.avif'
const OWN = 'https://x.supabase.co/storage/v1/object/public/event-images/covers/abc.avif'
const TYPE = 'https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/ev-1/cover-1440.avif'

const night = (over: Partial<SupplyNight>): SupplyNight => ({
  id: 'n',
  city: 'melbourne',
  categoryId: 'music',
  status: 'published',
  publishedAt: at(-20),
  startDate: at(3),
  endDate: at(3.2),
  freshUntil: at(15),
  coverUrl: OWN,
  organisationId: 'org-a',
  seriesId: null,
  isRecurring: false,
  isSeed: false,
  updatedAt: at(-20),
  ...over,
})

const rows = (over: Partial<SupplyRows> = {}): SupplyRows => ({
  nights: [],
  cancelled: [],
  waiting: [],
  categories: [
    { id: 'music', name: 'Music' },
    { id: 'comedy', name: 'Comedy' },
    { id: 'family', name: 'Family' },
  ],
  listingsOrganisationId: 'org-listings',
  ...over,
})

const city = (s: ReturnType<typeof supplyScorecard>, slug: string) => s.cities.find((c) => c.city === slug)

describe('supplyScorecard', () => {
  it('always lists the four initial markets first, then any other city with supply', () => {
    const s = supplyScorecard(rows({ nights: [night({ id: 'a', city: 'sydney' })] }), NOW)
    expect(s.cities.map((c) => c.city)).toEqual([...MARKETS, 'sydney'])
    expect(MARKETS).toEqual(['melbourne', 'geelong', 'ballarat', 'bendigo'])
  })

  it('counts a night as verified upcoming only while it is published, ahead within 90 days, fresh and real', () => {
    const s = supplyScorecard(
      rows({
        nights: [
          night({ id: 'ok' }),
          night({ id: 'stale', freshUntil: at(-1) }),
          night({ id: 'no-freshness-needed', freshUntil: null }),
          night({ id: 'too-far', startDate: at(91), endDate: at(91.2) }),
          night({ id: 'ended', startDate: at(-2), endDate: at(-1.9) }),
          night({ id: 'on-now', startDate: at(-0.1), endDate: at(0.1) }),
          night({ id: 'seed', isSeed: true }),
          night({ id: 'draft', status: 'draft' }),
        ],
      }),
      NOW,
    )
    expect(city(s, 'melbourne')?.verifiedUpcoming).toBe(3) // ok, no-freshness-needed, on-now
  })

  it('counts new as published in the last seven days, expiring as freshness lapsing within seven', () => {
    const s = supplyScorecard(
      rows({
        nights: [
          night({ id: 'new', publishedAt: at(-2) }),
          night({ id: 'old', publishedAt: at(-9) }),
          night({ id: 'lapsing', freshUntil: at(4) }),
          night({ id: 'lapsed', freshUntil: at(-1) }),
        ],
      }),
      NOW,
    )
    expect(city(s, 'melbourne')?.newThisWeek).toBe(1)
    expect(city(s, 'melbourne')?.expiringSoon).toBe(1)
  })

  it('counts cancellations of the last seven days and collected events waiting, by their city', () => {
    const s = supplyScorecard(
      rows({
        cancelled: [
          { city: 'geelong', updatedAt: at(-1), isSeed: false },
          { city: 'geelong', updatedAt: at(-10), isSeed: false },
          { city: 'geelong', updatedAt: at(-1), isSeed: true },
        ],
        waiting: [{ city: 'geelong' }, { city: 'geelong' }, { city: null }],
      }),
      NOW,
    )
    expect(city(s, 'geelong')?.cancelledThisWeek).toBe(1)
    expect(city(s, 'geelong')?.awaitingVerification).toBe(2)
    expect(s.waitingWithNoCity).toBe(1)
  })

  it('counts approved imagery as an image supplied for the night, never a library photograph or a cover we composed', () => {
    const s = supplyScorecard(
      rows({ nights: [night({ id: 'own' }), night({ id: 'lib', coverUrl: LIB }), night({ id: 'type', coverUrl: TYPE }), night({ id: 'none', coverUrl: null })] }),
      NOW,
    )
    expect(city(s, 'melbourne')?.withApprovedImagery).toBe(1)
  })

  it('counts active organisers without the listings account, and recurring suppliers by series or recurring nights', () => {
    const s = supplyScorecard(
      rows({
        nights: [
          night({ id: 'a1', organisationId: 'org-a', isRecurring: true }),
          night({ id: 'a2', organisationId: 'org-a', isRecurring: true }),
          night({ id: 'b1', organisationId: 'org-b' }),
          night({ id: 'l1', organisationId: 'org-listings', seriesId: 'series-trivia' }),
          night({ id: 'l2', organisationId: 'org-listings', seriesId: 'series-trivia' }),
          night({ id: 'l3', organisationId: 'org-listings', seriesId: 'series-jazz' }),
        ],
      }),
      NOW,
    )
    expect(city(s, 'melbourne')?.activeOrganisers).toBe(2) // org-a, org-b; never the listings account
    expect(city(s, 'melbourne')?.recurringSuppliers).toBe(3) // org-a (recurring), series-trivia, series-jazz
  })

  it('names the categories with nothing verified upcoming as the city\'s gaps', () => {
    const s = supplyScorecard(rows({ nights: [night({ id: 'm', categoryId: 'music' }), night({ id: 's', categoryId: 'family', freshUntil: at(-1) })] }), NOW)
    expect(city(s, 'melbourne')?.gaps).toEqual(['Comedy', 'Family'])
    expect(city(s, 'geelong')?.gaps).toEqual(['Comedy', 'Family', 'Music'])
  })
})
