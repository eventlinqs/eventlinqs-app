import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'

/**
 * WHAT WAITS FOR LAWAL'S DECISION IN THE COMMUNICATIONS CENTRE (law 30, the CRM directive's section 5: "the organiser
 * name and the associated event; the incoming message and the relevant conversation history; the proposed response").
 * Every reply the inbox run held for him (outreach_replies.needs_lawal), newest first, with who wrote, from which
 * organiser, their words, and the message of ours they answered; and the reply the platform proposes, which he edits
 * before APPROVE AND SEND (src/lib/comms/approve-and-send.ts).
 */

type Admin = SupabaseClient<Database>

export type Decision = {
  readonly replyId: string
  readonly receivedAt: string
  readonly outcome: string
  readonly confidence: number | null
  readonly theirWords: string
  readonly address: string
  readonly channel: string
  readonly organiser: string | null
  readonly greetingName: string
  readonly ourSubject: string | null
  readonly ourSentAt: string | null
  /** Their message's internet message id, by which its attachments are read from the mailbox. */
  readonly sourceMessageId: string | null
}

/** The name the greeting takes: the person on their own record, else their organisation's team (the gateway's rule). */
export function greetingNameFor(personName: string | null | undefined, organiser: string | null | undefined): string {
  const first = (personName ?? '').trim().split(/\s+/)[0] ?? ''
  if (first) return first
  const org = (organiser ?? '').trim()
  return org ? `${org} team` : ''
}

/** The reply the platform proposes: the greeting, a thank you, a blank line for his answer, and his reply signature. */
export function proposedReply(greetingName: string, replySignature: readonly string[]): string {
  return [`Hi ${greetingName},`, '', 'Thank you for your reply.', '', '', 'Kind regards,', ...replySignature].join('\n')
}

export async function readDecisions(db: Admin, limit = 25): Promise<Decision[]> {
  const r = await db
    .from('outreach_replies')
    .select('id, received_at, outcome, confidence, wording, contact_id, touch_id, source_message_id')
    .eq('needs_lawal', true)
    .order('received_at', { ascending: false })
    .limit(limit)
  if (r.error) throw new Error(`the replies waiting could not be read: ${r.error.message}`)
  const rows = r.data ?? []
  if (rows.length === 0) return []
  const contactIds = [...new Set(rows.map((x) => x.contact_id as string))]
  const touchIds = [...new Set(rows.map((x) => x.touch_id as string | null).filter((x): x is string => Boolean(x)))]
  const [contacts, touches] = await Promise.all([
    db.from('organiser_contacts').select('id, address, channel, person_name, organiser_id').in('id', contactIds),
    touchIds.length ? db.from('outreach_touches').select('id, subject, sent_at').in('id', touchIds) : Promise.resolve({ data: [] as { id: string; subject: string | null; sent_at: string | null }[], error: null }),
  ])
  if (contacts.error) throw new Error(`their contacts could not be read: ${contacts.error.message}`)
  if (touches.error) throw new Error(`the messages they answered could not be read: ${touches.error.message}`)
  // The platform's own listings organisation is never named as the organiser who wrote (growth-reads-skip-the-platform).
  const platform = await readPlatformOrganiserIds(db)
  const orgIds = [...new Set((contacts.data ?? []).map((c) => c.organiser_id as string | null).filter((x): x is string => Boolean(x) && !platform.has(x as string)))]
  const orgs = orgIds.length ? await db.from('organisers').select('id, name').in('id', orgIds) : { data: [] as { id: string; name: string }[], error: null }
  if (orgs.error) throw new Error(`their organisers could not be read: ${orgs.error.message}`)
  const contactOf = new Map((contacts.data ?? []).map((c) => [c.id as string, c]))
  const touchOf = new Map((touches.data ?? []).map((t) => [t.id as string, t]))
  const orgOf = new Map((orgs.data ?? []).map((o) => [o.id as string, o.name as string]))
  return rows.map((x) => {
    const c = contactOf.get(x.contact_id as string)
    const t = x.touch_id ? touchOf.get(x.touch_id as string) : undefined
    const organiser = c?.organiser_id ? orgOf.get(c.organiser_id as string) ?? null : null
    return {
      replyId: x.id as string,
      receivedAt: x.received_at as string,
      outcome: x.outcome as string,
      confidence: (x.confidence as number | null) ?? null,
      theirWords: (x.wording as string) ?? '',
      address: (c?.address as string) ?? '',
      channel: (c?.channel as string) ?? '',
      organiser,
      greetingName: greetingNameFor(c?.person_name as string | null, organiser),
      ourSubject: (t?.subject as string | null) ?? null,
      ourSentAt: (t?.sent_at as string | null) ?? null,
      sourceMessageId: (x.source_message_id as string | null) ?? null,
    }
  })
}
