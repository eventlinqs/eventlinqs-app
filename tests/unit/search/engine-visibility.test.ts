import { describe, expect, it, vi } from 'vitest'

/**
 * THE PM'S TWO CONDITIONS BEFORE THE SEARCH CAR'S GATE (22 November 2026, 05:45), run through the real fetcher:
 *   (a) the CORRECTED and RELAXED steps never answer an ended night or a hidden row: their ids are one `in` filter on the
 *       same query that carries the one public visibility rule and the listing window, exactly as an exact answer is;
 *   (b) the fallback to the old word filter writes a row to the search log every time, so it is never silent.
 * The client records every call; nothing reaches a database.
 */
const state = vi.hoisted(() => {
  const s = { calls: [] as unknown[][], engine: { data: [] as unknown[] | null, error: null as { message: string } | null } }
  const builder = (): unknown => {
    const b: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null })
          return (...args: unknown[]) => {
            s.calls.push([String(prop), ...args])
            return b
          }
        },
      },
    )
    return b
  }
  const client = {
    from: (t: string) => {
      s.calls.push(['from', t])
      return builder()
    },
    rpc: async (fn: string, args: unknown) => {
      s.calls.push(['rpc', fn, args])
      return s.engine
    },
  }
  return { s, client }
})

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => undefined }))
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => state.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => state.client }))

const { fetchPublicEvents } = await import('@/lib/events/fetchers')
const { PUBLIC_EVENT_MATCH } = await import('@/lib/events/public-visibility')

const listingWindow = (calls: unknown[][]) => calls.some((c) => c[0] === 'or' && String(c[1]).includes('end_date.gte.'))

describe('(a) a corrected or relaxed answer meets the same visibility as an exact one', () => {
  for (const matched of ['exact', 'corrected', 'relaxed'] as const) {
    it(`${matched}: its ids are one in filter beside the public rule and the listing window`, async () => {
      state.s.calls.length = 0
      state.s.engine = {
        data: [
          { event_id: 'live-night', score: 1, matched, query: 'comedy' },
          { event_id: 'ended-or-hidden-night', score: 0.5, matched, query: 'comedy' },
        ],
        error: null,
      }
      await fetchPublicEvents({ filters: { q: 'comdey' } })
      expect(state.s.calls).toContainEqual(['rpc', 'search_events', { p_q: 'comdey', p_limit: 200 }])
      expect(state.s.calls).toContainEqual(['match', PUBLIC_EVENT_MATCH])
      expect(state.s.calls).toContainEqual(['in', 'id', ['live-night', 'ended-or-hidden-night']])
      expect(listingWindow(state.s.calls)).toBe(true)
    })
  }
})

describe('(b) the fallback to the old word filter is never silent', () => {
  it('the engine refusing: one search log row with surface events-fallback, and the word filter answers', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    state.s.calls.length = 0
    state.s.engine = { data: null, error: { message: 'function public.search_events does not exist' } }
    await fetchPublicEvents({ filters: { q: 'asia oasis' } })
    expect(state.s.calls).toContainEqual(['from', 'site_searches'])
    expect(state.s.calls).toContainEqual(['insert', { term: 'asia oasis', results: null, surface: 'events-fallback' }])
    expect(state.s.calls.some((c) => c[0] === 'or' && String(c[1]).includes('title.ilike.*asia*'))).toBe(true)
    expect(state.s.calls).toContainEqual(['match', PUBLIC_EVENT_MATCH])
    err.mockRestore()
  })

  it('a log that cannot be written never stops the search', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    state.s.engine = { data: null, error: { message: 'down' } }
    const from = state.client.from
    state.client.from = (t: string) => {
      if (t === 'site_searches') throw new Error('no service key')
      return from(t)
    }
    await expect(fetchPublicEvents({ filters: { q: 'oasis' } })).resolves.toMatchObject({ page: 1 })
    state.client.from = from
    err.mockRestore()
  })
})
