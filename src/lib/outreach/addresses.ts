import type { CommsCategory } from '@/lib/comms/categories'
import { contactAddress } from '@/lib/email/sender'

/**
 * EACH MESSAGE TYPE TO ITS ADDRESS, ONE TABLE (law 33 (a), Lawal's 13:47 of 19 November 2026, through the PM's 13:50 item
 * 1, never asked again): acquisition first letters, their follow ups, personal organiser follow ups and partnerships go
 * from Lawal Adams, EventLinqs <lawal@eventlinqs.com>; photo permission requests, listing confirmations, automated
 * notifications, enquiries, support and routine replies go from EventLinqs <hello@eventlinqs.com>; a reply goes from the
 * address the organiser wrote to, in thread. Both mailboxes are reached by the one app, through Exchange's scope of
 * 19 November (C:\dev\GRAPH-CONSENT-19NOV.ps1, RESULT OK at 14:22:26).
 *
 * The table is keyed by the one category every message record carries (law 24, src/lib/comms/categories.ts), so a new
 * category cannot be added without its address: the Record type refuses it at compile time, and mailboxFor refuses a
 * message whose category is not on its record, so nothing goes from a guessed address.
 */

// Derived from the one domain (src/lib/email/sender.ts contactAddress; scripts/guards/one-contact-domain.mjs), never typed.
export const LAWAL_MAILBOX = contactAddress('founder')
export const HELLO_MAILBOX = contactAddress('hello')

export type FromMailbox = 'lawal' | 'hello'

export const ADDRESS_OF_CATEGORY: Readonly<Record<CommsCategory, FromMailbox>> = {
  ACQ: 'lawal', // acquisition first letters and their follow ups
  RET: 'lawal', // personal organiser follow ups and partnerships
  PERM: 'hello', // photo permission requests
  LIST: 'hello', // listing confirmations
  TKT: 'hello', // ticketing enquiries and support
  SOC: 'hello', // social notices
  SYS: 'hello', // automated notifications
}

const ADDRESS: Record<FromMailbox, string> = { lawal: LAWAL_MAILBOX, hello: HELLO_MAILBOX }

export type MailboxAnswer = { readonly mailbox: string } | { readonly refused: string }

/**
 * The address a message goes from. ONE CHANNEL PER CONVERSATION (Lawal, 25 November 2026, 14:41 and 14:43; ./conversation.ts):
 * a message to someone already in conversation with us goes from that conversation's mailbox, the one they last wrote
 * to or we last wrote from, whatever its purpose or category; only a first message goes from its category's address;
 * a message with no category and no conversation is refused, never sent from a guess.
 */
export function mailboxFor(input: { readonly category: string | null | undefined; readonly purpose: string; readonly conversation?: string | null }): MailboxAnswer {
  const wrote = (input.conversation ?? '').trim().toLowerCase()
  if (wrote === LAWAL_MAILBOX || wrote === HELLO_MAILBOX) return { mailbox: wrote }
  const category = (input.category ?? '').trim() as CommsCategory
  const which = (ADDRESS_OF_CATEGORY as Record<string, FromMailbox | undefined>)[category]
  if (!which) return { refused: `no address is set for the message type '${input.category ?? 'none'}' (law 33 (a)); nothing is sent from a guessed address` }
  return { mailbox: ADDRESS[which] }
}

/** Every mailbox the platform reads and sends from, for the inbox run and the Sent Items sync. */
export const OUR_MAILBOXES: readonly string[] = [HELLO_MAILBOX, LAWAL_MAILBOX]
