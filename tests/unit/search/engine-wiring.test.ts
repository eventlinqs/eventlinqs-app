import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ranksBySearch } from '@/lib/events/fetchers'

/**
 * /events ASKS THE ONE SEARCH ENGINE (the PM's order of 22 November 2026, 05:25): the free text of both fetch paths is
 * answered by search_events, its ids one `in` op beside every other filter and the one visibility rule, its order kept
 * by paging in memory, the old word filter only when the engine cannot answer.
 */
const src = readFileSync(join(__dirname, '..', '..', '..', 'src', 'lib', 'events', 'fetchers.ts'), 'utf8').replace(/\r\n/g, '\n')

describe("a search is in the engine's order", () => {
  it('free text with no other order chosen is ranked by the engine', () => {
    expect(ranksBySearch({ q: 'asia oasis' })).toBe(true)
    expect(ranksBySearch({ q: 'comedy', sort: 'relevance' })).toBe(true)
  })

  it('an order the visitor chose, no text, or the Organisers tab is not', () => {
    expect(ranksBySearch({ q: 'comedy', sort: 'date_asc' })).toBe(false)
    expect(ranksBySearch({ q: '   ' })).toBe(false)
    expect(ranksBySearch({})).toBe(false)
    expect(ranksBySearch({ q: 'harbourline', tab: 'organisers' })).toBe(false)
  })
})

describe('both fetch paths ask the engine', () => {
  it('the free text is the engine answer first, the word filter only when the engine cannot answer', () => {
    const at = src.indexOf('async function resolveSearch(')
    expect(at).toBeGreaterThan(0)
    const body = src.slice(at, src.indexOf('\n}\n', at))
    expect(body.indexOf('askEngine(')).toBeLessThan(body.indexOf('searchOrGroups('))
    expect(body).toContain("{ kind: 'in', column: 'id', values: engine.ids.length > 0 ? [...engine.ids] : [NO_MATCH] }")
  })

  it('the resolver reads the free text through the engine, and both paths keep its answer', () => {
    expect(src).toContain('const search = await resolveSearch(supabase, filters.q)')
    expect(src.match(/const resolved = await resolveEventFilterOps\(/g)).toHaveLength(2)
    expect(src.match(/if \(resolved\.engine && ranksBySearch\(filters\)\) events = orderByRank\(events, resolved\.engine\.rank\)/g)).toHaveLength(2)
    expect(src.match(/const inMemoryPagination = paginatesInMemory\(filters\) \|\| ranksBySearch\(filters\)/g)).toHaveLength(2)
  })
})
