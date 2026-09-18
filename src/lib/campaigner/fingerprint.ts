import { createHash } from 'node:crypto'

/**
 * THE SEGMENT FINGERPRINT: WHAT AN APPROVAL IS AN APPROVAL OF.
 *
 * A person approving a campaign is approving a SEGMENT and a MESSAGE, not a
 * campaign name. So the approval is keyed by a hash of the things that would
 * make it a different decision: which match run produced the list, which
 * channel it goes out on, and how many people are on it.
 *
 * WHY THOSE THREE AND NOTHING ELSE.
 *
 *   THE MATCH RUN because a different run is a different set of people, even
 *   when the count happens to match. GA2 stores a run per press, so this is the
 *   sharpest available identifier of "who".
 *   THE CHANNEL because approving an email to 340 people is not approving an
 *   SMS to the same 340.
 *   THE SIZE because a list that grew between the approval and the send is not
 *   the list that was approved, and the count is the cheapest thing that
 *   notices.
 *
 * WHAT IS DELIBERATELY NOT IN IT: the campaign name, the event title, the
 * opening line. Changing the WORDS is a real change and it is caught by the
 * approved sample stored beside the fingerprint, which an approver reads. Baking
 * the words into the fingerprint would force a fresh approval for a typo fix on
 * a segment nobody touched, and a gate that fires on everything is a gate
 * somebody routes around.
 *
 * PURE, so the value a test computes is the value the database stores.
 */
export function segmentFingerprint(input: {
  matchRunId: string
  channelCode: string
  allowlistSize: number
}): string {
  if (!input.matchRunId || !input.channelCode) {
    throw new Error('a segment fingerprint needs a match run and a channel')
  }
  if (!Number.isInteger(input.allowlistSize) || input.allowlistSize < 0) {
    throw new Error(`a segment fingerprint needs a whole allowlist size, got ${input.allowlistSize}`)
  }
  /*
   * Separated by a pipe, which cannot appear in any of the three: a uuid is hex
   * and hyphens, a channel code is lowercase letters, digits and underscores by
   * its own CHECK constraint, and a size is digits. Without a separator
   * ("ab", "c") and ("a", "bc") would hash to the same value, which is a
   * different segment approved by one approval.
   *
   * It is a PIPE rather than a null byte, and that is not cosmetic: the first
   * version of this line carried a literal control character, written by a
   * shell that ate the backslash, and no-control-characters caught it.
   */
  const material = [input.matchRunId, input.channelCode, String(input.allowlistSize)].join('|')
  return createHash('sha256').update(material).digest('hex')
}
