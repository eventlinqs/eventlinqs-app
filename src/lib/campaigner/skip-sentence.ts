import { SKIP_SENTENCE, type SkipReason } from './pacing'
import { RENDER_FAILURE_SENTENCE, type RenderFailure } from './render'

/**
 * EVERY REASON A PERSON WAS NOT SENT TO, IN WORDS A PERSON CAN READ.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO CLOSE, found on 19 September 2026 by the RED half
 * of scripts/verify/lb-readfail-drive.mjs.
 *
 * `/admin/campaigns` renders one line per skip reason with its count, and
 * `src/lib/campaigner/read.ts` resolved that line as
 *
 *     SKIP_SENTENCE[reason] ?? reason
 *
 * `SKIP_SENTENCE` holds the FIVE pacing reasons and nothing else. The four
 * render failures are not in it, so a campaign that refused seventy people for
 * a missing unsubscribe link printed, to a human being, on a shipped admin
 * surface:
 *
 *     unsubscribe_link_missing                    70
 *
 * The sentence for that code was already written, in RENDER_FAILURE_SENTENCE,
 * and nothing read it. A raw snake_case identifier on a shipped surface is a
 * Law 1 defect on its own; it also meant the drive written to catch a false
 * statement on that screen could not see one, because the string it asserted
 * was never rendered.
 *
 * ---------------------------------------------------------------------------
 * THE THIRD KIND OF REASON, and why the fallback is not `?? reason`.
 *
 * `run.ts` also records reasons that are ALREADY SENTENCES, written at the call
 * site: "the consent door refused this message", "the step names a template
 * that does not exist". Those must pass through untouched.
 *
 * So the two are told apart by SHAPE rather than by a list somebody maintains:
 * a reason that is a bare lower-case identifier is a CODE, and a code with no
 * sentence is a gap in this module rather than something to print. It is
 * rendered as a stated gap, naming the code, so it can never look like an
 * explanation. `tests/unit/growth/campaigner-skip-sentences.test.ts` asserts
 * that every code in both tables has one, so the gap path is unreachable for
 * anything that exists today.
 */

/** A reason that is a bare identifier rather than a sentence somebody wrote. */
export function looksLikeACode(reason: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(reason)
}

export function campaignSkipSentence(reason: string): string {
  const pacing = SKIP_SENTENCE[reason as SkipReason]
  if (pacing) return pacing

  const render = RENDER_FAILURE_SENTENCE[reason as RenderFailure]
  if (render) return render

  if (looksLikeACode(reason)) {
    return `These messages were skipped and the reason recorded, "${reason}", has no explanation written for it yet.`
  }

  // Already a sentence, written at the call site in run.ts.
  return reason
}
