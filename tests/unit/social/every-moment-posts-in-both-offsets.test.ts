import { describe, expect, it } from 'vitest'
import { firstLineFor, momentSaysOnNow, postableBand, type MomentKind } from '@/lib/social/lifecycle'
import { ON_NOW } from '@/lib/social/piece-quality'

/*
 * EVERY LIFECYCLE MOMENT HAS A NON EMPTY POSTING WINDOW, AT EVERY START TIME AND IN BOTH DAYLIGHT SAVING OFFSETS (the PM's
 * 16:30 and 16:40 of 21 November 2026, item 3 and (d)): announced, building, this week, tomorrow, today, running now and
 * final day, for nights that start at midnight, at 18:00 and at 23:00, in December (UTC+11) and June (UTC+10). Each is
 * asked of postableBand, the one rule the planner draws by, at the planner's own 06:40 run on the moment's day; and every
 * first line says on now exactly when its kind does, so the words and the window can never disagree.
 */
const ZONE = 'Australia/Melbourne'
const SEASONS = [
  { name: 'December', day: '2026-12-05', offset: '+11:00' },
  { name: 'June', day: '2027-06-05', offset: '+10:00' },
] as const
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const at = (day: string, hm: string, offset: string) => new Date(`${day}T${hm}:00${offset}`).toISOString()

// A night as listed: from midnight (an all day listing to 10 pm), from 6 pm to 11 pm, and from 11 pm to 3 am. A festival
// runs three days from the same start, to 10 pm on its last day.
const SHAPES = [
  { name: 'midnight', start: '00:00', single: { days: 0, end: '22:00' } },
  { name: '18:00', start: '18:00', single: { days: 0, end: '23:00' } },
  { name: '23:00', start: '23:00', single: { days: 1, end: '03:00' } },
] as const

type Case = { kind: MomentKind; formats: ('feed' | 'story')[]; day: (d: string) => string; festival: boolean }
const CASES: Case[] = [
  { kind: 'build', formats: ['feed'], day: (d) => shift(d, -20), festival: false },
  { kind: 'announce', formats: ['feed'], day: (d) => shift(d, -10), festival: false },
  { kind: 'final_push', formats: ['feed'], day: (d) => shift(d, -2), festival: false },
  { kind: 'tomorrow', formats: ['story'], day: (d) => shift(d, -1), festival: false },
  { kind: 'first_day', formats: ['feed', 'story'], day: (d) => d, festival: false },
  { kind: 'running', formats: ['feed', 'story'], day: (d) => shift(d, 1), festival: true },
  { kind: 'final_day', formats: ['feed', 'story'], day: (d) => shift(d, 2), festival: true },
]

describe('every lifecycle moment has a posting window, at every start, in both offsets', () => {
  for (const season of SEASONS) {
    for (const shape of SHAPES) {
      for (const c of CASES) {
        for (const format of c.formats) {
          it(`${season.name}, a night from ${shape.name}: ${c.kind} ${format}`, () => {
            const startDate = at(season.day, shape.start, season.offset)
            const endDate = c.festival
              ? at(shift(season.day, 2), '22:00', season.offset)
              : at(shift(season.day, shape.single.days), shape.single.end, season.offset)
            const day = c.day(season.day)
            const now = new Date(at(day, '06:40', season.offset))
            const band = postableBand({ kind: c.kind, format, night: { title: 'A night', startDate, endDate }, day, zone: ZONE, now })
            expect('why' in band ? band.why : null).toBeNull()
            if ('at' in band) {
              // On the moment's own day, never before the planner's run, and the night not over.
              expect(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(band.at)).toBe(day)
              expect(band.at.getTime()).toBeGreaterThanOrEqual(now.getTime())
              expect(band.at.getTime()).toBeLessThan(Date.parse(endDate))
            }
          })
        }
      }
    }
  }
})

describe("every first line says on now exactly when its kind's window needs it", () => {
  const KINDS: MomentKind[] = ['announce', 'build', 'final_push', 'tomorrow', 'first_day', 'running', 'final_day']
  for (const kind of KINDS) {
    for (const startedByBand of [false, true]) {
      it(`${kind}, ${startedByBand ? 'under way by its band' : 'not yet started'}`, () => {
        const lines = new Set<string>()
        for (let seed = 0; seed < 8; seed += 1) {
          const line = firstLineFor(kind, true, new Set(), seed, startedByBand)
          if (line !== null) lines.add(line)
        }
        expect(lines.size).toBeGreaterThan(0)
        for (const line of lines) expect(ON_NOW.test(line)).toBe(momentSaysOnNow(kind, startedByBand))
      })
    }
  }
})
