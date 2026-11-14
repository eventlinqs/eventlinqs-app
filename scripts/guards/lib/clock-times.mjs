/**
 * A CLOCK TIME DATED IN WORDS IS A TIME, NOT AN ASPECT RATIO (the guard audit of 14 November 2026,
 * C:\dev\START-16OCT\GUARD-AUDIT-14NOV.md).
 *
 * sourced-specifications reads a colon pair near a named third party as an aspect ratio, and already excuses a time
 * beside AEST, AEDT, UTC or GMT, a leading-zero time, and a time beside a scheduling word. On 7 November 2026 it stopped
 * a gate on a comment in src/lib/redis/client.ts that dated a ruling 'the CONTROLLER's 21:54 of 6 November 2026', beside
 * the word Upstash: a time, dated in words, with no zone. It was passed by adding 'AEDT' to the comment, which is
 * working round the guard. This is the guard taught the shape instead: a 24-hour time followed within a few characters
 * by 'of' or 'on' and a day and month in words. A bare ratio (16:10, 21:9, 1.91:1) never carries a date in words, so
 * the guard still sees every real one.
 */
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'

export const CLOCK_TIME_DATED_IN_WORDS = new RegExp(
  `\\b(?:[01]?\\d|2[0-3]):[0-5]\\d\\b[^\\n]{0,12}?\\b(?:of|on)\\s+\\d{1,2}\\s+(?:${MONTHS})\\b`,
)
