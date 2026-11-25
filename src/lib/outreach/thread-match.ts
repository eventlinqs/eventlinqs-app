import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Admin = SupabaseClient<Database>

/**
 * THE THREAD A MESSAGE BELONGS TO (the PM's 16:28 of 25 November 2026, directive 3.4: identify the contact and the
 * conversation). Bendigo Tourism's yes of 15:44 came from an address we hold no contact for, answering a message Lawal
 * sent by hand, and the inbox matched our own engine's message ids alone (those ending @eventlinqs.com), then the sender's
 * address; so it was matched to nobody and said nothing. The roads, in order:
 *
 *   1. headers       the ids its In-Reply-To and References name, any domain, against every message id we hold: each
 *                    message we sent (by the engine, or by hand and recorded from Sent Items) and each of theirs we logged;
 *   2. conversation  Outlook's conversation id (Microsoft Graph message.conversationId) against the messages recorded
 *                    with it (outreach_message_mailboxes), when the headers name nothing we hold;
 *   3. address       only then the address it came from, as a contact of ours.
 *
 * A read that fails throws: the message is then left unhandled and read again on the next run, never matched on a guess.
 */
export type ThreadTouch = { readonly id: string; readonly subject: string | null; readonly context_key: string | null }

export type ThreadMatch = {
  readonly contactId: string
  /** The newest message of ours in the thread the road found, for its subject and context; null when none is known. */
  readonly touch: ThreadTouch | null
  readonly road: 'headers' | 'conversation' | 'address'
}

export async function threadOf(
  db: Admin,
  input: { readonly ids: readonly string[]; readonly conversationId?: string | null; readonly address?: string | null },
): Promise<ThreadMatch | null> {
  const ids = [...new Set(input.ids.filter(Boolean))]
  if (ids.length > 0) {
    const ours = await db.from('outreach_touches').select('id, contact_id, subject, context_key').in('internet_message_id', ids).order('sent_at', { ascending: false }).limit(1)
    if (ours.error) throw new Error(`the messages it answers could not be read: ${ours.error.message}`)
    const t = (ours.data ?? [])[0] as { id: string; contact_id: string; subject: string | null; context_key: string | null } | undefined
    if (t) return { contactId: t.contact_id, touch: { id: t.id, subject: t.subject ?? null, context_key: t.context_key ?? null }, road: 'headers' }
    const theirs = await db.from('outreach_replies').select('contact_id, touch_id').in('source_message_id', ids).order('received_at', { ascending: false }).limit(1)
    if (theirs.error) throw new Error(`their earlier messages could not be read: ${theirs.error.message}`)
    const r = (theirs.data ?? [])[0] as { contact_id: string; touch_id: string | null } | undefined
    if (r) return { contactId: r.contact_id, touch: await touchOf(db, r.touch_id), road: 'headers' }
    // A message of ours on record only by its mailbox row (one sent by hand whose words the message record refuses).
    const rows = await db.from('outreach_message_mailboxes').select('contact_id').in('internet_message_id', ids).not('contact_id', 'is', null).order('message_at', { ascending: false }).limit(1)
    if (rows.error) throw new Error(`the messages it answers could not be read: ${rows.error.message}`)
    const row = (rows.data ?? [])[0] as { contact_id: string | null } | undefined
    if (row?.contact_id) return { contactId: row.contact_id, touch: null, road: 'headers' }
  }
  const conversation = (input.conversationId ?? '').trim()
  if (conversation) {
    const known = await db
      .from('outreach_message_mailboxes')
      .select('contact_id, internet_message_id')
      .eq('conversation_id', conversation)
      .not('contact_id', 'is', null)
      .order('message_at', { ascending: false })
      .limit(1)
    if (known.error) throw new Error(`the messages of its conversation could not be read: ${known.error.message}`)
    const k = (known.data ?? [])[0] as { contact_id: string | null; internet_message_id: string } | undefined
    if (k?.contact_id) {
      const ours = await db.from('outreach_touches').select('id').eq('internet_message_id', k.internet_message_id).limit(1)
      return { contactId: k.contact_id, touch: await touchOf(db, ((ours.data ?? [])[0] as { id: string } | undefined)?.id ?? null), road: 'conversation' }
    }
  }
  const address = (input.address ?? '').trim().toLowerCase()
  if (address) {
    const c = await db.from('organiser_contacts').select('id').eq('channel', 'email').eq('address', address).maybeSingle()
    if (c.error) throw new Error(`whether it came from a contact could not be read: ${c.error.message}`)
    const id = (c.data as { id?: string } | null)?.id
    if (id) return { contactId: id, touch: null, road: 'address' }
  }
  return null
}

async function touchOf(db: Admin, id: string | null | undefined): Promise<ThreadTouch | null> {
  if (!id) return null
  const t = await db.from('outreach_touches').select('id, subject, context_key').eq('id', id).maybeSingle()
  const row = t.data as { id: string; subject: string | null; context_key: string | null } | null
  return row ? { id: row.id, subject: row.subject ?? null, context_key: row.context_key ?? null } : null
}

/**
 * A NEW ADDRESS IN A KNOWN THREAD (the PM's 16:28, item 1): someone of the organisation wrote from an address we hold no
 * contact for, in a thread of ours. Their address becomes a contact of the same organiser, on the basis of their own
 * message (basis 'none': we answer them in that conversation; no letter of ours is ever started to it). Returns the
 * contact of that address (made now, or held already), or why not.
 */
export async function contactForNewAddress(
  db: Admin,
  input: { readonly threadContactId: string; readonly address: string; readonly by: string },
): Promise<{ readonly id: string; readonly made: boolean } | { readonly why: string }> {
  const address = input.address.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return { why: `${address} is not an address` }
  const held = await db.from('organiser_contacts').select('id').eq('channel', 'email').eq('address', address).maybeSingle()
  if (held.error) return { why: `whether ${address} is a contact could not be read: ${held.error.message}` }
  if ((held.data as { id?: string } | null)?.id) return { id: (held.data as { id: string }).id, made: false }
  const thread = await db.from('organiser_contacts').select('organiser_id').eq('id', input.threadContactId).maybeSingle()
  const organiserId = (thread.data as { organiser_id?: string } | null)?.organiser_id
  if (thread.error || !organiserId) return { why: `the thread's organiser could not be read${thread.error ? `: ${thread.error.message}` : ''}` }
  const made = await db
    .from('organiser_contacts')
    .insert({ organiser_id: organiserId, channel: 'email', address, role: 'wrote to us from this address in a thread of ours', basis: 'none', created_by: input.by })
    .select('id')
    .single()
  if (made.error) return { why: `${address} could not be recorded as their contact: ${made.error.message}` }
  return { id: (made.data as { id: string }).id, made: true }
}
