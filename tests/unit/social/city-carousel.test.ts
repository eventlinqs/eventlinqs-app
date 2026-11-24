import { describe, expect, test } from 'vitest'
import { CAROUSEL_EVENTS, captionWeek, carouselCaption, chooseCarouselNights, dateStrip, dayOf, iconRow, type CarouselNight } from '@/lib/social/city-carousel'
import { captionMarkFaults } from '@/lib/social/caption-marks'

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
  test('a hook naming the city and the week, a line per event with its day, the question, at most three tags', () => {
    const ig = carouselCaption({ city: 'Melbourne', postAt: POST, nights, platform: 'instagram', link: 'https://www.eventlinqs.com.au/city/melbourne', tags: ['#Melbourne', 'WhatsOnMelbourne', 'ThingsToDo', 'Extra'] })
    const lines = ig.split('\n')
    expect(lines[0]).toMatch(/Things to do in Melbourne this week, 30 Nov to 6 Dec\.$/)
    expect(ig).toContain('Mon 30 Nov: Jazz on the Roof')
    expect(ig).toContain('Wed 2 Dec: Kids Science Day (free)')
    expect(ig).toContain('Which one are you going to?')
    expect(ig).toContain('link in bio')
    expect(ig).not.toMatch(/\b(today|tonight|tomorrow|this weekend)\b/i)
    expect(lines.at(-1)).toBe('#Melbourne #WhatsOnMelbourne #ThingsToDo')
    expect(captionMarkFaults(ig)).toEqual([])
    const fb = carouselCaption({ city: 'Melbourne', postAt: POST, nights, platform: 'facebook', link: 'https://www.eventlinqs.com.au/city/melbourne', tags: [] })
    expect(fb).toContain('https://www.eventlinqs.com.au/city/melbourne')
    expect(fb).not.toContain('link in bio')
  })
})
