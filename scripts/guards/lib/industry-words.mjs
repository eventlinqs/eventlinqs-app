/**
 * THE WORDS ONE INDUSTRY USES, AND HOW TO FIND THEM IN AN IDENTIFIER.
 *
 * Shared by the two guards that hold the same line in two places:
 * `ledger-speaks-no-industry` (close-out D1, the slot ledger) and
 * `fillrate-reads-only-the-ledger` (close-out D2, the recovery engine).
 *
 * WHY IT LIVES HERE rather than being exported from the first guard, which is
 * where it started. A guard is a SCRIPT: it runs its checks on import and ends
 * with `process.exit(0)`. Importing one from the other therefore ran the first
 * guard's whole body and exited the process before the second guard had judged a
 * single line, and it did so while printing a confident PASS. That was caught by
 * running the new guard once and reading the output, which is the only reason it
 * is not in the tree as a check that never checked anything.
 *
 * WHOLE WORDS, SPLIT THE WAY IDENTIFIERS ARE WRITTEN. Substring matching fires
 * on the source system's own name, and a plain `\b` boundary misses
 * `ticket_hash` and `eventId`: an underscore is a WORD character, so `\b` does
 * not sit between `ticket` and `_hash`, and in `eventId` the boundary is a case
 * change rather than a separator. Both holes were found by the D1 guard's own
 * drill on its first run.
 */

/** The words close-out D1 names, in both numbers. */
export const BANNED_INDUSTRY_WORDS = new Set(['event', 'events', 'ticket', 'tickets', 'tier', 'tiers'])

/**
 * Every banned word in a piece of text, split the way identifiers are written.
 *
 * `eventlinqs` is removed FIRST. It is the source system's own name, a
 * legitimate VALUE in this schema, and camel-splitting `EventLinqs` would
 * otherwise report the brand as a breach on every line that names it.
 */
export function industryWordsIn(text) {
  return String(text)
    .replace(/eventlinqs/gi, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .map(w => w.toLowerCase())
    .filter(w => BANNED_INDUSTRY_WORDS.has(w))
}
