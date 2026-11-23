import { describe, expect, it } from 'vitest'
import { dayStart, momentWindowOf, planMoments, scheduleWindowOf, withStartingCalendar, type CadenceRule, type SocialFormat } from '@/lib/social/cadence'
import { endedByFirstBand, firstLineFor, startedByFirstBand, type MomentKind } from '@/lib/social/lifecycle'
import { ON_NOW } from '@/lib/social/piece-quality'

/*
 * EVERY LIFECYCLE MOMENT HAS A WINDOW IT CAN POST IN (the PM's 16:05 of 21 November 2026: "a class test that every
 * lifecycle moment has a non empty window"). On 21 November the run held Colours of Asia's tomorrow story because its
 * window was empty ('its next free band, Sun 22 Nov, 6:00 pm, is after ... starts (Sun 22 Nov, 12:00 am)'). For each
 * moment kind, each format it posts in, and three nights (an evening, a morning, a festival listed from midnight): the
 * first line the planner gives it, the window the scheduler gives that line, a band the starting calendar places in it on
 * the moment's own day, and the publish gate's rule at that band (a started night posts only while its words say it is
 * on now and it has not ended).
 */
const ZONE = 'Australia/Melbourne'
const rule = (format: SocialFormat): CadenceRule =>
  withStartingCalendar({ version: 1, gapHours: format === 'feed' ? 12 : 2, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 0, settleHours: 0, setAt: new Date('2026-11-01T00:00:00Z') }, format)

type Night = { title: string; start: number; end: number; startIso: string }
const night = (title: string, startIso: string, endIso: string): Night => ({ title, start: Date.parse(startIso), end: Date.parse(endIso), startIso })
// Saturday 5 December 2026, Melbourne (UTC+11).
const NIGHTS = {
  evening: night('An evening show', '2026-12-05T08:30:00Z', '2026-12-05T12:00:00Z'), // Sat 7:30 pm to 11 pm
  morning: night('A morning market', '2026-12-04T23:00:00Z', '2026-12-05T05:00:00Z'), // Sat 10 am to 4 pm
  festival: night('A festival listed from midnight', '2026-12-04T13:00:00Z', '2026-12-06T11:00:00Z'), // Sat 00:00 to Sun 10 pm
}
const D = '2026-12-05'
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

const MOMENTS: { kind: MomentKind; formats: SocialFormat[]; day: (n: keyof typeof NIGHTS) => string | null }[] = [
  { kind: 'build', formats: ['feed'], day: () => shift(D, -20) },
  { kind: 'announce', formats: ['feed'], day: () => shift(D, -10) },
  { kind: 'final_push', formats: ['feed'], day: () => shift(D, -2) },
  { kind: 'tomorrow', formats: ['story'], day: () => shift(D, -1) },
  { kind: 'first_day', formats: ['feed', 'story'], day: () => D },
  { kind: 'running', formats: ['feed', 'story'], day: (n) => (n === 'festival' ? shift(D, 1) : null) },
  { kind: 'final_day', formats: ['feed', 'story'], day: (n) => (n === 'festival' ? shift(D, 1) : null) },
]

describe('every lifecycle moment has a window it can post in', () => {
  for (const m of MOMENTS) {
    for (const format of m.formats) {
      for (const name of Object.keys(NIGHTS) as (keyof typeof NIGHTS)[]) {
        const day = m.day(name)
        if (day === null) continue
        it(`${m.kind} ${format}, ${name}`, () => {
          const n = NIGHTS[name]
          // A piece whose night has ended by its format's first band that day is never drawn (the planner's rule).
          if (endedByFirstBand(new Date(n.end).toISOString(), ZONE, format, day)) {
            expect([m.kind, format, name]).toEqual(['first_day', 'story', 'morning'])
            return
          }
          const line = firstLineFor(m.kind, true, new Set(), 0, startedByFirstBand(n.startIso, ZONE, format, day))
          expect(line).not.toBeNull()
          const onNow = ON_NOW.test(line as string)
          const w = momentWindowOf(day, scheduleWindowOf(format, [n], ZONE, { onNow }))
          expect(w.notBefore.getTime()).toBeLessThan(w.latestUseful.getTime())
          const opens = dayStart(new Date(`${day}T02:00:00Z`), ZONE)
          const plan = planMoments(
            [{ id: 'p', format, approvedAt: new Date(opens.getTime() - 3_600_000), latestUseful: w.latestUseful, notBefore: w.notBefore, days: null }],
            { feed: rule('feed'), story: rule('story') },
            { feed: [], story: [] },
            new Date(opens.getTime() - 3_600_000),
            ZONE,
          )
          expect(plan.late).toEqual([])
          const at = plan.moments.get('p')
          expect(at).toBeDefined()
          // On the moment's own day.
          expect(dayStart(at as Date, ZONE).getTime()).toBe(opens.getTime())
          // The publish gate (piece-quality.ts, class 1): a started night posts only while it is on now and not ended.
          const started = n.start <= (at as Date).getTime()
          const ended = n.end <= (at as Date).getTime()
          expect(!started || (onNow && !ended)).toBe(true)
        })
      }
    }
  }
})
