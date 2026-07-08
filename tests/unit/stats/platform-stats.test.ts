import { describe, it, expect } from 'vitest'
import { getPlatformStats, type StatsReadClient } from '@/lib/stats/platform-stats'

function fakeClient(
  rows: Array<{ organisation_id: string | null; venue_city: string | null }> | null,
  opts?: { error?: unknown; count?: number | null }
): StatsReadClient {
  return {
    from(table: string) {
      expect(table).toBe('events')
      return {
        select(_columns: string, _opts: { count: 'exact' }) {
          return {
            eq(column: string, value: string) {
              expect(column).toBe('status')
              expect(value).toBe('published')
              return Promise.resolve({
                data: rows,
                error: opts?.error ?? null,
                count: opts?.count ?? (rows ? rows.length : null),
              })
            },
          }
        },
      }
    },
  }
}

describe('getPlatformStats', () => {
  it('counts published events, distinct organisers, and distinct cities', async () => {
    const client = fakeClient([
      { organisation_id: 'org-1', venue_city: 'Melbourne' },
      { organisation_id: 'org-1', venue_city: 'melbourne ' },
      { organisation_id: 'org-2', venue_city: 'Sydney' },
      { organisation_id: 'org-3', venue_city: null },
      { organisation_id: null, venue_city: 'Geelong' },
    ])
    const stats = await getPlatformStats({ client })
    expect(stats.eventsListed).toBe(5)
    expect(stats.organisers).toBe(3) // null organisation ignored
    expect(stats.cities).toBe(3) // Melbourne deduped case/space-insensitively
    expect(stats.source).toBe('live')
  })

  it('returns all-null stats when the read errors, never throws', async () => {
    const client = fakeClient(null, { error: new Error('boom') })
    const stats = await getPlatformStats({ client })
    expect(stats).toEqual({
      eventsListed: null,
      organisers: null,
      cities: null,
      source: 'unavailable',
    })
  })

  it('prefers the exact count over the returned row length', async () => {
    const client = fakeClient(
      [{ organisation_id: 'org-1', venue_city: 'Perth' }],
      { count: 261 }
    )
    const stats = await getPlatformStats({ client })
    expect(stats.eventsListed).toBe(261)
  })
})
