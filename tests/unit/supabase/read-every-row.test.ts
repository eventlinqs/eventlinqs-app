import { describe, expect, it, vi } from 'vitest'
import { readEveryRow, SUPABASE_DEFAULT_ROW_CEILING } from '@/lib/supabase/read-every-row'

/**
 * THE PAGER THAT EXISTS BECAUSE A SCREEN REPORTED 997 PEOPLE OUT OF 9,364.
 *
 * Every test here is written against a FAKE SERVER rather than a fake pager,
 * because the defect being prevented is a property of the server: it answers
 * 200, with no error, having silently left rows out. A mock that returns what
 * it was asked for cannot reproduce that, and a test that cannot reproduce the
 * defect cannot prove it is fixed.
 */

/** A server holding `total` rows that will never return more than `ceiling`. */
function fakeTable(total: number, ceiling = SUPABASE_DEFAULT_ROW_CEILING) {
  const calls: { from: number; to: number; returned: number }[] = []
  const page = (from: number, to: number) => {
    const width = Math.min(to - from + 1, ceiling)
    const rows = []
    for (let i = from; i < Math.min(from + width, total); i += 1) rows.push({ id: i })
    calls.push({ from, to, returned: rows.length })
    return Promise.resolve({ data: rows, error: null })
  }
  return { page, calls }
}

describe('readEveryRow', () => {
  it('returns every row when the table is larger than one page', async () => {
    const { page } = fakeTable(9490)
    const rows = await readEveryRow('consent_events', page)
    expect(rows).toHaveLength(9490)
    expect(rows[0]).toEqual({ id: 0 })
    expect(rows[9489]).toEqual({ id: 9489 })
  })

  it('returns no duplicates and no gaps across pages', async () => {
    const { page } = fakeTable(2500)
    const rows = await readEveryRow('consent_events', page)
    const ids = rows.map(r => r.id)
    expect(new Set(ids).size).toBe(2500)
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
  })

  /*
   * THE ONE A NAIVE PAGER FAILS. A project whose row ceiling has been LOWERED
   * below the page size answers every request with a "short" page. A loop that
   * stops on a short page stops after the first one and reports a fraction of
   * the table as the whole of it, with no error anywhere. The ceiling lives in
   * a dashboard this repository cannot read, so the pager may not assume it.
   */
  it('reads the whole table when the project ceiling is lower than the page size', async () => {
    const { page, calls } = fakeTable(2500, 500)
    const rows = await readEveryRow('consent_events', page)
    expect(rows).toHaveLength(2500)
    expect(calls.every(c => c.returned <= 500)).toBe(true)
  })

  it('advances by the rows received, never by the page size', async () => {
    const { page, calls } = fakeTable(1200, 500)
    await readEveryRow('consent_events', page)
    expect(calls.map(c => c.from)).toEqual([0, 500, 1000, 1200])
  })

  it('stops on an empty page rather than on a short one', async () => {
    const { page, calls } = fakeTable(1000)
    const rows = await readEveryRow('consent_events', page)
    expect(rows).toHaveLength(1000)
    // 0-999 full, then 1000-1999 empty. A short-page stop would have made one.
    expect(calls).toHaveLength(2)
    expect(calls[1].returned).toBe(0)
  })

  it('asks for exactly one window per call, inclusive of both bounds', async () => {
    const { page, calls } = fakeTable(10)
    await readEveryRow('consent_events', page, { pageSize: 4 })
    expect(calls.map(c => [c.from, c.to])).toEqual([
      [0, 3],
      [4, 7],
      [8, 11],
      [10, 13],
    ])
  })

  it('reads an empty table without error', async () => {
    const { page, calls } = fakeTable(0)
    await expect(readEveryRow('consent_events', page)).resolves.toEqual([])
    expect(calls).toHaveLength(1)
  })

  /*
   * A PARTIAL ANSWER THAT LOOKS WHOLE IS THE DEFECT. Half a ledger is not a
   * ledger, so a failure mid-read throws rather than handing back what it had.
   */
  it('throws rather than returning the pages it managed to read', async () => {
    let call = 0
    const page = () => {
      call += 1
      return Promise.resolve(
        call === 1
          ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }
          : { data: null, error: { message: 'statement timeout' } },
      )
    }
    await expect(readEveryRow('consent_events', page)).rejects.toThrow(
      /consent_events could not be read in full: statement timeout/,
    )
  })

  it('names the read in the error, so a failure says which one gave up', async () => {
    const page = () => Promise.resolve({ data: null, error: { message: 'boom' } })
    await expect(readEveryRow('suppression_events', page)).rejects.toThrow(/^suppression_events could not be read/)
  })

  it('refuses a runaway read rather than exhausting memory', async () => {
    const { page } = fakeTable(500_000)
    await expect(readEveryRow('orders', page, { maxRows: 2000 })).rejects.toThrow(
      /returned more than 2000 rows; this read needs a filter or a bound/,
    )
  })

  it('refuses a page size that is not a positive integer', async () => {
    const { page } = fakeTable(10)
    await expect(readEveryRow('orders', page, { pageSize: 0 })).rejects.toThrow(/pageSize must be a positive integer/)
    await expect(readEveryRow('orders', page, { pageSize: 1.5 })).rejects.toThrow(/pageSize must be a positive integer/)
  })

  it('retries a transient pool failure rather than failing the whole read', async () => {
    vi.useFakeTimers()
    let call = 0
    const page = (from: number) => {
      call += 1
      if (call === 2) return Promise.resolve({ data: null, error: { message: 'fetch failed' } })
      const rows = from === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : []
      return Promise.resolve({ data: rows, error: null })
    }
    const promise = readEveryRow('consent_events', page)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toHaveLength(1000)
    vi.useRealTimers()
  })

  it('states the documented ceiling as its page size', () => {
    expect(SUPABASE_DEFAULT_ROW_CEILING).toBe(1000)
  })
})
