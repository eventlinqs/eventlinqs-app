/**
 * ONE SKIP VOCABULARY FOR A CLAUSE THAT CANNOT ALWAYS SEE.
 *
 * Close-out F1.6. On 8 September 2026 machine-callers-reachable skipped its
 * live-Vercel clause for a different reason, in a different sentence shape, on
 * each of the three machines that ran it:
 *
 *   Vercel        "the live System Bypass check needs a Vercel token"
 *   GitHub CI     "Vercel answered 404 for the System Bypass rules"
 *   this laptop   no skip at all: it read the rules and found none
 *
 * Three shapes for one question is how a guard stops being comparable across the
 * places it runs, and noticing it cost two full log reads. A verdict is now a
 * NAMED CODE from a closed set, rendered in one line that carries the build
 * scope, so the same clause on three machines produces three lines that can be
 * read side by side and diffed.
 *
 * Driven in tests/unit/guards/clause-verdict.test.ts.
 */
import { describeBuildScope } from '../../../src/lib/health/build-scope.mjs'

/**
 * THE CLOSED SET. A verdict outside it is a fault, not a new case: adding one
 * means adding it here, where every reader of the guard can see the whole list.
 *
 *   judged          the thing was read and compared
 *   no-token        no credential on this machine to read it with
 *   no-project-ids  no identifiers naming what to read
 *   http-<status>   the service answered, and refused. Its own error is quoted
 *   network-error   the request never completed
 */
export const VERDICT_CODES = ['judged', 'no-token', 'no-project-ids', 'network-error']

/** `http-404`, `http-403` and so on are generated, so the set stays closed without listing every status. */
export function isVerdictCode(code) {
  return VERDICT_CODES.includes(code) || /^http-[1-5]\d{2}$/.test(code)
}

/**
 * The one comparable line, plus the remedy when it could not judge.
 *
 * @param {object} input
 * @param {string} input.tag        the guard's log tag
 * @param {string} input.clause     what was being judged, in words
 * @param {string} input.code       one of VERDICT_CODES, or http-<status>
 * @param {string} input.detail     never a credential
 * @param {string} input.remedy     one sentence, what would make it real here
 * @param {Record<string, string | undefined>} [input.env]
 * @returns {string[]} the lines to print, in order
 */
export function renderVerdict({ tag, clause, code, detail, remedy, env = process.env }) {
  if (!isVerdictCode(code)) {
    throw new Error(
      `${code} is not a verdict code. The set is closed: ${VERDICT_CODES.join(', ')}, or http-<status>. ` +
        'A new shape of skip is added to scripts/guards/lib/clause-verdict.mjs, not invented at the call site.',
    )
  }
  const scope = describeBuildScope(env).split(';')[0]
  const verdict = code === 'judged' ? 'JUDGED' : 'NOT JUDGED'
  const lines = [`${tag} ${clause}: ${verdict} [${code}] on ${scope} - ${detail}`]
  if (code !== 'judged') {
    lines.push(`${tag}   A guard that cannot see says so rather than passing. To make this real here:`)
    lines.push(`${tag}   ${remedy}`)
  }
  return lines
}
