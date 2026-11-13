import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CRM_STAGE_WORDS } from '@/lib/crm/stages'
import { readGrowthWeek } from './weekly'
import { lastWeeks } from './weekly-math'
import { readWeeklyReport } from './weekly-report'
import { proofWords, type Week } from './weekly-report-math'

/**
 * THE WEEKLY REPORT'S MONDAY COPY, IN WORDS (order 4, Release 3, item 10; INTERNAL ONLY). The morning state email
 * (.github/workflows/state-report.yml, scripts/ops/state-report.mjs) asks GET /api/ops/state?weekly=1 on a Melbourne
 * Monday, and this is what it gets: last week (lastWeeks, the same week /admin/growth shows), its six numbers, and the
 * weekly report, already worded with the page's own words (Lawal's stage words, the shared proof words), so the email
 * and the page never say a thing differently. No new cron, email type or spend: the existing email carries it.
 * A failed read is returned as its own named failure and never fails the counts the email already carries.
 */

export type WeeklyDigest =
  | {
      readonly ok: true
      readonly week: Week
      readonly six: readonly { readonly label: string; readonly shown: string; readonly basis: string }[]
      readonly moved: readonly { readonly stage: string; readonly organisers: number; readonly provedBy: readonly { readonly words: string; readonly moves: number }[] }[]
      readonly leftTheLine: number
      readonly conversion: readonly { readonly from: string; readonly to: string; readonly reachedFrom: number; readonly reachedTo: number }[]
      readonly overdue: readonly { readonly title: string; readonly dueOn: string | null }[]
      readonly failed: readonly { readonly title: string; readonly reason: string | null }[]
    }
  | { readonly ok: false; readonly error: string }

export async function readWeeklyDigest(db: SupabaseClient, now: Date = new Date()): Promise<WeeklyDigest> {
  try {
    const { last } = lastWeeks(now)
    const [growth, report] = await Promise.all([readGrowthWeek(now), readWeeklyReport(db, last, now)])
    return {
      ok: true,
      week: last,
      six: growth.six.last.map((f) => ({ label: f.label, shown: f.display ?? (f.value === null ? 'not known' : String(f.value)), basis: f.basis })),
      moved: report.moved.map((m) => ({
        stage: CRM_STAGE_WORDS[m.stage],
        organisers: m.organisers,
        provedBy: m.provedBy.map((p) => ({ words: proofWords(p.by), moves: p.moves })),
      })),
      leftTheLine: report.leftTheLine,
      conversion: report.conversion.map((s) => ({ from: CRM_STAGE_WORDS[s.from], to: CRM_STAGE_WORDS[s.to], reachedFrom: s.reachedFrom, reachedTo: s.reachedTo })),
      overdue: report.overdueTasks.map((t) => ({ title: t.title, dueOn: t.dueAt })),
      failed: report.failedJobs.map((t) => ({ title: t.title, reason: t.failureReason })),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
