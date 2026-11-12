import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { refusalFromError } from './crm'
import { graphReadSentItems, type GraphConfig } from './graph'
import { planSentSync, type SentMail } from './sent-sync-math'
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
      readonly refused: readonly { readonly contactId: string; readonly why: string }[]
    }

const chunks = <T,>(xs: readonly T[], n = 200): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export async function syncSentItems(db: Admin, cfg: GraphConfig, input: { readonly sinceIso: string }): Promise<SentSynced> {
  const founder = await founderAccount(db)
  if (founder.id === null) return { state: 'not synced', why: founder.why }
  const raw = await graphReadSentItems(cfg, input.sinceIso)
  const mail: SentMail[] = raw.map((m) => ({ internetMessageId: m.internetMessageId, subject: m.subject, toAddresses: m.toAddresses, sentAt: m.sentAt, text: m.text.trim() }))

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
  const refused: { contactId: string; why: string }[] = []
  let marked = 0
  let recordedNow = 0
  for (const a of plan.actions) {
    const sent = { state: 'sent' as const, sent_at: a.mail.sentAt, sent_by: founder.id, provider: 'by_hand' as const, internet_message_id: a.mail.internetMessageId, subject: a.mail.subject, body: a.mail.text }
    if (a.kind === 'mark') {
      const r = await db.from('outreach_touches').update(sent).eq('id', a.touchId).eq('state', 'held').select('id').maybeSingle()
      if (r.error || !r.data) refused.push({ contactId: a.contactId, why: r.error ? refusalFromError(r.error) : 'the draft was no longer waiting' })
      else marked += 1
      continue
    }
    // A message he wrote himself: the next cadence step while there is one, otherwise a relationship message.
    const prior = await db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('contact_id', a.contactId).eq('purpose', 'cadence').neq('state', 'void')
    if (prior.error) throw new Error(`their earlier messages could not be counted: ${prior.error.message}`)
    const step = (prior.count ?? 0) + 1
    const r = await db
      .from('outreach_touches')
      .insert({
        contact_id: a.contactId,
        purpose: step <= 3 ? 'cadence' : 'relationship',
        step: step <= 3 ? step : null,
        held_because: [],
        drafted_by: founder.id,
        ...sent,
      })
      .select('id')
      .single()
    if (r.error) refused.push({ contactId: a.contactId, why: refusalFromError(r.error) })
    else recordedNow += 1
  }
  return { state: 'synced', read: mail.length, marked, recorded: recordedNow, alreadyRecorded: plan.alreadyRecorded, notContacts: plan.notContacts, refused }
}
