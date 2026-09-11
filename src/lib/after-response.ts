import { after } from 'next/server'
import { captureException } from '@/lib/observability/sentry'

/**
 * RUN THIS AFTER THE PERSON HAS THEIR ANSWER.
 *
 * WHY IT EXISTS, measured rather than assumed (close-out D1's reversal
 * condition, 10 September 2026):
 *
 *     "Measure checkout latency at the 95th percentile before and after. If the
 *      ledger write adds more than 50ms, move it off the request path to a
 *      queue. Never drop fields to make it cheaper."
 *
 * It was measured, on this tree's production build, by driving the same
 * endpoint forty times with the ledger write and forty times without it,
 * interleaved so any drift landed on both arms:
 *
 *     with the write     p50 459.7ms   p95 585.3ms
 *     without it         p50 275.9ms   p95 340.3ms
 *     the write adds     p50 183.8ms   p95 245.0ms
 *
 * 245ms against a 50ms threshold. Comfortably OVER, and not marginal enough to
 * argue about: even measured in-region it is a database round trip a buyer is
 * waiting on for a row that is history about their purchase rather than part of
 * it.
 *
 * WHY THIS AND NOT A QUEUE. The close-out says "move it off the request path to
 * a queue"; a queue is one way to do that and it is the expensive way. Next
 * ships the cheap one: `after` runs a callback once the response is finished,
 * and its own reference names this exact use ("tasks and other side effects
 * that should not block the response, such as logging and analytics"). No
 * infrastructure, no delivery semantics to get wrong, no second place for a row
 * to get stuck, and NOT ONE FIELD DROPPED, which the close-out forbids in the
 * same sentence. This repository already uses `after` once, in
 * `src/app/actions/gigs.ts`, so it is not a new idiom here either.
 *
 * WHY IT DEGRADES INSTEAD OF THROWING. `after` requires a request scope, and
 * the same recorders are reached from crons, from the backfill script and from
 * the suite, where there is none. Outside a request the work is simply AWAITED,
 * which is correct there: nobody is waiting on that response because there is
 * no response.
 *
 * WHY IT NEVER REJECTS. Every caller is on somebody's money. The work is
 * already guarded inside the ledger adapter, and this is the second belt: a
 * deferred task that threw after the response was sent would become an
 * unhandled rejection, which on a serverless runtime can take the invocation
 * down with it and would turn an analytics row into a failed request.
 */
export function afterResponse(what: string, work: () => Promise<unknown>): Promise<void> {
  const guarded = async () => {
    try {
      await work()
    } catch (error) {
      captureException(error, { where: `afterResponse:${what}` })
      console.error(`[after-response] ${what} failed after the response was sent:`, error)
    }
  }
  try {
    after(guarded)
    return Promise.resolve()
  } catch (error) {
    /*
     * No request scope: a cron, a script, or the suite. Do the work NOW, and
     * RETURN it rather than dropping it on the floor, so a caller that genuinely
     * needs it finished can await. A fire-and-forget fallback here would be a
     * silent behaviour change for exactly the callers who have no response to
     * wait for, which is the opposite of what this function is for.
     */
    console.warn(
      `[after-response] ${what} ran inline (no request scope): ${error instanceof Error ? error.message : String(error)}`,
    )
    return guarded()
  }
}
