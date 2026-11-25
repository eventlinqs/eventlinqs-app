import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { unpostableReason } from '@/lib/social/store'

/*
 * THE QUEUE KEPT HONEST (WINDOW 5C, 25 November 2026; the PM's 12:11 item 2). Of 136 discarded pieces, 69 of the 70
 * that expired were drawn 9 to 16 November in families law 37 then switched off: nothing could approve them, and nothing
 * set them aside, so each stood pending until its nights passed. The daily run now sets aside each unapproved piece
 * nothing can approve, with its reason; these are red on main, where neither the rule nor the step exists.
 */
const NOW = new Date('2026-11-25T19:40:00Z') // Thursday 26 November, 06:40 in Melbourne
const H = 3_600_000
const photo = [{ t: 'photo' as const }]

describe('why a piece nothing can approve is set aside', () => {
  it('every night it shows is over', () => {
    expect(unpostableReason({ kind: 'coming_up', slides: photo, ends: [NOW.getTime() - H, NOW.getTime() - 5 * H] }, NOW)).toMatch(/every night it shows had ended/)
  })
  it('never while a night is still to come or still on: a night on now may be posted while it runs', () => {
    expect(unpostableReason({ kind: 'coming_up', slides: photo, ends: [NOW.getTime() - H, NOW.getTime() + H] }, NOW)).toBeNull()
    expect(unpostableReason({ kind: 'coming_up', slides: photo, ends: [Number.NaN] }, NOW)).toBeNull()
  })
  it('a piece of our own account whose slides law 37 no longer posts (an earlier family)', () => {
    expect(unpostableReason({ kind: 'daily_poster', slides: [{ t: 'poster' }], ends: [NOW.getTime() + 48 * H] }, NOW)).toMatch(/^Set aside by the daily run: It is not in law 37's format/)
    expect(unpostableReason({ kind: 'week_ahead', slides: [{ t: 'week_cover' }, { t: 'feature' }], ends: [NOW.getTime() + 48 * H] }, NOW)).toMatch(/law 37/)
  })
  it("a permitted photograph whole, or a finished file, still to come, is left alone", () => {
    expect(unpostableReason({ kind: 'coming_up', slides: photo, ends: [NOW.getTime() + 48 * H] }, NOW)).toBeNull()
  })
  it("a partner kit is a card for the partner's own account, so only its nights set it aside", () => {
    expect(unpostableReason({ kind: 'partner_kit', slides: [{ t: 'story' }], ends: [NOW.getTime() + 48 * H] }, NOW)).toBeNull()
    expect(unpostableReason({ kind: 'partner_kit', slides: [{ t: 'story' }], ends: [NOW.getTime() - H] }, NOW)).toMatch(/had ended/)
  })
})

describe("every hour's run sets them aside", () => {
  const route = readFileSync('src/app/api/cron/social-publish/route.ts', 'utf8').replace(/\r\n/g, '\n')
  // The PM's 14:15 item E: "set aside the hour the rule changes", so in every hour's run, never the 06:40 run alone; after
  // the 06:40 plan in the run that plans, in the standing policy's name, and what it set aside recorded.
  it("calls the step in every hour's run, after the 06:40 plan, in the standing policy's name, and records what it set aside", () => {
    const daily = route.slice(route.indexOf("if (hourRun && (melbourneHour(now) === 6"), route.indexOf('// THE QUEUE KEPT HONEST, EVERY HOUR'))
    const hourly = route.slice(route.indexOf('// THE QUEUE KEPT HONEST, EVERY HOUR'), route.indexOf('// THE TIMETABLE\'S SOCIAL PHASES'))
    expect(daily).toContain('planCampaignWeek(db')
    expect(daily).not.toContain('setAsideUnpostable(')
    // Its own block, opened by the hour's run alone, after the 06:40 block has closed.
    expect(route.slice(0, route.indexOf('// THE QUEUE KEPT HONEST, EVERY HOUR')).trimEnd().endsWith('}\n    if (hourRun) {')).toBe(true)
    expect(hourly).toContain('setAsideUnpostable(db, { now, by: founder.id })')
    expect(hourly).not.toContain('melbourneHour(now) === 6')
    expect(route.indexOf('planCampaignWeek(db, { plannedBy: null, now })')).toBeLessThan(route.indexOf('setAsideUnpostable(db, { now, by: founder.id })'))
    expect(hourly).toContain("action: 'system.social.set_aside'")
  })
})
