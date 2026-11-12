import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { queueOrder } from './tasks-math'

/**
 * THE COMMAND CENTRE'S TASK READ (the Growth OS directive of 11 November 2026, section 5: "What happened? What needs
 * approval? What is overdue? What happens next? Who is responsible? Which workflows failed? ... Every actionable item must
 * have a status, owner, due date and link to its underlying record. The system must never silently lose failed tasks").
 * The tasks are kept by src/lib/crm/tasks.ts in the outreach-run cron; this reads them for /admin/today, overdue first.
 *
 * Before migration 20261111230001 is applied the table is not there: that is said in words ('not_landed'), never shown
 * as an empty queue. Any other failed read is said too.
 */
type Db = SupabaseClient

export interface CentreTask {
  readonly id: string
  readonly source_key: string
  readonly title: string
  readonly status: string
  readonly owner_id: string | null
  readonly due_on: string | null
  readonly next_action: string | null
  readonly failure_reason: string | null
  readonly workflow: string
}

export type CentreRead =
  | { readonly state: 'read'; readonly open: readonly CentreTask[]; readonly overdue: number; readonly waitingApproval: number; readonly failed: number; readonly doneLastDay: number }
  | { readonly state: 'not_landed' }
  | { readonly state: 'failed'; readonly reason: string }

const melbourneDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export async function readCommandCentre(db: Db, now: Date = new Date()): Promise<CentreRead> {
  const [open, done] = await Promise.all([
    db.from('growth_tasks').select('id, source_key, title, status, owner_id, due_on, next_action, failure_reason, workflow').not('status', 'in', '(done,cancelled)').limit(500),
    db.from('growth_tasks').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('done_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
  ])
  const error = open.error ?? done.error
  if (error) {
    // PostgREST's 'relation does not exist' (42P01) and its schema cache miss (PGRST205): the migration is not applied yet.
    if (error.code === '42P01' || error.code === 'PGRST205') return { state: 'not_landed' }
    return { state: 'failed', reason: error.message }
  }
  const today = melbourneDay(now)
  const rows = ((open.data ?? []) as CentreTask[]).slice().sort((a, b) => queueOrder(a, b, today))
  return {
    state: 'read',
    open: rows,
    overdue: rows.filter((t) => t.due_on !== null && t.due_on < today).length,
    waitingApproval: rows.filter((t) => t.status === 'waiting_approval').length,
    failed: rows.filter((t) => t.status === 'failed').length,
    doneLastDay: done.count ?? 0,
  }
}

/** Whether a task is past its due day, in Melbourne. */
export function isOverdue(t: { due_on: string | null }, now: Date): boolean {
  return t.due_on !== null && t.due_on < melbourneDay(now)
}
