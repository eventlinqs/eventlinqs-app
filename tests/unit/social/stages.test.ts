import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine } from '@/lib/events/cta'
import { planCampaign, type CampaignCity, type CampaignNight } from '@/lib/social/campaign'
import { campaignStageOf, daysToStart } from '@/lib/social/stages'

/*
 * D2, THE DEADLINE-AWARE STAGES (Lawal's final blueprint, section 4, 30 October 2026): T-30 to 21 launch and awareness,
 * T-20 to 8 consideration, T-7 to 2 final week, T-1 to 0 last mile, T+1 to 7 reporting. A stage comes from the days left
 * alone, so a night found three days out starts at its own stage and skips the rest. The blueprint: 'initial operating
 * design, not proven universal booking patterns'.
 */

const NOW = new Date('2026-10-26T01:00:00Z') // Monday 12pm in Melbourne
const at = (iso: string) => ({ startDate: iso, timezone: 'Australia/Melbourne' })

describe('the stage of a night', () => {
  it('counts whole calendar days in the night\'s own zone', () => {
    expect(daysToStart(at('2026-10-26T09:00:00Z'), NOW)).toBe(0)
    expect(daysToStart(at('2026-10-27T12:59:00Z'), NOW)).toBe(1) // Tue 11:59pm
    expect(daysToStart(at('2026-10-27T13:01:00Z'), NOW)).toBe(2) // Wed 12:01am
  })
  it.each([
    [31, null],
    [30, 'launch'],
    [21, 'launch'],
    [20, 'consideration'],
    [8, 'consideration'],
    [7, 'final_week'],
    [2, 'final_week'],
    [1, 'last_mile'],
    [0, 'last_mile'],
    [-1, 'reporting'],
    [-7, 'reporting'],
    [-8, null],
  ])('%i days out is %s', (days, stage) => {
    const start = new Date(NOW.getTime() + days * 86_400_000).toISOString()
    expect(campaignStageOf(at(start), NOW)).toBe(stage)
  })
})

const ORIGIN = 'https://www.eventlinqs.com.au'
const WEEK = '2026-10-26'
const CITIES: CampaignCity[] = [
  { slug: 'geelong', name: 'Geelong' },
  { slug: 'ballarat', name: 'Ballarat' },
]
let seq = 0
function night(iso: string, over: Partial<CampaignNight> = {}): CampaignNight {
  seq += 1
  const cta = ctaFor({ tiers: [{ price: 2500 }] })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `bp-stage-${seq}`,
    title: `Bp Stage ${seq}`,
    startDate: iso,
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: `Venue ${seq}`,
    host: `Host ${seq}`,
    categorySlug: `cat-${seq}`,
    summary: 'A night of local bands in the front bar. Doors at seven.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $25' }),
    ...over,
  }
}

describe('the Coming Up edition, the consideration stage', () => {
  const thisWeek = night('2026-10-30T09:00:00Z')
  const soon = [night('2026-11-04T09:00:00Z'), night('2026-11-10T09:00:00Z'), night('2026-11-15T09:00:00Z')] // days 9, 15, 20
  const tooFar = night('2026-11-17T09:00:00Z') // day 22
  const ballarat = [night('2026-11-05T09:00:00Z', { citySlug: 'ballarat', cityName: 'Ballarat' }), night('2026-11-06T09:00:00Z', { citySlug: 'ballarat', cityName: 'Ballarat' })]
  const { pieces } = planCampaign({ nights: [thisWeek, ...soon, tooFar, ...ballarat], cities: CITIES, weekStart: WEEK, origin: ORIGIN })
  const coming = pieces.filter((p) => p.kind === 'coming_up')

  it("holds the edition city's nights 8 to 20 days from the week's start, and no other", () => {
    expect(coming).toHaveLength(1)
    expect(coming[0].city).toBe('geelong')
    expect(new Set(coming[0].eventIds)).toEqual(new Set(soon.map((n) => n.eventId)))
  })

  it('prints each night\'s date, as a weekday alone would mislead this far out', () => {
    expect(coming[0].caption).toMatch(/Wed 4 Nov/)
    expect(coming[0].caption.match(/Wed 4 Nov/g)).toHaveLength(1) // once: a fact is never said twice
    const cover = coming[0].slides[0] as { contents: string[] }
    expect(cover.contents[0]).toContain('4 Nov')
  })

  it('is a whole piece to the city page', () => {
    expect(coming[0].audience).toBe('attendees')
    expect(coming[0].link).toBe(`${ORIGIN}/city/geelong`)
    expect(coming[0].outcome).toMatch(/through this post's own link/)
  })

  it('leaves the pieces of the week alone: no later night reaches them', () => {
    for (const p of pieces.filter((x) => x.kind === 'week_ahead' || x.kind === 'weekend_carousel')) {
      for (const id of soon.map((n) => n.eventId)) expect(p.eventIds).not.toContain(id)
    }
  })

  it('is not planned with fewer than two nights', () => {
    const one = planCampaign({ nights: [soon[0]], cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces
    expect(one.filter((p) => p.kind === 'coming_up')).toHaveLength(0)
  })
})
