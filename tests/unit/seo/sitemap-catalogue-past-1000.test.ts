import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { readEventCatalogue, readOrganiserCatalogue, readVenueCatalogue } from '@/lib/seo/sitemap-catalogue'

/*
 * THE SITEMAP PAST 1,000 ROWS (car 44c's failed production build, 5 November 2026; the CONTROLLER's 17:22 quoting Vercel's
 * log: '[sitemap-covers-the-catalogue] FAIL ... 13 events page(s) the database holds are ABSENT from the sitemap ...
 * /events/wwe-rod-laver-arena-2026-12-09, /events/yacht-rock-revival-bird-s-basement-2026-12-11 ...'). Every missing
 * page sorted last: the server answers at most 1,000 rows a request whatever .limit() asks, and the hunt grew the
 * catalogue past it. This fake answers as the server does, 1,000 rows at most per request, over 1,200 rows.
 */
const ROWS = 1200
const CEILING = 1000
function client(make: (i: number) => Record<string, unknown>) {
  const all = Array.from({ length: ROWS }, (_, i) => make(i))
  return {
    from: () => {
      let lo = 0
      let hi = Number.MAX_SAFE_INTEGER
      let cap = Number.MAX_SAFE_INTEGER
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'match', 'not', 'order', 'eq', 'in', 'is', 'neq', 'gt']) b[m] = () => b
      b.limit = (n: number) => ((cap = n), b)
      b.range = (from: number, to: number) => ((lo = from), (hi = to), b)
      b.then = (ok: (v: unknown) => unknown) => {
        const want = all.slice(lo, Math.min(hi + 1, lo + cap))
        return Promise.resolve({ data: want.slice(0, CEILING), error: null }).then(ok)
      }
      return b
    },
  } as never
}
const pad = (i: number) => String(i).padStart(5, '0')

describe('the sitemap reads every row past the server ceiling', () => {
  it('1,200 public events are 1,200 event pages, the last ones included', async () => {
    const r = await readEventCatalogue(client((i) => ({ slug: `event-${pad(i)}`, updated_at: '2026-11-05T00:00:00Z' })))
    expect(r.error).toBeNull()
    expect(r.rows).toHaveLength(ROWS)
    expect(r.rows.at(-1)?.path).toBe(`/events/event-${pad(ROWS - 1)}`)
  })
  it('1,200 events at 1,200 venues are 1,200 venue pages', async () => {
    const r = await readVenueCatalogue(client((i) => ({ venue_name: `Venue ${pad(i)}`, updated_at: '2026-11-05T00:00:00Z' })))
    expect(r.error).toBeNull()
    expect(r.rows).toHaveLength(ROWS)
  })
  it('the organiser catalogue reads past the ceiling too', async () => {
    const r = await readOrganiserCatalogue({
      admin: client((i) => ({ id: `o${i}`, slug: `org-${pad(i)}`, description: 'A real organiser with a real biography.', updated_at: '2026-11-05T00:00:00Z' })),
      eventCountFor: () => 10,
      threshold: 1,
    })
    expect(r.error).toBeNull()
    expect(r.rows.length).toBeGreaterThan(CEILING)
  })
})
