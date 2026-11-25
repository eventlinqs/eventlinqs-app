import { describe, expect, test } from 'vitest'
import { CAROUSEL_EVENTS, CAROUSEL_LEAD_HOURS, CITY_COVERS, captionWeek, carouselCaption, carouselDesign, carouselPostAt, carouselTimeline, chooseCarouselNights, cityCoverPhotos, dateStrip, dayOf, iconRow, relationshipOf, type CarouselNight } from '@/lib/social/city-carousel'
import { captionMarkFaults } from '@/lib/social/caption-marks'
import { goHop } from '@/lib/social/go-hop'
import { relativeDateWords } from '@/lib/social/playbook'

/*
 * THE WEEKLY CITY CAROUSEL'S RULES (Lawal's yes, 25 November 2026, 00:47; the PM's 01:12 item 2: "every rule a pure
 * function with a test"; C:\dev\START-16OCT\SOCIAL-BENCHMARK-PLAYBOOK-25NOV.md section 5).
 */

// Monday 30 November 2026, 7:00 am in Melbourne, the engine's own window.
const POST = new Date('2026-11-29T20:00:00Z')
const H = 3_600_000
let id = 0
function night(o: { title?: string; hoursAfter: number; category?: string | null; free?: boolean; relationship?: CarouselNight['relationship'] }): CarouselNight {
  id += 1
  return {
    eventId: `e${id}`,
    slug: `night-${id}`,
    title: o.title ?? `Night ${id}`,
    startDate: new Date(POST.getTime() + o.hoursAfter * H).toISOString(),
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: 'A Venue',
    host: null,
    categorySlug: null,
    summary: null,
    approvedPhotoUrl: null,
    photoCredit: null,
    cta: { state: o.free ? 'free_open' : 'external' } as never,
    priceLine: o.free ? 'Free' : 'From $20',
    free: o.free ?? false,
    categoryName: o.category === undefined ? 'Music' : o.category,
    relationship: o.relationship ?? null,
  }
}

describe('which eight events', () => {
  test('eight, in the seven days from the post, none starting before it, one per title, in date order', () => {
    const before = night({ hoursAfter: -1 })
    const after = night({ hoursAfter: 24 * 7 + 1 })
    const week = Array.from({ length: 10 }, (_, i) => night({ hoursAfter: 2 + i * 14, category: ['Music', 'Comedy', 'Family'][i % 3] }))
    const twice = night({ title: week[0].title, hoursAfter: 60, category: 'Music' })
    const c = chooseCarouselNights([before, after, ...week, twice], POST)
    expect(c.nights).toHaveLength(CAROUSEL_EVENTS)
    expect(c.nights.map((n) => n.eventId)).not.toContain(before.eventId)
    expect(c.nights.map((n) => n.eventId)).not.toContain(after.eventId)
    expect(c.nights.filter((n) => n.title === week[0].title)).toHaveLength(1)
    expect([...c.nights].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))).toEqual(c.nights)
    expect(c.short).toEqual([])
  })

  test('organisers who gave photo permission first, then ticketing, then those we write to, then the rest', () => {
    const rest = Array.from({ length: 8 }, (_, i) => night({ hoursAfter: 2 + i, category: ['Music', 'Comedy', 'Family', 'Theatre'][i % 4] }))
    const writing = night({ hoursAfter: 150, relationship: 'writing', category: 'Music' })
    const ticketing = night({ hoursAfter: 140, relationship: 'ticketing', category: 'Comedy' })
    const permission = night({ hoursAfter: 130, relationship: 'permission', category: 'Family' })
    const ids = chooseCarouselNights([...rest, writing, ticketing, permission], POST).nights.map((n) => n.eventId)
    for (const lead of [permission, ticketing, writing]) expect(ids).toContain(lead.eventId)
  })

  test('at least three categories and four days, and a free one when the week has one', () => {
    // Monday is full of music; one comedy, one family night and one free night fall later in the week.
    const monday = Array.from({ length: 9 }, (_, i) => night({ hoursAfter: 2 + i, category: 'Music' }))
    const comedy = night({ hoursAfter: 50, category: 'Comedy' })
    const family = night({ hoursAfter: 76, category: 'Family' })
    const free = night({ hoursAfter: 100, category: 'Music', free: true })
    const c = chooseCarouselNights([...monday, comedy, family, free], POST)
    expect(new Set(c.nights.map((n) => n.categoryName)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(c.nights.map(dayOf)).size).toBeGreaterThanOrEqual(4)
    expect(c.nights.some((n) => n.free)).toBe(true)
    expect(c.short).toEqual([])
  })

  test('a thin week says which rule it could not meet, and never invents a night', () => {
    const c = chooseCarouselNights([night({ hoursAfter: 3 }), night({ hoursAfter: 4 })], POST)
    expect(c.nights).toHaveLength(2)
    expect(c.short).toEqual(['the seven days hold 2 events, not 8', 'the events chosen span 1 categories, not 3', 'the events chosen fall on 1 days, not 4'])
  })
})

