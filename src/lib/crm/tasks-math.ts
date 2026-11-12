/**
 * THE GROWTH OS'S TASKS, FROM THE QUEUE THE PLATFORM ALREADY READS (the Growth OS directive of 11 November 2026, Release 1,
 * PM order 4 Part 2 item 2: "Every record and every task carries status, owner, due date, last action, next action and
 * a link; overdue items rise to the top of the queue; failed jobs are never lost").
 *
 * /admin/today already gathers what waits for a person (src/lib/admin/today.ts: submissions not live, plays to approve,
 * sends paused, replies to read, exceptions), each with a stable id ('play:<id>', 'reply:<id>', 'claim:<id>', ...). This
 * turns each item into a task keyed by that id, so a run made twice makes nothing twice; a source that could not be read
 * becomes a FAILED task that stays until the source reads again, so a failure is never silently lost; and an open task
 * whose item is no longer in the queue was resolved at its source, so it is closed with that said.
 *
 * Owner: null means the founder (migration 20261111230001). Due: the day after the item began waiting, so anything
 * waiting more than a day is overdue. Pure.
 */
import type { Queue, SectionKey } from '@/lib/admin/today-math'

export type RecordType = 'organiser' | 'venue' | 'event' | 'submission' | 'claim' | 'permission' | 'campaign' | 'message' | 'source' | 'social_piece' | 'removal' | 'job'
export type Workflow = 'organiser_acquisition' | 'venue_partnership' | 'listing_claim' | 'media_permission' | 'marketing' | 'operations'
export type TaskStatus = 'open' | 'waiting_approval' | 'in_progress' | 'done' | 'failed' | 'cancelled'

export interface TaskRow {
  readonly source_key: string
  readonly record_type: RecordType
  readonly record_id: string | null
  readonly workflow: Workflow
  readonly kind: string
  readonly title: string
  readonly status: TaskStatus
  readonly due_on: string
  readonly last_action: string | null
  readonly next_action: string | null
  readonly failure_reason: string | null
}

/** Each queue item's id prefix, as the record it serves and the workflow it belongs to. */
const BY_PREFIX: Readonly<Record<string, { record: RecordType; workflow: Workflow }>> = {
  play: { record: 'campaign', workflow: 'organiser_acquisition' },
  paused: { record: 'campaign', workflow: 'organiser_acquisition' },
  reply: { record: 'message', workflow: 'organiser_acquisition' },
  held: { record: 'message', workflow: 'organiser_acquisition' },
  claim: { record: 'claim', workflow: 'listing_claim' },
  submission: { record: 'submission', workflow: 'operations' },
  source: { record: 'source', workflow: 'operations' },
  swept: { record: 'social_piece', workflow: 'marketing' },
  removal: { record: 'removal', workflow: 'operations' },
  report: { record: 'event', workflow: 'operations' },
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s)

/** The Melbourne date a day after an instant: the item's due date. */
export function dueAfter(sinceIso: string): string {
  const next = new Date(Date.parse(sinceIso) + 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(next)
}

/** The tasks the queue asks for now: one per item, and one failed task per source that could not be read. */
export function tasksFromQueue(queue: Queue, now: Date): TaskRow[] {
  const out: TaskRow[] = []
  for (const section of queue.sections) {
    for (const item of section.items) {
      const prefix = item.id.split(':')[0]
      const mapped = BY_PREFIX[prefix]
      const recordId = item.id.match(UUID)?.[0] ?? null
      const record: RecordType = mapped && recordId ? mapped.record : 'job'
      out.push({
        source_key: clip(item.id, 200),
        record_type: record,
        record_id: record === 'job' ? null : recordId,
        workflow: mapped?.workflow ?? 'operations',
        kind: section.key,
        title: clip(item.what, 300),
        status: section.key === ('plays' satisfies SectionKey) ? 'waiting_approval' : 'open',
        due_on: dueAfter(item.since),
        last_action: null,
        next_action: clip(item.why, 500),
        failure_reason: null,
      })
    }
    // A source the queue could not read is a failed job, kept until the source reads again (one task a source a day,
    // so a source failing all day is one task, not ninety-six).
    for (const words of section.unread) {
      const day = dueAfter(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      out.push({
        source_key: clip(`unread:${section.key}:${day}:${words.slice(0, 60)}`, 200),
        record_type: 'job',
        record_id: null,
        workflow: 'operations',
        kind: 'source_unread',
        title: clip(`The queue could not read a source: ${words}`, 300),
        status: 'failed',
        due_on: day,
        last_action: null,
        next_action: 'Find why the source could not be read and read it again',
        failure_reason: clip(words, 1000),
      })
    }
  }
  return out
}

export interface OpenTask {
  readonly id: string
  readonly source_key: string
  readonly status: TaskStatus
}

/** Open tasks whose item is no longer in the queue were resolved at their source: these are closed. */
export function resolvedAtSource(open: readonly OpenTask[], wanted: readonly TaskRow[]): string[] {
  const still = new Set(wanted.map((t) => t.source_key))
  return open.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && !still.has(t.source_key)).map((t) => t.id)
}

/** Overdue first, then the oldest due, then waiting for approval before open; a task with no due date last. */
export function queueOrder(a: { due_on: string | null; status: string }, b: { due_on: string | null; status: string }, today: string): number {
  const over = (t: { due_on: string | null }) => (t.due_on !== null && t.due_on < today ? 0 : 1)
  return over(a) - over(b) || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || Number(b.status === 'waiting_approval') - Number(a.status === 'waiting_approval')
}
