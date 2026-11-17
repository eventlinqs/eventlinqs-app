import { describe, expect, it } from 'vitest'
import { languageFaults, PIECE_RULES_SINCE, pieceQuality, type QualityNight } from '@/lib/social/piece-quality'
import type { Slide } from '@/lib/social/campaign'

/*
 * LAW 22, THE PUBLISH GATE: ONE CHECK OF A PIECE'S OWN CONTENT (the PM's 21:58 and 22:02 of 17 November 2026; P0 sections
 * 3, 4, 5, 6 and 7). Each drill plants a fault seen on 17 November and the gate refuses it with an actionable reason:
 * Pevan & Sarah at 9:25 pm (its night had started), a guitarist over Boyz II Men, 'one nights', 'Quintet- JL Room',
 * the robotic 'An event on a ... evening' line, 'Her Majesty's Theatre Ballarat, Ballarat', and a piece drawn on
 * 16 November. A clean piece passes.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const GUITARIST = `${ORIGIN}/social/stand-ins/12298227.jpg`
const after = new Date(Date.parse(PIECE_RULES_SINCE) + 60_000).toISOString()

const night = (over: Partial<QualityNight> & { eventId: string; title: string; startDate: string }): QualityNight => ({
  summary: null,
  venueName: 'Costa Hall',
  host: 'Costa Hall',
  categorySlug: 'music',
  timezone: 'Australia/Melbourne',
  ...over,
})

const boyz = night({ eventId: 'b', title: 'Boyz II Men', startDate: '2026-11-28T05:00:00Z', venueName: 'Mt Duneed Estate', host: 'Mt Duneed Estate' })
const medium = night({ eventId: 'm', title: 'Psychic Medium John Edward', startDate: '2026-11-28T02:00:00Z', categorySlug: 'talks', summary: 'An evening of readings with the psychic medium.' })
const gig = night({ eventId: 'g', title: 'The Teskey Brothers', startDate: '2026-11-28T09:00:00Z', venueName: 'Forum Melbourne', host: 'Forum Melbourne' })
const pevan = night({ eventId: 'p', title: 'Pevan & Sarah in Concert 2026', startDate: '2026-11-16T23:30:00Z', venueName: 'Ulumbarra Theatre', host: 'Ulumbarra Theatre' })

const nightsOf = (...ns: QualityNight[]) => new Map(ns.map((n) => [n.eventId, n]))
const row = (n: QualityNight) => ({ eventId: n.eventId, startDate: n.startDate, when: '7:30 PM', sub: null, title: n.title, place: n.venueName ?? '', free: false })
const days = (photo: string | null, ns: QualityNight[]): Slide =>
  ({ t: 'days', composition: 'contents_cover', day: 'Saturday', date: '28 Nov', rows: ns.map(row), photo, credit: photo ? 'Illustrative photo: Alexander Hamilton / Pexels' : null }) as unknown as Slide
const ask: Slide = { t: 'ask', composition: 'contents_cover', three: [], all: 'All 3 are on EventLinqs.', link: 'Link in bio' } as unknown as Slide

const base = { caption: 'Three nights worth planning for in Geelong.\n\nAll of it: eventlinqs.com.au/city/geelong', madeAt: after, now: new Date('2026-11-18T00:00:00Z') }

describe('pieceQuality, the drills', () => {
  it('a clean piece passes', () => {
    expect(pieceQuality({ ...base, slides: [days(GUITARIST, [gig, boyz]), ask], nights: nightsOf(gig, boyz) })).toEqual([])
  })

  it('Pevan & Sarah at 9:25 pm: a piece whose night has started is refused (class 1)', () => {
    const out = pieceQuality({ ...base, slides: [days(null, [pevan])], nights: nightsOf(pevan), now: new Date('2026-11-17T10:25:00Z') })
    expect(out.join(' ')).toMatch(/^\[night\] Pevan & Sarah in Concert 2026: it has started/)
  })

  it('a guitarist over a psychic medium and Boyz II Men: a stand-in that does not show its nights is refused (class 2)', () => {
    const out = pieceQuality({ ...base, slides: [days(GUITARIST, [medium, boyz])], nights: nightsOf(medium, boyz) })
    expect(out.some((r) => r.startsWith('[photo] slide 1') && r.includes('Psychic Medium John Edward'))).toBe(true)
  })

  it('a stand-in over nights of its own kind passes', () => {
    expect(pieceQuality({ ...base, slides: [days(GUITARIST, [gig])], nights: nightsOf(gig) })).toEqual([])
  })

  it("'one nights', 'Quintet- JL Room' and the robotic line are refused (class 4)", () => {
    const words = (s: string) => pieceQuality({ ...base, caption: s, slides: [ask], nights: nightsOf() }).join(' ')
    expect(words('Family in Geelong this week: one nights.')).toMatch(/\[language\].*one nights/)
    expect(words('Darcy Gilkerson Quintet- JL Room at The JazzLab.')).toMatch(/\[language\].*Quintet- JL Room/)
    expect(words('An event on a Wednesday evening, tickets through AXS.')).toMatch(/\[language\].*robotic/)
  })

  it("'Her Majesty's Theatre Ballarat, Ballarat' is refused: the city said twice", () => {
    const out = pieceQuality({ ...base, caption: "Thu 19 Nov, 7pm, Kate Ceberano, Her Majesty's Theatre Ballarat, Ballarat.", slides: [ask], nights: nightsOf() })
    expect(out.join(' ')).toMatch(/\[language\].*Ballarat, Ballarat/)
  })

  it('a piece drawn on 16 November is stale and refused until drawn again (class 5)', () => {
    const out = pieceQuality({ ...base, madeAt: '2026-11-15T19:40:07.237+00:00', slides: [ask], nights: nightsOf() })
    expect(out.join(' ')).toMatch(/^\[stale\]/)
  })

  it('a piece the locked look refuses is refused (class 3)', () => {
    const cover = { t: 'cover', composition: 'contents_cover', chip: 'x', headline: 'x', line: 'x', contents: [] } as unknown as Slide
    expect(pieceQuality({ ...base, slides: [cover, ask], nights: nightsOf() }).join(' ')).toMatch(/\[look\]/)
  })
})

describe("hashtags come from one list (the PM's 23:45, fix (e))", () => {
  it("'#geelongevent' (the s missing) is refused; '#geelong #geelongevents' and '#thisweekend' pass", () => {
    expect(languageFaults(['#geelong #geelongevent'])).toEqual(['[language] "#geelongevent" is not one of our hashtags; use the city\'s own two.'])
    expect(languageFaults(['#geelong #geelongevents', '#melbourne #melbourneevents #thisweekend', '#victoriaevents'])).toEqual([])
  })
})
