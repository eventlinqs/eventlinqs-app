import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readDailyTwenty } from './daily-twenty-read'
import { readHeldTouches } from './daily-queue'
import type { DailyAction, DailyTwenty } from './daily-twenty'
import type { QueueTouch } from './daily-queue-math'

/**
 * TOMORROW'S TWENTY ON THE COMMAND CENTRE (Lawal, 12 November 2026, 11:11, through the PM: "in the Command Centre on his
 * phone ... 20 organisers from the CRM, Melbourne first, ranked by the score, 5 of them conversion asks. Each with: the
 * organiser, the published business address and the recorded Spam Act basis, the draft in his own format ... a one-press
 * 'copy' and a one-press 'sent'").
 *
 * Nothing new decides anything here: WHO is ./daily-twenty.ts (its groups, one action an organiser, eligibility from the
 * database's own refusal, Melbourne first), the DRAFT is the held touch the existing pipeline wrote and the gateway judges
 * (./daily-queue.ts readHeldTouches), and SENT is /admin/acquisition's own action. This only puts them side by side.
 */

type Admin = SupabaseClient<Database>

export interface TwentyContact {
  readonly basis: string
  readonly basisRecordedAt: string | null
  /** Where the address was published, the page it was read from. */
  readonly publishedOn: string | null
  /** Why they are relevant, as recorded with the contact. */
  readonly relevance: string | null
}

export interface TwentyRow {
  readonly action: DailyAction
  readonly contact: TwentyContact | null
  /** The newest held draft written to this contact, or null when none is drafted yet. */
  readonly draft: QueueTouch | null
}

export interface TwentyView {
  readonly groups: readonly { readonly key: string; readonly words: string; readonly short: number; readonly rows: readonly TwentyRow[] }[]
  readonly socialFirstTouches: DailyTwenty['socialFirstTouches']
  readonly research: DailyTwenty['research']
  readonly drafted: number
  readonly total: number
}

/** The newest held draft per contact. Pure. */
export function newestDraftByContact(touches: readonly QueueTouch[]): Map<string, QueueTouch> {
  const out = new Map<string, QueueTouch>()
  for (const t of touches) {
    if (!t.contactId) continue
    const seen = out.get(t.contactId)
    if (!seen || t.draftedAt > seen.draftedAt) out.set(t.contactId, t)
  }
  return out
}

/** The twenty with each contact's basis and draft. Pure: the reads are passed in. */
export function twentyView(day: DailyTwenty, contacts: ReadonlyMap<string, TwentyContact>, drafts: ReadonlyMap<string, QueueTouch>): TwentyView {
  const groups = day.groups.map((g) => ({
    key: g.key,
    words: g.words,
    short: g.short,
    rows: g.actions.map((a) => ({
      action: a,
      contact: a.contactId ? contacts.get(a.contactId) ?? null : null,
      draft: a.contactId ? drafts.get(a.contactId) ?? null : null,
    })),
  }))
  const rows = groups.flatMap((g) => g.rows)
  return {
    groups,
    socialFirstTouches: day.socialFirstTouches,
    research: day.research,
    drafted: rows.filter((r) => r.draft !== null).length,
    total: rows.length,
  }
}

export async function readTwentyView(db: Admin, now: Date = new Date()): Promise<TwentyView> {
  const [day, held] = await Promise.all([readDailyTwenty(db, now), readHeldTouches(db, now)])
  const ids = day.groups.flatMap((g) => g.actions.map((a) => a.contactId)).filter((id): id is string => Boolean(id))
  const contacts = new Map<string, TwentyContact>()
  if (ids.length > 0) {
    const r = await db.from('organiser_contacts').select('id, basis, basis_recorded_at, published_on_url, relevance').in('id', ids)
    if (r.error) throw new Error(`the twenty's contacts could not be read: ${r.error.message}`)
    for (const c of r.data ?? []) {
      contacts.set(c.id, { basis: c.basis, basisRecordedAt: c.basis_recorded_at, publishedOn: c.published_on_url, relevance: c.relevance })
    }
  }
  return twentyView(day, contacts, newestDraftByContact(held.touches))
}

/**
 * WHAT CAME BACK (Lawal's 11:11, item 2: "stops the sequence on a reply, an unsubscribe or a bounce he marks"). Each
 * message sent in the last fortnight that nothing has come back on yet, so he can mark a reply, a request to stop or a
 * bounce in one press. An unsubscribe through the message's own link is recorded by /unsubscribe/outreach without him.
 */
export interface SentRecent {
  readonly touchId: string
  readonly contactId: string
  readonly organiserName: string
  readonly address: string
  readonly step: number
  readonly sentAt: string
}

/** The sent messages with no reply logged on their contact since they went, newest first. Pure. */
export function awaitingAnswer(
  sent: readonly SentRecent[],
  replies: readonly { readonly contactId: string; readonly receivedAt: string }[],
): SentRecent[] {
  const lastReply = new Map<string, string>()
  for (const r of replies) {
    const seen = lastReply.get(r.contactId)
    if (!seen || r.receivedAt > seen) lastReply.set(r.contactId, r.receivedAt)
  }
  return sent
    .filter((s) => {
      const r = lastReply.get(s.contactId)
      return !r || r < s.sentAt
    })
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0))
}

export const SENT_RECENT_DAYS = 14

export async function readSentRecently(db: Admin, now: Date = new Date()): Promise<SentRecent[]> {
  const since = new Date(now.getTime() - SENT_RECENT_DAYS * 86_400_000).toISOString()
  const t = await db
    .from('outreach_touches')
    .select('id, contact_id, step, sent_at, organiser_contacts!inner(address, organisers(name))')
    .eq('state', 'sent')
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(200)
  if (t.error) throw new Error(`the messages sent could not be read: ${t.error.message}`)
  const sent: SentRecent[] = (t.data ?? []).flatMap((r) => {
    if (!r.sent_at) return []
    const c = r.organiser_contacts as unknown as { address: string; organisers: { name: string } | null } | null
    return [{ touchId: r.id, contactId: r.contact_id, organiserName: c?.organisers?.name ?? 'Unknown organiser', address: c?.address ?? '', step: r.step, sentAt: r.sent_at }]
  })
  if (sent.length === 0) return []
  const rep = await db.from('outreach_replies').select('contact_id, received_at').in('contact_id', [...new Set(sent.map((s) => s.contactId))])
  if (rep.error) throw new Error(`the replies could not be read: ${rep.error.message}`)
  return awaitingAnswer(sent, (rep.data ?? []).map((r) => ({ contactId: r.contact_id, receivedAt: r.received_at })))
}
