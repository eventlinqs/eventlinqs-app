// AN `.in()` READ HAS TWO CEILINGS, AND A READ THAT RESPECTS ONE IS STILL WRONG.
//
// `readEveryRow` bounds what one RESPONSE may carry. `chunkInFilterValues` bounds
// what one REQUEST may ask for. Every real `.in()` read needs both, and until
// 21 September 2026 the just-announced alert cron had neither: it spelled up to
// 200 organisation ids into one URL (about 7.4 KB of UUIDs against a 4 KB budget)
// and then read the answer with no page bound at all. Which way it failed
// depended only on how many organisers had announced something that fortnight.
//
// These pin the combination rather than either half, because the halves are
// tested where they live (in-chunks.test.ts and read-every-row.test.ts) and the
// defect was in nobody putting them together.

import { describe, expect, it } from 'vitest'
import { readEveryRowIn } from '@/lib/supabase/read-every-row-in'

type Row = { owner: string; value: string }

/** A fake PostgREST that truncates any window wider than its ceiling. */
function server(rows: Row[], ceiling = 1000) {
  const asked: { chunk: string[]; from: number; to: number }[] = []
  const page = (chunk: string[], from: number, to: number) => {
    asked.push({ chunk, from, to })
    const matching = rows.filter((r) => chunk.includes(r.owner))
    const width = Math.min(to - from + 1, ceiling)
    return Promise.resolve({ data: matching.slice(from, from + width), error: null })
  }
  return { asked, page }
}

const idsOfLength = (n: number, prefix = 'o') =>
  Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(4, '0')}`)

describe('readEveryRowIn', () => {
  it('asks nothing at all when there is nothing to ask about', async () => {
    const { asked, page } = server([])
    expect(await readEveryRowIn('nothing', [], page)).toEqual([])
    expect(asked).toHaveLength(0)
  })

  it('splits one oversized id list across requests and returns them as one answer', async () => {
    // 250 UUID-shaped values is past the 100-value count bound, so this must
    // become several requests and the caller must not be able to tell.
    const owners = idsOfLength(250)
    const rows = owners.map((owner) => ({ owner, value: `${owner}-row` }))
    const { asked, page } = server(rows)

    const got = await readEveryRowIn<{ owner: string; value: string }>('owners', owners, page)

    expect(got).toHaveLength(250)
    expect(new Set(got.map((r) => r.owner)).size).toBe(250)
    // Each chunk is asked TWICE: the page that carries its rows, then the empty
    // page that ends the loop. That second request is the price of terminating
    // correctly at a ceiling this code cannot see, and readEveryRow's header
    // says so; asserting it here stops a future "optimisation" removing it.
    const chunks = asked.filter((a) => a.from === 0).map((a) => a.chunk)
    expect(chunks.length).toBeGreaterThan(1)
    expect(asked).toHaveLength(chunks.length * 2)
    // Every id appears exactly once across the chunks, in caller order.
    expect(chunks.flat()).toEqual(owners)
  })

  it('pages within a chunk, so a chunk whose answer exceeds the ceiling is still read in full', async () => {
    // One chunk of 10 owners, but 2,500 rows behind them: the request bound is
    // satisfied and the RESPONSE bound is the one that bites.
    const owners = idsOfLength(10)
    const rows = Array.from({ length: 2_500 }, (_, i) => ({
      owner: owners[i % 10],
      value: `row-${i}`,
    }))
    const { asked, page } = server(rows, 1_000)

    const got = await readEveryRowIn<{ owner: string; value: string }>('rows', owners, page)

    expect(got).toHaveLength(2_500)
    // Three full pages and the empty one that stops the loop.
    expect(asked.map((a) => a.from)).toEqual([0, 1_000, 2_000, 2_500])
  })

  it('advances by the rows it received, so a project ceiling below the page size still terminates', async () => {
    // The failure mode readEveryRow's own header names: stop on a SHORT page and
    // a lowered ceiling makes every page short. 400 rows behind a ceiling of 250.
    const owners = idsOfLength(4)
    const rows = Array.from({ length: 400 }, (_, i) => ({ owner: owners[i % 4], value: `r-${i}` }))
    const { page } = server(rows, 250)

    expect(await readEveryRowIn('rows', owners, page)).toHaveLength(400)
  })

  it('raises rather than returning the half it managed to read', async () => {
    const failing = () => Promise.resolve({ data: null, error: { message: 'connection reset' } })
    await expect(readEveryRowIn('followers', ['o-1'], failing)).rejects.toThrow(/connection reset/)
  })
})
