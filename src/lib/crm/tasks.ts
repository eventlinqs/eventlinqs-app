import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readTodayQueue } from '@/lib/admin/today'
import { SOURCE_KEYS } from '@/lib/admin/today-math'
import { resolvedAtSource, retitled, tasksFromQueue, type OpenTask } from './tasks-math'

/**
 * THE GROWTH OS'S TASKS, KEPT (the rules are ./tasks-math.ts, pure; the table is migration 20261111230001). Run by the
 * existing 15 minute outreach-run cron, never a new one (law 14 (d)). Each run reads the queue /admin/today reads, adds a
 * task for anything new (insert only, on the unique source key, so a rerun makes nothing twice), and closes the tasks
 * this generator made whose item has left the queue, saying they were resolved at their source. It touches only the
 * kinds it makes; a task made any other way is never closed here. A failed write throws, and the cron reports it.
 */
type Db = SupabaseClient

/** The kinds this generator makes: the queue's sections, and a source it could not read. */
const MINE = [...SOURCE_KEYS, 'source_unread'] as const

export interface TaskSyncReport {
  readonly wanted: number
  readonly made: number
  readonly closed: number
  readonly retitled: number
  readonly failedSources: number
}

export async function syncGrowthTasks(db: Db, now: Date = new Date()): Promise<TaskSyncReport> {
  const queue = await readTodayQueue(now)
  const wanted = tasksFromQueue(queue, now)

  let made = 0
  if (wanted.length > 0) {
    const { data, error } = await db.from('growth_tasks').upsert(wanted.map((t) => ({ ...t })), { onConflict: 'source_key', ignoreDuplicates: true }).select('id')
    if (error) throw new Error(`the tasks could not be written: ${error.message}`)
    made = (data ?? []).length
  }

  const { data: open, error: openError } = await db
    .from('growth_tasks')
    .select('id, source_key, status, title, next_action')
    .in('kind', [...MINE])
    .not('status', 'in', '(done,cancelled)')
  if (openError) throw new Error(`the open tasks could not be read: ${openError.message}`)
  const close = resolvedAtSource((open ?? []) as OpenTask[], wanted)
  if (close.length > 0) {
    const at = now.toISOString()
    const { error } = await db
      .from('growth_tasks')
      .update({ status: 'done', done_at: at, updated_at: at, last_action: 'Resolved at its source', last_action_at: at })
      .in('id', close)
    if (error) throw new Error(`the resolved tasks could not be closed: ${error.message}`)
  }

  // An open task's words follow its item (a count that moved, a reason that changed); never its status or due day.
  const moved = retitled((open ?? []) as OpenTask[], wanted)
  for (const m of moved) {
    const { error } = await db.from('growth_tasks').update({ title: m.title, next_action: m.next_action, updated_at: now.toISOString() }).eq('id', m.id).not('status', 'in', '(done,cancelled)')
    if (error) throw new Error(`a task's words could not follow its item: ${error.message}`)
  }

  return { wanted: wanted.length, made, closed: close.length, retitled: moved.length, failedSources: wanted.filter((t) => t.status === 'failed').length }
}
