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

/** The verifier's 'why' for a night its own source states at another time: the only failure that switches a source off. */
export const SOURCE_DISAGREES = 'the source states another time'

const hostOf = (u: string): string | null => {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * THE SWITCH, ONE RULE (LAW 19 sections 4.3 and 7.2: 'that source's publication flag switches off'). Every source still
 * read automatically ('read') whose host is the host of a night the check found wrong against its own page; a night that
 * fails only on the live page (the site, not the source) switches nothing off. Returns their ids in the order given. Pure.
 */
export function sourcesToSwitchOff(
  results: readonly { verdict: string; why: string; sourceUrl: string }[],
  sources: readonly { id: string; page_url: string; collection: string }[],
): string[] {
  const failing = new Set(results.filter((r) => r.verdict === 'FAIL' && r.why === SOURCE_DISAGREES && r.sourceUrl).map((r) => hostOf(r.sourceUrl)).filter((h): h is string => h !== null))
  return sources.filter((s) => s.collection === 'read' && failing.has(hostOf(s.page_url) ?? '')).map((s) => s.id)
}

export function verifierVerdict(r: { sourceOk: boolean | null; liveOk: boolean; source: string }): Verdict {
  if (r.sourceOk === false || !r.liveOk) return 'FAIL'
  if (r.sourceOk === true) return 'PASS'
  return UNVERIFIABLE_REASONS.includes(r.source) ? 'UNVERIFIABLE' : 'NOT JUDGED'
}
