/**
 * THE VENUE LINE NEVER REPEATS THE TITLE (the CONTROLLER's 21:00 of 31 October 2026, from the live home: 'Melbourne
 * Diwali' over a venue line reading 'Melbourne Diwali'). The city listings import wrote the event's own name as its venue
 * for markets and festivals held in the open (production that night: Melbourne Diwali at '740 Bourke Street', Melbourne
 * Makers' Market, The Lygon Street Market, Southbank Makers Market; and 'The Street Social' for 'The Street Social:
 * Halloween'). Wherever a page names the venue beside the title, it asks here: the venue's name when it is a place of its
 * own, else the first part of its stored address ('740 Bourke Street', 'City Square'), else nothing. Nothing is invented;
 * the stored name stays in the row and in the structured data.
 *
 * A leaf, so the rule is tested without a database.
 */

const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Whether the venue's name only repeats the event's title: the same words, or the title opening with it then a colon. */
export function venueRepeatsTitle(title: string | null | undefined, venueName: string | null | undefined): boolean {
  if (!title || !venueName) return false
  const t = fold(title)
  const v = fold(venueName)
  if (!v) return false
  if (t === v) return true
  return title.trim().toLowerCase().startsWith(`${venueName.trim().toLowerCase()}:`)
}

export function shownVenueName(event: {
  title?: string | null
  venue_name?: string | null
  venue_address?: string | null
}): string | null {
  const name = event.venue_name?.trim() || null
  if (name && !venueRepeatsTitle(event.title, name)) return name
  const first = event.venue_address?.split(',')[0]?.trim()
  return first || null
}
