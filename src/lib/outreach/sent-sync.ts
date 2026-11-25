import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { refusalFromError } from './crm'
import { graphReadSentItems, type GraphConfig } from './graph'
import { ownMessagePurpose, ownText, planSentSync, type SentAction, type SentMail } from './sent-sync-math'
import { contactForNewAddress, threadOf } from './thread-match'
import { founderAccount } from './twenty-drafts'

/**
 * LAWAL'S SENT ITEMS, RECORDED IN THE CRM BY THEMSELVES (Release 2, item 5: "his approval, sending, then Sent Items and
 * replies synced back into each organiser's timeline automatically (this also records the 20 he sent himself today
 * once the mailbox is connected)"). In the outreach run, once Graph can read the outreach mailbox
 * (C:\dev\GRAPH-CONSENT-12NOV.ps1, Lawal's one step): every message in its Sent Items not yet recorded is matched by
 * ./sent-sync-math.ts and written through the database's own rules (outreach_touch_is_lawful), as by hand: Lawal sent it
 * from his own mailbox, nothing here sends anything. A message the database refuses (no recorded basis, no opt out line,
 * a dash) is not recorded and is said, in its words, so he can see why.
 */

type Admin = SupabaseClient<Database>

export type SentSynced =
  | { readonly state: 'not synced'; readonly why: string }
  | {
      readonly state: 'synced'
      readonly read: number
      readonly marked: number
      readonly recorded: number
      readonly alreadyRecorded: number
      readonly notContacts: number
      /** Messages to an address that is no contact of ours, matched to a thread of ours and recorded on its contact. */
      readonly byThread?: number
      readonly refused: readonly { readonly contactId: string; readonly why: string }[]
      /** Said when the mailbox each message left from could not be recorded (./conversation.ts). */
      readonly mailboxNotRecorded?: string
    }

