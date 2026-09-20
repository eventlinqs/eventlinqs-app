import { describe, it, expect } from 'vitest'
import {
  getPlatformStats,
  type PlatformStatsRow,
  type StatsReadClient,
} from '@/lib/stats/platform-stats'

/**
 * A FAKE THAT CAN ACTUALLY SHOW THE DEFECT.
 *
 * The fake this file replaced returned exactly the rows it was handed, so no
 * value of any argument could ever make it truncate, and the resolver's
 * thousand-row cap was invisible to every test in the suite while it was live
 * on /organisers. This one models the thing that was wrong: a SERVER CEILING
 * applied after the filter and the order, exactly as PostgREST applies it
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
 * plus a `.range()` window the caller may ask for.
 *
 * It also RECORDS what it was asked, so a test can assert that the read paged
 * and ordered rather than assuming it did.
 */
function ceilingClient(
  rows: PlatformStatsRow[],
  opts: { ceiling?: number; failOnCall?: number } = {},
): StatsReadClient & { calls: Array<{ from: number; to: number }>; orderedBy: string[] } {
  const ceiling = opts.ceiling ?? 1000
  const calls: Array<{ from: number; to: number }> = []
  const orderedBy: string[] = []

  const client = {
    calls,
    orderedBy,
    from(table: string) {
      expect(table).toBe('events')
      return {
        select(columns: string) {
          expect(columns).toBe('organisation_id, venue_city')
          return {
            eq(column: string, value: string) {
              expect(column).toBe('status')
              expect(value).toBe('published')
              return {
                order(column: string, o: { ascending: boolean }) {
                  orderedBy.push(column)
                  expect(o.ascending).toBe(true)
                  return {
                    range(from: number, to: number) {
                      calls.push({ from, to })
                      if (opts.failOnCall !== undefined && calls.length === opts.failOnCall) {
                        return Promise.resolve({
                          data: null,
                          error: { message: 'connection reset' },
                        })
                      }
                      // The window the caller asked for, then the server's cap.
                      const window = rows.slice(from, to + 1)
                      return Promise.resolve({ data: window.slice(0, ceiling), error: null })
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
  return client as unknown as StatsReadClient & {
    calls: Array<{ from: number; to: number }>
    orderedBy: string[]
  }
}

/** `n` events, every one with its own organisation and its own city. */
function allDistinct(n: number): PlatformStatsRow[] {
  return Array.from({ length: n }, (_, i) => ({
    organisation_id: `org-${i}`,
    venue_city: `City ${i}`,
  }))
}

describe('getPlatformStats', () => {
  it('counts published events, distinct organisers, and distinct cities', async () => {
    const client = ceilingClient([
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

  /**
   * THE DEFECT ITSELF. 2,500 events, each with its own organiser and its own
   * city, behind the documented 1,000-row ceiling. The shape this replaced
   * reported 1,000 organisers and 1,000 cities beside an exact total of 2,500:
   * one line describing two different catalogues.
   */
  it('counts every organiser and every city past the row ceiling', async () => {
    const client = ceilingClient(allDistinct(2_500), { ceiling: 1_000 })
    const stats = await getPlatformStats({ client })

    expect(stats.eventsListed).toBe(2_500)
    expect(stats.organisers).toBe(2_500)
    expect(stats.cities).toBe(2_500)
    expect(stats.source).toBe('live')

    // The ceiling must really have bitten, or this test proves nothing: a fake
    // that never truncates passes whatever the resolver does.
    expect(client.calls.length).toBeGreaterThan(1)
    expect(client.calls[0]).toEqual({ from: 0, to: 999 })
  })

  /**
   * A CEILING LOWER THAN THE PAGE SIZE MAKES EVERY PAGE SHORT. A pager that
   * stops on a short page would report 300 of 2,500 events as the whole
   * catalogue, and the ceiling is a project setting this repository cannot see.
   */
  it('is exact when the project ceiling is lower than the page size', async () => {
    const client = ceilingClient(allDistinct(2_500), { ceiling: 300 })
    const stats = await getPlatformStats({ client })
    expect(stats.eventsListed).toBe(2_500)
    expect(stats.organisers).toBe(2_500)
    expect(stats.cities).toBe(2_500)
  })

  /** Paging over an undefined order can return one row twice and skip another. */
  it('pages on a stable total order', async () => {
    const client = ceilingClient(allDistinct(1_500))
    await getPlatformStats({ client })
    expect(client.orderedBy.length).toBeGreaterThan(0)
    expect(new Set(client.orderedBy)).toEqual(new Set(['id']))
  })

  it('returns all-null stats when the read errors, never throws', async () => {
    const client = ceilingClient([], { failOnCall: 1 })
    const stats = await getPlatformStats({ client })
    expect(stats).toEqual({
      eventsListed: null,
      organisers: null,
      cities: null,
      source: 'unavailable',
    })
  })

  /**
   * A HALF-READ IS NOT A SMALLER CATALOGUE. When the second page fails, the
   * band must hide rather than publish the first thousand as the whole
   * platform, which is the failure mode that reads as a true number.
   */
  it('hides the band when a later page fails rather than reporting a partial catalogue', async () => {
    const client = ceilingClient(allDistinct(2_500), { ceiling: 1_000, failOnCall: 2 })
    const stats = await getPlatformStats({ client })
    expect(stats.source).toBe('unavailable')
    expect(stats.eventsListed).toBeNull()
    expect(stats.organisers).toBeNull()
    expect(stats.cities).toBeNull()
  })
})
