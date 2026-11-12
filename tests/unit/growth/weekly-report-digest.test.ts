import { describe, expect, it, vi } from 'vitest'

const growth = vi.fn()
const report = vi.fn()
vi.mock('@/lib/growth/weekly', () => ({ readGrowthWeek: (...a: unknown[]) => growth(...a) }))
vi.mock('@/lib/growth/weekly-report', () => ({ readWeeklyReport: (...a: unknown[]) => report(...a) }))

import { readWeeklyDigest } from '@/lib/growth/weekly-report-digest'
import { lastWeeks } from '@/lib/growth/weekly-math'

/*
 * THE WEEKLY REPORT'S MONDAY COPY (order 4, Release 3; INTERNAL ONLY): last week as /admin/growth reads it, its six
 * numbers, and the report worded in Lawal's stage words and the shared proof words; a failed read named, never thrown.
 */

const NOW = new Date('2026-11-15T22:00:00.000Z')

describe('the Monday copy', () => {
  it('words last week as the page does', async () => {
    growth.mockResolvedValueOnce({ six: { last: [{ label: 'Paid tickets', value: 3, basis: 'real' }, { label: 'Net contribution', value: 420, display: 'A$4.20', basis: 'estimated' }] } })
    report.mockResolvedValueOnce({
      week: lastWeeks(NOW).last,
      moved: [{ stage: 'contacted', organisers: 2, provedBy: [{ by: 'outreach_touches', moves: 2 }, { by: 'some_new_table', moves: 1 }] }],
      leftTheLine: 1,
      conversion: [{ from: 'contacted', to: 'engaged', reachedFrom: 4, reachedTo: 1 }],
      overdueTasks: [{ title: 'Answer Aunty Jacks', status: 'open', dueAt: '2026-11-12', recordType: 'organiser', failureReason: null }],
      failedJobs: [{ title: 'The replies could not be read', status: 'failed', dueAt: null, recordType: 'job', failureReason: 'Graph is not connected' }],
    })
    const d = await readWeeklyDigest({} as never, NOW)
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.week).toEqual(lastWeeks(NOW).last)
    expect(report.mock.calls[0][1]).toEqual(lastWeeks(NOW).last)
    expect(d.six).toEqual([
      { label: 'Paid tickets', shown: '3', basis: 'real' },
      { label: 'Net contribution', shown: 'A$4.20', basis: 'estimated' },
    ])
    expect(d.moved).toEqual([{ stage: 'Contacted', organisers: 2, provedBy: [{ words: 'a message sent', moves: 2 }, { words: 'some_new_table', moves: 1 }] }])
    expect(d.conversion).toEqual([{ from: 'Contacted', to: 'Engaged', reachedFrom: 4, reachedTo: 1 }])
    expect(d.overdue).toEqual([{ title: 'Answer Aunty Jacks', dueOn: '2026-11-12' }])
    expect(d.failed).toEqual([{ title: 'The replies could not be read', reason: 'Graph is not connected' }])
  })

  it('a failed read is named, never thrown, so the counts the email carries still go', async () => {
    growth.mockResolvedValueOnce({ six: { last: [] } })
    report.mockRejectedValueOnce(new Error('the growth tasks could not be read: boom'))
    expect(await readWeeklyDigest({} as never, NOW)).toEqual({ ok: false, error: 'the growth tasks could not be read: boom' })
  })
})
