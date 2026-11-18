import { describe, expect, it } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import { postTitle, venueSpotlightLines, type CampaignNight, type PiecePlan } from '@/lib/social/campaign'
import { dailyPosterPieces, partOfDay, posterCaption, withKitCaptions } from '@/lib/social/daily-posters'
import { planMoments, weekendDaysOf, type CadenceRule } from '@/lib/social/cadence'

/*
 * THE PM'S 03:10 OF 18 NOVEMBER 2026, THE PACK'S CLASSES (law 4: each a class, red first), and the finding behind them:
 * the publisher posts each platform's VERSION (store.ts publishDuePieces), so every class is held on what posts.
 *   (1) a daytime event is never a 'night'      (5) a free event never says 'tickets'
 *   (3) the title alone, the kind on the next   (6) a weekend line goes Thursday or Friday only
 *   (4) the city once, one place per night      (7) one poster per event over several days, naming its days
 *   (8) a partner kit's caption of its kind     (9) the venue once in its spotlight
 */
const night = (over: Partial<CampaignNight>): CampaignNight =>
  ({
    eventId: '00000000-0000-4000-9000-000000000001',
    slug: 'a-night',
    title: 'Geelong Dance Movement: A Passage Through Time',
    startDate: '2026-11-19T07:30:00Z',
    endDate: '2026-11-19T10:00:00Z',
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: 'The Play House',
    host: 'Geelong Arts Centre',
    categorySlug: 'arts-community',
    summary: 'A performance at The Play House, Geelong Arts Centre.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta: ctaFor({ tiers: [{ price: 3500 }] }),
    priceLine: 'Tickets on geelongartscentre.org.au',
    ...over,
  }) as unknown as CampaignNight
const GEELONG = { slug: 'geelong', name: 'Geelong' }
const ORIGIN = 'https://www.eventlinqs.com.au'
const SITE = 'eventlinqs.com.au'
const ig = (n: CampaignNight) => posterCaption(n, GEELONG, SITE, { platform: 'instagram', link: `${ORIGIN}/events/${n.slug}` })
const fb = (n: CampaignNight) => posterCaption(n, GEELONG, SITE, { platform: 'facebook', link: `${ORIGIN}/events/${n.slug}` })
const lines = (c: string) => c.split('\n').filter((l) => l.trim() !== '')

describe('(1) the time of day word is true of the local start', () => {
  it('a dance at 11 am is a morning, at 2 pm an afternoon, at 6.30 pm a night', () => {
    expect(partOfDay('2026-11-21T00:00:00Z', 'Australia/Melbourne')).toBe('morning')
    expect(partOfDay('2026-11-21T03:00:00Z', 'Australia/Melbourne')).toBe('afternoon')
    expect(partOfDay('2026-11-19T07:30:00Z', 'Australia/Melbourne')).toBe('night')
    const torquay = night({ title: 'Torquay Dance Academy: SHOWTIME: A World of Imagination', startDate: '2026-11-21T00:00:00Z', summary: null })
    const c = ig(torquay)
    expect(c).not.toMatch(/a night of dance/i)
    expect(lines(c)[0]).toBe('\u{1F483} Torquay Dance Academy takes the stage in Geelong.')
    expect(lines(c)[1]).toBe('Showtime: A World of Imagination, a morning of dance.')
  })
})

// Caption standard version 2 (Lawal's 20:44 of 18 November 2026): the hook names who and where in a shape of its kind;
// the show's own name and the kind of night take the next line, never chained to the title by a colon.
describe('(3) the hook names who, the show and the kind of event on the next line; capitals take title case', () => {
  it('no colon chain into the kind', () => {
    const l = lines(ig(night({})))
    expect(l[0]).toBe('\u{1F483} Geelong Dance Movement takes the stage.')
    expect(l[1]).toBe('A Passage Through Time, a night of dance.')
    expect(ig(night({}))).not.toMatch(/Time: a night/)
  })
  it('a title written in capitals, or a long word in capitals, takes title case; a short name in capitals stays', () => {
    expect(postTitle('PROFESSIONAL COMEDIANS', null)).toBe('Professional Comedians')
    expect(postTitle('Torquay Dance Academy: SHOWTIME: A World of Imagination', null)).toBe('Torquay Dance Academy: Showtime: A World of Imagination')
    expect(postTitle('LANY', null)).toBe('LANY')
    expect(postTitle('Synth 101 at MESS', null)).toBe('Synth 101 at MESS')
  })
})

