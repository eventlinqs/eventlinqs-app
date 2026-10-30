import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { EDITION_CITIES, planCampaign, type CampaignCity, type CampaignNight, type PiecePlan } from '@/lib/social/campaign'

/*
 * D5, THE OWNED EDITIONS (Lawal's final directive of 30 October 2026, section 5; the blueprint's 'Thursday: what's on
 * this weekend. Friday: tonight and tomorrow. Sunday/Monday: next week's highlights'). The planner already made Monday's
 * week ahead, Thursday's weekend guide and Friday's venue spotlight; these are the two it did not: Friday's TONIGHT AND
 * TOMORROW and a CATEGORY SPOTLIGHT, Geelong and Melbourne first, every other rule of a piece kept (one audience, one
 * objective, one measured outcome, Instagram and Facebook versions, typographic unless a rights row is approved).
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const WEEK = '2026-10-26' // Monday
const CITIES: CampaignCity[] = [
  { slug: 'geelong', name: 'Geelong' },
  { slug: 'ballarat', name: 'Ballarat' },
  { slug: 'melbourne', name: 'Melbourne' },
]

let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { tiers: [{ price: 2500 }] })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `bp-edition-${seq}`,
    title: `Bp Edition ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    // Each night at its own venue: the planner keeps at most two of one venue in a set (K6), which is not under test here.
    venueName: `Venue ${seq}`,
    host: `Host ${seq}`,
    categorySlug: 'music',
    summary: 'A night of local bands in the front bar. Doors at seven.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $25' }),
    ...over,
  }
}

// Geelong: music Tue, Thu, Fri, Sat (four music nights), a family market Saturday.
const geelong = [
  night({ at: '2026-10-27T09:00:00Z' }), // Tue 8pm
  night({ at: '2026-10-29T09:00:00Z' }), // Thu 8pm
  night({ at: '2026-10-30T09:00:00Z' }), // Fri 8pm
  night({ at: '2026-10-31T09:00:00Z' }), // Sat 8pm
  night({ at: '2026-10-31T00:00:00Z', categorySlug: 'family', title: 'Bp Market' }), // Sat 11am
]
// Ballarat: enough for both editions, but not yet an edition city.
const ballarat = [
  night({ at: '2026-10-28T09:00:00Z', citySlug: 'ballarat', cityName: 'Ballarat' }),
  night({ at: '2026-10-30T09:00:00Z', citySlug: 'ballarat', cityName: 'Ballarat' }),
  night({ at: '2026-10-31T09:00:00Z', citySlug: 'ballarat', cityName: 'Ballarat' }),
]
// Melbourne: one Friday night only, so no Tonight and Tomorrow; two comedy nights, so no spotlight.
const melbourne = [
  night({ at: '2026-10-30T09:00:00Z', citySlug: 'melbourne', cityName: 'Melbourne', categorySlug: 'comedy' }),
  night({ at: '2026-10-27T09:00:00Z', citySlug: 'melbourne', cityName: 'Melbourne', categorySlug: 'comedy' }),
]

const pieces = planCampaign({ nights: [...geelong, ...ballarat, ...melbourne], cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces
const of = (kind: string, city?: string) => pieces.filter((p) => (p.kind as string) === kind && (city === undefined || p.city === city))

describe('the edition cities', () => {
  it('are Geelong then Melbourne, held in one place', () => {
    expect(EDITION_CITIES).toEqual(['geelong', 'melbourne'])
  })
  it('plan no new edition for a city not yet on the list, however many nights it has', () => {
    expect(of('tonight_tomorrow', 'ballarat')).toHaveLength(0)
    expect(of('category_spotlight', 'ballarat')).toHaveLength(0)
  })
})

describe("Friday's Tonight and Tomorrow", () => {
  const [p] = of('tonight_tomorrow', 'geelong')

  it("holds the city's Friday and Saturday nights only", () => {
    expect(of('tonight_tomorrow', 'geelong')).toHaveLength(1)
    expect(new Set(p.eventIds)).toEqual(new Set([geelong[2].eventId, geelong[3].eventId, geelong[4].eventId]))
  })

  it('names the days, never a relative word that goes stale if it posts late', () => {
    const words = [p.caption, p.versions.instagram.caption, p.versions.facebook.caption, ...p.slides.map((s) => JSON.stringify(s))].join(' ')
    expect(words).toContain('Friday and Saturday in Geelong')
    expect(words).not.toMatch(/\btonight\b|\btomorrow\b/i)
  })

  it('is a whole piece: one audience, one objective, its own outcome, both platforms, to the city page', () => {
    expect(p.audience).toBe('attendees')
    expect(p.objective).toBe('audience_growth')
    expect(p.outcome).toMatch(/through this post's own link/)
    expect(p.link).toBe(`${ORIGIN}/city/geelong`)
    expect(p.versions.instagram.caption).toContain('Friday and Saturday in Geelong')
    expect(p.versions.facebook.cta).toContain(`${ORIGIN}/city/geelong`)
  })

  it('is not planned with fewer than two nights', () => {
    expect(of('tonight_tomorrow', 'melbourne')).toHaveLength(0)
  })
})

describe('the Category Spotlight', () => {
  const [p] = of('category_spotlight', 'geelong')

  it("takes the city's strongest category of the week, three nights or more", () => {
    expect(of('category_spotlight', 'geelong')).toHaveLength(1)
    expect(new Set(p.eventIds)).toEqual(new Set(geelong.slice(0, 4).map((n) => n.eventId)))
  })

  it('names the category and links to its filtered view in the city', () => {
    expect(p.caption).toContain('Music in Geelong this week')
    expect(p.link).toBe(`${ORIGIN}/events?city=geelong&category=music`)
  })

  it('is not planned under three nights of one category', () => {
    expect(of('category_spotlight', 'melbourne')).toHaveLength(0)
  })
})

describe('the pieces already planned', () => {
  it('are unchanged: the week ahead and the weekend guide still plan for every guide city', () => {
    expect(of('week_ahead', 'ballarat')).toHaveLength(1)
    expect(of('weekend_carousel', 'geelong')).toHaveLength(1)
  })
})

// Typed use, so a kind the planner cannot hold fails tsc as well as the test.
const _kinds: PiecePlan['kind'][] = ['tonight_tomorrow', 'category_spotlight']
void _kinds
