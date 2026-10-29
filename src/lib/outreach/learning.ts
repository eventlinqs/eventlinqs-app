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
 * ALPHA itself is a CHOICE, not a fact: 0.05 one-sided, CONFIRMED by the project manager's ruling of 29 October 2026,
 * 21:01 (with at least 31 sent per half, np >= 5 on both halves, judged once after 14 days, verified claims only);
 * Lawal may change it later, here, and the judgement row records the value it was judged with.
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

/**
 * The claim window, a CHOICE, not a fact: a test is judged 14 days after its last first message went, so the cadence's
 * own day 10 close has gone out and a few days more are left for the organiser to claim. Confirmed by the project
 * manager's ruling of 29 October 2026, 21:01.
 */
export const CLAIM_WINDOW_DAYS = 14

export type JudgedOutcome = Judgement['outcome']
export type PlayTerms = { readonly step1TemplateId: string; readonly variantTemplateId: string | null; readonly testPerHalf: number | null }

/**
 * The text a first message takes and the half it counts in. While the test is open, the contact's own half and that
 * half's text; once a half has its size, or once the play is judged, the current text (or the winner) outside the test.
 */
export function firstMessageChoice(play: PlayTerms, judged: JudgedOutcome | null, half: Half, alreadyInHalf: number): { templateId: string; half: Half | null } {
  if (!play.variantTemplateId || play.testPerHalf === null) return { templateId: play.step1TemplateId, half: null }
  if (judged === 'variant_wins') return { templateId: play.variantTemplateId, half: null }
  if (judged !== null) return { templateId: play.step1TemplateId, half: null }
  if (alreadyInHalf >= play.testPerHalf) return { templateId: play.step1TemplateId, half: null }
  return { templateId: half === 'b' ? play.variantTemplateId : play.step1TemplateId, half }
}

/** Whether a play's test is judged now: both halves have sent their size and the claim window has passed. */
export function readyToJudge(t: { sentA: number; sentB: number; testPerHalf: number; lastSentAt: Date; now: Date }): boolean {
  if (t.sentA < t.testPerHalf || t.sentB < t.testPerHalf) return false
  return t.now.getTime() - t.lastSentAt.getTime() >= CLAIM_WINDOW_DAYS * 86_400_000
}

/** Each half's messages sent and how many of their organisers claimed after the message. */
export function armsOf(rows: readonly { half: Half; claimedAfter: boolean }[]): { a: Arm; b: Arm } {
  const tally = { a: { sent: 0, claims: 0 }, b: { sent: 0, claims: 0 } }
  for (const r of rows) {
    tally[r.half].sent++
    if (r.claimedAfter) tally[r.half].claims++
  }
  return tally
}