describe('(4) the city once, and one place name per night', () => {
  it("a title that holds its city takes no 'in <city>'", () => {
    expect(lines(ig(night({})))[0]).not.toMatch(/in Geelong/)
    expect(lines(ig(night({ title: 'Fine Lines & Wine', categorySlug: 'arts-community', summary: null })))[0]).toMatch(/in Geelong/)
    // The city once in a line (the hook may name it, as Lawal's model does, and the place line again: 'to Geelong!' over
    // '📍 Costa Hall, Geelong' in caption standard version 2's approved third sample); never twice in one line.
    for (const l of lines(ig(night({ title: 'Fine Lines & Wine', categorySlug: 'arts-community', summary: null })))) expect(l).not.toMatch(/Geelong.*Geelong/)
  })
  it("the night's own words keep the venue, never a second place name beside the city", () => {
    const fine = night({ title: 'Fine Lines & Wine', venueName: 'Archive Wine Bar', summary: 'A relaxed sketching night with a glass of wine at Archive Wine Bar, Belmont.', startDate: '2026-11-18T07:00:00Z' })
    const c = ig(fine)
    expect(c).not.toContain('Belmont')
    expect(c).toContain('A relaxed sketching night with a glass of wine at Archive Wine Bar.')
    expect(c).toContain('\u{1F4CD} Archive Wine Bar, Geelong')
  })
})

describe("(5) a free event never says 'tickets'", () => {
  it('free entry and event details', () => {
    const tour = night({ title: 'Free Sunday Garden Tour', categorySlug: 'health-wellness', cta: ctaFor({ isFree: true }), priceLine: null, summary: null })
    const c = ig(tour)
    expect(c).toContain('\u{1F4B2} Free entry')
    expect(c).toContain('\u{1F39F} Event details: link in our bio')
    expect(c).not.toMatch(/tickets/i)
    expect(fb(tour)).toContain(`\u{1F39F} Event details:\n${ORIGIN}/events/a-night`)
  })
})

describe('the two posted versions are the one poster caption', () => {
  // Version 2 (Lawal's Kate Ceberano model): hashtags close BOTH platforms' versions; Facebook carries the whole link.
  it('Instagram points to the link in bio; Facebook carries the whole link; both end with the same tags', () => {
    expect(ig(night({}))).toContain('\u{1F39F} Event details and tickets: link in our bio')
    expect(ig(night({}))).not.toContain(ORIGIN)
    expect(fb(night({}))).toContain(`\u{1F39F} Event details and tickets:\n${ORIGIN}/events/a-night`)
    for (const c of [ig(night({})), fb(night({}))]) expect(lines(c).at(-1)).toBe('#GeelongEvents #GeelongDanceMovement #EventLinqs')
  })
  it("a daily poster's versions are those captions, never 'title, at venue, city.' and a pick line", () => {
    const [p] = dailyPosterPieces({ nights: [night({})], cities: [GEELONG], weekStart: '2026-11-16', origin: ORIGIN })
    expect(p.versions.instagram.caption).toBe(posterCaption(night({ title: postTitle(night({}).title, 'The Play House') }), GEELONG, SITE, { platform: 'instagram', link: `${ORIGIN}/events/a-night` }))
    expect(p.versions.facebook.caption).toContain(`${ORIGIN}/events/a-night`)
    expect(p.versions.instagram.hook).toBe('\u{1F483} Geelong Dance Movement takes the stage.')
  })
})

