import { describe, expect, it } from 'vitest'
import { judgeVisitorPage, linksOnPage, type PageEventFacts } from '@/lib/health/visitor-sentinel'

/*
 * THE VISITOR SENTINEL (the controller's 16:43 of 1 November 2026, Lawal: nothing may break tomorrow or after). What a
 * visitor meets on a city page is judged from the page itself and the database's own facts about every night it links:
 * no ended night, no night of another city, no dead booking button, no placeholder drawn where a photograph belongs.
 */

const NOW = new Date('2026-11-01T07:00:00Z') // 18:00 in Geelong

const html = (...events: string[]) =>
  `<main>${events.map((s) => `<a href="/events/${s}"><img src="https://x.supabase.co/storage/v1/object/public/event-images/a/${s}.jpg"></a>`).join('')}
   <a href="/out/abc">Tickets</a><a href="/about">About</a><a href="https://www.ticketek.com.au/x">Elsewhere</a></main>`

const fact = (over: Partial<PageEventFacts> = {}): PageEventFacts => ({
  slug: 'trivia-night', citySlug: 'geelong', startDate: '2026-11-03T08:30:00Z', endDate: null, timezone: 'Australia/Melbourne',
  status: 'published', deadBookingLinks: 0, liveBookingLinks: 1, ...over,
})

const failing = (r: ReturnType<typeof judgeVisitorPage>) => r.filter((x) => !x.ok).map((x) => x.id)

describe('the links a visitor can follow', () => {
  it('reads internal links and event pages, and leaves the counted routes and outside sites alone', () => {
    const l = linksOnPage(html('trivia-night'))
    expect(l.events).toEqual(['trivia-night'])
    expect(l.internal).toEqual(['/events/trivia-night', '/about'])
  })
})

describe('what the page shows, judged against the database', () => {
  it('a page of current nights in its own city reads clean', () => {
    expect(failing(judgeVisitorPage({ path: '/city/geelong', citySlug: 'geelong', html: html('trivia-night'), facts: [fact()], now: NOW }))).toEqual([])
  })

  it('a night that has ended, in its own zone, fails', () => {
    const r = judgeVisitorPage({ path: '/city/geelong', citySlug: 'geelong', html: html('old-show'), facts: [fact({ slug: 'old-show', startDate: '2026-10-30T08:00:00Z' })], now: NOW })
    expect(failing(r)).toEqual(['visitor-ended:/city/geelong'])
  })

  it('a night of another city on a city page fails', () => {
    const r = judgeVisitorPage({ path: '/city/geelong', citySlug: 'geelong', html: html('melb-gig'), facts: [fact({ slug: 'melb-gig', citySlug: 'melbourne' })], now: NOW })
    expect(failing(r)).toEqual(['visitor-other-city:/city/geelong'])
  })

  // WINDOW 1's 16:50: the label is what put Aireys Inlet (41 km, Surf Coast) under Geelong, so the venue's own placement
  // (public.venue_city_relation, 20261101160001) judges where one is known; the label only where it is not.
  it('a night labelled with the city whose venue stands outside it fails, by the venue, not the label', () => {
    const aireys = fact({ slug: 'aireys-gig', citySlug: 'geelong', cityRelation: 'outside' })
    const r = judgeVisitorPage({ path: '/city/geelong', citySlug: 'geelong', html: html('aireys-gig'), facts: [aireys], now: NOW })
    expect(failing(r)).toEqual(['visitor-other-city:/city/geelong'])
  })

  it('a night whose venue is in the city or its surrounds reads clean whatever its label says', () => {
    for (const rel of ['city', 'surrounding']) {
      const f = fact({ slug: 'lara-gig', citySlug: 'melbourne', cityRelation: rel })
      expect(failing(judgeVisitorPage({ path: '/city/geelong', citySlug: 'geelong', html: html('lara-gig'), facts: [f], now: NOW }))).toEqual([])
    }
  })

  it('a night whose every booking link is dead fails', () => {
    const r = judgeVisitorPage({ path: '/city/geelong', citySlug: 'geelong', html: html('trivia-night'), facts: [fact({ deadBookingLinks: 1, liveBookingLinks: 0 })], now: NOW })
    expect(failing(r)).toEqual(['visitor-dead-booking:/city/geelong'])
  })

  it('a placeholder cover drawn where a photograph belongs fails', () => {
    const page = `<a href="/events/trivia-night"><img src="https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/t.png"></a>`
    expect(failing(judgeVisitorPage({ path: '/city/geelong', citySlug: 'geelong', html: page, facts: [fact()], now: NOW }))).toEqual(['visitor-placeholder:/city/geelong'])
  })

  it('the home page is judged for ended nights and placeholders but not for one city', () => {
    const r = judgeVisitorPage({ path: '/', citySlug: null, html: html('melb-gig'), facts: [fact({ slug: 'melb-gig', citySlug: 'melbourne' })], now: NOW })
    expect(failing(r)).toEqual([])
  })

  it('every failure is critical and names the nights, so the founder can act', () => {
    const r = judgeVisitorPage({ path: '/city/geelong', citySlug: 'geelong', html: html('old-show'), facts: [fact({ slug: 'old-show', startDate: '2026-10-30T08:00:00Z' })], now: NOW })
    const bad = r.find((x) => !x.ok)
    expect(bad?.severity).toBe('critical')
    expect(bad?.detail).toContain('old-show')
  })
})
