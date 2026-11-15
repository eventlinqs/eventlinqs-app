import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { dayInWeek, planCampaign, spotlightsFromDay, type CampaignCity, type CampaignNight } from '@/lib/social/campaign'

/*
 * THE SPOTLIGHTS DRAWN FROM TOMORROW (the PM's 09:35 of 16 November 2026, item 3): out-14's Melbourne category spotlight
 * and its venue spotlight (JazzLab) each carried Monday 16 November's 7:30 pm night, drawn that Monday; the week's plan
 * gives the one Monday evening feed band to the week ahead, and a piece is held whole once any of its nights has ended,
 * so neither could have gone. A spotlight drawn on a day of the week takes nights from the next day on.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const WEEK = '2026-11-16'
const CITIES: CampaignCity[] = [{ slug: 'melbourne', name: 'Melbourne' }]

let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { tiers: [{ price: 4500 }] })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `jazz-night-${seq}`,
    title: `Jazz Night ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: 'JazzLab',
    host: 'JazzLab',
    categorySlug: 'music',
    summary: 'A quartet in the main room. Doors at seven.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $45' }),
    ...over,
  }
}

// Melbourne's week as out-14 drew it in shape: JazzLab Monday to Thursday at 7:30 pm (UTC+11), and other rooms beside.
const jazz = ['2026-11-16T08:30:00Z', '2026-11-17T08:30:00Z', '2026-11-18T08:30:00Z', '2026-11-19T08:30:00Z'].map((at) => night({ at }))
const others = [
  night({ at: '2026-11-16T09:00:00Z', host: 'The Forum', venueName: 'Forum Melbourne', title: 'Monday Headliner' }),
  night({ at: '2026-11-18T09:00:00Z', host: 'Corner Hotel', venueName: 'Corner Hotel', title: 'Wednesday Band' }),
  night({ at: '2026-11-20T09:00:00Z', host: 'Northcote Social Club', venueName: 'Northcote Social Club', title: 'Friday Band' }),
  night({ at: '2026-11-21T09:00:00Z', host: 'The Croxton', venueName: 'The Croxton', title: 'Saturday Band' }),
]
const all = [...jazz, ...others]
const spotlightNights = (from: number) => {
  const plan = planCampaign({ nights: all, cities: CITIES, weekStart: WEEK, origin: ORIGIN, spotlightsFrom: from })
  return plan.pieces.filter((p) => p.kind === 'venue_spotlight' || p.kind === 'category_spotlight')
}

describe('the spotlights drawn from tomorrow', () => {
  it("is tomorrow's day of the week on Melbourne's clock, and the whole week when drawn before it", () => {
    expect(spotlightsFromDay(new Date('2026-11-15T19:40:00Z'), WEEK)).toBe(1) // Monday 6:40 am, the planner's own run
    expect(spotlightsFromDay(new Date('2026-11-15T22:40:00Z'), WEEK)).toBe(1) // Monday 9:40 am
    expect(spotlightsFromDay(new Date('2026-11-17T12:00:00Z'), WEEK)).toBe(2) // Tuesday 11 pm: tomorrow is Wednesday, day 2
    expect(spotlightsFromDay(new Date('2026-11-17T13:30:00Z'), WEEK)).toBe(3) // half past midnight Wednesday: Thursday, day 3
    expect(spotlightsFromDay(new Date('2026-11-15T09:00:00Z'), WEEK)).toBe(0) // Sunday evening before the week
  })

  it("JazzLab's venue spotlight drawn on Monday carries Tuesday to Thursday, never Monday's night", () => {
    const [venue] = spotlightNights(1).filter((p) => p.kind === 'venue_spotlight')
    expect(venue).toBeDefined()
    expect(venue.eventIds).not.toContain(jazz[0].eventId)
    expect(venue.eventIds).toEqual(expect.arrayContaining([jazz[1].eventId, jazz[2].eventId, jazz[3].eventId]))
  })

  it('no spotlight night falls before the day it is drawn from', () => {
    for (const p of spotlightNights(1)) {
      for (const id of p.eventIds) {
        const n = all.find((x) => x.eventId === id) as CampaignNight
        expect(dayInWeek(n, WEEK)).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('drawn before the week begins, the whole week as before', () => {
    const [venue] = spotlightNights(0).filter((p) => p.kind === 'venue_spotlight')
    expect(venue.eventIds).toContain(jazz[0].eventId)
  })
})
