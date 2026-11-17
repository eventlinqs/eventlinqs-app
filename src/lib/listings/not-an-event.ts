/**
 * A FACILITY NOTICE IS NOT AN EVENT (the PM's 15:38 item 1 of 16 November 2026). Geelong Regional Libraries' feed carries
 * notices beside its sessions ('Makerspace Opening Hours', 'Makers Room Safety Induction', 'Overlocker Safety Induction'):
 * nothing a visitor goes out to. For every source, a night whose title is a facility notice is refused by the collection
 * run with the reason NOT_AN_EVENT and its words (src/lib/listings/collect-store.ts refuseNotEvents): never published,
 * never deleted, never a person's task. Each phrase is a notice's own shape, so a real night that shares a word ('Hall of
 * Fame Induction Night', 'Zen and the Art of Motorcycle Maintenance', 'Closing Night Party') is never refused. Pure.
 */
export const NOT_AN_EVENT = 'not an event'

const NOTICES: readonly { words: string; re: RegExp }[] = [
  { words: 'opening hours', re: /\bopening (hours|times)\b/i },
  { words: 'a safety induction', re: /\bsafety induction\b/i },
  { words: 'a closure', re: /\b(library|branch|centre|center|building|venue|site|service)\s+(is\s+)?(closed|closure)\b|^closed\b|\bclosed for (the )?(public holiday|maintenance|renovations?|works)\b/i },
  { words: 'maintenance', re: /\b(scheduled|planned|system|systems|website|building|network)\s+maintenance\b|^maintenance\b/i },
  { words: 'booking of equipment', re: /\b(printer|equipment|room|studio|space|machine|computer|pc|laptop|sewing machine|overlocker|laser cutter)\s+(booking|bookings|hire)\b/i },
]

/** The kind of notice a title is, or null when it is a night. */
export function facilityNotice(title: string): string | null {
  const t = title.trim()
  for (const n of NOTICES) if (n.re.test(t)) return n.words
  return null
}
