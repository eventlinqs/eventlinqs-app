// EVERY CRON ROUTE IS ACTUALLY SCHEDULED.
//
// The defect that produced this guard, found on 10 September 2026 while
// auditing the notification routing for close-out UX4:
// src/app/api/cron/queue-admit/route.ts said "runs every minute via Vercel
// Crons" in its own header and had no entry in vercel.json. Nineteen cron route
// directories, eighteen schedules. The virtual-queue admission batch had never
// run: anybody placed in a queue waited for ever.
//
// Nothing could see it, and that is the point of the guard. A page nobody
// renders 404s. A cron nobody invokes looks exactly like a cron with nothing to
// do: no error, no row, and every direct unit test of the handler still passes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  judge,
  cronRouteNames,
  scheduledPaths,
  INVOKED_WITHOUT_A_SCHEDULE,
} from '../../../scripts/guards/cron-routes-scheduled.mjs'

const ROOT = process.cwd()

describe('the judgement, both directions', () => {
  it('passes when every route has a schedule and every schedule has a route', () => {
    const problems = judge(
      ['warm', 'queue-admit'],
      [
        { path: '/api/cron/warm', schedule: '* * * * *' },
        { path: '/api/cron/queue-admit', schedule: '* * * * *' },
      ],
      {},
    )
    expect(problems).toEqual([])
  })

  it('FAILS on the exact defect: a route handler with no schedule', () => {
    const problems = judge(['warm', 'queue-admit'], [{ path: '/api/cron/warm', schedule: '* * * * *' }], {})
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('/api/cron/queue-admit')
    expect(problems[0]).toContain('never runs')
  })

  it('FAILS the other way too: a schedule aimed at a route that does not exist', () => {
    const problems = judge(['warm'], [
      { path: '/api/cron/warm', schedule: '* * * * *' },
      { path: '/api/cron/deleted-last-year', schedule: '0 * * * *' },
    ], {})
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('deleted-last-year')
    expect(problems[0]).toContain('404')
  })

  it('accepts a route that records what invokes it instead of a schedule', () => {
    const problems = judge(['warm', 'called-by-hand'], [{ path: '/api/cron/warm', schedule: '* * * * *' }], {
      'called-by-hand': 'invoked by the operator runbook, never on a timer',
    })
    expect(problems).toEqual([])
  })

  it('refuses to let an exemption rot: one naming a route that is now scheduled', () => {
    const problems = judge(['warm'], [{ path: '/api/cron/warm', schedule: '* * * * *' }], {
      warm: 'invoked by hand',
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('IS scheduled')
  })

  it('refuses to let an exemption rot: one naming a route that no longer exists', () => {
    const problems = judge(['warm'], [{ path: '/api/cron/warm', schedule: '* * * * *' }], {
      gone: 'invoked by hand',
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('no route handler')
  })
})

describe('against the repository as it actually stands', () => {
  it('finds every cron route scheduled, queue-admit included', () => {
    const routes = cronRouteNames()
    const scheduled = scheduledPaths(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
    expect(routes).toContain('queue-admit')
    expect(scheduled.map((s: { path: string }) => s.path)).toContain('/api/cron/queue-admit')
    expect(judge(routes, scheduled, INVOKED_WITHOUT_A_SCHEDULE)).toEqual([])
  })

  it('scans a scope that has not collapsed to nothing', () => {
    expect(cronRouteNames().length).toBeGreaterThanOrEqual(19)
  })
})
