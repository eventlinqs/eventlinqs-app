/*
 * NOTHING STAYS ONLINE UNLESS VERIFIED ON ITS REAL SOURCE (Lawal, 15 November 2026, 06:03). The fixed critical case
 * BRAZJAZ (law 19 (c)): stored Sat 21 November 2026, 8:00 pm at The JazzLab; on 15 November its page stated only Sat 4 April,
 * 8:00 pm (the engine verifier, run 43622475988), and the night stayed public. The shared judge (src/lib/listings/
 * night-judge.ts, the accuracy sweep's own rules) must call that a disagreement, never an agreement or a silence; the
 * re-read (src/lib/listings/reverify-run.ts) reads a night exactly when its own freshness tier is about to run out.
 */
import { describe, expect, it } from 'vitest'
import { judgeNight, verdictOf, type ListedNight } from '@/lib/listings/night-judge'
import { isDue, readDay, siteOf, DUE_AHEAD_MS } from '@/lib/listings/reverify-run'
import type { FoundEvent } from '@/lib/listings/collect'

const BRAZJAZ: ListedNight = {
  id: 'bfbab3e3-ad8a-432f-b98f-8a073c9006f6',
  title: 'BRAZJAZ- JL Room',
  start_date: '2026-11-21T09:00:00+00:00',
  timezone: 'Australia/Melbourne',
  venue_name: 'The JazzLab',
  venue_address: '27 Leslie St, Brunswick VIC 3056',
}
const found = (title: string, startsAt: string): FoundEvent => ({
  title, startsAt, endsAt: null, venueName: 'The JazzLab', venueAddress: '27 Leslie St, Brunswick VIC 3056',
  pageUrl: 'https://thejazzlab.com.au/event/brazjaz-2/', imageUrl: null, description: null, links: [], timeStatus: 'exact',
})

describe('the fixed critical case BRAZJAZ (law 19 (c))', () => {
  it('a page that states only Sat 4 April is a disagreement on the start, never an agreement', () => {
    const page = '<h1>BRAZJAZ</h1><p>This event has passed.</p><p>Saturday, April 4, 2026 @ 8:00 pm</p>'
    const j = judgeNight(BRAZJAZ, false, page, [found('BRAZJAZ', '2026-04-04T09:00:00+00:00')], [])
    const v = verdictOf(j)
    expect(v.verdict).toBe('disagree')
    expect(v.field).toBe('start')
    expect(v.detail).toMatch(/4 Apr/)
  })
  it('the same page stating 21 November at 8:00 pm agrees', () => {
    const j = judgeNight(BRAZJAZ, false, '<h1>BRAZJAZ- JL Room</h1>', [found('BRAZJAZ- JL Room', '2026-11-21T09:00:00+00:00')], [])
    expect(verdictOf(j).verdict).toBe('agree')
  })
  it('a page that states nothing the readers can judge is unread, never an agreement', () => {
    const j = judgeNight(BRAZJAZ, false, '<p>Page not found</p>', [], [])
    expect(verdictOf(j).verdict).toBe('unread')
  })
  it('a venue that differs is a disagreement on the venue', () => {
    const elsewhere = { ...found('BRAZJAZ- JL Room', '2026-11-21T09:00:00+00:00'), venueName: 'Bird\'s Basement', venueAddress: '11 Singers Ln, Melbourne VIC 3000' }
    const v = verdictOf(judgeNight(BRAZJAZ, false, '', [elsewhere], []))
    expect(v.verdict).toBe('disagree')
    expect(v.field).toBe('venue')
  })
})

describe('the re-read reads only the nights whose own tier runs out (the PM 15 November 2026 07:00, item 4)', () => {
  const now = new Date('2026-11-15T00:00:00Z')
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString()
  it('a night never verified is due', () => {
    expect(isDue({ fresh_until: null }, now)).toBe(true)
  })
  it('a night whose freshness ends inside the next turns is due; one fresh for longer is not, however near its start', () => {
    expect(isDue({ fresh_until: at(DUE_AHEAD_MS - 1) }, now)).toBe(true)
    expect(isDue({ fresh_until: at(-1) }, now)).toBe(true)
    expect(isDue({ fresh_until: at(DUE_AHEAD_MS + 1) }, now)).toBe(false)
  })
  it('a check is dated on the Melbourne day of its read', () => {
    expect(readDay(new Date('2026-11-14T14:30:00Z'))).toBe('2026-11-15')
  })
})

describe('a disagreement marks its site (item 4 (e))', () => {
  it('reads the site a night was read from, www. aside', () => {
    expect(siteOf('https://www.thejazzlab.com.au/event/brazjaz/')).toBe('thejazzlab.com.au')
    expect(siteOf('not a page')).toBeNull()
    expect(siteOf(null)).toBeNull()
  })
})
