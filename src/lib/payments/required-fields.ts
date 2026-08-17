/**
 * ONE MECHANISM FOR EVERY GATE BOUNDARY: a decision may not run on a row that is
 * missing the fields the decision reads.
 *
 * FOUNDER RULING, 18 August 2026, after the second outage of this shape in one
 * week: "Every gate on this platform that reads a set of fields must be unable to
 * run on an incomplete set." This is that mechanism, in one place, so the next
 * gate added does not have to reinvent it and cannot get it subtly different.
 *
 * WHY A CAST IS NOT ENOUGH, which is the specific hole this closes. The pattern
 * across the payment layer was
 *
 *     const { data } = await admin.from('organisations').select('a, b, c')
 *     return data as OrgChargeFields
 *
 * A cast is an ASSERTION BY THE AUTHOR, checked by nobody. Narrow that select by
 * one column and the code still compiles, still returns an object, and the
 * missing field arrives `undefined` at a boolean test, where `!undefined` is
 * `true` and `undefined !== true` is also `true`. Both readings refuse, and the
 * refusal is indistinguishable from a real one. That is precisely how a security
 * migration took every paid event off sale on 15 August, and how a select naming
 * a column the database did not have did it again on 18 August.
 *
 * THE RULE, stated once:
 *
 *   ABSENT is not FALSE. A field that is present and null is an answer. A field
 *   that is missing is a programming error, and the two must never produce the
 *   same verdict.
 *
 * IT FAILS LOUDLY WHERE A HUMAN WILL SEE IT and quietly where a buyer would.
 * Outside production it throws, so the mistake is caught in development, in CI
 * and in every test run. In production it returns the incomplete verdict, which
 * every caller maps to a distinct "we could not establish this" reason, because a
 * live platform must not crash a buyer's page over a schema problem and must not
 * lie to them about it either.
 */

export type FieldsVerdict<T> =
  | { complete: true; row: T }
  | { complete: false; missing: string[] }

/**
 * Prove a row carries every named field.
 *
 * PRESENCE IS DECIDED BY THE KEY, NOT THE VALUE (`key in row`). Testing the value
 * would collapse "the column is null" into "the column is missing", which is the
 * exact conflation this exists to prevent.
 */
export function verifyRowFields<T>(
  row: unknown,
  keys: readonly string[],
  context: string,
): FieldsVerdict<T> {
  if (row === null || typeof row !== 'object') {
    return { complete: false, missing: keys.slice() }
  }
  const present = row as Record<string, unknown>
  const missing = keys.filter((key) => !(key in present))
  if (missing.length === 0) return { complete: true, row: row as T }

  const message =
    `[${context}] row is missing ${missing.join(', ')}. A field a gate READS must be ` +
    `SELECTED by the query that feeds it. Absent is not false: a missing field is a ` +
    `programming error, not a verdict about the organiser.`

  // Loud in development, in CI and in tests. Quiet, typed and logged in
  // production. Never silently folded into a refusal.
  if (process.env.NODE_ENV !== 'production') throw new Error(message)
  console.error(message)
  return { complete: false, missing }
}
