import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { dateOf, nightWords, pieceRefusal, planCampaign, type CampaignCity, type CampaignNight } from '@/lib/social/campaign'
import { withoutCredits } from '@/lib/social/store'

/*
 * THE PLANNER UNDER THE APPROVED TREATMENTS (Lawal, 28 October 2026 19:52; the engine plan's parts D and F). Every word
 * a night's slide carries comes from its stored facts: the entry line only where section E allows it, the action as the
 * five states word it, several days said as a span. The weekend brand piece names no night, so a photograph on it is
 * never taken for one, and with no licensed photograph it is EventLinqs' own art. The sweep takes a withdrawn image's
 * credit out of the words.
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const WEEK = '2026-10-26'
const CITIES: CampaignCity[] = [
  { slug: 'geelong', name: 'Geelong' },
  { slug: 'melbourne', name: 'Melbourne' },
]

let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { entryMode: 'walk_in', isFree: true })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `bp-night-${seq}`,
    title: `Bp Night ${seq}`,
    startDate: over.at,
    endDate: null,
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: 'The Barwon Club',
    host: 'The Barwon Club',
    categorySlug: 'music',
    summary: 'A night of local bands in the front bar.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $25' }),
    ...over,
  }
}

describe("a night's words, from its facts alone", () => {
  it('a free walk-in says so, and its action is to view the details (E1)', () => {
    const w = nightWords(night({ at: '2026-10-31T09:00:00Z' }))
    expect(w).toMatchObject({ entry: 'Free, no ticket needed', action: 'View event details', eyebrow: 'Live at The Barwon Club', city: 'Geelong' })
  })
  it('an outside ticketed night names its provider and never claims EventLinqs ticketing (E4, E7)', () => {
    const w = nightWords(night({ at: '2026-10-31T09:00:00Z', state: { externalTicketUrl: 'https://www.geelongartscentre.org.au/x', providerName: 'Geelong Arts Centre' } }))
    expect(w.action).toBe('View tickets at Geelong Arts Centre')
    expect(w.entry ?? '').not.toMatch(/free|eventlinqs/i)
  })
  it('an outside night with no checked price says no price, never repeats where tickets are (E5)', () => {
    const w = nightWords(night({ at: '2026-10-31T09:00:00Z', state: { externalTicketUrl: 'https://www.geelongartscentre.org.au/x', providerName: 'Geelong Arts Centre' } }))
    expect(w.entry).toBeNull()
  })
  it('a price nobody stated is never said, and free is never inferred (E5, E6)', () => {
    const w = nightWords(night({ at: '2026-10-31T09:00:00Z', state: { tiers: [], isFree: false }, categorySlug: 'festival' }))
    expect(w.entry).toBeNull()
    expect(w.action).toBe('View event details')
    expect(w.eyebrow).toBe('At The Barwon Club')
  })
  it('a native ticketed night says its price and gets tickets (E3)', () => {
    const w = nightWords(night({ at: '2026-10-31T09:00:00Z', state: { tiers: [{ price: 2500 }] } }))
    expect(w.action).toBe('Get tickets')
    expect(w.entry).toBe('From $25')
  })
  it('a festival over three days says the span and when it opens, in Melbourne time', () => {
    const n = night({ at: '2026-11-20T00:00:00Z', endDate: '2026-11-22T09:00:00Z', venueName: 'Fed Square', categorySlug: 'festival' })
    expect(dateOf(n)).toBe('Fri 20 to Sun 22 Nov')
    expect(nightWords(n)).toMatchObject({ date: 'Fri 20 to Sun 22 Nov', time: 'From 11am', eyebrow: 'At Fed Square' })
  })
  it('a night that ends the same evening, or after midnight, is one date', () => {
    expect(dateOf(night({ at: '2026-10-31T09:00:00Z', endDate: '2026-10-31T14:00:00Z' }))).toBe('Sat 31 Oct')
    expect(dateOf(night({ at: '2026-10-31T10:00:00Z', endDate: '2026-10-31T16:00:00Z' }))).toBe('Sat 31 Oct')
  })
  it("the planner puts the words on every night's slide", () => {
    const { pieces } = planCampaign({ nights: [night({ at: '2026-10-29T09:00:00Z' }), night({ at: '2026-10-31T09:00:00Z' })], cities: CITIES, weekStart: WEEK, origin: ORIGIN })
    const slides = pieces.flatMap((p) => p.slides).filter((s) => s.t === 'night' || s.t === 'story')
    expect(slides.length).toBeGreaterThan(0)
    for (const s of slides) expect((s as { words?: unknown }).words).toBeDefined()
  })
})

describe('the weekend brand piece', () => {
  const week = [night({ at: '2026-10-29T09:00:00Z' }), night({ at: '2026-10-31T09:00:00Z', citySlug: 'melbourne', cityName: 'Melbourne' })]
  it('names no night, picks none, and is EventLinqs own art with no licensed photograph', () => {
    const brand = planCampaign({ nights: week, cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces.find((p) => p.kind === 'brand_campaign')!
    expect(brand.eventIds).toEqual([])
    expect(brand.picks).toEqual([])
    expect(brand.mode).toBe('graphic_led')
    expect(brand.link).toBe(`${ORIGIN}/events`)
    expect(brand.slides).toEqual([expect.objectContaining({ t: 'brand', photo: null, headline: 'Say yes to this weekend.' })])
    expect(pieceRefusal(brand)).toBeNull()
  })
  it('carries a photograph only when one is licensed for EventLinqs own promotion, with its credit', () => {
    const brand = planCampaign({ nights: week, cities: CITIES, weekStart: WEEK, origin: ORIGIN, brandPhoto: { url: 'https://example.com/licensed.jpg', credit: 'Licensed for EventLinqs' } }).pieces.find((p) => p.kind === 'brand_campaign')!
    expect(brand.mode).toBe('photo_led')
    expect(brand.caption).toContain('Photo: Licensed for EventLinqs')
  })
  it('is refused if it ever names a night', () => {
    const brand = planCampaign({ nights: week, cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces.find((p) => p.kind === 'brand_campaign')!
    expect(pieceRefusal({ ...brand, eventIds: [week[0].eventId] })).toMatch(/names no night/)
  })
  it('is not planned in a week with no nights', () => {
    expect(planCampaign({ nights: [], cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces.some((p) => p.kind === 'brand_campaign')).toBe(false)
  })
})

describe('the sweep takes a withdrawn image out of the words', () => {
  it('drops the credit of a removed photograph, keeps one another slide still carries', () => {
    const caption = 'Hook.\n\nA line.\n\nPhoto: AMCF, past festival\nPhoto: The Barwon Club\n\nThe whole week: eventlinqs.com.au/city/geelong'
    const out = withoutCredits(caption, new Set(['AMCF, past festival', 'The Barwon Club']), new Set(['The Barwon Club']))
    expect(out).not.toContain('AMCF')
    expect(out).toContain('Photo: The Barwon Club')
  })
})

describe('one night per title in a set', () => {
  it('a market on Saturday and Sunday is picked once, its sooner date', async () => {
    const { selectNights } = await import('@/lib/social/campaign')
    const sat = night({ at: '2026-10-31T00:00:00Z', title: 'The Melbourne Book Market', venueName: 'Queen Victoria Market' })
    const sun = night({ at: '2026-11-01T00:00:00Z', title: 'The Melbourne Book Market', venueName: 'Queen Victoria Market' })
    const other = night({ at: '2026-11-01T03:00:00Z', title: 'Run the Tan', venueName: 'Run the Tan' })
    const { nights } = selectNights([sat, sun, other], 5)
    expect(nights.map((n) => n.title)).toEqual(['The Melbourne Book Market', 'Run the Tan'])
    expect(nights[0].eventId).toBe(sat.eventId)
  })
})
