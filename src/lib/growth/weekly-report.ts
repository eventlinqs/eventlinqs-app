import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readPlatformOrganiserIds } from './platform-organiser'
import { weeklyReport, type ReportTask, type Transition, type Week, type WeeklyReport } from './weekly-report-math'

/**
 * THE WEEKLY REPORT, ITS READS (order 4, Release 3, item 10; INTERNAL ONLY; the arithmetic is ./weekly-report-math.ts).
 *
 * - The organisers' moves: public.organiser_acquisition_transitions up to the week's end (conversion reads the whole
 *   history), every row paged on a stable order (scripts/guards/no-silent-row-ceiling.mjs), the platform's own account
 *   left out (src/lib/growth/platform-organiser.ts: the platform is not an organiser).
 * - The tasks: public.growth_tasks still live or failed. A task's due_on is a calendar day in Melbourne, so it is late
 *   once that day has passed there: compared as Melbourne's date today, never as an instant.
 * A failed read throws with its name; the page says which read failed, never a zero.
 */

type Db = SupabaseClient

/** Melbourne's calendar day for an instant, as YYYY-MM-DD. */
export function melbourneDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

export async function readWeeklyReport(db: Db, week: Week, now: Date = new Date()): Promise<WeeklyReport> {
  const platform = await readPlatformOrganiserIds(db)
  const moves = await readEveryRow<{ organiser_id: string; from_state: string | null; to_state: string; at: string; proved_by: string }>(
    'the organisers moves',
    (from, to) =>
      db
        .from('organiser_acquisition_transitions')
        .select('organiser_id, from_state, to_state, at, proved_by')
        .lt('at', week.to)
        .order('at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
  )
  const transitions: Transition[] = moves
    .filter((m) => !platform.has(m.organiser_id))
    .map((m) => ({ organiserId: m.organiser_id, from: m.from_state, to: m.to_state, at: new Date(m.at).toISOString(), provedBy: m.proved_by }))

  const rows = await readEveryRow<{ title: string; status: string; due_on: string | null; record_type: string; failure_reason: string | null }>(
    'the growth tasks',
    (from, to) =>
      db
        .from('growth_tasks')
        .select('title, status, due_on, record_type, failure_reason')
        .not('status', 'in', '(done,cancelled)')
        .order('id', { ascending: true })
        .range(from, to),
  )
  const tasks: ReportTask[] = rows.map((r) => ({
    title: r.title,
    status: r.status as ReportTask['status'],
    dueAt: r.due_on,
    recordType: r.record_type,
    failureReason: r.failure_reason,
  }))

  // Tasks compare by Melbourne's calendar day (due_on is a day), so the clock the arithmetic is given is today's date.
  return weeklyReport({ week, now: melbourneDay(now), transitions, tasks })
}
