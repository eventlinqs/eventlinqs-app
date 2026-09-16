import type { createClient } from './client'
import { reportClientError } from '@/lib/observability/client-error-report'

/**
 * THE SUPABASE BROWSER CLIENT, FETCHED WHEN IT IS NEEDED RATHER THAN ON SIGHT.
 *
 * ============================================================================
 * WHAT IT COSTS, MEASURED, AND ON WHICH PAGES
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD, C8B.3: work the cost table down one item at a
 * time, state the expected saving, make the change, re-measure the same route,
 * and revert anything that does not improve the number.
 *
 * `scripts/perf/first-load-budget.mjs` against the build of 15 September 2026
 * found the four heaviest PUBLIC routes on the platform, and they were not the
 * pages anybody had been looking at:
 *
 *     /signup               228.9 KB gzip first-load JS
 *     /login                228.2 KB
 *     /auth/reset-password  226.8 KB
 *     /scan/[eventId]       225.2 KB       the door, on a phone, at the venue
 *
 * against Scope v5 section 10.3's 200 KB. The event page, the one the whole
 * performance effort has been aimed at, is 200.4 KB. Those four are the first
 * page a new organiser and a new buyer ever load, and they were 28 KB heavier
 * than it.
 *
 * One chunk explains it: 51.4 KB gzip of `@supabase/ssr` and the Node Buffer
 * polyfill it drags, pulled in by a STATIC import of `./client` in four client
 * components. It appears in no other route's first load.
 *
 * ============================================================================
 * WHY A DYNAMIC IMPORT IS HONEST HERE AND NOT A TRICK
 * ============================================================================
 *
 * Moving bytes from "first load" to "fetched a moment later" can be a metric
 * moved rather than a cost removed, and C8B.6 forbids reporting the second as
 * the first. So, per surface, plainly:
 *
 *   /login, /signup    A WEIGHT saving. The client is needed only when someone
 *                      submits or presses Continue with Google. A visitor who
 *                      opens the page and leaves, or who is already signed in
 *                      and bounces, never fetches those 51.4 KB at all.
 *
 *   /scan/[eventId]    A WEIGHT saving, and the biggest one. The door scanner's
 *                      actual job (match a ticket against the set already
 *                      downloaded to the phone) needs no network and no client.
 *                      The client is only for the live channel that shows the
 *                      other doors, which is skipped entirely when the phone is
 *                      offline. At a venue with no signal, which is the case
 *                      Scope 10.3 is written about, it is never fetched.
 *
 *   /auth/reset-password   A SEQUENCING saving, not a weight one, and it is
 *                      recorded as such. That page reads the session on mount,
 *                      so the client is fetched a moment after hydration either
 *                      way. What changes is that it is no longer parsed and
 *                      evaluated before the page can paint its own "Validating
 *                      your reset link" state.
 *
 * ============================================================================
 * THE LATENCY THIS COULD HAVE ADDED, AND WHERE IT WAS PUT INSTEAD
 * ============================================================================
 *
 * A naive deferral puts a 51.4 KB fetch between "press Sign in" and anything
 * happening, which is the worst possible moment to add a wait. So the import is
 * WARMED on the visitor's first interaction with the form, the same mechanism
 * H3 used for the error-reporting SDK on 8 September: by the time anybody has
 * typed an email address the client is already in memory, and `loadSupabase`
 * resolves from the cache.
 *
 * ============================================================================
 * A REJECTED PROMISE IS NOT CACHED, AND THAT IS NOT A DETAIL
 * ============================================================================
 *
 * Caching the promise is what makes this a singleton, and the module it loads
 * is itself a singleton (two browser clients compete for the same localStorage
 * auth-token lock). But caching a REJECTED promise would make one dropped chunk
 * request permanent: a warm that failed on a flaky connection would be replayed
 * at submit, and every retry after it, so the form could never recover and the
 * person would be told their sign-in failed for ever. The rejection clears the
 * cache so the next call refetches.
 */

type BrowserClient = ReturnType<typeof createClient>

let pending: Promise<BrowserClient> | undefined

/**
 * The browser client, fetching the chunk on first call and reusing it after.
 *
 * Await this inside the handler that needs it. Never at module scope and never
 * in a component body: both would defeat the point by running during render.
 */
export function loadSupabaseClient(): Promise<BrowserClient> {
  if (!pending) {
    const attempt = import('./client').then((module) => module.createClient())
    attempt.catch((cause: unknown) => {
      if (pending === attempt) pending = undefined
      reportClientError(cause, { where: 'loadSupabaseClient', detail: 'the auth client chunk could not be fetched' })
    })
    pending = attempt
  }
  return pending
}

/**
 * Start fetching the client without waiting for it.
 *
 * Call this on the first sign that the person is about to need it: a focus, a
 * keystroke in the email field, a pointer entering the Google button. A failure
 * here is not shown to them, because the same import is awaited again at submit
 * where a failure IS surfaced; `loadSupabaseClient` has already reported it.
 */
export function warmSupabaseClient(): void {
  void loadSupabaseClient().catch(() => {
    // Reported inside loadSupabaseClient. This arm exists only so a warm that
    // nobody awaited cannot surface as an unhandled rejection in the console.
  })
}