const chunks = <T,>(xs: readonly T[], n = 200): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export async function syncSentItems(db: Admin, cfg: GraphConfig, input: { readonly sinceIso: string }): Promise<SentSynced> {
  const founder = await founderAccount(db)
  if (founder.id === null) return { state: 'not synced', why: founder.why }
  const raw = await graphReadSentItems(cfg, input.sinceIso)
  const mail: SentMail[] = raw.map((m) => ({
    internetMessageId: m.internetMessageId,
    subject: m.subject,
    toAddresses: m.toAddresses,
    sentAt: m.sentAt,
    text: ownText(m.text),
    conversationId: m.conversationId ?? '',
    threadIds: m.threadIds ?? [],
  }))

  const ids = [...new Set(mail.map((m) => m.internetMessageId).filter(Boolean))]
  const recorded = new Set<string>()
  for (const part of chunks(ids)) {
    const r = await db.from('outreach_touches').select('internet_message_id').in('internet_message_id', part).limit(part.length)
    if (r.error) throw new Error(`the messages already recorded could not be read: ${r.error.message}`)
    for (const t of r.data ?? []) if (t.internet_message_id) recorded.add(t.internet_message_id)
  }

  const addresses = [...new Set(mail.flatMap((m) => m.toAddresses))]
  const contacts: { id: string; address: string }[] = []
  for (const part of chunks(addresses)) {
    const r = await db.from('organiser_contacts').select('id, address').eq('channel', 'email').in('address', part).limit(1000)
    if (r.error) throw new Error(`the contacts could not be read: ${r.error.message}`)
    contacts.push(...(r.data ?? []).map((c) => ({ id: c.id as string, address: c.address as string })))
  }

  const held: { touchId: string; contactId: string; subject: string | null }[] = []
  for (const part of chunks(contacts.map((c) => c.id))) {
    const r = await db.from('outreach_touches').select('id, contact_id, subject').eq('state', 'held').in('contact_id', part).limit(1000)
    if (r.error) throw new Error(`the drafts waiting could not be read: ${r.error.message}`)
    held.push(...(r.data ?? []).map((t) => ({ touchId: t.id as string, contactId: t.contact_id as string, subject: (t.subject as string | null) ?? null })))
  }

  const plan = planSentSync(mail, contacts, held, recorded)
  // THE CONTACT OF EACH MESSAGE: its address's contact, else its thread's (the PM's 16:28, item 2: every message we send,
  // to any address, matched as the inbox matches, so mail sent by hand is never missing). A message to a new address in a
  // thread of ours is recorded on the thread's contact, and that address becomes a contact of the same organiser.
  const contactOf = new Map<string, string>()
  for (const a of plan.actions) if (!contactOf.has(a.mail.internetMessageId)) contactOf.set(a.mail.internetMessageId, a.contactId)
  const actions: SentAction[] = [...plan.actions]
  let byThread = 0
  for (const m of plan.unmatched ?? []) {
    const match = await threadOf(db, { ids: m.threadIds ?? [], conversationId: m.conversationId ?? null })
    if (!match) continue
    contactOf.set(m.internetMessageId, match.contactId)
    for (const to of m.toAddresses) await contactForNewAddress(db, { threadContactId: match.contactId, address: to, by: founder.id })
    actions.push({ kind: 'record', contactId: match.contactId, mail: m })
    byThread += 1
  }
  const refused: { contactId: string; why: string }[] = []
  let marked = 0
  let recordedNow = 0
  for (const a of actions) {
    const sent = { state: 'sent' as const, sent_at: a.mail.sentAt, sent_by: founder.id, provider: 'by_hand' as const, internet_message_id: a.mail.internetMessageId, subject: a.mail.subject, body: a.mail.text }
    if (a.kind === 'mark') {
      const r = await db.from('outreach_touches').update(sent).eq('id', a.touchId).eq('state', 'held').select('id').maybeSingle()
      if (r.error || !r.data) refused.push({ contactId: a.contactId, why: r.error ? refusalFromError(r.error) : 'the draft was no longer waiting' })
      else {
        marked += 1
        recorded.add(a.mail.internetMessageId)
      }
      continue
    }
    // A message he wrote himself: a reply to a contact who wrote to us, otherwise the next cadence step while there is
    // one, then a relationship message (./sent-sync-math.ts ownMessagePurpose).
    const wrote = await db.from('outreach_replies').select('id', { count: 'exact', head: true }).eq('contact_id', a.contactId)
    if (wrote.error) throw new Error(`whether they wrote to us could not be read: ${wrote.error.message}`)
    const prior = await db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('contact_id', a.contactId).eq('purpose', 'cadence').neq('state', 'void')
    if (prior.error) throw new Error(`their earlier messages could not be counted: ${prior.error.message}`)
    const own = ownMessagePurpose({ wroteToUs: (wrote.count ?? 0) > 0, cadenceSoFar: prior.count ?? 0 })
    const r = await db
      .from('outreach_touches')
      .insert({
        contact_id: a.contactId,
        purpose: own.purpose,
        step: own.step,
        held_because: [],
        drafted_by: founder.id,
        ...sent,
      })
      .select('id')
      .single()
    if (r.error) refused.push({ contactId: a.contactId, why: refusalFromError(r.error) })
    else {
      recordedNow += 1
      recorded.add(a.mail.internetMessageId)
    }
  }
  // EVERY MESSAGE THIS MAILBOX SENT, ON RECORD (Lawal, 25 November 2026, 14:41 and 14:43; the PM's 16:28, item 2): the
  // mailbox it left from, who it went to, its subject, time and conversation, and its contact (null when it matched
  // none), whether the engine sent it or a person did by hand, and whether or not the message record took it (a hand
  // sent answer without the opt out line is refused there, and is kept here), so the conversation keeps to it and no
  // message we sent is missing. Insert only: a message already recorded keeps its row.
  const mailbox = cfg.mailbox.trim().toLowerCase()
  const rows = mail
    .filter((m) => m.internetMessageId)
    .map((m) => ({
      internet_message_id: m.internetMessageId,
      mailbox,
      direction: 'sent',
      counterpart_address: m.toAddresses.find((a) => /^[^@\s]+@[^@\s]+$/.test(a)) ?? null,
      subject: (m.subject ?? '').slice(0, 998) || null,
      message_at: m.sentAt || null,
      conversation_id: (m.conversationId ?? '').trim() || null,
      contact_id: contactOf.get(m.internetMessageId) ?? null,
    }))
  let mailboxNotRecorded: string | undefined
  for (const part of chunks(rows)) {
    const k = await Promise.resolve()
      .then(() => db.from('outreach_message_mailboxes').upsert(part, { onConflict: 'internet_message_id', ignoreDuplicates: true }))
      .catch((err: unknown) => ({ error: { message: err instanceof Error ? err.message : String(err) } }))
    if (k.error) mailboxNotRecorded = `the mailbox of the messages sent could not be recorded: ${k.error.message}`
  }
  return { state: 'synced', read: mail.length, marked, recorded: recordedNow, alreadyRecorded: plan.alreadyRecorded, notContacts: plan.notContacts - byThread, byThread, refused, ...(mailboxNotRecorded ? { mailboxNotRecorded } : {}) }
}
