/*
 * THE HOLD WALK RUNS IN THE ENGINE (the Event Discovery Engine, part (e); Lawal's 18:28 of 13 November 2026). The walk the
 * reviewed script drove by hand (scripts/verify/resolve-run.mts --walk-holds) now runs in each collection turn by the same
 * rules: a page stating the night releases its hold and shows the night again; a page calling it off (cancelled in its own
 * Event data, or postponed) cancels the night; a silent page moves the hold to its next source; robots.txt and a 429 are
 * obeyed. A fake database records every write; a fake fetcher serves real shaped pages.
 */
import { describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelledOnPage, walkHolds } from '@/lib/listings/hold-walk-run'

const START = '2026-11-20T09:00:00.000Z'
const PAGE = 'https://venue.example.com.au/whats-on/night'

type Write = { table: string; values: Record<string, unknown>; filters: [string, string, unknown][] }

function fakeDb(holds: Record<string, unknown>[]) {
  const writes: Write[] = []
  const event = { id: 'ev1', title: 'Jazz Night', start_date: START, timezone: 'Australia/Melbourne', venue_name: 'The Venue', venue_address: '12 Smith Street, Fitzroy' }
  const builder = (table: string) => {
    let values: Record<string, unknown> | null = null
    const filters: [string, string, unknown][] = []
    const self: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => {
      filters.push([name, String(args[0]), args[1]])
      return self
    }
    for (const m of ['select', 'is', 'or', 'order', 'limit', 'in', 'eq']) self[m] = chain(m)
    self.update = (v: Record<string, unknown>) => {
      values = v
      return self
    }
    self.then = (resolve: (r: { data: unknown; error: null }) => unknown) => {
      if (values) {
        writes.push({ table, values, filters })
        return Promise.resolve(resolve({ data: null, error: null }))
      }
      const data = table === 'listing_holds' ? holds : table === 'events' ? [event] : table === 'event_booking_links' ? [] : []
      return Promise.resolve(resolve({ data, error: null }))
    }
    return self
  }
  return { db: { from: builder } as unknown as SupabaseClient, writes }
}

const hold = (over: Record<string, unknown> = {}) => ({
  id: 'h1', scope: 'night', field: 'start', state: 'held', next_source: PAGE, sources_tried: [],
  readings: [{ kind: 'venue', url: PAGE, value: null }], event_id: 'ev1', next_check_at: null, ...over,
})

const ld = (o: Record<string, unknown>) => `<html><script type="application/ld+json">${JSON.stringify(o)}</script></html>`
const night = (extra: Record<string, unknown> = {}) =>
  ld({ '@context': 'https://schema.org', '@type': 'Event', name: 'Jazz Night', startDate: START, location: { '@type': 'Place', name: 'The Venue' }, ...extra })

function fakeFetch(pages: Record<string, { status: number; body: string }>) {
  const asked: string[] = []
  const fetcher = (async (u: string) => {
    asked.push(u)
    const p = pages[u] ?? { status: 404, body: '' }
    return new Response(p.body, { status: p.status, headers: { 'content-type': 'text/html' } })
  }) as unknown as typeof fetch
  return { fetcher, asked }
}

const ROBOTS = 'https://venue.example.com.au/robots.txt'
const run = (db: SupabaseClient, fetcher: typeof fetch) => walkHolds(db, fetcher, new Date('2026-11-14T00:00:00Z'), Date.now() + 60_000, 15, 0)

describe('the walk in the engine', () => {
  test('a page stating the night releases the hold, by the resolver, and shows a held night again', async () => {
    const { db, writes } = fakeDb([hold()])
    const { fetcher } = fakeFetch({ [ROBOTS]: { status: 200, body: '' }, [PAGE]: { status: 200, body: night() } })
    const out = await run(db, fetcher)
    expect(out).toMatchObject({ due: 1, walked: 1, released: 1, cancelled: 0, next: 0, failed: [] })
    const shown = writes.find((w) => w.table === 'events')
    expect(shown?.values).toEqual({ visibility: 'public' })
    const released = writes.find((w) => w.table === 'listing_holds')
    expect(String(released?.values.released_by)).toMatch(/^the resolver: /)
  })

  test('a page marking the night cancelled cancels it, only a published listing, and releases the hold', async () => {
    const { db, writes } = fakeDb([hold({ field: 'status' })])
    const { fetcher } = fakeFetch({ [ROBOTS]: { status: 200, body: '' }, [PAGE]: { status: 200, body: night({ eventStatus: 'https://schema.org/EventCancelled' }) } })
    const out = await run(db, fetcher)
    expect(out.cancelled).toBe(1)
    const cancelled = writes.find((w) => w.table === 'events')
    expect(cancelled?.values).toEqual({ status: 'cancelled' })
    expect(cancelled?.filters).toEqual(expect.arrayContaining([['eq', 'status', 'published'], ['eq', 'listing_source', 'eventlinqs']]))
  })

  test('a silent page moves the hold to its next source tomorrow, with what was tried', async () => {
    const OTHER = 'https://tickets.example.com/e/1'
    const { db, writes } = fakeDb([hold({ readings: [{ kind: 'venue', url: PAGE, value: null }, { kind: 'seller', url: OTHER, value: null }] })])
    const { fetcher } = fakeFetch({ [ROBOTS]: { status: 200, body: '' }, [PAGE]: { status: 200, body: '<html>nothing here</html>' } })
    const out = await run(db, fetcher)
    expect(out.next).toBe(1)
    const moved = writes.find((w) => w.table === 'listing_holds')
    expect(moved?.values).toMatchObject({ state: 'held', next_source: OTHER })
    expect((moved?.values.sources_tried as unknown[]).length).toBe(1)
  })

  test('robots.txt barring the page is obeyed: the page is never asked for', async () => {
    const { db } = fakeDb([hold()])
    const { fetcher, asked } = fakeFetch({ [ROBOTS]: { status: 200, body: 'User-agent: *\nDisallow: /' }, [PAGE]: { status: 200, body: night() } })
    const out = await run(db, fetcher)
    expect(asked).toEqual([ROBOTS])
    expect(out.released).toBe(0)
  })

  test('no hold due, nothing read and nothing written', async () => {
    const { db, writes } = fakeDb([])
    const { fetcher, asked } = fakeFetch({})
    const out = await run(db, fetcher)
    expect(out.due).toBe(0)
    expect(asked).toEqual([])
    expect(writes).toEqual([])
  })
})

describe('a night its own page calls cancelled', () => {
  test('at the same minute, or under its own title that day', () => {
    expect(cancelledOnPage(night({ eventStatus: 'EventCancelled' }), { title: 'Jazz Night', start_date: START })).toBe(true)
    expect(cancelledOnPage(night({ eventStatus: 'EventCancelled', startDate: '2026-11-20T11:00:00.000Z' }), { title: 'jazz night', start_date: START })).toBe(true)
    expect(cancelledOnPage(night(), { title: 'Jazz Night', start_date: START })).toBe(false)
    expect(cancelledOnPage(night({ eventStatus: 'EventCancelled', name: 'Another Night', startDate: '2026-11-21T09:00:00.000Z' }), { title: 'Jazz Night', start_date: START })).toBe(false)
  })
})
