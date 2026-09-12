/**
 * EVERY SUPABASE REQUEST CARRIES ITS OWN SIGNAL, SO A RETRY IS A REAL REQUEST.
 *
 * Found on 12 September 2026 by driving the read-failure fix rather than
 * believing it. The blink proof (scripts/verify/read-failure-blink-proof.mjs)
 * dropped ONE socket under the events layout's existence read and expected the
 * retry in `withBuildRetry` to ask again. The server log duly said "transient
 * pool error after 3 retries", and the network saw exactly one request. The
 * three retries never left the process.
 *
 * WHY. Next.js wraps `fetch` for the duration of a render with a request
 * deduplicator (node_modules/next/dist/server/lib/dedupe-fetch.js, after
 * React's ReactFetch): a GET with the same URL and headers as one already made
 * in this render gets the SAME promise back, a rejected promise included. A
 * retry inside a render is, by construction, the same URL with the same headers,
 * so it was handed the original failure three times over, on a 250, 500 and
 * 1000 millisecond schedule, and then threw. Every render-time use of the retry
 * primitive since it was written (the discovery routes, the organiser profile,
 * the squad page) has been a no-op against a transient fault for the same
 * reason. A guard that was drilled green and a primitive that was unit tested
 * green both walked past this, because neither ran inside a Next render.
 *
 * THE OPT-OUT IS DOCUMENTED IN THAT FILE: "If we're passed a signal, then we
 * assume that someone else controls the lifetime of this object and opts out
 * of caching. It's effectively the opt-out mechanism." So every Supabase
 * request made through this platform's clients carries a signal. When the
 * caller supplied none, it is a timeout, which is a second thing a database
 * read should have had all along: a read that hangs is not a read that is
 * still coming.
 *
 * WHAT IS GIVEN UP. Two identical Supabase reads in one render are no longer
 * collapsed into one network request. The blink proof's baseline log shows the
 * event page's own metadata and render reads already reaching the network
 * separately, so on the surfaces measured nothing was being collapsed; where
 * something was, the cost is one duplicate read against a live pool, and the
 * benefit is that a retry retries.
 *
 * Wired into createPublicClient, createAdminClient and the server client, which
 * are the three doors to the database from the application. The proxy builds
 * its own client for the queue gate and is not a render, so the deduplicator
 * does not apply to it.
 */

/** Long enough for any read this platform makes on purpose, short enough that a hung socket is an error rather than a wait. */
export const SUPABASE_REQUEST_TIMEOUT_MS = 30_000

export function undedupedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal ?? AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS)
  // `fetch` is resolved at call time on purpose: whatever the framework has
  // installed on the global (the deduplicator in a render, the plain runtime
  // fetch elsewhere) is what runs, and the signal is what tells it to pass this
  // request through.
  return fetch(input, { ...init, signal })
}
