/**
 * THE TYPED CONFIRMATION, normalised the same way on both sides of the wire.
 *
 * A destructive action asks the person to type the event's name. The dialog
 * enables its confirm control by this rule and the server action refuses by
 * the same rule, so the organiser cannot be let through by the client and
 * refused by the server for a stray space or a capital letter. Case and
 * surrounding or repeated whitespace are forgiven; nothing else is.
 */
export function normaliseTyped(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function typedMatches(typed: string, expected: string): boolean {
  return normaliseTyped(typed) === normaliseTyped(expected)
}
