/**
 * CAPTION STANDARD VERSION 2'S MARKS, ONE RULE (C:/dev/GROWTH/CAPTION-STANDARD-18NOV.md; Lawal's approval of 18 November
 * 2026, 20:44, for every new caption, through the PM's 20:50; the emoji gate of the PM's 21:00; the operating model of
 * 21:15, section 4, START-16OCT/OPERATING-MODEL-LOCKED-18NOV.md):
 *   - every caption carries an emoji (a caption with none is refused), at most five, never two side by side;
 *   - at most one exclamation mark, and only in the hook (its first line), as in Lawal's Kate Ceberano model;
 *   - never a long dash (law 6).
 * One rule, read in every place a caption is judged: a caption is drawn (campaign.ts pieceRefusal) and saved from the
 * founder's own edit (store.ts editPiece) only when it carries every mark, and the hourly run draws again any piece that
 * does not (piece-quality.ts pieceCorrections). At approval and publishing (campaign.ts creativeRefusals, inside the publish
 * gate) only the marks that were holds before version 2 still hold, the exclamation mark and the long dash
 * (holdsAtPublishing): law 22 as amended by Lawal's 00:12 of 18 November 2026 keeps the gate to essential protection, and
 * a version he approved before version 2 is never held for an emoji count it was approved with. Pure, imports nothing.
 */
export const MAX_EMOJI = 5

/** One emoji, a joined sequence ('family' emoji built with zero width joiners) counted once, its variation selector with it. */
const ONE_EMOJI = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu
const TWO_SIDE_BY_SIDE = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*[ \t]*\p{Extended_Pictographic}/u
const LONG_DASH = /[\u2013\u2014]/

/**
 * AN EXCLAMATION MARK, NEVER A LETTER IN A NAME (the comedy weekend set of 23 November 2026, approved by Lawal: the improv
 * show's own name writes a letter of a word as '!'): a '!' with a letter on both sides is part of a word the organiser
 * named, never a mark the caption makes, so it is never counted; a mark that ends a word ('Oklahoma!', a hook's own '!')
 * still is, and still holds.
 */
const EXCLAMATION = /(?<!\p{L})!|!(?!\p{L})/gu

/** The exclamation marks a text makes, a letter written as '!' inside a word left out. */
export function exclamationCount(text: string): number {
  return (text.match(EXCLAMATION) ?? []).length
}

export function emojiCount(text: string): number {
  return (text.match(ONE_EMOJI) ?? []).length
}

/** Every way a caption breaks the marks of version 2, each led by its class; none means it stands. */
export function captionMarkFaults(caption: string): string[] {
  const out: string[] = []
  const emoji = emojiCount(caption)
  if (emoji === 0) out.push("[caption] It carries no emoji: caption standard version 2 leads with the night's own and marks the place, the date, the price and the link.")
  if (emoji > MAX_EMOJI) out.push(`[caption] It carries ${emoji} emoji, over the ${MAX_EMOJI} caption standard version 2 allows.`)
  if (TWO_SIDE_BY_SIDE.test(caption)) out.push('[caption] Two emoji sit side by side; each stands alone.')
  const bangs = exclamationCount(caption)
  const hook = caption.split('\n').find((l) => l.trim() !== '') ?? ''
  if (bangs > 1) out.push(`[caption] It carries ${bangs} exclamation marks; one at most, in the hook.`)
  else if (bangs === 1 && exclamationCount(hook) === 0) out.push('[caption] Its exclamation mark is outside the hook; one at most, in the hook only.')
  if (LONG_DASH.test(caption)) out.push('[caption] It carries a long dash.')
  return out
}

/** The marks that still hold at approval and publishing: the exclamation mark and the long dash (see the header). */
export function holdsAtPublishing(fault: string): boolean {
  return /exclamation mark|long dash/.test(fault)
}
