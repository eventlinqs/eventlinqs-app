/**
 * Whether a ticket gets its holder in, asked in one place.
 *
 * The tickets table allows five statuses (20260517000001): 'valid', 'scanned', 'refunded', 'void',
 * 'transferred'. Only 'valid' and 'scanned' admit: scan_ticket refuses the other three at the door.
 * The ticket page, the confirmation page and the confirmation email each kept their own copy of
 * this rule, and the ticket page's disagreed (a transferred ticket kept its QR, a void one was told
 * it had been refunded), so all three read it from here.
 */
const ADMITS_ENTRY: ReadonlySet<string> = new Set(['valid', 'scanned'])

export function admitsEntry(status: string): boolean {
  return ADMITS_ENTRY.has(status)
}

/** Plain-language sentence for a ticket that no longer admits entry; null for one that does. */
export function notValidSentence(status: string): string | null {
  if (status === 'refunded') return 'This ticket was refunded and is no longer valid.'
  if (status === 'void') return 'This ticket was cancelled and is no longer valid.'
  if (status === 'transferred') return 'This ticket was transferred and is no longer valid.'
  if (admitsEntry(status)) return null
  return 'This ticket is no longer valid.'
}