describe("the cover's words", () => {
  test('the date strip is written with "to", never a dash, across a month and a year', () => {
    expect(dateStrip(new Date('2026-11-22T20:00:00Z'))).toBe('23 to 29 NOV 2026')
    expect(dateStrip(POST)).toBe('30 NOV to 6 DEC 2026')
    expect(dateStrip(new Date('2026-12-27T20:00:00Z'))).toBe('28 DEC 2026 to 3 JAN 2027')
    expect(captionWeek(POST)).toBe('30 Nov to 6 Dec')
  })
  test('the icon row counts the events, then the categories present, most first, and FREE when one is free', () => {
    const nights = [night({ hoursAfter: 2 }), night({ hoursAfter: 3 }), night({ hoursAfter: 4, category: 'Comedy' }), night({ hoursAfter: 5, category: 'Family', free: true })]
    expect(iconRow(nights)).toBe('4 EVENTS · MUSIC · COMEDY · FAMILY · FREE')
  })
})

describe('the caption', () => {
  const nights = [night({ title: 'Jazz on the Roof', hoursAfter: 12 }), night({ title: 'Kids Science Day', hoursAfter: 60, category: 'Family', free: true })]
  const hop = goHop('https://www.eventlinqs.com.au', 'facebook')
  test('a hook naming the city and its dates, a line per event with its day and its place, the question, at most three tags', () => {
    const ig = carouselCaption({ city: 'Melbourne', postAt: POST, nights, platform: 'instagram', hop, tags: ['#Melbourne', 'WhatsOnMelbourne', 'ThingsToDo', 'Extra'] })
    const lines = ig.split('\n')
    expect(lines[0]).toMatch(/Things to do in Melbourne, 30 Nov to 6 Dec\.$/)
    expect(ig).toContain('Mon 30 Nov: Jazz on the Roof, A Venue')
    expect(ig).toContain('Wed 2 Dec: Kids Science Day, A Venue (free)')
    expect(ig).toContain('Which one are you going to?')
    expect(ig.match(/link in our bio/g)).toHaveLength(1)
    expect(ig).not.toMatch(/https?:\/\//)
    expect(lines.at(-1)).toBe('#Melbourne #WhatsOnMelbourne #ThingsToDo')
    expect(captionMarkFaults(ig)).toEqual([])
    const fb = carouselCaption({ city: 'Melbourne', postAt: POST, nights, platform: 'facebook', hop, tags: [] })
    expect(fb.match(/https?:\/\/\S+/g)).toEqual([hop])
    expect(fb).not.toContain('link in our bio')
  })
  test('no relative day anywhere in either caption: the cover says THIS WEEK, the caption names the dates', () => {
    for (const platform of ['instagram', 'facebook'] as const) {
      expect(relativeDateWords(carouselCaption({ city: 'Melbourne', postAt: POST, nights, platform, hop, tags: [] }))).toEqual([])
    }
  })
})

describe("the carousel's design, in the locked look", () => {
  const photo = { url: 'https://www.eventlinqs.com.au/social/cities/melbourne-city-circle-tram.jpg', credit: 'Photo: Dietmar Rabich, CC BY-SA 4.0' }
  const design = (nights: CarouselNight[], cityPhoto: typeof photo | null = photo) =>
    carouselDesign({ city: { slug: 'melbourne', name: 'Melbourne' }, nights, postAt: POST, origin: 'https://www.eventlinqs.com.au', cityPhoto, tags: ['#MelbourneEvents', '#Melbourne', '#EventLinqs'] })
  test("the week's cover over the city's own photograph with its licence credit, the city in the accent, a feature slide per event, then the ask", () => {
    const out = design(Array.from({ length: 9 }, (_, i) => night({ hoursAfter: 13 + i * 17, category: ['Music', 'Comedy', 'Family'][i % 3], free: i === 4 })))
    expect(out).not.toBeNull()
    expect(out!.slides).toHaveLength(1 + CAROUSEL_EVENTS + 1)
    const cover = out!.slides[0]
    expect(cover).toMatchObject({ t: 'week_cover', lines: ['THINGS TO DO IN', 'MELBOURNE', 'THIS WEEK'], accentLine: 1, range: '30 NOV to 6 DEC 2026', photo: photo.url, credit: photo.credit, photoEventId: null })
    expect(String((cover as { draws: string }).draws)).toMatch(/^8 EVENTS · /)
    expect(out!.slides.slice(1, -1).every((s) => s.t === 'feature')).toBe(true)
    expect(out!.slides.at(-1)).toMatchObject({ t: 'ask', count: CAROUSEL_EVENTS })
    expect(out!.captions.instagram).toContain('link in our bio')
    expect(out!.captions.facebook).toContain(goHop('https://www.eventlinqs.com.au', 'facebook'))
    expect(out!.link).toBe('https://www.eventlinqs.com.au/city/melbourne')
    expect(out!.short).toEqual([])
    // A feature slide with no permitted photograph of its own is drawn in type, never with a borrowed one; none prints a credit.
    expect(out!.slides.slice(1, -1).every((s) => s.t === 'feature' && s.photo === null && s.credit === null)).toBe(true)
  })
  test("a night's own permitted photograph is its slide's, printed with no credit (law 17 as narrowed)", () => {
    const own = { ...night({ hoursAfter: 20 }), approvedPhotoUrl: 'https://x.test/own.jpg', photoCredit: 'Their photographer' }
    const out = design([own, night({ hoursAfter: 40 })])
    expect(out!.slides.find((s) => s.t === 'feature' && s.eventId === own.eventId)).toMatchObject({ photo: 'https://x.test/own.jpg', credit: null })
  })
  test(`a night starting within ${CAROUSEL_LEAD_HOURS} hours of the post is never chosen, so the timing engine's window holds Monday's bands`, () => {
    const early = night({ hoursAfter: CAROUSEL_LEAD_HOURS - 1 })
    const out = design([early, night({ hoursAfter: 20 }), night({ hoursAfter: 40 })])
    expect(out!.nights.map((n) => n.eventId)).not.toContain(early.eventId)
  })
  test('no city photograph of its own, or a week of fewer than two events, makes no carousel', () => {
    expect(design([night({ hoursAfter: 20 }), night({ hoursAfter: 40 })], null)).toBeNull()
    expect(design([night({ hoursAfter: 20 })])).toBeNull()
  })
  test('a night leads by its photograph with rights recorded, then EventLinqs ticketing, then an organiser we write to', () => {
    const base = night({ hoursAfter: 4 })
    expect(relationshipOf({ ...base, approvedPhotoUrl: 'https://x.test/p.jpg' })).toBe('permission')
    expect(relationshipOf({ ...base, cta: { ticketingByEventLinqs: true } as never })).toBe('ticketing')
    expect(relationshipOf({ ...base, cta: { ticketingByEventLinqs: false } as never }, new Set([base.eventId]))).toBe('writing')
    expect(relationshipOf({ ...base, cta: { ticketingByEventLinqs: false } as never })).toBeNull()
  })
  test("it goes at the window's opening, 06:00 on the week's Monday in Melbourne", () => {
    expect(carouselPostAt('2026-11-30').toISOString()).toBe('2026-11-29T19:00:00.000Z')
  })
})

describe("the carousel's timeline, as the timing engine holds a piece of nights ahead", () => {
  const post = carouselPostAt('2026-11-30') // Monday 30 November, 06:00 in Melbourne
  test('a first night on the Monday evening: useful until two hours before its doors, expired as it starts', () => {
    // Monday 30 November, 7:00 pm in Melbourne.
    expect(carouselTimeline(post, [{ startDate: '2026-11-30T08:00:00Z' }])).toEqual({ preferredAt: '2026-11-29T19:00:00.000Z', latestAt: '2026-11-30T06:00:00.000Z', expiresAt: '2026-11-30T08:00:00.000Z' })
  })
  test('a first night later in the week: never past the end of the Monday, so a missed Monday is never posted later (law 42)', () => {
    // Wednesday 2 December, 7:00 pm; the Monday ends at Tuesday 1 December, 00:00 in Melbourne (13:00 UTC on 30 November).
    expect(carouselTimeline(post, [{ startDate: '2026-12-02T08:00:00Z' }, { startDate: '2026-12-04T08:00:00Z' }])).toEqual({ preferredAt: '2026-11-29T19:00:00.000Z', latestAt: '2026-11-30T13:00:00.000Z', expiresAt: '2026-11-30T13:00:00.000Z' })
  })
})

describe("each city's cover photograph", () => {
  test("Melbourne's own (the register refuses the stock library), the guide's licensed banner for the others, credited as each licence asks", () => {
    const photos = cityCoverPhotos([{ slug: 'melbourne' }, { slug: 'geelong' }, { slug: 'ballarat' }, { slug: 'bendigo' }, { slug: 'perth' }], 'https://www.eventlinqs.com.au')
    expect(photos.get('melbourne')).toEqual({ url: 'https://www.eventlinqs.com.au/social/cities/melbourne-city-circle-tram.jpg', credit: 'Photo: Dietmar Rabich, CC BY-SA 4.0' })
    expect(photos.get('geelong')).toEqual({ url: 'https://www.eventlinqs.com.au/images/library/city-banner-geelong.jpg', credit: 'Photo: Mattplaysthedrums, CC BY-SA 4.0' })
    expect(photos.get('bendigo')).toEqual({ url: 'https://www.eventlinqs.com.au/images/library/city-banner-bendigo.jpg', credit: null })
    expect(photos.has('perth')).toBe(false)
    for (const p of photos.values()) expect(p.url).not.toContain('/storage/v1/object/public/event-images/stock/')
    expect(CITY_COVERS.melbourne.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
  })
})
