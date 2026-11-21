import { describe, expect, it, vi } from 'vitest'
import { askEngine, ENGINE_LIMIT, orderByRank, toAnswer, type EngineRow, type SearchRpcClient } from '@/lib/search/engine'

const row = (event_id: string, matched = 'exact', query = 'comedy', score = 1): EngineRow => ({ event_id, score, matched, query })

describe('the engine answer', () => {
  it('keeps the engine order, once per id, and says how it matched', () => {
    const a = toAnswer([row('a'), row('b'), row('a')])
    expect(a.ids).toEqual(['a', 'b'])
    expect(a.rank.get('b')).toBe(1)
    expect(a).toMatchObject({ matched: 'exact', query: 'comedy' })
  })

  it("a corrected answer carries the corrected query, for 'Did you mean'", () => {
    expect(toAnswer([row('a', 'corrected', 'comedy')])).toMatchObject({ matched: 'corrected', query: 'comedy' })
  })

  it('nothing matched is an empty answer, not an error', () => {
    expect(toAnswer([])).toEqual({ ids: [], rank: new Map(), matched: null, query: null })
  })
})

describe('asking the engine', () => {
  it('asks search_events for its best ENGINE_LIMIT', async () => {
    const rpc = vi.fn(async () => ({ data: [row('a')], error: null }))
    const a = await askEngine({ rpc } as unknown as SearchRpcClient, 'asia oasis')
    expect(rpc).toHaveBeenCalledWith('search_events', { p_q: 'asia oasis', p_limit: ENGINE_LIMIT })
    expect(a?.ids).toEqual(['a'])
  })

  it('an engine that cannot answer gives null (the caller falls back), logged, never thrown', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'function public.search_events does not exist' } }))
    await expect(askEngine({ rpc } as unknown as SearchRpcClient, 'x')).resolves.toBeNull()
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/could not answer/))
    err.mockRestore()
  })

  it('a client with no rpc, or an rpc that throws, also gives null, never a thrown error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(askEngine({} as unknown as SearchRpcClient, 'x')).resolves.toBeNull()
    const rpc = vi.fn(async () => { throw new Error('fetch failed') })
    await expect(askEngine({ rpc } as unknown as SearchRpcClient, 'x')).resolves.toBeNull()
    err.mockRestore()
  })
})

describe('rows in the engine order', () => {
  it('ranked rows by rank, unranked after them in their own order', () => {
    const rank = new Map([['c', 0], ['a', 1]])
    const rows = [{ id: 'a' }, { id: 'x' }, { id: 'c' }, { id: 'y' }]
    expect(orderByRank(rows, rank).map((r) => r.id)).toEqual(['c', 'a', 'x', 'y'])
  })
})
