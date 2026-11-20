import { localDate } from '@/lib/walk-in/dates'

/**
 * A MISSED DAY IS NEVER CAUGHT UP (Lawal, 20 November 2026, 23:58; the PM's 00:20 of 21 November 2026; law 42 of
 * C:\dev\CLAUDE.md). Lawal, quoted: "if today is missed, let's forget about it and start afresh". A sending window or a
 * posting slot that has passed is never fired late as that day's batch: everything that goes out to people runs on
 * today's date and today's facts.
 *
 * The two readers in the engine that send or post at a slot (src/lib/outreach/sender.ts for every letter, follow up and
 * permission request; publishDuePieces in src/lib/social/store.ts for every post) ask this module first, and
 * tests/unit/ops/stale-slot.test.ts fails the build if a reader of a passed slot is added without it.
 */

/** Social slots are planned in Melbourne's day (the timetable's zone). */
export const SOCIAL_SLOT_ZONE = 'Australia/Melbourne'

/** The local calendar day of a slot, "YYYY-MM-DD", or null when it cannot be read. */
export function slotDay(slotIso: string | null, zone: string): string | null {
  return slotIso ? localDate(slotIso, zone) : null
}

/** True when the slot fell on an earlier local day than now: its day was missed, and it is never fired as that day's. */
export function slotFromEarlierDay(slotIso: string | null, now: Date, zone: string): boolean {
  const slot = slotDay(slotIso, zone)
  const today = localDate(now.toISOString(), zone)
  return slot !== null && today !== null && slot < today
}

const TIME_WORDS =
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|today|tonight|tomorrow|yesterday|this (?:morning|afternoon|evening|week|weekend)|next week|last week|January|February|March|April|May|June|July|August|September|October|November|December)\b/i

/**
 * The first word in a message that names a day or a date, or null. A letter re planned from a missed day whose words
 * name a time is drafted again from today's facts rather than sent with yesterday's.
 */
export function wordsNameATime(text: string): string | null {
  return TIME_WORDS.exec(text)?.[0] ?? null
}
