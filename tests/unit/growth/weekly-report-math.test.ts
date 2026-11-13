import { describe, expect, it } from 'vitest'
import { weeklyReport, type ReportTask, type Transition } from '@/lib/growth/weekly-report-math'

/*
 * THE WEEKLY REPORT'S ARITHMETIC (order 4, Release 3, item 10; INTERNAL ONLY). Moves are counted forward along Lawal's
 * line only, in his stages, with what proved each; side stages apart; conversion read up to the week's end; overdue and
 * failed tasks listed. Release 3's acceptance: which activities produce activated organisers, sales and contribution.
 */

const WEEK = { from: '2026-11-09T00:00:00.000Z', to: '2026-11-16T00:00:00.000Z' }
const NOW = '2026-11-13T02:00:00.000Z'
const t = (organiserId: string, from: string | null, to: string, at: string, provedBy = 'outreach_touches'): Transition => ({ organiserId, from, to, at, provedBy })

describe('the weekly report', () => {
  it('counts organisers moving forward into each of Lawal stages this week, with what proved the moves', () => {
    const r = weeklyReport({
      week: WEEK,
      now: NOW,
      tasks: [],
      transitions: [
        t('a', null, 'discovered', '2026-11-10T01:00:00.000Z', 'organisers'),
        t('a', 'discovered', 'qualified', '2026-11-11T01:00:00.000Z', 'events'),
        t('b', 'ready', 'contacted', '2026-11-11T02:00:00.000Z', 'outreach_touches'),
        t('c', 'ready', 'contacted', '2026-11-12T02:00:00.000Z', 'outreach_touches'),
        t('d', 'claim_invited', 'verified', '2026-11-12T03:00:00.000Z', 'listing_claims'),
        t('e', 'qualified', 'eligibility_checked', '2026-11-12T04:00:00.000Z', 'organisers'),
        t('f', 'contacted', 'qualified', '2026-11-12T05:00:00.000Z', 'organisers'),
        t('g', 'ready', 'contacted', '2026-11-02T02:00:00.000Z', 'outreach_touches'),
      ],
    })
    expect(r.moved).toEqual([
      { stage: 'discovered', organisers: 1, provedBy: [{ by: 'organisers', moves: 1 }] },
      { stage: 'qualified', organisers: 1, provedBy: [{ by: 'events', moves: 1 }] },
      { stage: 'contacted', organisers: 2, provedBy: [{ by: 'outreach_touches', moves: 2 }] },
      { stage: 'claimed', organisers: 1, provedBy: [{ by: 'listing_claims', moves: 1 }] },
    ])
  })

  it('counts a move to a side stage apart, never as progress', () => {
    const r = weeklyReport({
      week: WEEK,
      now: NOW,
      tasks: [],
      transitions: [t('a', 'contacted', 'suppressed', '2026-11-10T01:00:00.000Z'), t('b', 'engaged', 'rejected', '2026-11-11T01:00:00.000Z')],
    })
    expect(r.moved).toEqual([])
    expect(r.leftTheLine).toBe(2)
  })

  it('reads conversion up to the week end: of those who ever reached a stage, how many reached the next', () => {
    const r = weeklyReport({
      week: WEEK,
      now: NOW,
      tasks: [],
      transitions: [
        t('a', null, 'discovered', '2026-10-01T00:00:00.000Z'),
        t('a', 'discovered', 'qualified', '2026-10-02T00:00:00.000Z'),
        t('a', 'ready', 'contacted', '2026-11-10T00:00:00.000Z'),
        t('b', null, 'discovered', '2026-10-01T00:00:00.000Z'),
        t('b', 'discovered', 'qualified', '2026-11-11T00:00:00.000Z'),
        t('c', null, 'discovered', '2026-10-01T00:00:00.000Z'),
        t('c', 'discovered', 'qualified', '2026-11-20T00:00:00.000Z'),
      ],
    })
    const step = (from: string) => r.conversion.find((s) => s.from === from)
    expect(step('discovered')).toEqual({ from: 'discovered', to: 'qualified', reachedFrom: 3, reachedTo: 2 })
    expect(step('qualified')).toEqual({ from: 'qualified', to: 'contact_ready', reachedFrom: 2, reachedTo: 1 })
    expect(r.conversion.map((s) => s.to)).not.toContain('ticketing_activated')
  })

  it('lists the live tasks past their due time, oldest first, and every failed job', () => {
    const task = (title: string, status: ReportTask['status'], dueAt: string | null, recordType = 'organiser'): ReportTask => ({ title, status, dueAt, recordType, failureReason: status === 'failed' ? 'the source could not be read' : null })
    const r = weeklyReport({
      week: WEEK,
      now: NOW,
      transitions: [],
      tasks: [
        task('late', 'open', '2026-11-12T00:00:00.000Z'),
        task('later still', 'waiting_approval', '2026-11-11T00:00:00.000Z'),
        task('not yet due', 'open', '2026-11-14T00:00:00.000Z'),
        task('no due date', 'in_progress', null),
        task('done late', 'done', '2026-11-01T00:00:00.000Z'),
        task('a source failed', 'failed', null, 'job'),
      ],
    })
    expect(r.overdueTasks.map((x) => x.title)).toEqual(['later still', 'late'])
    expect(r.failedJobs.map((x) => x.title)).toEqual(['a source failed'])
  })
})
