/**
 * WHAT THIS PAGE IS DOING, IN ONE SENTENCE, TIED TO WHAT IT ACTUALLY DID.
 *
 * Close-out FT1 point 4, and it is the clause the whole tool stands or falls
 * on: "One sentence, always visible and never in small print, naming the method
 * in the owner's terms ... and a test proves the page cannot show a measured
 * claim while the data behind it is arithmetic."
 *
 * THE SENTENCE AND THE METHOD ARE ONE VALUE. They are not a string and a
 * separate flag that somebody has to remember to change together: the sentence
 * is looked up FROM the method the calculation actually used, so a page that
 * ran arithmetic cannot print the measured sentence. There is nowhere to type
 * the wrong one.
 *
 * WHEN THE SECOND METHOD ARRIVES. The moment the slot ledger (D1) holds real
 * sell-through for comparable events, `measured` becomes reachable, and the
 * function that computes a measured result is the only thing allowed to return
 * it. Until then `MEASURED_IS_REACHABLE` is false and the guard and the test
 * both hold it there, so nobody can ship the better-sounding sentence ahead of
 * the data that would make it true.
 */

export type ForecastMethod = 'arithmetic' | 'measured'

/**
 * Is there enough real sell-through on this platform to say "measured"?
 *
 * FALSE, today, and it is one named constant rather than a condition scattered
 * through the page, so switching it on is a deliberate act with a test in front
 * of it. Production holds two published events; there is nothing to measure.
 */
export const MEASURED_IS_REACHABLE = false

/**
 * The sentence, per method, in the owner's own terms.
 *
 * The arithmetic one says three things and no more: what it is, what it is not,
 * and what it becomes. That last clause is the honest part, because it tells an
 * organiser the number will get better rather than implying it is already good.
 */
export const METHOD_SENTENCE: Record<ForecastMethod, string> = {
  arithmetic:
    'Today this is arithmetic from what you told us, not a prediction. It becomes a measurement as soon as we have sold tickets for events like yours.',
  measured:
    'This is measured from what events like yours have actually sold on EventLinqs, not a guess. The events it is measured from are named below.',
}

/**
 * The one sentence a page may print, chosen by the method that produced its
 * numbers.
 *
 * It REFUSES the measured sentence while measured is out of reach, rather than
 * trusting the caller, because the caller is the thing most likely to be wrong:
 * a page reaching for the better sentence is exactly the failure the clause is
 * written against. The refusal returns the arithmetic sentence rather than
 * throwing, because a marketing page that 500s over its own wording helps
 * nobody, and the wrong-but-modest sentence is the safe direction.
 */
export function methodSentence(method: ForecastMethod): string {
  if (method === 'measured' && !MEASURED_IS_REACHABLE) return METHOD_SENTENCE.arithmetic
  return METHOD_SENTENCE[method]
}

/**
 * WHICH METHOD A RESULT WAS PRODUCED BY, asked of the result rather than
 * declared beside it.
 *
 * `forecast()` in `arithmetic.ts` does arithmetic and nothing else, so anything
 * it returns is `arithmetic`. When a measured path exists it will be a separate
 * function returning its own method, and this will read it from the result.
 * Written as a function now so the page never carries the literal.
 */
export function methodOf(_result: { unanswerable: boolean }): ForecastMethod {
  return 'arithmetic'
}
