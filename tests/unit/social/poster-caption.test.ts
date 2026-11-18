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

const FB = 'https://www.eventlinqs.com.au/events/a-night'
const gigFb = posterCaption(night({}), city, SITE, { platform: 'facebook', link: FB })
const free = posterCaption(night({ eventId: 'f', slug: 'f', title: 'Lakeside Picnic Concert', summary: null, cta: ctaFor({ tiers: [], isFree: true } as never), priceLine: null }), city, SITE)
const emojiIn = (t: string) => [...t.matchAll(/\p{Extended_Pictographic}/gu)].length

/*
 * CAPTION STANDARD VERSION 2 (C:/dev/GROWTH/CAPTION-STANDARD-18NOV.md; Lawal's 20:44 approval of 18 November 2026 for every
 * new caption, through the PM's 20:50; the rules of the PM's 20:45). One test per rule; Kate Ceberano's caption, Lawal's own
 * model of 00:12, is the golden case.
 */
describe('posterCaption, caption standard version 2', () => {
  // Lawal's own caption, word for word, is held in caption-golden.test.ts (the PM's 21:40). Here, the same night with words
  // of its own and a price: the tour goes into the hook and its words under it, as caption standard version 2's third
  // sample has it, and the price brings its share line.
  it("Kate Ceberano with words of her own and a price, in version 2's third sample's shape, Instagram and Facebook", () => {
    expect(gig).toBe(
      [
        '🎶 Kate Ceberano is bringing the Australian Made Tour to Ballarat!',
        'Kate Ceberano sings the songs of a lifetime with a full band.',
        "📍 Her Majesty's Theatre Ballarat",
        '📅 Thursday 19 November · 7 pm',
        '💲 Tickets from $79',
        '🎟 Event details and tickets: link in our bio',
        'Bring the friend who knows every word.',
        '#BallaratEvents #KateCeberano #EventLinqs',
      ].join('\n'),
    )
    expect(gigFb).toContain(['🎟 Event details and tickets:', FB].join('\n'))
    expect(gigFb.split('\n').at(-1)).toBe('#BallaratEvents #KateCeberano #EventLinqs')
  })

  it('1. THE HOOK: the kind’s emoji, then who or what, and where, in a shape of its own kind', () => {
    expect(gig.split('\n')[0]).toBe('🎶 Kate Ceberano is bringing the Australian Made Tour to Ballarat!')
    expect(posterCaption(night({ summary: null }), city, SITE).split('\n')[0]).toBe('🎶 Kate Ceberano is coming to Ballarat!')
    expect(comedy.split('\n')[0]).toBe('😂 Laugh Lab brings the laughs to Melbourne!')
  })

  it('2. ONE LINE ON THE EXPERIENCE: the night’s own words, or what its title’s second part names', () => {
    expect(gig.split('\n')[1]).toBe('Kate Ceberano sings the songs of a lifetime with a full band.')
    const noWords = posterCaption(night({ summary: null }), city, SITE)
    expect(noWords.split('\n')[1]).toBe("Experience the Australian Made Tour at Her Majesty's Theatre Ballarat this Thursday, 19 November, at 7 pm.")
  })

  it('3. THE SIGNPOSTS, one emoji each: the place, the date and time, the price or free entry', () => {
    expect(gig).toContain("📍 Her Majesty's Theatre Ballarat\n📅 Thursday 19 November · 7 pm\n💲 Tickets from $79")
    // No blank lines (the golden cases stand without them).
    for (const c of [gig, gigFb, comedy, free]) expect(c).not.toMatch(/\n\n/)
    expect(gig).not.toContain('Ballarat, Ballarat')
    expect(free).toContain('💲 Free entry')
    expect(free).toContain('🎟 Event details: link in our bio')
  })

  it('4. THE LINK LINE: Instagram, the link in our bio; Facebook, the event page itself on its own line', () => {
    expect(gig).toContain('🎟 Event details and tickets: link in our bio')
    expect(gig).not.toContain('https://')
    expect(gigFb).toContain(`🎟 Event details and tickets:\n${FB}`)
  })

  it('5. A SHARE LINE of the night’s kind, with no emoji', () => {
    const share = gig.split('\n').find((l) => l === 'Bring the friend who knows every word.')
    expect(share).toBeDefined()
    expect(comedy).toContain('Tag the friend who needs a laugh.')
  })

  it('6. HASHTAGS LAST on both platforms: the city’s events, the night, #EventLinqs', () => {
    for (const c of [gig, gigFb]) expect(c.split('\n').at(-1)).toBe('#BallaratEvents #KateCeberano #EventLinqs')
    expect(comedy.split('\n').at(-1)).toBe('#MelbourneEvents #LaughLab #EventLinqs')
  })

  it('AT MOST FIVE EMOJI, never two in a row, never inside a name or a title', () => {
    for (const c of [gig, gigFb, comedy, free]) {
      expect(emojiIn(c)).toBeLessThanOrEqual(5)
      expect(c).not.toMatch(/\p{Extended_Pictographic}\uFE0F?\s*\p{Extended_Pictographic}/u)
    }
    expect(emojiIn('Kate Ceberano: Australian Made Tour 2026')).toBe(0)
  })

  it('AT MOST ONE EXCLAMATION MARK, in the hook only; never a long dash', () => {
    for (const c of [gig, gigFb, comedy, free]) {
      expect((c.match(/!/g) ?? []).length).toBeLessThanOrEqual(1)
      for (const line of c.split('\n').slice(1)) expect(line).not.toContain('!')
      expect(c).not.toMatch(/[–—]/)
    }
  })

  it('two nights of different kinds do not get the same sentence shape', () => {
    const shape = (c: string, title: string, cityName: string) => c.split('\n')[0].replace(title, 'T').replace(cityName, 'C')
    expect(shape(gig, 'Kate Ceberano', 'Ballarat')).not.toBe(shape(comedy, 'Laugh Lab', 'Melbourne'))
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
    expect(all).toContain('\u{1F4CD} Geelong Racecourse\\n')
    expect(all).toContain('\u{1F4CD} Costa Hall, Geelong\\n')
  })
})
