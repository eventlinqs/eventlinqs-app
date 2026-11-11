/**
 * THE GROWTH OS'S TASKS FROM THE QUEUE (the Growth OS directive, Release 1: every task carries status, owner, due date,
 * last and next action and a link; overdue first; failed jobs never lost). One task per queue item keyed by its id, so a
 * rerun makes nothing twice; an unread source is a failed task; a task whose item left the queue is closed.
 */
import { describe, expect, it } from 'vitest'
import type { Queue } from '@/lib/admin/today-math'
import { dueAfter, queueOrder, resolvedAtSource, tasksFromQueue } from '@/lib/crm/tasks-math'

const NOW = new Date('2026-11-12T01:00:00Z')
const queue = (over: Partial<Queue> = {}): Queue => ({
  sections: [
    { key: 'submissions', title: 's', items: [{ id: 'submission:3f2b8f4e-6c1a-4d2b-9e3f-1a2b3c4d5e6f', what: 'Mr Snotbottom is not live', why: 'held: no photo', since: '2026-11-10T00:00:00Z', href: '/admin/submissions' }], unread: [] },
    { key: 'plays', title: 'p', items: [{ id: 'play:9a2b8f4e-6c1a-4d2b-9e3f-1a2b3c4d5e6f', what: 'A play to approve', why: 'waits for Lawal', since: '2026-11-11T22:00:00Z', href: '/admin/today' }], unread: [] },
    { key: 'paused_sends', title: 'ps', items: [], unread: [] },
    { key: 'unclear_replies', title: 'r', items: [], unread: [] },
    { key: 'exceptions', title: 'e', items: [{ id: 'collected:waiting', what: '3 collected nights wait', why: 'review them', since: '2026-11-11T00:00:00Z', href: '/admin/collected' }], unread: ['Listing runs: could not be read just now (timeout).'] },
  ],
  waiting: 3,
  allClear: false,
  ...over,
})

describe('tasks from the queue', () => {
  it('one task per item, keyed by its own id, with its record, workflow and next action', () => {
    const t = tasksFromQueue(queue(), NOW)
    const sub = t.find((x) => x.source_key.startsWith('submission:'))!
    expect(sub).toMatchObject({ record_type: 'submission', record_id: '3f2b8f4e-6c1a-4d2b-9e3f-1a2b3c4d5e6f', workflow: 'operations', kind: 'submissions', status: 'open', next_action: 'held: no photo' })
    const play = t.find((x) => x.source_key.startsWith('play:'))!
    expect(play).toMatchObject({ record_type: 'campaign', workflow: 'organiser_acquisition', status: 'waiting_approval' })
    const collected = t.find((x) => x.source_key === 'collected:waiting')!
    expect(collected).toMatchObject({ record_type: 'job', record_id: null })
  })

  it('a rerun asks for exactly the same keys, so nothing is made twice', () => {
    expect(tasksFromQueue(queue(), NOW).map((t) => t.source_key)).toEqual(tasksFromQueue(queue(), NOW).map((t) => t.source_key))
  })

  it('a source the queue could not read is a failed task with its reason, one a day', () => {
    const failed = tasksFromQueue(queue(), NOW).filter((t) => t.status === 'failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ record_type: 'job', kind: 'source_unread', failure_reason: 'Listing runs: could not be read just now (timeout).' })
    expect(tasksFromQueue(queue(), new Date(NOW.getTime() + 15 * 60 * 1000)).filter((t) => t.status === 'failed')[0].source_key).toBe(failed[0].source_key)
  })

  it('is due the Melbourne day after it began waiting', () => {
    expect(dueAfter('2026-11-10T00:00:00Z')).toBe('2026-11-11')
    expect(dueAfter('2026-11-10T14:00:00Z')).toBe('2026-11-12')
  })

  it('an open task whose item left the queue is closed; done and cancelled ones are left alone', () => {
    const wanted = tasksFromQueue(queue(), NOW)
    const open = [
      { id: 'a', source_key: 'submission:3f2b8f4e-6c1a-4d2b-9e3f-1a2b3c4d5e6f', status: 'open' as const },
      { id: 'b', source_key: 'reply:11111111-2222-4333-8444-555555555555', status: 'open' as const },
      { id: 'c', source_key: 'reply:aaaaaaaa-2222-4333-8444-555555555555', status: 'done' as const },
    ]
    expect(resolvedAtSource(open, wanted)).toEqual(['b'])
  })

  it('overdue first, then the oldest due, then waiting for approval before open', () => {
    const today = '2026-11-12'
    const rows = [
      { id: 'later', due_on: '2026-11-14', status: 'open' },
      { id: 'overdue', due_on: '2026-11-10', status: 'open' },
      { id: 'today-open', due_on: '2026-11-12', status: 'open' },
      { id: 'today-approve', due_on: '2026-11-12', status: 'waiting_approval' },
    ]
    expect(rows.slice().sort((a, b) => queueOrder(a, b, today)).map((r) => r.id)).toEqual(['overdue', 'today-approve', 'today-open', 'later'])
  })
})
