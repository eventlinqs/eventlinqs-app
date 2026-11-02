import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadGuideUpcoming } from '@/lib/events/guide-queries'

/*
 * THE CITY GUIDE LISTS EVERY NIGHT, WHEREVER IT IS BOOKED (WINDOW 3's finding of 1 November 2026, 19:23;
 * C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md s1 'Correct EventLinqs and external booking destinations').
 * The guide read the home rails' query, which leaves out every night sold on another site (a rule for the rails only)
 * and stops at Supabase's 1,000 row ceiling. Its own read keeps both, pages to the end, in a stable order.
 */
type Row = { id: string; start_date: string; end_date: string | null; external_ticket_url: string | null }

function fakeClient(all: Row[], pageCap = 1000) {
  const calls: { from: number; to: number; is: unknown[]; orders: string[] }[] = []
  const client = {
    from() {
      const q: Record<string, unknown> & { _from?: number; _to?: number; _is: unknown[]; _orders: string[] } = { _is: [], _orders: [] }
      const chain = {
        select: () => chain,
        match: () => chain,
        or: () => chain,
        is: (...a: unknown[]) => (q._is.push(a), chain),
        order: (c: string) => (q._orders.push(c), chain),
        range(from: number, to: number) {
          calls.push({ from, to, is: q._is, orders: q._orders })
          const end = Math.min(to + 1, from + pageCap)
          return Promise.resolve({ data: all.slice(from, end), error: null })
        },
      }
      return chain
    },
  }
  return { client, calls }
}

const night = (i: number, external: boolean): Row => ({
  id: `e${String(i).padStart(5, '0')}`,
  start_date: new Date(Date.UTC(2026, 10, 2) + i * 60_000).toISOString(),
  end_date: null,
  external_ticket_url: external ? `https://tickets.example.org/${i}` : null,
})

describe('the city guide reads every listed night', () => {
  it('keeps nights sold on another site and reads past 1,000 rows, page by page, in start then id order', async () => {
    const all = Array.from({ length: 1500 }, (_, i) => night(i, i % 2 === 0))
    const { client, calls } = fakeClient(all)
    const rows = await loadGuideUpcoming(client as never, new Date('2026-11-01T09:00:00Z'))
    expect(rows).toHaveLength(1500)
    expect(rows.filter((r) => (r as unknown as Row).external_ticket_url).length).toBe(750)
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const c of calls) {
      expect(c.is).toEqual([])
      expect(c.orders).toEqual(['start_date', 'id'])
    }
  })

  it('the guide screen uses this read, never the home rails\u2019 query', () => {
    const screen = readFileSync(join(process.cwd(), 'src/components/features/city-guide/city-guide-screen.tsx'), 'utf8')
    expect(screen).toContain('loadGuideUpcoming(')
    expect(screen).not.toContain('loadHomeUpcoming')
    const read = readFileSync(join(process.cwd(), 'src/lib/events/guide-queries.ts'), 'utf8')
    expect(read).not.toMatch(/\.is\(\s*'external_ticket_url'/)
  })
})
