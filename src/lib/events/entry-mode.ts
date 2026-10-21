/**
 * HOW A PERSON GETS IN: the event's entry mode (WI1, 21 October 2026).
 *
 * `tickets` is every event before WI1: ticket types sold or registered here.
 * `walk_in` is free entry with no ticket needed. A walk-in event never holds a
 * ticket type, is always free, and keeps its mode once it leaves draft. The
 * database enforces all three (migration 20261021000020), so this module only
 * READS the mode; it never decides anything the database has not already made
 * true.
 *
 * A leaf on purpose: no imports. The card components, the sale decision, the
 * publish gate and the structured data all ask the one question here, and none
 * of them may pull a server module into the client bundle by asking it.
 */

export const ENTRY_MODES = ['tickets', 'walk_in'] as const
export type EntryMode = (typeof ENTRY_MODES)[number]

export type EntryModeFields = { entry_mode?: string | null }

/** Is this a free walk-in event? A missing or unknown mode is NOT walk-in. */
export function isWalkIn(event: EntryModeFields | null | undefined): boolean {
  return event?.entry_mode === 'walk_in'
}

/** The price position on every browse card for a walk-in event. */
export const FREE_ENTRY_LABEL = 'Free entry'

/**
 * The only phrases a walk-in surface may use that contain the word "ticket".
 * Lawal's ruling of 21 October 2026: no "ticket" and no "book" on a walk-in
 * page, except "No ticket needed". These are that phrase in the four places
 * locked design A sets it, and `scripts/guards/walk-in-page-sells-nothing.mjs`
 * allows these and nothing else.
 */
export const NO_TICKET_NEEDED = 'No ticket needed'
export const FREE_ENTRY_NO_TICKET_NEEDED = 'Free entry, no ticket needed'
export const FREE_NO_TICKET_NEEDED = 'Free, no ticket needed'
export const FREE_BAR_NO_TICKET_NEEDED = 'Free · No ticket needed'

/** The four, longest first, so a judge removing them never leaves half of one behind. */
export const ALLOWED_TICKET_PHRASES = [
  FREE_ENTRY_NO_TICKET_NEEDED,
  FREE_BAR_NO_TICKET_NEEDED,
  FREE_NO_TICKET_NEEDED,
  NO_TICKET_NEEDED,
] as const
