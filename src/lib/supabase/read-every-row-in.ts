import { chunkInFilterValues } from './in-chunks'
import { readEveryRow, type PagedResult } from './read-every-row'

/**
 * AN `.in()` READ HAS TWO CEILINGS AND NEITHER ONE IMPLIES THE OTHER.
 *
 * ---------------------------------------------------------------------------
 * THE TWO BOUNDS, AND WHY BOTH ARE ALWAYS NEEDED TOGETHER.
 *
 *   THE REQUEST  `chunkInFilterValues`. An `in` filter is spelled into the URL,
 *                and Supabase Cloud refuses a request whose headers and URL pass
 *                16 KB ("This is commonly caused by lengthy `in` clauses",
 *                https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2,
 *                fetched 2026-09-19). The failure is `TypeError: fetch failed`,
 *                not a short answer.
 *
 *   THE RESPONSE `readEveryRow`. A project returns at most a fixed number of
 *                rows, 1,000 by default, and says nothing about the ones it left
 *                out: HTTP 200, `error` null, a full-looking array.
 *
 * Every real caller needs both, and every caller that has needed both has so far
 * written both out by hand or, more often, written neither. The just-announced
 * alert cron had exactly this shape on 21 September 2026: `.in()` over up to 200
 * organisation ids (about 7.4 KB of UUIDs against a 4 KB budget) whose result was
 * then read with no page bound at all, so it could fail outright OR silently
 * drop every follower past the first thousand, depending only on how many
 * organisers had announced something that fortnight.
 *
 * ---------------------------------------------------------------------------
 * THE CALLER STILL SUPPLIES THE ORDER, AND MUST.
 *
 * Ranged paging over a non-unique sort is not paging: Postgres may hand back one
 * row in two windows and another in none. This cannot supply the order itself
 * because only the caller knows which columns are unique together, so it stays
 * the caller's job and `scripts/guards/no-silent-row-ceiling.mjs` fails the build
 * when a ranged read carries no `.order(`.
 */
export async function readEveryRowIn<T>(
  what: string,
  values: string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<PagedResult<T>>,
): Promise<T[]> {
  if (values.length === 0) return []
  const rows: T[] = []
  const chunks = chunkInFilterValues(values)
  for (const [index, chunk] of chunks.entries()) {
    const batch = await readEveryRow<T>(
      chunks.length === 1 ? what : `${what} (chunk ${index + 1} of ${chunks.length})`,
      (from, to) => page(chunk, from, to),
    )
    rows.push(...batch)
  }
  return rows
}
