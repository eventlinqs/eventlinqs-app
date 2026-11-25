import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'

/**
 * WHAT WAITS FOR LAWAL'S DECISION IN THE COMMUNICATIONS CENTRE (law 30, the CRM directive's section 5: "the organiser
 * name and the associated event; the incoming message and the relevant conversation history; the proposed response").
 * Every reply the inbox run held for him (outreach_replies.needs_lawal), newest first, with who wrote, from which
 * organiser, their words, and the message of ours they answered; and the answer the engine drafted in their thread, if it
 * drafted one (APPROVE AND SEND, src/lib/comms/approve-and-send.ts, sends it).
 *
 * WITH THE PM, NEVER A BLANK TEMPLATE (Lawal, 25 November 2026, 07:08: "Don't ever make me go to my admin page and see
 * that message, ever."; the PM's 07:09 items 1 and 2): replies go by themselves (src/lib/outreach/self-queue.ts
 * queueApprovedReplies); the rare one held goes to the PM, who shows Lawal the words in his chat. What is shown here is
 * the drafted answer or nothing: never a bare thanks for their reply with an empty body, never a team greeted when the
 * sender gave their own name (src/lib/outreach/replies.ts recordSenderName). tests/unit/comms/no-template-reply.test.ts
 * fails the build if a proposal can be either.
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
  /** Why it was not answered by itself, as the inbox run recorded it (its action), or null. */
  readonly why: string | null
  /** The answer the engine drafted in their thread (not withdrawn), newest first, or null when none was drafted. */
  readonly drafted: string | null
}

/** The name the greeting takes: the person on their own record, else their organisation's team (the gateway's rule). */
export function greetingNameFor(personName: string | null | undefined, organiser: string | null | undefined): string {
  const first = (personName ?? '').trim().split(/\s+/)[0] ?? ''
  if (first) return first
  const org = (organiser ?? '').trim()
  return org ? `${org} team` : ''
}

/** A line that answers nothing: a thank you for their reply or their email, alone. */
const TEMPLATE_ONLY = /^(thank you|thanks)( so much| very much)? for (your|the) (reply|email|e-mail|message|response)\.?$/i

/**
 * The answer shown for a held reply: the one the engine drafted in their thread, else null (nothing is proposed: the PM
 * writes it). A draft that is only a greeting, a thank you and a signature is no answer, and is never shown as one. Pure.
 */
export function proposalFor(drafted: string | null | undefined): string | null {
  const text = (drafted ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return null
  const own = text.split('\n').filter((l) => l.trim() !== '')
  const k = own.findIndex((l) => /^Kind regards,?$/.test(l.trim()))
  const between = (k < 0 ? own.slice(1) : own.slice(1, k)).map((l) => l.trim()).filter((l) => !TEMPLATE_ONLY.test(l))
  return between.length === 0 ? null : text
}

export async function readDecisions(db: Admin, limit = 25): Promise<Decision[]> {
  const r = await db
    .from('outreach_replies')
    .select('id, received_at, outcome, confidence, wording, contact_id, touch_id, source_message_id, action_taken')
    .eq('needs_lawal', true)
    .order('received_at', { ascending: false })
    .limit(limit)
  if (r.error) throw new Error(`the replies waiting could not be read: ${r.error.message}`)
  const rows = r.data ?? []
  if (rows.length === 0) return []
  const contactIds = [...new Set(rows.map((x) => x.contact_id as string))]
  const touchIds = [...new Set(rows.map((x) => x.touch_id as string | null).filter((x): x is string => Boolean(x)))]
  const messageIds = [...new Set(rows.map((x) => x.source_message_id as string | null).filter((x): x is string => Boolean(x)))]
  const [contacts, touches, drafts] = await Promise.all([
    db.from('organiser_contacts').select('id, address, channel, person_name, organiser_id').in('id', contactIds),
    touchIds.length ? db.from('outreach_touches').select('id, subject, sent_at').in('id', touchIds) : Promise.resolve({ data: [] as { id: string; subject: string | null; sent_at: string | null }[], error: null }),
    messageIds.length
      ? db.from('outreach_touches').select('in_reply_to, body, drafted_at').in('in_reply_to', messageIds).neq('state', 'void').order('drafted_at', { ascending: false })
      : Promise.resolve({ data: [] as { in_reply_to: string | null; body: string; drafted_at: string | null }[], error: null }),
  ])
  if (contacts.error) throw new Error(`their contacts could not be read: ${contacts.error.message}`)
  if (touches.error) throw new Error(`the messages they answered could not be read: ${touches.error.message}`)
  if (drafts.error) throw new Error(`the answers drafted in their threads could not be read: ${drafts.error.message}`)
  const draftOf = new Map<string, string>()
  for (const d of drafts.data ?? []) if (d.in_reply_to && !draftOf.has(d.in_reply_to as string)) draftOf.set(d.in_reply_to as string, d.body as string)
  // The platform's own listings organisation is never named as the organiser who wrote (growth-reads-skip-the-platform).
  // A test organiser is named, so a test reply waits here like a real one (the PM's 02:39 of 20 November 2026, item 5).
  const platform = await readPlatformOrganiserIds(db, { keepTests: true })
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
      why: (x.action_taken as string | null) ?? null,
      drafted: x.source_message_id ? proposalFor(draftOf.get(x.source_message_id as string)) : null,
    }
  })
}
