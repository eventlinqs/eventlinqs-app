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
}

export type SentAction =
  | { readonly kind: 'mark'; readonly touchId: string; readonly contactId: string; readonly mail: SentMail }
  | { readonly kind: 'record'; readonly contactId: string; readonly mail: SentMail }

export interface SentPlan {
  readonly actions: readonly SentAction[]
  readonly alreadyRecorded: number
  readonly notContacts: number
}

export function subjectKey(subject: string | null | undefined): string {
  return (subject ?? '').trim().replace(/^((re|fwd?|fw)\s*:\s*)+/i, '').trim().toLowerCase()
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
    if (!matched) notContacts += 1
  }
  return { actions, alreadyRecorded, notContacts }
}
