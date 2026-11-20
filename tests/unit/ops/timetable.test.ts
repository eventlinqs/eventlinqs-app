import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { PHASES, RIDES, lateBy, minutesOf, outreachPhaseAt, p90, phaseOf, phaseState, plannedStart, socialPhaseAt, melbourneMinutes, unitOfRun } from '@/lib/ops/timetable'
import { phaseRunRow } from '@/lib/ops/phase-runs'
import { SCHEDULES } from '@/lib/admin/automation-schedules'

/*
 * THE DAILY TIMETABLE (Lawal, 20 November 2026, 00:17; C:\dev\START-16OCT\DAILY-TIMETABLE-LOCKED-20NOV.md; the PM's
 * order of that night, train Y): one table, every phase's slot and cutoff, each start worked back from its cutoff on
 * measured times, every run recorded, no new or quickened cron.
 */
describe('the one table', () => {
  test("the phases in the locked document's order, each slot before or at its cutoff", () => {
    expect(PHASES.map((p) => p.key)).toEqual(['prepare', 'collect', 'verify', 'freeze', 'schedule', 'live', 'queue', 'report', 'send', 'inbox', 'midday', 'tonight', 'evening'])
    for (const p of PHASES) expect(minutesOf(p.slot), p.key).toBeLessThanOrEqual(minutesOf(p.cutoff))
    expect(phaseOf('live').cutoff).toBe('06:00')
    expect(phaseOf('report').cutoff).toBe('08:00')
  })

  test('every run a phase rides is a cron vercel.json already has, or its own workflow schedules, on the schedule the table names', () => {
    const crons = (JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }).crons
    for (const r of Object.values(RIDES)) {
      // The engine verifier rides GitHub (the PM's 05:38 of 20 November 2026): its own workflow schedules it.
      if (r.path.startsWith('.github/workflows/')) expect(readFileSync(join(process.cwd(), r.path), 'utf8'), r.path).toContain(`- cron: '${r.schedule}'`)
      else expect(crons.find((c) => c.path === r.path)?.schedule, r.path).toBe(r.schedule)
    }
    expect(RIDES.collection.schedule).toBe('25 4,10,16,22 * * *')
    expect(SCHEDULES.collectionRun.cron).toBe(RIDES.collection.schedule)
  })

  test('the database knows every phase the table names, and no other', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261120010001_ops_phase_runs.sql'), 'utf8')
    const listed = sql.match(/phase in \(([^)]*)\)/)![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(listed).toEqual(PHASES.map((p) => p.key))
  })
})

describe('working backwards from the cutoff', () => {
  test('p90 is the nearest rank', () => {
    expect(p90([])).toBeNull()
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9)
    expect(p90([5])).toBe(5)
  })

  test('start = cutoff minus count times the p90 per unit plus half again, at least 15 minutes; no history means the slot', () => {
    const freeze = phaseOf('freeze') // 04:40 to 05:30
    expect(plannedStart(freeze, 10, [])).toBe(minutesOf('04:40'))
    // 30 pieces at 60 s each is 30 minutes; half again is 45; 05:30 minus 45 is 04:45.
    expect(plannedStart(freeze, 30, [60, 60, 60])).toBe(minutesOf('04:45'))
    expect(lateBy(freeze, 30, [60, 60, 60])).toBe(0)
    // 80 pieces at 60 s is 120 minutes with the half: start 03:30, 70 minutes before the slot, so late before it begins.
    expect(lateBy(freeze, 80, [60])).toBe(70)
    // A tiny count still allows 15 minutes.
    expect(plannedStart(freeze, 1, [1])).toBe(minutesOf('05:15'))
  })

  test("a phase's state: done in time, done late, running, late, not yet", () => {
    const live = phaseOf('live')
    expect(phaseState(live, { startedAt: 'x', endedAt: 'y' }, 400, minutesOf('05:58'))).toBe('done')
    expect(phaseState(live, { startedAt: 'x', endedAt: 'y' }, 400, minutesOf('06:20'))).toBe('late')
    expect(phaseState(live, null, minutesOf('05:00'), null)).toBe('not yet')
    expect(phaseState(live, null, minutesOf('06:01'), null)).toBe('late')
  })
})

