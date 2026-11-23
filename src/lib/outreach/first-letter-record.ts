import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { organisationDomain, type LetterRecord } from './one-first-letter'

type Admin = SupabaseClient<Database>

/**
 * WHAT THE ONE FIRST LETTER RULE READS (./one-first-letter.ts), FOR THE SENDER AND FOR EVERY DRAFTER: the candidate's
 * contact and organiser, and every message written to, and every reply from, a contact of the same organiser or an
 * address at the same organisation domain. A read that fails answers null, and nothing is drafted or sent on a guess.
 *
 * Which messages count as written is the caller's: at send, a message sent (./sender.ts, FIRST_LETTER_SENT); before a
 * first letter is drafted, one queued or being sent too, so the first to go holds the other (./drafts.ts and ./crm.ts,
 * FIRST_LETTER_WRITTEN). Until 23 November 2026 only the sender read it: at 22:15 that night the engine's outreach run
 * drafted a source ask to marketing@ballarat.vic.gov.au though balc@ballarat.vic.gov.au had been written to, a letter the
 * loader had refused and the sender would have refused (C:\dev\EVIDENCE\EL-23NOV\source-asks).
 */
export const FIRST_LETTER_SENT = ['sent'] as const
export const FIRST_LETTER_WRITTEN = ['queued', 'sending', 'sent'] as const

export async function readFirstLetterRecord(
  db: Admin,
  candidate: { readonly contactId: string; readonly touchId?: string | null },
  written: readonly ('queued' | 'sending' | 'sent')[] = FIRST_LETTER_SENT,
): Promise<LetterRecord | null> {
  const me = await db.from('organiser_contacts').select('id, organiser_id, address').eq('id', candidate.contactId).single()
  if (me.error) return null
  const organiserId = me.data.organiser_id as string
  const address = (me.data.address as string | null) ?? ''
  const theirs = await db.from('organiser_contacts').select('id, organiser_id, address').eq('organiser_id', organiserId)
  if (theirs.error) return null
  const domain = organisationDomain(address)
  const sameDomain = domain ? await db.from('organiser_contacts').select('id, organiser_id, address').ilike('address', `%@${domain}`) : { data: [], error: null }
  if (sameDomain.error) return null
  const contacts = new Map<string, { organiserId: string; address: string }>()
  for (const c of [...(theirs.data ?? []), ...(sameDomain.data ?? [])]) {
    contacts.set(c.id as string, { organiserId: c.organiser_id as string, address: (c.address as string | null) ?? '' })
  }
  const ids = [...contacts.keys()]
  const touches = db.from('outreach_touches').select('contact_id, sent_at').in('contact_id', ids)
  const query = written.length === 1 ? touches.eq('state', written[0]) : touches.in('state', [...written])
  const sent = candidate.touchId ? await query.neq('id', candidate.touchId) : await query
  if (sent.error) return null
  const replies = await db.from('outreach_replies').select('contact_id, received_at').in('contact_id', ids)
  if (replies.error) return null
  const who = (id: string) => contacts.get(id) ?? { organiserId: '', address: '' }
  return {
    candidate: { contactId: candidate.contactId, organiserId, address },
    sent: (sent.data ?? []).map((s) => ({ contactId: s.contact_id as string, ...who(s.contact_id as string), sentAt: (s.sent_at as string | null) ?? null })),
    replies: (replies.data ?? []).map((r) => ({ contactId: r.contact_id as string, ...who(r.contact_id as string), receivedAt: (r.received_at as string | null) ?? null })),
  }
}
