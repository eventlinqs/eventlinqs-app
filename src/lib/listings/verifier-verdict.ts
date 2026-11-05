/**
 * THE ENGINE VERIFIER'S VERDICT, ONE RULE (scripts/verify/engine-verifier.mts; the CONTROLLER's 16:20 of 5 November 2026:
 * NOT JUDGED is resolved, or marked unverifiable with its reason). Pure.
 *   PASS          the source states the night's start and the live page agrees with the stored row
 *   FAIL          the source states another time, or the live page disagrees with the stored row
 *   UNVERIFIABLE  no permitted read can judge the night this run, for a named reason, listed for a person's re-check
 *   NOT JUDGED    anything else, a fact for a person (an error code: the page may have moved or gone)
 */
export const NO_ANSWER = 'the page answered nothing'
export const PDF_SOURCE = 'the source is a PDF, which the verifier does not read'
export const OUTSIDE_TERM = 'the page states this weekly session, but no term it states covers this night'

/**
 * Every reason no permitted read can judge the night. A page that gave no answer (a timeout, a refused connection) is
 * unverifiable THIS run: the deployed run of 6 November 01:39 read Boost Mobile AUSX Open Geelong so from GitHub's runner.
 */
export const UNVERIFIABLE_REASONS: readonly string[] = [
  'no source page on record',
  'robots.txt disallows a re-read',
  'the page does not state this night',
  'the page states a date with no time',
  'the page states the date in words but not this time',
  PDF_SOURCE,
  OUTSIDE_TERM,
  NO_ANSWER,
]

export type Verdict = 'PASS' | 'FAIL' | 'NOT JUDGED' | 'UNVERIFIABLE'

export function verifierVerdict(r: { sourceOk: boolean | null; liveOk: boolean; source: string }): Verdict {
  if (r.sourceOk === false || !r.liveOk) return 'FAIL'
  if (r.sourceOk === true) return 'PASS'
  return UNVERIFIABLE_REASONS.includes(r.source) ? 'UNVERIFIABLE' : 'NOT JUDGED'
}
