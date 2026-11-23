import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planMoments, type CadenceRule } from '@/lib/social/cadence'
import { applyDailyFloor, dayKey, DISCOVERY_KINDS, rhythmDays, type FloorPiece } from '@/lib/social/daily-rhythm'

/*
 * THE OPERATING MODEL'S AMENDMENT 1, A1 AND A2 (the PM's 01:39 of 19 November 2026, item 2): the weekly rhythm is a lean
 * the relevance tiers override; a thin day takes one discovery family post and never an invented or passed night; a day
 * nothing can fill posts nothing and is named. Monday 23 November 2026 in Melbourne (daylight time, UTC+11).
 */
const NOW = new Date('2026-11-22T20:00:00Z') // Monday 23 November, 7 am in Melbourne
const daily = (h: number[]) => Array.from({ length: 7 }, (_, d) => h.map((x) => d * 24 + x)).flat()
const rules: Record<'feed' | 'story', CadenceRule> = {
  feed: { version: 1, gapHours: 12, slots: daily([9, 21]), basis: 'starting', learnedFrom: 0, floorPosts: 12, settleHours: 48, setAt: NOW },
  story: { version: 1, gapHours: 4, slots: daily([18]), basis: 'starting', learnedFrom: 0, floorPosts: 12, settleHours: 48, setAt: NOW },
}
const none = { feed: [], story: [] }
const SUNDAY_10AM = new Date('2026-11-28T23:00:00Z')
const MONDAY_10PM = new Date('2026-11-23T11:00:00Z')

describe('A2, the weekly rhythm: a lean, never a fixed calendar', () => {
  it('each family leans to its day when that day falls inside its own window', () => {
    expect(rhythmDays('week_ahead', { latestUseful: SUNDAY_10AM }, NOW)).toEqual([1])
    expect(rhythmDays('weekend_carousel', { latestUseful: SUNDAY_10AM }, NOW)).toEqual([4])
    expect(rhythmDays('free_week', { latestUseful: SUNDAY_10AM }, NOW)).toEqual([3, 0])
    // G, the organiser offer: business days only.
    expect(rhythmDays('organiser_campaign', {}, NOW)).toEqual([1, 2, 3, 4, 5])
  })

  it('law 18 wins: no lean that would hold a piece past its night, and Tonight and a night poster keep their own day', () => {
    // The weekend piece whose earliest night is Tuesday evening cannot wait for Thursday.
    expect(rhythmDays('weekend_carousel', { latestUseful: new Date('2026-11-24T08:00:00Z') }, NOW)).toBeNull()
    expect(rhythmDays('tonight', { latestUseful: SUNDAY_10AM }, NOW)).toBeNull()
    expect(rhythmDays('daily_poster', { latestUseful: SUNDAY_10AM }, NOW)).toBeNull()
  })

  it("car C's learning, once it gives days, replaces the rhythm's", () => {
    expect(rhythmDays('week_ahead', { latestUseful: SUNDAY_10AM }, NOW, { learned: [3] })).toEqual([3])
  })
})

