/**
 * THE ONE SEARCH ENGINE, AS THE APP CALLS IT (the PM's order of 22 November 2026, 05:25; Lawal, 05:08: "This can never
 * break"). The engine itself is in the database (supabase/migrations/20261122060001_search_engine.sql, search_events):
 * one document per event written from what its page shows, ranked in three steps (exact, corrected for 'Did you mean',
 * relaxed). This module asks it and hands back the ranked ids, how they matched and the query that answered.
 *
 * WHAT IT NEVER DOES: decide what a visitor may see. The ids are candidates; every caller filters them with the one
 * public visibility rule (src/lib/events/public-visibility.ts) exactly as before.
 *
 * WHEN THE ENGINE CANNOT ANSWER (an error, such as a database the migration has not reached), askEngine answers null
 * and the caller falls back to the word filter that served before it, so search keeps answering and the failure is
 * logged loudly rather than shown to a visitor as 'No results'.
 *
 * THE LIMIT. The ids travel to the events query as one `in` filter in the request's address; 200 ids is about 7.5 KB of
 * address. The gateway's own limit on an address's length is UNSOURCED (not found on a Supabase page this session), so
 * the engine is asked for its best 200, ranked: a results page shows 24, so this is eight pages of the best answers.
 */
export const ENGINE_LIMIT = 200

export type EngineMatch = 'exact' | 'corrected' | 'relaxed'

export type EngineAnswer = {
  /** The candidate event ids, best first. */
  readonly ids: readonly string[]
  /** Each id's place in the engine's order (0 is best). */
  readonly rank: ReadonlyMap<string, number>
  /** How the answer matched; null when nothing matched at all. */
  readonly matched: EngineMatch | null
  /** The query that answered: the corrected one where it was corrected ('Did you mean'). */
  readonly query: string | null
}

export type EngineRow = { event_id: string; score: number; matched: string; query: string }

export type SearchRpcClient = {
  rpc(fn: 'search_events', args: { p_q: string; p_limit?: number }): PromiseLike<{ data: EngineRow[] | null; error: { message: string } | null }>
}

const MATCHES: readonly string[] = ['exact', 'corrected', 'relaxed']

/** The engine's rows as an answer. Pure. */
export function toAnswer(rows: readonly EngineRow[]): EngineAnswer {
  const ids: string[] = []
  const rank = new Map<string, number>()
  for (const r of rows) {
    if (rank.has(r.event_id)) continue
    rank.set(r.event_id, ids.length)
    ids.push(r.event_id)
  }
  const first = rows[0]
  return {
    ids,
    rank,
    matched: first && MATCHES.includes(first.matched) ? (first.matched as EngineMatch) : null,
    query: first ? first.query : null,
  }
}

/** Asks the engine; null when it could not answer (the caller falls back and search still answers). */
export async function askEngine(client: SearchRpcClient, q: string): Promise<EngineAnswer | null> {
  try {
    if (typeof client?.rpc !== 'function') throw new Error('the client has no rpc')
    const { data, error } = await client.rpc('search_events', { p_q: q, p_limit: ENGINE_LIMIT })
    if (error) throw new Error(error.message)
    return toAnswer(data ?? [])
  } catch (e) {
    console.error(`[search-engine] search_events could not answer, the word filter answers instead: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/**
 * Rows in the engine's order: ranked rows first by rank, any row the engine did not rank after them in the order it
 * came. Stable. Pure.
 */
export function orderByRank<T extends { id: string }>(rows: readonly T[], rank: ReadonlyMap<string, number>): T[] {
  return rows
    .map((row, i) => ({ row, i, r: rank.get(row.id) }))
    .sort((a, b) => (a.r ?? Number.MAX_SAFE_INTEGER) - (b.r ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .map((x) => x.row)
}