describe('the runs read their phase from the table', () => {
  test('the hourly social run: freeze, schedule, live, midday, tonight, evening, prepare; nothing at other hours', () => {
    expect([4, 5, 6, 12, 17, 19, 22, 23].map(socialPhaseAt)).toEqual(['freeze', 'schedule', 'live', 'midday', 'tonight', 'evening', 'prepare', 'prepare'])
    expect(socialPhaseAt(9)).toBeNull()
  })

  test('the outreach run: queue to 08:29, send to 10:30, inbox to 22:00, nothing at night', () => {
    expect(outreachPhaseAt(minutesOf('06:59'))).toBeNull()
    expect(outreachPhaseAt(minutesOf('07:00'))).toBe('queue')
    expect(outreachPhaseAt(minutesOf('08:30'))).toBe('send')
    expect(outreachPhaseAt(minutesOf('10:30'))).toBe('send')
    expect(outreachPhaseAt(minutesOf('10:45'))).toBe('inbox')
    expect(outreachPhaseAt(minutesOf('22:15'))).toBeNull()
  })

  test("Melbourne's minute of the day: 19:00 UTC on 19 November is 06:00 there", () => {
    expect(melbourneMinutes(new Date('2026-11-19T19:00:00Z'))).toBe(minutesOf('06:00'))
  })

  test('each route records its phase through the table, and the listings run keeps IndexNow\'s answer in its row', () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
    expect(read('src/app/api/cron/social-publish/route.ts')).toContain('socialPhaseAt(melbourneHour(now))')
    expect(read('src/app/api/cron/outreach-run/route.ts')).toContain('outreachPhaseAt(melbourneMinutes(now))')
    expect(read('src/app/api/cron/listing-occurrences/route.ts')).toMatch(/phase: 'collect',[\s\S]{0,400}IndexNow: \$\{indexNow\}/)
    expect(read('src/app/api/cron/health-heartbeat/route.ts')).toContain("phase: 'report', ride: 'heartbeat'")
  })
})

describe('a run record', () => {
  test('its unit from the table, units never below zero, an end never before its start, a long result cut', () => {
    const start = new Date('2026-11-20T04:40:00+11:00')
    const row = phaseRunRow({ phase: 'freeze', ride: 'social', startedAt: start, endedAt: new Date(start.getTime() - 1000), units: -3, result: 'x'.repeat(2500) })
    expect(row.unit).toBe('piece')
    expect(row.units).toBe(0)
    expect(row.ended_at).toBe(row.started_at)
    expect(String(row.result).length).toBeLessThanOrEqual(2000)
  })
})

// TRAIN AL (20 November 2026): /admin/today read '1171 sources' for Collect, where the hourly listings run had read 1,171
// nights; the board said every run in its phase's unit. A run is said in its own ride's unit where that is fixed.
describe("a run is counted in its own ride's unit", () => {
  test('Collect: the listings run counts nights, the collection run sources', () => {
    const collect = phaseOf('collect')
    expect(unitOfRun(collect, 'listings')).toBe('night')
    expect(unitOfRun(collect, 'collection')).toBe('source')
  })
  test("Verify: the link check counts links; a ride with no unit of its own, or none known, takes the phase's", () => {
    expect(unitOfRun(phaseOf('verify'), 'linkCheck')).toBe('link')
    expect(unitOfRun(phaseOf('queue'), 'outreach')).toBe('letter')
    expect(unitOfRun(phaseOf('collect'), null)).toBe('source')
    expect(unitOfRun(phaseOf('collect'), 'watchdog')).toBe('source')
  })
})