describe('A1, the daily floor and the ceiling', () => {
  it('a thin day takes one discovery family post from a day with two, inside its own window; nothing is made', () => {
    const pieces: FloorPiece[] = [
      { id: 'week-ahead', kind: 'week_ahead', format: 'feed', approvedAt: NOW, latestUseful: SUNDAY_10AM },
      { id: 'free-week', kind: 'free_week', format: 'feed', approvedAt: NOW, latestUseful: SUNDAY_10AM },
    ]
    const plan = planMoments(pieces, rules, none, NOW)
    // Both on Monday, at 9 am and 9 pm: Tuesday is thin.
    expect([...plan.moments.values()].map((d) => dayKey(d))).toEqual(['2026-11-23', '2026-11-23'])
    const floor = applyDailyFloor({ pieces, plan, rules, taken: none, now: NOW })
    const tuesday = [...floor.moments].filter(([, at]) => dayKey(at) === '2026-11-24')
    expect(tuesday).toHaveLength(1)
    const [id, at] = tuesday[0]
    expect(DISCOVERY_KINDS).toContain(pieces.find((p) => p.id === id)?.kind)
    // Never a passed night: it goes before its earliest night starts.
    expect(at.getTime()).toBeLessThan(SUNDAY_10AM.getTime())
    // Never an invented one: only the plan's own pieces have moments, and Monday keeps one.
    expect([...floor.moments.keys()].sort()).toEqual(['free-week', 'week-ahead'])
    expect([...floor.moments.values()].filter((d) => dayKey(d) === '2026-11-23')).toHaveLength(1)
    expect(floor.moved).toEqual([{ id, day: '2026-11-24' }])
  })

  it('a day no piece can reach posts nothing and is named in the report', () => {
    // Both pieces' nights start on Monday evening: neither may go on Tuesday.
    const pieces: FloorPiece[] = [
      { id: 'week-ahead', kind: 'week_ahead', format: 'feed', approvedAt: NOW, latestUseful: MONDAY_10PM },
      { id: 'free-week', kind: 'free_week', format: 'feed', approvedAt: NOW, latestUseful: MONDAY_10PM },
    ]
    const floor = applyDailyFloor({ pieces, plan: planMoments(pieces, rules, none, NOW), rules, taken: none, now: NOW })
    expect([...floor.moments.values()].filter((d) => dayKey(d) === '2026-11-24')).toHaveLength(0)
    expect(floor.moved).toEqual([])
    expect(floor.report).toContain('No feed post on Tuesday 24 November: no approved piece from a verified listing can go that day, so none is made (A1).')
    // A story is never moved or made: a day without one is named the same way.
    expect(floor.report).toContain('No story on Tuesday 24 November: no approved story\'s night falls that day, so none is made (A1).')
  })

  it('a piece that is not discovery (a night poster) is never moved to fill a day', () => {
    const pieces: FloorPiece[] = [
      { id: 'poster-a', kind: 'daily_poster', format: 'feed', approvedAt: NOW, latestUseful: SUNDAY_10AM },
      { id: 'poster-b', kind: 'daily_poster', format: 'feed', approvedAt: NOW, latestUseful: SUNDAY_10AM },
    ]
    const floor = applyDailyFloor({ pieces, plan: planMoments(pieces, rules, none, NOW), rules, taken: none, now: NOW })
    expect(floor.moved).toEqual([])
    expect(floor.report.some((l) => l.startsWith('No feed post on Tuesday 24 November'))).toBe(true)
  })

  it('the ceiling holds: never two feed posts inside the gap, never more than the day has bands', () => {
    const pieces: FloorPiece[] = ['week_ahead', 'free_week', 'venue_spotlight', 'week_ahead', 'free_week'].map((kind, i) => ({ id: `p${i}`, kind, format: 'feed', approvedAt: NOW, latestUseful: SUNDAY_10AM }))
    const floor = applyDailyFloor({ pieces, plan: planMoments(pieces, rules, none, NOW), rules, taken: none, now: NOW })
    const times = [...floor.moments.values()].map((d) => d.getTime()).sort((a, b) => a - b)
    for (let i = 1; i < times.length; i += 1) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(12 * 3_600_000)
    const perDay = new Map<string, number>()
    for (const d of floor.moments.values()) perDay.set(dayKey(d), (perDay.get(dayKey(d)) ?? 0) + 1)
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(2)
  })
})

describe('A1 and A2 are wired where approved pieces are scheduled', () => {
  const root = process.cwd()
  const store = readFileSync(join(root, 'src/lib/social/store.ts'), 'utf8').replace(/\r\n/g, '\n')
  const cron = readFileSync(join(root, 'src/app/api/cron/social-publish/route.ts'), 'utf8').replace(/\r\n/g, '\n')
  it('the scheduler leans each piece by its kind and applies the floor to the plan', () => {
    const body = store.slice(store.indexOf('export async function scheduleApprovedPieces('))
    expect(body).toMatch(/rhythmDays\(d\.kind, window, now\)/)
    // Every piece but one an owner asked to post at this minute (postNightNow, 22 November 2026) is banded and floored.
    expect(body).toMatch(/const banded = pieces\.filter\(\(p\) => !goNow\.has\(p\.id\)\)/)
    expect(body).toMatch(/applyDailyFloor\(\{ pieces: banded, plan: planMoments\(banded, rules, taken, now\)/)
    expect(body).toMatch(/floor: plan\.report/)
  })
  it('the hourly run names every day the floor could not fill', () => {
    expect(cron).toMatch(/for \(const f of scheduled\.floor\) console\.log/)
  })
})
