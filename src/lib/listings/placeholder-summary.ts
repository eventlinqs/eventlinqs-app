/**
 * A SENTENCE THAT SAYS NOTHING ABOUT THE NIGHT IS NOT ITS DESCRIPTION (the PM's 03:14 of 21 November 2026; Law 1 and the
 * Definition of Done: zero placeholders). Read on production at 03:15 that day: 350 of the 721 live nights carried one of
 * two composed lines, every one written by the engine's own listing writer:
 *   274  the headline hunt's line, 'An event on a Saturday evening, tickets through Ticketek.' (its kind, the day and the
 *        part of the day in Melbourne, and where it is booked: all of it already on the row, none of it about the night);
 *   76   'A performance at The Play House, Geelong Arts Centre.' (its kind and its venue, nothing more).
 * A night with no description of its own shows none. This is the one test of such a line: the writers never store one
 * (headline-hunt, the checked file import), every surface that shows a summary leaves one out, and the production clear
 * of 21 November 2026 removed the stored ones. Pure.
 */

/** The two shapes, exactly as production held them. */
export const PLACEHOLDER_SUMMARIES: readonly RegExp[] = [
  /^[A-Z][^.]*? on an? (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (morning|afternoon|evening|night)(, free entry|, tickets through [^.]+)?\.$/,
  // The venue's name and at most its place, nothing more: 'A performance at The Play House, Geelong Arts Centre.' is one;
  // 'A performance at The Play House by the Geelong Rep, with live music.' says something and is not.
  /^An? ([a-z]+ )?performance at [A-Z][^.,]*(, [A-Z][^.,]*)?\.$/,
]

/** True for a composed line that says nothing about the night; false for any real description, and for none. */
export function isPlaceholderSummary(text: string | null | undefined): boolean {
  const line = (text ?? '').replace(/\s+/g, ' ').trim()
  return line !== '' && PLACEHOLDER_SUMMARIES.some((p) => p.test(line))
}

/** The summary a surface may show: the night's own words, or null where it has none (or only a placeholder). */
export function shownSummary(text: string | null | undefined): string | null {
  const line = (text ?? '').trim()
  return line === '' || isPlaceholderSummary(line) ? null : line
}
