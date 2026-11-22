import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { socialPhaseAt } from '@/lib/ops/timetable'

// THE 05:40 SCHEDULE PHASE (the PM's 18:46 of 22 November 2026, fix 2). The timetable gives the 05:40 run the 'schedule'
// phase, and its plan check (src/lib/ops/plan-check.ts) fails when nothing is scheduled for the rest of the day. The
// standing policy first approved at 06:40, so on 21 and 22 November the 05:40 row read "NOTHING scheduled for the rest of
// today" and failed while the day's eligible posts waited an hour for their approval (law 35: everything live by 06:00).
// Every hour whose run the timetable gives the schedule or live phase now gives the policy's approvals first.
const route = readFileSync(join(process.cwd(), 'src/app/api/cron/social-publish/route.ts'), 'utf8')

function policyHours(): number[] {
  const m = route.match(/const POLICY_HOURS: ReadonlySet<number> = new Set\(\[([0-9, ]+)\]\)/)
  if (!m) throw new Error('POLICY_HOURS not found in the publish route')
  return m[1].split(',').map((x) => Number(x.trim()))
}

describe('the schedule and live phases run after the day\'s approvals', () => {
  it('every hour the timetable gives the schedule or live phase is an hour of the standing policy', () => {
    const phased = Array.from({ length: 24 }, (_, h) => h).filter((h) => socialPhaseAt(h) === 'schedule' || socialPhaseAt(h) === 'live')
    expect(phased).toEqual([5, 6])
    for (const h of phased) expect(policyHours()).toContain(h)
  })

  it('the policy still approves every three hours through the day after the first', () => {
    expect(policyHours()).toEqual([5, 6, 9, 12, 15, 18])
  })

  it('in the run, the approvals come before the scheduling, and the scheduling before the plan check', () => {
    const policy = route.indexOf('if (hourRun && POLICY_HOURS.has(melbourneHour(now)))')
    const schedule = route.indexOf('const scheduled = await scheduleApprovedPieces(db, now)')
    const check = route.indexOf('plan = planCheckWords(dry, later.count ?? 0)')
    expect(policy).toBeGreaterThan(-1)
    expect(policy).toBeLessThan(schedule)
    expect(schedule).toBeLessThan(check)
  })
})
