/**
 * HOW MUCH OF A CITY'S AUDIENCE ONE DIGEST INVOCATION MAY WRITE TO, AND WHAT
 * IT STILL OWES WHEN IT STOPS.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO END. The weekly digest cron sent
 * `recipients.slice(0, MAX_RECIPIENTS_PER_RUN)` and then wrote the period's
 * `digest_sends` row. The unique (city_slug, period_start) key is the cron's
 * idempotence, so the next invocation read that row and answered
 * `skipped: 'already_sent_this_period'`. The cron fires once a week
 * (`0 22 * * 3`, vercel.json), so for a city with nine hundred lawful
 * recipients the four hundred past the cap did not receive that week's email
 * LATER. They never received it, and `recipient_count: 500` was recorded with
 * nothing beside it to read the 500 against.
 *
 * A BOUND IS NOT SAFETY. Every scanner this repository owns judged that slice
 * as bounded, correctly, and bounded is exactly what it was. The lesson is the
 * one the seating screens taught on 20 September: a read or a write that CAN
 * come back short is dangerous whether or not somebody wrote the short down.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CAP IS KEPT. The cron walks every city in ONE function invocation and
 * sends sequentially, so an unbounded run is a timeout, and a timeout half way
 * through a city is a period with no `digest_sends` row at all, which the next
 * fire treats as untouched and starts again from the top. The cap is protecting
 * something real. What was wrong was that stopping was silent and permanent.
 *
 * ---------------------------------------------------------------------------
 * WHY AN OFFSET IS A SAFE WAY TO RESUME, STATED WITH ITS FAILURE DIRECTION
 * RATHER THAN CLAIMED TO HAVE NONE.
 *
 * Resuming at a COUNT is only correct while the audience keeps a stable order
 * across invocations. `fetchDigestRecipients` orders both sources oldest first
 * (`granted_at, id` and `created_at, id`), and `mergeDigestAudience` preserves
 * input order, so a row created between two invocations sorts at the END and
 * shifts nobody already written to.
 *
 * What can still move is a row LEAVING: somebody unsubscribes mid-week, the
 * list shortens ahead of the offset, and one person at the boundary is stepped
 * over. That costs a missed email. The opposite direction, a duplicate, needs a
 * row to appear BEFORE the offset, which needs a backdated `granted_at`. So the
 * failure this design can produce is somebody not hearing from us, never
 * somebody hearing from us twice, and that is the direction to fail in.
 *
 * Recording WHO was written to rather than HOW MANY would remove even that, at
 * the price of a row per recipient per week. It is not worth it yet, and this
 * paragraph is here so the trade is visible to whoever decides it is.
 */

/**
 * Recipients one invocation may write to. Kept here rather than in the route so
 * the number the tests converge against and the number that ships are the same
 * one.
 */
export const DIGEST_MAX_RECIPIENTS_PER_RUN = 500

export interface DigestRunPlan<T> {
  /** The window this invocation writes to, in audience order. */
  toSend: T[]
  /** How many of the audience are still owed an email after this window. */
  remaining: number
  /** True when this window finishes the city's period. */
  complete: boolean
  /** The lawful audience this period resolved to. */
  audience: number
  /** The resume point, clamped to the audience that actually exists. */
  alreadySent: number
}

/**
 * @param audience     the lawful recipients, in a stable order
 * @param alreadySent  `digest_sends.recipient_count` for this city and period
 * @param cap          recipients this invocation may write to
 */
export function planDigestRun<T>(input: {
  audience: T[]
  alreadySent: number
  cap: number
}): DigestRunPlan<T> {
  const { audience, alreadySent, cap } = input

  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error(
      `planDigestRun: cap must be a positive integer, got ${cap}. A run that may write to nobody never completes, so the period would be retried for ever.`,
    )
  }
  if (!Number.isInteger(alreadySent) || alreadySent < 0) {
    throw new Error(
      `planDigestRun: alreadySent must be a whole number of recipients, got ${alreadySent}. It is read from digest_sends.recipient_count and a wrong value silently skips real people.`,
    )
  }

  /*
   * THE AUDIENCE MAY HAVE SHRUNK SINCE THE LAST INVOCATION, because somebody
   * unsubscribed. Clamping here rather than trusting the stored count is what
   * stops a shorter list being read as "start again from the top", which would
   * mail the whole city a second time.
   */
  const start = Math.min(alreadySent, audience.length)
  const toSend = audience.slice(start, start + cap)
  const remaining = audience.length - start - toSend.length

  return {
    toSend,
    remaining,
    complete: remaining === 0,
    audience: audience.length,
    alreadySent: start,
  }
}
