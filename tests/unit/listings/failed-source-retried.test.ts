import { describe, expect, it } from 'vitest'
import { dueSources, type RegisteredSource } from '@/lib/listings/collect'

/*
 * DEMONSTRATION 18 OF THE SUPREME SPECIFICATION (30 October 2026): 'A failed job is logged and recoverable.'
 *
 * The collection run logs every source's run (listing_source_runs) and /admin/today lists a source that has failed three
 * runs in a row. But a failed check also moved last_checked_at, and dueSources waited the source's whole pace after it,
 * so a weekly source that failed once was not read again for six days, a monthly one for 27, a rarely one for 89: one
 * outage cost a week or more of that source's nights. A source whose last check failed is now read again at the daily
 * pace until it succeeds, whatever its own pace; a source that succeeded keeps its pace exactly as before.
 */

const now = new Date('2026-10-27T03:00:00Z')
const src = (id: string, over: Partial<RegisteredSource>): RegisteredSource => ({
  id, name: id, pageUrl: `https://${id}.example.com`, collection: 'read', changes: 'weekly', lastCheckedAt: null, lastSuccessAt: null, permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, ...over,
})
const yesterday = '2026-10-26T03:00:00Z'
const anHourAgo = '2026-10-27T02:00:00Z'
const lastWeek = '2026-10-20T03:00:00Z'

describe('a source whose last check failed is read again at the daily pace (demonstration 18)', () => {
  it('a weekly, monthly or rarely source that FAILED yesterday is due today', () => {
    const due = dueSources(
      [
        src('weekly-failed-yesterday', { lastCheckedAt: yesterday, lastSuccessAt: lastWeek }),
        src('monthly-failed-yesterday', { changes: 'monthly', lastCheckedAt: yesterday, lastSuccessAt: '2026-10-01T03:00:00Z' }),
        src('rarely-never-succeeded', { changes: 'rarely', lastCheckedAt: yesterday, lastSuccessAt: null }),
      ],
      now,
    )
    expect(due.map((s) => s.id)).toEqual(['weekly-failed-yesterday', 'monthly-failed-yesterday', 'rarely-never-succeeded'])
  })

  it('a source that SUCCEEDED yesterday keeps its own pace', () => {
    const due = dueSources(
      [
        src('weekly-read-yesterday', { lastCheckedAt: yesterday, lastSuccessAt: yesterday }),
        src('monthly-read-yesterday', { changes: 'monthly', lastCheckedAt: yesterday, lastSuccessAt: yesterday }),
      ],
      now,
    )
    expect(due).toEqual([])
  })

  it('a failed source is not hammered: an hour after a failure it waits for the next daily run', () => {
    expect(dueSources([src('weekly-failed-an-hour-ago', { lastCheckedAt: anHourAgo, lastSuccessAt: lastWeek })], now)).toEqual([])
  })

  it('a daily source keeps its daily pace whether its last check failed or not', () => {
    const due = dueSources(
      [
        src('daily-failed-yesterday', { changes: 'daily', lastCheckedAt: yesterday, lastSuccessAt: lastWeek }),
        src('daily-read-yesterday', { changes: 'daily', lastCheckedAt: yesterday, lastSuccessAt: yesterday }),
      ],
      now,
    )
    expect(due.map((s) => s.id)).toEqual(['daily-failed-yesterday', 'daily-read-yesterday'])
  })
})
