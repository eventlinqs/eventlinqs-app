import { withBuildRetry } from './build-retry'

/**
 * A READ WHOSE EMPTY ANSWER DECIDES A 404 MAY NEVER ANSWER "NOT THERE" BECAUSE IT
 * COULD NOT ASK.
 *
 * The fourth occurrence of one class, 12 September 2026. The pre-push gate's
 * checkout drive opened a published, public, paid event at 768 wide and the page
 * answered 404, once, between a 200 at 390 and a 200 at 1440. The row was
 * published and public, the select policies carry no time clause, and the server
 * log carried no failed read, because the read that decided the answer had
 * discarded its error:
 *
 *     const { data } = await supabase.from('events').select('id').eq('slug', slug).maybeSingle()
 *     if (data) return children
 *     notFound()
 *
 * A dropped socket, a pool refusal, a statement timeout: every one of them lands
 * in `error`, leaves `data` null, and is indistinguishable from an empty table to
 * the line below. A buyer whose read blinked is told the event does not exist. A
 * crawler following our own sitemap is told to delete the page.
 *
 * The first three occurrences are recorded on the routes that had them: the
 * organiser profile (twice, `src/app/organisers/[handle]/page.tsx`) and the squad
 * payment page. Each was fixed where it stood. This module is the one door for
 * the fix, so the fifth occurrence has nowhere to happen: a read that decides
 * existence goes through here, or the guard
 * `scripts/guards/read-failure-is-not-not-found.mjs` fails the build.
 *
 * WHAT IT DOES, in the order it does it.
 *
 *   1. RETRIES a transient fault through `withBuildRetry`, which already exists
 *      for exactly this and already recognises `fetch failed`, `ECONNRESET`,
 *      `ETIMEDOUT`, pool exhaustion and statement timeouts. A dropped keep-alive
 *      socket is asked again rather than believed. The retry is a REAL second
 *      request only because every client passes `undedupedFetch`
 *      (src/lib/supabase/undeduped-fetch.ts): without it Next's render-time
 *      deduplicator hands the retry the memo of the first failure, which the
 *      blink proof caught on the day this was written.
 *   2. ANSWERS null for the one error that genuinely means "no row": PostgREST's
 *      PGRST116, which `.single()` returns when zero (or several) rows match.
 *      That is the truth, and the caller's notFound() stands on it.
 *   3. THROWS for anything else, after logging it. A 500 says "ask again", which
 *      is true. A 404 says something false and permanent.
 *
 * WHAT A THROW BECOMES, so nobody expects more of it than Next.js gives: thrown
 * ABOVE a route's loading boundary (a layout, or a page with no loading.tsx) it
 * is a real HTTP 500. Thrown INSIDE one, the shell has already streamed as a 200
 * and the error boundary renders in its place (next/dist/docs, loading.md,
 * "Status Codes"). Either way the reader is told to try again and is never told
 * the thing does not exist.
 */

/**
 * The shape supabase-js hands back from any awaited query builder. Used at a
 * call site as `... .single() as unknown as Read<Row>` when the row type is
 * wider than the select list can infer.
 */
export type Read<T> = PromiseLike<{ data: T | null; error: unknown }>

export class ReadFailed extends Error {
  constructor(label: string, cause: unknown) {
    super(`[${label}] could not read; answering 500 rather than 404`)
    this.name = 'ReadFailed'
    this.cause = cause
  }
}

/**
 * PostgREST's code for `.single()` finding no row (or more than one). It is the
 * ONLY error that means "not there"; every other error means "could not ask".
 * https://postgrest.org/en/stable/references/errors.html (fetched 2026-09-12)
 */
export const NO_ROW_CODE = 'PGRST116'

export function isNoRowError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === NO_ROW_CODE
}

/**
 * Run a read whose empty answer will decide a 404 (or a refusal). Retries a
 * transient fault, answers null only when the database itself said "no row",
 * and throws `ReadFailed` for everything else so the answer is a 500 and never
 * a false 404.
 *
 * The type parameter is the WHOLE response, not the row, and that is deliberate:
 * a PostgREST response is a union (`{ data: Row; error: null } | { data: null;
 * error: PostgrestError }`), and inferring a row type from `data: T | null`
 * through PromiseLike's callback lands on the intersection of the arms, which
 * is `never`. Inferring the response itself and indexing its `data` gives the
 * row back on every call site without a type argument.
 *
 * @param label  names the surface in the log line, e.g. `event-route`
 * @param run    the query, as a thunk so it can be re-run on a transient fault
 */
export async function readOrThrow<R extends { data: unknown; error: unknown }>(
  label: string,
  run: () => PromiseLike<R>,
): Promise<NonNullable<R['data']> | null> {
  const { data, error } = await withBuildRetry(run as () => PromiseLike<{ data: R['data']; error: unknown }>, { label })
  if (error) {
    if (isNoRowError(error)) return null
    console.error(`[${label}] read failed; answering 500 rather than 404:`, error)
    throw new ReadFailed(label, error)
  }
  return (data ?? null) as NonNullable<R['data']> | null
}
