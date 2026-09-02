import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * WRITE A HUMAN-READABLE PROOF ARTEFACT, ONLY WHEN EXPLICITLY ASKED.
 *
 * WHY THIS EXISTS, 3 September 2026. Several unit tests wrote their output into
 * TRACKED files under docs/ on every run: poster hashes, a parity report, a
 * visual-set index, and an organiser copy review. The intent is good and worth
 * keeping, and one of those tests says so in its own header, that the current
 * output should always be sitting there so a person can LOOK rather than argue
 * about a number.
 *
 * The cost was that `npm test` left four tracked files modified every single
 * time, with no change of content, purely because Node writes LF and
 * `core.autocrlf` had checked them out as CRLF. A permanently dirty tree trains
 * everyone to ignore `git status`, and that is precisely how an unintended
 * change eventually rides along inside somebody else's commit.
 *
 * THE RULE NOW: a test run never writes into the repository unless a human asks
 * for it.
 *
 *   npm test                              asserts everything, writes nothing
 *   WRITE_PROOF_ARTEFACTS=1 npm test      also refreshes the artefacts
 *
 * WHAT IS NOT LOST. Every assertion still runs on every run. None of these
 * tests reads its own artefact back as a baseline, so gating the write cannot
 * weaken a check: verified by inspection on all four call sites before this was
 * introduced. The artefact is a report, not an oracle.
 *
 * Companion fix: .gitattributes pins these paths to eol=lf, so that when they
 * ARE regenerated the bytes match what is checked out and the tree stays clean.
 */
export const WRITE_ARTEFACTS = process.env.WRITE_PROOF_ARTEFACTS === '1'

/**
 * Write a proof artefact if, and only if, WRITE_PROOF_ARTEFACTS=1.
 * Creates the parent directory. Returns whether it wrote.
 */
export function writeProofArtefact(path: string, contents: string | Uint8Array): boolean {
  if (!WRITE_ARTEFACTS) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
  return true
}
