/**
 * A COUNT THAT FAILED IS NOT A COUNT OF ZERO.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, measured on TEST on 20 September 2026.
 *
 * `.select('id', { count: 'exact', head: true })` returns `{ count, error }`,
 * and the habit everywhere it was used was `count ?? 0`. That coalesce collapses
 * three different facts into one number:
 *
 *   the count is 0        nobody has done this yet
 *   `error` is set        the database could not be reached
 *   `count` is null       the count was never asked for, a caller's mistake
 *
 * On the founder's demand-signal screen the second one rendered as "0 events
 * published, 0 posters downloaded, 0 tracked link clicks" under a header that
 * says in its own words that all figures are live counts. The worst of them was
 * derived by subtraction: `spotsRemaining = CAP - (taken ?? 0)`, so a failed
 * read did not show a missing number, it showed all fifty founding spots free.
 * That is the one wrong answer on that screen that causes an action.
 *
 * So every count on a screen a decision is made from goes through here. It
 * throws, in the same shape as `readEveryRow`, and for the same reason: a
 * partial answer that looks whole is worse than no answer at all.
 *
 * Held by `scripts/guards/the-founder-screens-read-every-row.mjs`, which fails
 * the build when a founder screen coalesces a count instead of calling this.
 */

export interface CountResult {
  count: number | null
  error: { message: string } | null
}

/**
 * @param what named in the error, so a failure says which figure gave up
 */
export function countOrRaise(what: string, result: CountResult): number {
  if (result.error) {
    throw new Error(`the count of ${what} could not be read: ${result.error.message}`)
  }
  if (result.count === null) {
    throw new Error(`the count of ${what} came back null with no error; it was not asked for`)
  }
  return result.count
}
