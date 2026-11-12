import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WeeklyReportSection } from '@/components/admin/weekly-report-section'
import type { WeeklyReport } from '@/lib/growth/weekly-report-math'

/*
 * THE WEEKLY REPORT'S SECTION (order 4, Release 3; INTERNAL ONLY, admin only): Lawal's stage words, what proved each
 * move in words, conversion as a share, late tasks and failed jobs listed, a failed read said in place of zeros, and
 * Search Console named as waiting on his step.
 */

const WEEK = { from: '2026-11-09T00:00:00.000Z', to: '2026-11-16T00:00:00.000Z' }
const empty: WeeklyReport = { week: WEEK, moved: [], leftTheLine: 0, conversion: [], overdueTasks: [], failedJobs: [] }
const html = (report: Parameters<typeof WeeklyReportSection>[0]['report']) => renderToStaticMarkup(<WeeklyReportSection report={report} />)

describe("the weekly report's section", () => {
  it('a failed read is said, and no figure is shown in its place', () => {
    const out = html({ ok: false, why: 'the growth tasks could not be read: boom' })
    expect(out).toContain('The weekly report could not be read: the growth tasks could not be read: boom.')
    expect(out).not.toContain('Conversion to date')
  })

  it('an empty week says so in words', () => {
    const out = html({ ok: true, value: empty })
    expect(out).toContain('No organiser moved forward along the line last week.')
    expect(out).toContain('data-overdue="none"')
    expect(out).toContain('data-failed="none"')
    expect(out).toContain('wait on Search Console access')
  })

  it('names each move in Lawal stage words with what proved it, conversion as a share, late and failed listed', () => {
    const out = html({
      ok: true,
      value: {
        ...empty,
        moved: [{ stage: 'contacted', organisers: 2, provedBy: [{ by: 'outreach_touches', moves: 2 }] }, { stage: 'claimed', organisers: 1, provedBy: [{ by: 'listing_claims', moves: 1 }] }],
        leftTheLine: 1,
        conversion: [{ from: 'contacted', to: 'engaged', reachedFrom: 4, reachedTo: 1 }],
        overdueTasks: [{ title: 'Answer Aunty Jacks', status: 'open', dueAt: '2026-11-12', recordType: 'organiser', failureReason: null }],
        failedJobs: [{ title: 'The replies could not be read', status: 'failed', dueAt: null, recordType: 'job', failureReason: 'Graph is not connected' }],
      },
    })
    expect(out).toContain('Contacted</span>: 2 organisers, proved by a message sent (2)')
    expect(out).toContain('Claimed</span>: 1 organiser, proved by a claim (1)')
    expect(out).toContain('Left the line last week (opted out, not interested, unresponsive or a removal asked): 1.')
    expect(out).toContain('Contacted to Engaged: 1 of 4 (25 percent)')
    expect(out).toContain('Answer Aunty Jacks')
    expect(out).toContain('The replies could not be read')
    expect(out).toContain('Graph is not connected')
  })
})