describe('(7) one poster for an event over several days, naming its days', () => {
  it('the Leisurefest on Friday, Saturday and Sunday is one poster, on its first day, and its caption names the days', () => {
    const fri = night({ eventId: 'f', slug: 'race-20', title: 'Geelong Caravanning and Adventure Leisurefest', venueName: 'Geelong Racecourse', host: 'Geelong Racecourse', categorySlug: 'festival', startDate: '2026-11-19T22:00:00Z', endDate: '2026-11-20T05:00:00Z', summary: null })
    const sat = { ...fri, eventId: 't', slug: 'race-21', startDate: '2026-11-20T22:00:00Z', endDate: '2026-11-21T05:00:00Z' }
    const sun = { ...fri, eventId: 's', slug: 'race-22', startDate: '2026-11-21T22:00:00Z', endDate: '2026-11-22T05:00:00Z' }
    const pieces = dailyPosterPieces({ nights: [fri, sat, sun], cities: [GEELONG], weekStart: '2026-11-16', origin: ORIGIN })
    expect(pieces.map((p) => p.eventIds[0])).toEqual(['f'])
    expect(pieces[0].versions.instagram.caption).toContain('\u{1F4C5} Friday 20 to Sunday 22 November · 9 am')
  })
  // The pack of 05:43: 'Thursday 19 to Thursday 26 November' for a weekly show; a run is consecutive days in the week only.
  it('a weekly repeat is never read as a run of days: its own day only', () => {
    const thu = night({ eventId: 'w1', slug: 'gdm-19', startDate: '2026-11-19T07:30:00Z' })
    const next = { ...thu, eventId: 'w2', slug: 'gdm-26', startDate: '2026-11-26T07:30:00Z', endDate: '2026-11-26T10:00:00Z' }
    const [p] = dailyPosterPieces({ nights: [thu, next], cities: [GEELONG], weekStart: '2026-11-16', origin: ORIGIN })
    expect(p.versions.instagram.caption).toContain('\u{1F4C5} Thursday 19 November · 6.30 pm')
    expect(p.versions.instagram.caption).not.toMatch(/to Thursday 26/)
  })
})

describe("(8) a partner kit's caption is of its kind, with its ticket line", () => {
  it('the kit takes the poster caption for its night, on both platforms', () => {
    const n = night({})
    const kit = { kind: 'partner_kit', city: 'geelong', eventIds: [n.eventId], link: `${ORIGIN}/events/a-night`, caption: 'Geelong Dance Movement, featured on EventLinqs this week.', versions: { instagram: { hook: 'x', caption: 'x', crop: '9:16', cta: 'x' }, facebook: { hook: 'x', caption: 'x', crop: '9:16', cta: 'x' } } } as unknown as PiecePlan
    const [out] = withKitCaptions([kit], [n], [GEELONG], ORIGIN)
    expect(out.versions.instagram.caption).toContain('\u{1F483} Geelong Dance Movement takes the stage.')
    expect(out.versions.instagram.caption).toContain('\u{1F39F} Event details and tickets:')
    expect(out.versions.facebook.caption).toContain(`${ORIGIN}/events/a-night`)
    expect(out.caption).not.toContain('featured on EventLinqs this week')
    expect(out.versions.instagram.crop).toBe('9:16')
  })
})

