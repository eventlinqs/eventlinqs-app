import { describe, expect, it } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import { dailyPosterPieces, posterCaption, DAILY_POSTERS_IN_PLAN } from '@/lib/social/daily-posters'
import type { CampaignNight } from '@/lib/social/campaign'

/*
 * A DAILY POSTER'S CAPTION, NATURAL AND OF ITS OWN KIND (Lawal, 18 November 2026, 00:12 and 00:17; the PM's 00:25 and
 * 00:32): his Kate Ceberano caption is the QUALITY REFERENCE, never a template: an emoji led hook that fits the night, one
 * line of experience, then place, date and time, then tickets and hashtags from our list. Two nights of different kinds
 * never get the same sentence shape. Lawal's A (00:12) admits photo free posters, so the daily posters are in the plan.
 */
const night = (over: Partial<CampaignNight>): CampaignNight =>
  ({
    eventId: '00000000-0000-4000-9000-000000000001',
    slug: 'a-night',
    title: 'Kate Ceberano: Australian Made Tour 2026',
    startDate: '2026-11-19T08:00:00Z',
    endDate: '2026-11-19T11:00:00Z',
    timezone: 'Australia/Melbourne',
    citySlug: 'ballarat',
    cityName: 'Ballarat',
    venueName: "Her Majesty's Theatre Ballarat",
    host: "Her Majesty's Theatre Ballarat",
    categorySlug: 'music',
    summary: 'Kate Ceberano sings the songs of a lifetime with a full band.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta: ctaFor({ tiers: [{ price: 7900 }] }),
    priceLine: 'From $79',
    ...over,
  }) as unknown as CampaignNight

const city = { slug: 'ballarat', name: 'Ballarat' }
const SITE = 'eventlinqs.com.au'
const gig = posterCaption(night({}), city, SITE)
const comedy = posterCaption(night({ eventId: 'b', slug: 'b', title: 'Laugh Lab', categorySlug: 'comedy', summary: 'Five comics, one room, new material.', venueName: 'Comedy Republic', host: 'Comedy Republic' }), { slug: 'melbourne', name: 'Melbourne' }, SITE)

describe('posterCaption', () => {
  it("follows Lawal's shape: hook, experience, place, date and time, tickets, hashtags", () => {
    const lines = gig.split('\n').filter((l) => l.trim() !== '')
    expect(lines[0]).toMatch(/^\p{Extended_Pictographic}/u)
    expect(lines[0]).toContain('Kate Ceberano')
    expect(gig).toContain('Kate Ceberano sings the songs of a lifetime with a full band.')
    expect(gig).toContain("📍 Her Majesty's Theatre Ballarat")
    expect(gig).not.toContain('Ballarat, Ballarat')
    expect(gig).toMatch(/📅 Thursday 19 November · 7(:00)? ?pm/)
    expect(gig).toContain('🎟 Event details and tickets:')
    expect(gig).toContain(`${SITE}/events/a-night`)
    expect(lines.at(-1)).toBe('#ballarat #ballaratevents')
  })

  it('never carries an exclamation mark or a long dash (the copy law)', () => {
    for (const c of [gig, comedy]) expect(c).not.toMatch(/[!–—]/)
  })

  it('two nights of different kinds do not get the same sentence shape', () => {
    const shape = (c: string, title: string, cityName: string) => c.split('\n')[0].replace(title, 'T').replace(cityName, 'C')
    expect(shape(gig, 'Kate Ceberano: Australian Made Tour 2026', 'Ballarat')).not.toBe(shape(comedy, 'Laugh Lab', 'Melbourne'))
  })

  it("Lawal's A: the daily posters are in the week's plan", () => {
    expect(DAILY_POSTERS_IN_PLAN).toBe(true)
  })
})

// The pack of 18 November 2026: the posters' platform versions read 'at Geelong Racecourse, Geelong' and 'at Ballarat
// Botanical Gardens, Ballarat', the class the PM's 23:45 of 17 November (fix (d)) ruled out: a venue whose own name holds
// its city is named alone, any other keeps its city.
describe("a daily poster's hook names the city once", () => {
  it('a venue whose name holds its city is named alone; any other venue keeps its city', () => {
    const race = night({ eventId: 'r', slug: 'r', title: 'Geelong Caravanning and Adventure Leisurefest', citySlug: 'geelong', cityName: 'Geelong', venueName: 'Geelong Racecourse', host: 'Geelong Racecourse', categorySlug: 'festival', summary: 'A caravan and outdoor show.' })
    const costa = night({ eventId: 'c', slug: 'c', title: 'The Kim Wilde', citySlug: 'geelong', cityName: 'Geelong', venueName: 'Costa Hall', host: 'Costa Hall', startDate: '2026-11-20T08:30:00Z', endDate: '2026-11-20T11:00:00Z' })
    const pieces = dailyPosterPieces({ nights: [race, costa], cities: [{ slug: 'geelong', name: 'Geelong' }], weekStart: '2026-11-16', origin: 'https://www.eventlinqs.com.au' })
    const all = JSON.stringify(pieces)
    expect(pieces.length).toBe(2)
    expect(all).not.toContain('Racecourse, Geelong')
    expect(all).toContain('at Geelong Racecourse.')
    expect(all).toContain('at Costa Hall, Geelong.')
  })
})
