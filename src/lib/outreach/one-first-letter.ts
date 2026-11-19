import { FREE_MAIL } from './written-before'

/**
 * ONE FIRST LETTER PER ORGANISER (the PM's 09:45 of 19 November 2026, item 1 (d): "one first contact per organiser
 * (matched by organiser and by the address's domain), never a first contact to an organiser who has replied, and every
 * later night of the same organiser rides in the one thread").
 *
 * THE CASE BEHIND IT. Asia Oasis was written on 18 November at 15:30 (info@asiaoasis.com.au, about its 21 November
 * night). Aria replied at 09:19 on 19 November with three photographs and a venue correction. The run of 09:30 logged her
 * reply (outreach_replies, 09:30:05) and, three seconds later, in the same run, sent a fresh first letter about the 22
 * November night to the organiser's other published address, partnership@asiaoasis.com.au (09:30:14). The sender's
 * no-doubles check looked at one contact only, so a second address of the same organiser read as someone never written.
 *
 * Pure: the reads live with the sender (sender.ts readFirstLetterRecord), so the rule is tested without a database.
 */

/** The organisation's own domain of an address, or null for a free mail domain (which says nothing about who it is). */
export function organisationDomain(address: string): string | null {
  const domain = (address.trim().toLowerCase().split('@')[1] ?? '').trim()
  return domain === '' || FREE_MAIL.has(domain) ? null : domain
}

export type LetterRecord = {
  /** The first letter about to go: its contact, that contact's organiser, and its address. */
  readonly candidate: { readonly contactId: string; readonly organiserId: string; readonly address: string }
  /** Every message already sent to a contact of the same organiser, or to an address at the same organisation domain. */
  readonly sent: readonly { readonly contactId: string; readonly organiserId: string; readonly address: string; readonly sentAt: string | null }[]
  /** Every reply logged from a contact of the same organiser, or from an address at the same organisation domain. */
  readonly replies: readonly { readonly contactId: string; readonly organiserId: string; readonly address: string; readonly receivedAt: string | null }[]
}

/** Whether a contact is the same organisation as the candidate: the same organiser, or the same organisation domain. */
function sameOrganisation(candidate: LetterRecord['candidate'], other: { organiserId: string; address: string }): boolean {
  if (other.organiserId === candidate.organiserId) return true
  const mine = organisationDomain(candidate.address)
  return mine !== null && organisationDomain(other.address) === mine
}

/**
 * Why this first letter must not go, or null when it may. A reply comes first: an organiser who has written back is
 * answered in their own thread, never written to cold again. Then any message already sent to the same organisation.
 */
export function firstLetterBlocked(record: LetterRecord): string | null {
  const c = record.candidate
  const replied = record.replies.find((r) => sameOrganisation(c, r))
  if (replied) {
    return `they have replied (${replied.address}, ${replied.receivedAt ?? 'earlier'}): no first letter goes to an organiser who has written back; any later night rides in that thread`
  }
  const written = record.sent.find((s) => s.contactId !== c.contactId && sameOrganisation(c, s))
  if (written) {
    return `already written at ${written.address} (${written.sentAt ?? 'earlier'}): one first letter per organiser, so a later night rides in that thread`
  }
  return null
}
