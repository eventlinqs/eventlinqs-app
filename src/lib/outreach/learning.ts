/**
 * THE LEARNING LOOP: ONE CHANGE, EQUAL HALVES, JUDGED ON CLAIMS (window 6, 29 October 2026; the engine plan's FULL
 * AUTOMATION: "each play tests one change at a time (subject, true line, question) against the current template on
 * equal random halves; a variant replaces the template only on a measured rise in claims (not opens), recorded with the
 * numbers").
 *
 * The test is a one-sided comparison of two proportions, each number from its source, fetched on 29 October 2026:
 *   - the statistic, NIST/SEMATECH e-Handbook of Statistical Methods, 7.3.3
 *     (https://www.itl.nist.gov/div898/handbook/prc/section3/prc33.htm): the pooled
 *     z = (p1 - p2) / sqrt(p(1 - p)(1/n1 + 1/n2)), p = (x1 + x2)/(n1 + n2), compared with z(1 - alpha);
 *   - when it may be used, 7.2.4 (https://www.itl.nist.gov/div898/handbook/prc/section2/prc24.htm):
 *     "min{N p0, N(1-p0)} >= 5" and "valid for large N, (N > 30)";
 *   - the critical value, 1.3.6.7.1 (https://www.itl.nist.gov/div898/handbook/eda/section3/eda3671.htm): 1.645 at
 *     p = 0.950.
 * ALPHA itself is a CHOICE, not a fact: 0.05, named here for the project manager or Lawal to confirm or change.
 *
 * A test is judged ONCE, when both halves have reached the size the play declared at approval and the claim window has
 * passed: judging it every run would be looking again and again at a test made for one look, which raises the chance of
 * a false win above alpha. Until then the answer is 'not enough yet', never a winner.
 */

export const ALPHA = 0.05
export const Z_CRITICAL = 1.645
export const MIN_SENT_PER_HALF_EXCLUSIVE = 30
export const MIN_EXPECTED = 5

export type Half = 'a' | 'b'
export type Arm = { readonly sent: number; readonly claims: number }
export type Judgement = { readonly outcome: 'variant_wins' | 'keep' | 'not_enough'; readonly z: number | null; readonly why: string }

/** Whether the variant (b) beats the current template (a) on claims, by the rule above. */
export function judgeVariant(a: Arm, b: Arm): Judgement {
  if (a.sent <= MIN_SENT_PER_HALF_EXCLUSIVE || b.sent <= MIN_SENT_PER_HALF_EXCLUSIVE) {
    return { outcome: 'not_enough', z: null, why: `each half needs more than ${MIN_SENT_PER_HALF_EXCLUSIVE} messages sent (a ${a.sent}, b ${b.sent})` }
  }
  const pooled = (a.claims + b.claims) / (a.sent + b.sent)
  for (const [name, arm] of [['a', a], ['b', b]] as const) {
    const fewest = Math.min(arm.sent * pooled, arm.sent * (1 - pooled))
    if (fewest < MIN_EXPECTED) {
      return { outcome: 'not_enough', z: null, why: `half ${name} expects ${fewest.toFixed(1)} claims or non-claims; the test needs at least ${MIN_EXPECTED} of each` }
    }
  }
  const z = (b.claims / b.sent - a.claims / a.sent) / Math.sqrt(pooled * (1 - pooled) * (1 / a.sent + 1 / b.sent))
  if (z > Z_CRITICAL) return { outcome: 'variant_wins', z, why: `z ${z.toFixed(3)} > ${Z_CRITICAL} (one-sided, alpha ${ALPHA})` }
  return { outcome: 'keep', z, why: `z ${z.toFixed(3)} is not above ${Z_CRITICAL} (one-sided, alpha ${ALPHA})` }
}

/** The half a contact falls in: a stable 32-bit FNV-1a hash of its id, so the same contact always lands the same way. */
export function halfOf(contactId: string): Half {
  let h = 0x811c9dc5
  for (let i = 0; i < contactId.length; i++) {
    h ^= contactId.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h >>> 16) & 1 ? 'b' : 'a'
}
