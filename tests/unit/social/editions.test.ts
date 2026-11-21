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
  { slug: 'sydney', name: 'Sydney' },
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
// Sydney: enough for both editions, but not an edition city (Ballarat and Bendigo joined on the PM's 15:35).
const sydney = [
  night({ at: '2026-10-28T09:00:00Z', citySlug: 'sydney', cityName: 'Sydney' }),
  night({ at: '2026-10-30T09:00:00Z', citySlug: 'sydney', cityName: 'Sydney' }),
  night({ at: '2026-10-31T09:00:00Z', citySlug: 'sydney', cityName: 'Sydney' }),
]
// Melbourne: one Friday night only, so no Tonight and Tomorrow; two comedy nights, so no spotlight.
const melbourne = [
  night({ at: '2026-10-30T09:00:00Z', citySlug: 'melbourne', cityName: 'Melbourne', categorySlug: 'comedy' }),
  night({ at: '2026-10-27T09:00:00Z', citySlug: 'melbourne', cityName: 'Melbourne', categorySlug: 'comedy' }),
]

const pieces = planCampaign({ nights: [...geelong, ...sydney, ...melbourne], cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces
/* A busy week (the PM's 16:40 fix 3: two list posts in one city and one week share at most one night): five headline
   nights Monday to Thursday carry the week post, so the later list posts have nights of their own. */
function busyWeek(at: (o: Partial<CampaignNight> & { at: string; state?: CtaInput }) => CampaignNight) {
  const h = (when: string, venue: string, categorySlug: string) => at({ at: when, venueName: venue, host: venue, categorySlug, state: { tiers: [{ price: 9900 }] } })
  return [
    h('2026-10-26T09:00:00Z', 'Costa Hall', 'theatre'),
    h('2026-10-27T09:00:00Z', 'Rod Laver Arena', 'sport'),
    h('2026-10-27T10:00:00Z', 'Hamer Hall', 'dance'),
    h('2026-10-28T09:00:00Z', 'Palais Theatre', 'family'),
    h('2026-10-29T09:00:00Z', 'Regent Theatre', 'arts'),
  ]
}
/* The busy Geelong week for the later list posts: Friday comedy, Saturday nightlife, a Sunday market, and four weekday
   music nights at their own venues (music the week's strongest category, none of them in the week post). */
const busyFri = ['2026-10-30T08:00:00Z', '2026-10-30T09:00:00Z', '2026-10-30T10:00:00Z'].map((at) => night({ at, categorySlug: 'comedy' }))
const busySat = ['2026-10-31T08:00:00Z', '2026-10-31T09:00:00Z', '2026-10-31T10:00:00Z'].map((at) => night({ at, categorySlug: 'nightlife' }))
const busySun = [night({ at: '2026-11-01T05:00:00Z', categorySlug: 'markets' })]
const busyMusic = ['2026-10-27T11:00:00Z', '2026-10-28T11:00:00Z', '2026-10-28T12:00:00Z', '2026-10-29T11:00:00Z'].map((at) => night({ at }))
const busyPieces = planCampaign({ nights: [...busyWeek(night), ...busyFri, ...busySat, ...busySun, ...busyMusic], cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces
const ofBusy = (kind: string) => busyPieces.filter((x) => (x.kind as string) === kind && x.city === 'geelong')
const of = (kind: string, city?: string) => pieces.filter((p) => (p.kind as string) === kind && (city === undefined || p.city === city))

describe('the edition cities', () => {
  it('are Geelong then Melbourne, held in one place', () => {
    expect(EDITION_CITIES).toEqual(['melbourne', 'geelong', 'ballarat', 'bendigo'])
  })
  it('plan no new edition for a city not yet on the list, however many nights it has', () => {
    expect(of('tonight_tomorrow', 'sydney')).toHaveLength(0)
    expect(of('category_spotlight', 'sydney')).toHaveLength(0)
  })
})

describe("Friday's Tonight and Tomorrow", () => {
  const [p] = ofBusy('tonight_tomorrow')

  it('drops itself when its list would be the weekend\'s own: no two posts share a list (fix 3)', () => {
    expect(of('tonight_tomorrow', 'geelong')).toHaveLength(0)
    const lists = pieces.filter((x) => x.city === 'geelong' && x.slides.some((s) => s.t === 'week_cover')).map((x) => `${x.format}|${[...x.eventIds].sort().join(',')}`)
    expect(new Set(lists).size).toBe(lists.length)
  })

  it('the weekend holds Friday, Saturday and Sunday', () => {
    expect(new Set(ofBusy('weekend_carousel')[0].eventIds)).toContain(busySun[0].eventId)
  })

  it('two list posts in the city share at most one night (the PM\'s 16:40 fix 3)', () => {
    const lists = busyPieces.filter((x) => x.city === 'geelong' && x.format === 'feed' && x.slides.some((s) => s.t === 'week_cover'))
    for (const a of lists) for (const b of lists) if (a !== b) expect(a.eventIds.filter((id) => b.eventIds.includes(id)).length).toBeLessThanOrEqual(1)
  })

  it("holds the city's Friday and Saturday nights only", () => {
    expect(ofBusy('tonight_tomorrow')).toHaveLength(1)
    const friSat = new Set([...busyFri, ...busySat].map((n) => n.eventId))
    expect(p.eventIds.length).toBeGreaterThanOrEqual(2)
    for (const id of p.eventIds) expect(friSat.has(id)).toBe(true)
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
  const [p] = ofBusy('category_spotlight')

  it("takes the city's strongest category of the week, three nights or more, none of them already in a list post", () => {
    expect(ofBusy('category_spotlight')).toHaveLength(1)
    expect(new Set(p.eventIds)).toEqual(new Set(busyMusic.map((n) => n.eventId)))
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
    expect(of('week_ahead', 'sydney')).toHaveLength(1)
    expect(of('weekend_carousel', 'geelong')).toHaveLength(1)
  })
})

// Typed use, so a kind the planner cannot hold fails tsc as well as the test.
const _kinds: PiecePlan['kind'][] = ['tonight_tomorrow', 'category_spotlight']
void _kinds