describe('(9) the venue once in its spotlight', () => {
  it('the lines carry the day, the time and the title; the seller once', () => {
    const mrc = (title: string, at: string) => night({ eventId: title, title, venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre', citySlug: 'melbourne', cityName: 'Melbourne', startDate: at, priceLine: 'Tickets on melbournerecital.com.au' })
    const body = venueSpotlightLines([mrc('Eternity', '2026-11-19T07:00:00Z'), mrc('Holly Hebe', '2026-11-19T09:30:00Z')]).join('\n')
    expect(body).not.toContain('Melbourne Recital Centre')
    expect(body.match(/Tickets on melbournerecital\.com\.au/g)).toHaveLength(1)
    expect(body).toContain('Eternity')
  })
})

describe('(6) a weekend line goes on a Thursday or a Friday only', () => {
  it("a piece that names 'this weekend' and no night of its own takes Thursday or Friday", () => {
    expect(weekendDaysOf('Say yes to this weekend.', 0)).toEqual([4, 5])
    expect(weekendDaysOf('Say yes to this weekend.', 2)).toBeNull()
    expect(weekendDaysOf('Run regular nights in Victoria?', 0)).toBeNull()
    const monday = new Date('2026-11-23T10:00:00Z') // Monday 23 November, 9 pm in Melbourne
    const daily = (h: number[]) => Array.from({ length: 7 }, (_, d) => h.map((x) => d * 24 + x)).flat()
    const rules: Record<'feed' | 'story', CadenceRule> = { feed: { version: 1, gapHours: 12, slots: daily([9, 21]), basis: 'starting', learnedFrom: 0, floorPosts: 12, settleHours: 48, setAt: monday }, story: { version: 1, gapHours: 4, slots: daily([18]), basis: 'starting', learnedFrom: 0, floorPosts: 12, settleHours: 48, setAt: monday } }
    const plan = planMoments([{ id: 'brand', format: 'feed', approvedAt: monday, days: [4, 5] }], rules, { feed: [], story: [] }, monday)
    const at = plan.moments.get('brand')!
    const day = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long' }).format(at)
    expect(['Thursday', 'Friday']).toContain(day)
  })
})

// The pack of 05:43: 'Live music in Melbourne. / Live music, up close.' A night with no words of its own says its kind once.
describe('the kind is said once', () => {
  it('no fallback line under the kind line when the night has no words of its own', () => {
    const recital = night({ title: 'Anne Sofie von Otter & Kristian Bezuidenhout', citySlug: 'melbourne', cityName: 'Melbourne', venueName: 'Melbourne Recital Centre', categorySlug: 'music', summary: null })
    const l = lines(posterCaption(recital, { slug: 'melbourne', name: 'Melbourne' }, SITE, { platform: 'instagram', link: `${ORIGIN}/events/a-night` }))
    expect(l[2].startsWith('📍')).toBe(true)
    expect(l.join(' ')).not.toMatch(/up close|The game, live/)
  })
})

/*
 * THE KIND SAID TWICE, THE WHOLE CLASS (the PM's 06:39 of 18 November 2026, item 2): Showtime Bendigo read 'An afternoon
 * of dance in Bendigo.' then 'A dance performance at Ulumbarra Theatre.', and two Play House nights 'A performance at The
 * Play House.': the second line said the kind again and the venue the pin line already names. A night's own line stays
 * only where it adds something beyond its kind, its venue and its city.
 */
describe("the night's own line adds something, or it goes", () => {
  it('a line of only the kind and the venue goes, on both platforms', () => {
    const showtime = night({ title: 'Showtime: The Entertainers Performing Arts Studio', venueName: 'Ulumbarra Theatre', cityName: 'Bendigo', citySlug: 'bendigo', startDate: '2026-11-21T03:00:00Z', summary: 'A dance performance at Ulumbarra Theatre.' })
    const bendigo = { slug: 'bendigo', name: 'Bendigo' }
    for (const platform of ['instagram', 'facebook'] as const) {
      const l = lines(posterCaption(showtime, bendigo, SITE, { platform, link: `${ORIGIN}/events/a-night` }))
      expect(l[0]).toBe('\u{1F483} Showtime takes the stage in Bendigo.')
      expect(l[1]).toBe('An afternoon of dance.')
      expect(l[2].startsWith('\u{1F4CD}')).toBe(true)
    }
    for (const c of [ig(night({})), fb(night({}))]) expect(c).not.toMatch(/A performance at The Play House/)
  })
  it('a line that adds its own words stays', () => {
    const fine = night({ title: 'Fine Lines & Wine', venueName: 'Archive Wine Bar', categorySlug: 'arts-community', summary: 'A relaxed sketching night with a glass of wine at Archive Wine Bar.' })
    expect(ig(fine)).toContain('A relaxed sketching night with a glass of wine at Archive Wine Bar.')
    const showcase = night({ summary: 'A dance showcase by 200 students of the academy.' })
    expect(ig(showcase)).toContain('A dance showcase by 200 students of the academy.')
  })
})
