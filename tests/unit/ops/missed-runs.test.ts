import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GRACE_MINUTES, WATCHDOG_RIDE, missedPhases, missedWords, type DayRun } from '@/lib/ops/missed-runs'
import { PHASES, phaseState, type Phase } from '@/lib/ops/timetable'

/*
 * THE MISSED-RUN ALARM (Lawal's 09:01 of 20 November 2026, item 4, through the PM's 09:05): a phase with no run an hour
 * past its cutoff is missed; the quarter-hour outreach run writes one alarm row for it a day, and the board and the 08:00
 * report say MISSED. Read on production that morning: verify (04:20 to 04:40) and prepare (the night before) had no row
 * at all, and nothing said so.
 */
const phase = (key: string): Phase => {
  const p = PHASES.find((x) => x.key === key)
  if (!p) throw new Error(`no phase ${key}`)
  return p
}
// Melbourne is UTC+11 in November: 20 November 05:41 in Melbourne is 19 November 18:41 UTC.
const mel = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 10, day, h - 11, m))
}
const run = (key: string, at: Date, ride = 'listings'): DayRun => ({ phase: key, ride, startedAt: at.toISOString() })

describe('a day phase', () => {
  const verify = [phase('verify')]
  it('is not missed until an hour past its cutoff', () => {
    expect(GRACE_MINUTES).toBe(60)
    expect(missedPhases([], mel(20, '05:39'), verify)).toEqual([])
    expect(missedPhases([], mel(20, '05:40'), verify).map((p) => p.key)).toEqual(['verify'])
  })
  it('is not missed when it ran today, even late', () => {
    expect(missedPhases([run('verify', mel(20, '05:00'))], mel(20, '06:00'), verify)).toEqual([])
  })
  it("is missed when its only run was yesterday's", () => {
    expect(missedPhases([run('verify', mel(19, '04:25'))], mel(20, '06:00'), verify).map((p) => p.key)).toEqual(['verify'])
  })
  it('is alarmed once a day: its alarm row today stops a second', () => {
    expect(missedPhases([run('verify', mel(20, '05:45'), WATCHDOG_RIDE)], mel(20, '06:00'), verify)).toEqual([])
  })
})

describe('the night-before phase (prepare, 22:00 to 23:30)', () => {
  const prepare = [phase('prepare')]
  it('is judged the morning after, from half past midnight', () => {
    expect(missedPhases([], mel(20, '00:29'), prepare)).toEqual([])
    expect(missedPhases([], mel(20, '00:30'), prepare).map((p) => p.key)).toEqual(['prepare'])
  })
  it('is not missed when it ran last evening', () => {
    expect(missedPhases([run('prepare', mel(19, '22:40'), 'social')], mel(20, '07:00'), prepare)).toEqual([])
  })
  it('is alarmed once: an alarm written this morning stops a second', () => {
    expect(missedPhases([run('prepare', mel(20, '00:30'), WATCHDOG_RIDE)], mel(20, '07:00'), prepare)).toEqual([])
  })
})

describe('its words and the board', () => {
  it('says what was missed, between its slot and cutoff', () => {
    expect(missedWords(phase('verify'))).toBe(
      'MISSED: no run of Verify between 04:20 and 04:40 Melbourne; the board and the 08:00 report carry it until a run is recorded',
    )
  })
  it("reads the alarm row as missed and a failed run as failed, before late or done", () => {
    const live = phase('live')
    expect(phaseState(live, { startedAt: 'x', endedAt: 'y', ride: WATCHDOG_RIDE, failed: true }, 400, 400)).toBe('missed')
    expect(phaseState(live, { startedAt: 'x', endedAt: 'y', ride: 'social', failed: true }, 400, 300)).toBe('failed')
    expect(phaseState(live, { startedAt: 'x', endedAt: 'y', ride: 'social', failed: false }, 400, 300)).toBe('done')
  })
  it('the quarter-hour outreach run writes the alarm, after its own phase record, and names it in its answer', () => {
    const route = readFileSync('src/app/api/cron/outreach-run/route.ts', 'utf8')
    expect(route).toContain('const watchdog = await recordMissedRuns(db, now)')
    expect(route.indexOf('recordMissedRuns(db, now)')).toBeGreaterThan(route.indexOf('await recordPhaseRun(db, {'))
    expect(route).toContain('sentItems, pool, watchdog })')
  })
  it('the board and the 08:00 report show failed and missed phases', () => {
    const board = readFileSync('src/components/admin/timetable-board.tsx', 'utf8')
    expect(board).toContain("failed: 'Failed', missed: 'Missed'")
    expect(board).toContain('Last success')
    expect(board).toContain('Next run {r.nextRun}')
    const lines = readFileSync('src/lib/ops/learned-lines.ts', 'utf8')
    expect(lines).toContain("${count('failed')} failed, ${count('missed')} missed")
  })
})
