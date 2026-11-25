/**
 * WHAT LAWAL SENT, MATCHED TO THE CRM (Release 2, item 5: "Sent Items and replies synced back into each organiser's
 * timeline automatically"). Pure: ./sent-sync.ts reads the rows and writes what this decides.
 *
 * For each message in the outreach mailbox's Sent Items that is not yet recorded (by its internet message id):
 *   - to a contact with a draft HELD for it under the same subject: that draft is the message he sent, marked sent with
 *     his own words as they went;
 *   - to a contact with no such draft: a message he wrote himself, recorded as sent in his words;
 *   - to an address that is no contact: none of the CRM's business (his other mail), counted and nothing more.
 * Subjects compare without case, surrounding space or a leading "Re:" or "Fwd:".
 */

export interface SentMail {
  readonly internetMessageId: string
  readonly subject: string
  readonly toAddresses: readonly string[]
  readonly sentAt: string
  readonly text: string
  /** Outlook's conversation id and the ids its thread headers name (./graph.ts): the roads to its thread (./thread-match.ts). */
  readonly conversationId?: string
  readonly threadIds?: readonly string[]
}

export type SentAction =
  | { readonly kind: 'mark'; readonly touchId: string; readonly contactId: string; readonly mail: SentMail }
  | { readonly kind: 'record'; readonly contactId: string; readonly mail: SentMail }

export interface SentPlan {
  readonly actions: readonly SentAction[]
  readonly alreadyRecorded: number
  readonly notContacts: number
  /** Each message not yet recorded whose addresses are no contact of ours: matched to its thread by the store, or not. */
  readonly unmatched?: readonly SentMail[]
}

export function subjectKey(subject: string | null | undefined): string {
  return (subject ?? '').trim().replace(/^((re|fwd?|fw)\s*:\s*)+/i, '').trim().toLowerCase()
}

/**
 * HIS OWN WORDS ONLY (the PM's 12:18 of 19 November 2026: Lawal's 12:12:58 reply to Asia Oasis was never recorded).
 * Graph returns a sent reply with the message it answers quoted beneath it, so the record held the organiser's words
 * too, and the database's checks (no dashes, no exclamation marks) judged them as his. Everything from the quoted
 * history on is cut: Outlook's rule line and 'From: ', '-----Original Message-----', or 'On ... wrote:'. The gateway
 * judges a message's own part the same way (C:\dev\comms-gateway\gateway.py own_part).
 */
const QUOTED_HISTORY = /\n[ \t]*(?:_{5,}[ \t]*\n[ \t]*)?(?:From:[ \t]|-----Original Message-----|On .{5,80} wrote:)/

export function ownText(text: string): string {
  return text.replace(/\r\n?/g, '\n').split(QUOTED_HISTORY)[0].trim()
}

export type OwnPurpose = { readonly purpose: 'reply' | 'cadence' | 'relationship'; readonly step: number | null }

/**
 * WHAT A MESSAGE HE WROTE HIMSELF IS (the same defect): to a contact who has written to us, it is a reply, whatever
 * went before; the database refuses a cadence step to a contact who replied ("the cadence has stopped"), so filing his
 * answer as the next cadence step lost every reply he sent by hand (production held none on 19 November 2026).
 * Otherwise it is the next cadence step while there is one, then a relationship message.
 */
export function ownMessagePurpose(input: { readonly wroteToUs: boolean; readonly cadenceSoFar: number }): OwnPurpose {
  if (input.wroteToUs) return { purpose: 'reply', step: null }
  const step = input.cadenceSoFar + 1
  return step <= 3 ? { purpose: 'cadence', step } : { purpose: 'relationship', step: null }
}

export function planSentSync(
  mail: readonly SentMail[],
  contacts: readonly { readonly id: string; readonly address: string }[],
  held: readonly { readonly touchId: string; readonly contactId: string; readonly subject: string | null }[],
  recorded: ReadonlySet<string>,
): SentPlan {
  const byAddress = new Map<string, string>()
  for (const c of contacts) byAddress.set(c.address.trim().toLowerCase(), c.id)
  const used = new Set<string>()
  const actions: SentAction[] = []
  let alreadyRecorded = 0
  let notContacts = 0
  const unmatched: SentMail[] = []
  for (const m of mail) {
    if (!m.internetMessageId || recorded.has(m.internetMessageId)) {
      alreadyRecorded += 1
      continue
    }
    let matched = false
    for (const address of m.toAddresses) {
      const contactId = byAddress.get(address.trim().toLowerCase())
      if (!contactId) continue
      matched = true
      const draft = held.find((h) => h.contactId === contactId && !used.has(h.touchId) && subjectKey(h.subject) === subjectKey(m.subject))
      if (draft) {
        used.add(draft.touchId)
        actions.push({ kind: 'mark', touchId: draft.touchId, contactId, mail: m })
      } else {
        actions.push({ kind: 'record', contactId, mail: m })
      }
    }
    if (!matched) {
      notContacts += 1
      unmatched.push(m)
    }
  }
  return { actions, alreadyRecorded, notContacts, unmatched }
}
