/**
 * The seat emails: the organiser updated or assigned a ticket holder's seat. Pure, so the letter test renders them
 * with fixture data (tests/unit/email/every-letter-greets.test.ts). Moved out of the seats server action file on
 * 31 October 2026 (gap 3: every letter greets and signs off); on the way the event title is escaped in the html and
 * the spaced hyphen is a colon (law 6).
 */
import { escapeHtml } from '@/lib/email/escape'
import { greetingHtml, greetingText, signOffHtml, signOffText } from '@/lib/email/letter'

export function renderSeatChangeEmail(input: {
  kind: 'updated' | 'assigned'
  holderName: string | null
  eventTitle: string
  toLabel: string
  fromLabel?: string | null
}): { subject: string; html: string; text: string } {
  const { kind, holderName, eventTitle, toLabel } = input
  const fromLabel = kind === 'updated' ? input.fromLabel ?? null : null
  const seatWord = kind === 'updated' ? 'Your new seat' : 'Your seat'
  const after =
    kind === 'updated'
      ? 'Your ticket and its QR code stay exactly the same: the seat shown on it has already been updated, and the door scanner knows. Nothing else about your order changes.'
      : 'Your ticket and its QR code stay exactly the same: the seat now shows on the ticket, and the door scanner knows. Nothing else about your order changes.'
  return {
    subject: `Your seat for ${eventTitle} has been ${kind}`,
    text: `${greetingText(holderName)}The organiser has ${kind} your seat for ${eventTitle}.\n\n${seatWord}: ${toLabel}${fromLabel ? `\nPrevious seat: ${fromLabel}` : ''}\n\n${after}${signOffText()}`,
    html: `${greetingHtml(holderName)}<p>The organiser has ${kind} your seat for <strong>${escapeHtml(eventTitle)}</strong>.</p><p><strong>${seatWord}: ${escapeHtml(toLabel)}</strong>${fromLabel ? `<br/>Previous seat: ${escapeHtml(fromLabel)}` : ''}</p><p>${after}</p>${signOffHtml()}`,
  }
}
