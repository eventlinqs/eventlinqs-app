import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/growth/platform-organiser', () => ({ readPlatformOrganiserIds: vi.fn(async () => new Set(['the-platform'])) }))

import { melbourneDay, readWeeklyReport } from '@/lib/growth/weekly-report'

/*
 * THE WEEKLY REPORT'S READS (order 4, Release 3; INTERNAL ONLY): the platform's own account never counts as an
 * organiser; a task is late once its Melbourne day has passed, never by an instant; a failed read says its name.
 */

type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>, fail?: string) {
  return {
    from: (table: string) => {
      const b = {
        select: () => b,
        lt: () => b,
        not: () => b,
        order: () => b,
        range: (from: number, to: number) =>
          Promise.resolve(fail === table ? { data: null, error: { message: 'boom' } } : { data: (tables[table] ?? []).slice(from, to + 1), error: null }),
      }
      return b
    },
  } as never
}

const WEEK = { from: '2026-11-09T00:00:00.000Z', to: '2026-11-16T00:00:00.000Z' }

describe("the weekly report's reads", () => {
  it('leaves the platform out, and judges a task late by Melbourne day', async () => {
    const db = fakeDb({
      organiser_acquisition_transitions: [
        { organiser_id: 'a', from_state: 'ready', to_state: 'contacted', at: '2026-11-11T01:00:00+00:00', proved_by: 'outreach_touches' },
        { organiser_id: 'the-platform', from_state: 'active', to_state: 'recurring', at: '2026-11-11T02:00:00+00:00', proved_by: 'orders' },
      ],
      growth_tasks: [
        { title: 'due yesterday', status: 'open', due_on: '2026-11-12', record_type: 'organiser', failure_reason: null },
        { title: 'due today', status: 'open', due_on: '2026-11-13', record_type: 'organiser', failure_reason: null },
        { title: 'a source failed', status: 'failed', due_on: null, record_type: 'job', failure_reason: 'could not be read' },
      ],
    })
    // 01:30 on 13 November in Melbourne is still 12 November in UTC.
    const now = new Date('2026-11-12T14:30:00.000Z')
    expect(melbourneDay(now)).toBe('2026-11-13')
    const r = await readWeeklyReport(db, WEEK, now)
    expect(r.moved).toEqual([{ stage: 'contacted', organisers: 1, provedBy: [{ by: 'outreach_touches', moves: 1 }] }])
    expect(r.overdueTasks.map((t) => t.title)).toEqual(['due yesterday'])
    expect(r.failedJobs.map((t) => t.title)).toEqual(['a source failed'])
  })

  it('a failed read throws with its name, never a zero', async () => {
    await expect(readWeeklyReport(fakeDb({}, 'growth_tasks'), WEEK, new Date('2026-11-13T00:00:00.000Z'))).rejects.toThrow(/the growth tasks/)
  })
})
