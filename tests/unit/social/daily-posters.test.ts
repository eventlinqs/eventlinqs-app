import { describe, expect, test } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import type { CampaignNight } from '@/lib/social/campaign'
import { planDailyPosters } from '@/lib/social/daily-posters'

/*
 * FAMILY F's PICKS (the daily poster directive, pipeline steps 1 and 2): one night per city per day of the week, by the
 * planner's ranking, a host on yesterday's poster passed over when the day holds another, and every pick keeping why it
 * was chosen and how its image was decided.
 */

let seq = 0
const night = (over: Partial<CampaignNight> & { startDate: string }): CampaignNight => {
  seq += 1
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `night-${seq}`,
    title: `Night ${seq}`,
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: 'Elephant & Castle',
    host: 'Elephant & Castle',
    categorySlug: 'nightlife',
    summary: 'Trivia in the front bar.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta: ctaFor({ entryMode: 'walk_in' }),
    priceLine: null,
    ...over,
  }
}
const CITIES = [{ slug: 'geelong', name: 'Geelong' }, { slug: 'ballarat', name: 'Ballarat' }]
const WEEK = '2026-11-02' // a Monday

describe('one night per city per day', () => {
  test('each day with nights gets one poster per city; a day without gets none', () => {
    const nights = [
      night({ startDate: '2026-11-05T08:00:00Z' }), // Thu
      night({ startDate: '2026-11-05T09:00:00Z', host: 'The House', venueName: 'The House' }),
      night({ startDate: '2026-11-06T10:30:00Z', host: "Beav's Bar" }), // Fri
      night({ startDate: '2026-11-07T10:00:00Z', citySlug: 'ballarat', cityName: 'Ballarat', host: 'Hop Temple' }), // Sat
    ]
    const picks = planDailyPosters({ nights, cities: CITIES, weekStart: WEEK })
    expect(picks.map((p) => `${p.city} ${p.day}`)).toEqual(['geelong 2026-11-05', 'geelong 2026-11-06', 'ballarat 2026-11-07'])
  })

  test('a host on yesterday\'s poster is passed over when the day holds another, and the reason says so', () => {
    const nights = [
      night({ startDate: '2026-11-05T08:00:00Z', host: 'Elephant & Castle' }),
      night({ startDate: '2026-11-06T08:00:00Z', host: 'Elephant & Castle' }),
      night({ startDate: '2026-11-06T09:00:00Z', host: "Beav's Bar", venueName: "Beav's Bar" }),
    ]
    const [thu, fri] = planDailyPosters({ nights, cities: CITIES.slice(0, 1), weekStart: WEEK })
    expect(thu.eventId).toBe(nights[0].eventId)
    expect(fri.eventId).toBe(nights[2].eventId)
    expect(fri.reason).toMatch(/Elephant & Castle was on yesterday's poster/)
  })

  test('the rights gate is recorded: photo-led only with an approved row, else type-led, each with its reason', () => {
    const nights = [
      night({ startDate: '2026-11-05T08:00:00Z', approvedPhotoUrl: 'https://x/approved.jpg', photoCredit: 'The House Geelong' }),
      night({ startDate: '2026-11-06T08:00:00Z', host: 'Other' }),
    ]
    const [a, b] = planDailyPosters({ nights, cities: CITIES.slice(0, 1), weekStart: WEEK })
    expect([a.rights, a.rightsReason]).toEqual(['photo', 'Photo-led: an approved register row for this night (The House Geelong).'])
    expect([b.rights, b.rightsReason]).toEqual(['type', 'Type-led: no approved photograph for this night on the register.'])
  })

  test('the same week gives the same posters, and a night left out by the founder is never one', () => {
    const nights = [night({ startDate: '2026-11-05T08:00:00Z' }), night({ startDate: '2026-11-05T09:00:00Z', host: 'B' })]
    const once = planDailyPosters({ nights, cities: CITIES, weekStart: WEEK })
    expect(planDailyPosters({ nights, cities: CITIES, weekStart: WEEK })).toEqual(once)
    const without = planDailyPosters({ nights, cities: CITIES, weekStart: WEEK, excluded: new Set([once[0].eventId]) })
    expect(without[0].eventId).not.toBe(once[0].eventId)
  })
})
