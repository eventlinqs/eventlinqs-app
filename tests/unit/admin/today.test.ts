import { describe, expect, it } from 'vitest'
import { queueOf, reportsOverdue, REPORT_GRACE_HOURS, type QueueItem, type Source } from '@/lib/admin/today-math'

/**
 * /admin/today, Lawal's one queue (the engine plan of 28 October 2026, part H; the project manager's 20:17): only what
 * waits for a person, and never an empty queue that was not read.
 */

const item = (id: string, since: string): QueueItem => ({ id, what: `item ${id}`, why: 'waits for a person', since, href: '/admin/collected' })

describe('queueOf', () => {
  it('puts each item in its section, oldest first, and counts them', () => {
    const q = queueOf([
      { key: 'a', section: 'exceptions', name: 'A', read: { state: 'read', items: [item('2', '2026-10-28T02:00:00Z'), item('1', '2026-10-27T02:00:00Z')] } },
      { key: 'b', section: 'plays', name: 'B', read: { state: 'read', items: [item('3', '2026-10-28T00:00:00Z')] } },
    ])
    expect(q.sections.map((s) => s.key)).toEqual(['plays', 'paused_sends', 'unclear_replies', 'exceptions'])
    expect(q.sections[3].items.map((i) => i.id)).toEqual(['1', '2'])
    expect(q.waiting).toBe(3)
    expect(q.allClear).toBe(false)
  })

  it('never calls the queue clear while a source has not landed or failed to read', () => {
    const sources: Source[] = [
      { key: 'a', section: 'exceptions', name: 'Collected events', read: { state: 'read', items: [] } },
      { key: 'b', section: 'plays', name: 'Plays', read: { state: 'not_landed', owner: 'window 6' } },
      { key: 'c', section: 'exceptions', name: 'Claims', read: { state: 'failed', reason: 'timeout' } },
    ]
    const q = queueOf(sources)
    expect(q.waiting).toBe(0)
    expect(q.allClear).toBe(false)
    expect(q.sections[0].unread).toEqual(['Plays: not on this database yet (window 6).'])
    expect(q.sections[3].unread).toEqual(['Claims: could not be read just now (timeout).'])
  })

  it('is clear only when every source was read and none has an item', () => {
    const q = queueOf([{ key: 'a', section: 'exceptions', name: 'A', read: { state: 'read', items: [] } }])
    expect(q.allClear).toBe(true)
  })
})

describe('reportsOverdue', () => {
  const NOW = new Date('2026-11-03T00:00:00Z')
  const HOUR = 60 * 60 * 1000
  const ended = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString()

  it('raises a night only once the sweep has had its hour and two more runs', () => {
    const items = reportsOverdue(
      [
        { id: 'late', endDate: ended(48 + REPORT_GRACE_HOURS), title: 'Late night' },
        { id: 'fresh', endDate: ended(48 + REPORT_GRACE_HOURS - 0.5), title: 'Fresh night' },
      ],
      48,
      NOW,
    )
    expect(items.map((i) => i.id)).toEqual(['report:late'])
    expect(items[0].what).toBe('The after-the-night report for Late night')
    expect(items[0].since).toBe(ended(REPORT_GRACE_HOURS))
  })
})
