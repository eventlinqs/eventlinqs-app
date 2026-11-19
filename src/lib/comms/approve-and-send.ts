import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { graphSendMime, type GraphConfig } from '@/lib/outreach/graph'
import { buildOutreachMime, mimeForGraph, newMessageId } from '@/lib/outreach/mime'
import { syncSentItems } from '@/lib/outreach/sent-sync'
import { readVoicePolicy, voiceProblems, type VoicePolicy } from '@/lib/outreach/voice-gate'

/**
 * APPROVE AND SEND (law 30, the CRM directive's section 5: "When I select APPROVE AND SEND: the CRM records my
 * authorisation; the existing EventLinqs sending service sends the message; the system confirms provider acceptance;
 * the communication history updates; the relevant workflow continues. Do not ask me to open Outlook").
 *
 * A reply that waits for Lawal (outreach_replies.needs_lawal) is answered from /admin/comms: his words, checked by the
 * gateway's own rules in the platform (voice-gate.ts, the policy generated from C:\dev\comms-gateway), recorded as his
 * approval (comms_send_approvals: the content's hash, CLEARED_TO_SEND, the policy version, who pressed), then sent by
 * the outreach mailbox through Graph as a reply IN THE ORGANISER'S THREAD: the MIME message names their message in
 * In-Reply-To and both messages in References, under the thread's own subject.
 *
 * Why MIME and not a Graph draft: Graph's createReply needs Mail.ReadWrite ("Application Mail.ReadWrite",
 * https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0, read 19 November 2026), and the
 * outreach app holds Mail.Send and Mail.Read on the outreach mailbox only (C:\dev\GRAPH-CONSENT-15NOV.ps1). The MIME send
 * is the sender's own path (graphSendMime), already proved on 31 letters.
 *
 * Once only: the reply is claimed (needs_lawal true to false, in one conditional update) before anything goes, so a
 * second press finds nothing to answer; a send Graph refuses puts the claim back and keeps the refusal on the record.
 * After Graph accepts it, the Sent Items sync records the message on the organiser's timeline as his reply.
 */

type Admin = SupabaseClient<Database>
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export type ApproveAnswer =
  | { readonly state: 'sent'; readonly messageId: string; readonly to: string; readonly recorded: string }
  | { readonly state: 'refused'; readonly reason: string; readonly problems?: readonly string[] }

/** The thread's subject, once prefixed: 'Re: ' and never 'Re: Re: '. */
export function replySubject(subject: string | null | undefined): string {
  const bare = (subject ?? '').trim().replace(/^((re|fwd?|fw)\s*:\s*)+/i, '').trim()
  return bare ? `Re: ${bare}` : ''
}

/** His words as they go: line endings made one kind, trailing space off every line, no blank run longer than one. */
export function replyText(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** sha256 of the words approved, hex: the approval names exactly what was sent. */
export function replyHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Every reason the gateway's rules refuse the reply; empty when it may go. */
export function replyProblems(
  input: { readonly from: string; readonly to: string; readonly subject: string; readonly greetingName: string; readonly text: string; readonly threadRef: string | null },
  policy: VoicePolicy,
): string[] {
  return voiceProblems(
    { channel: 'email', category: 'reply', from: input.from, to: [input.to], subject: input.subject, greetingName: input.greetingName, body: input.text, threadRef: input.threadRef },
    policy,
  )
}

export async function approveAndSend(
  db: Admin,
  cfg: GraphConfig,
  input: {
    readonly replyId: string
    readonly body: string
    readonly greetingName: string
    readonly by: string
    readonly origin: string
    readonly now?: Date
    readonly fetchImpl?: Fetch
  },
): Promise<ApproveAnswer> {
  const now = input.now ?? new Date()
  const r = await db.from('outreach_replies').select('id, contact_id, touch_id, source_message_id, needs_lawal').eq('id', input.replyId).maybeSingle()
  if (r.error) return { state: 'refused', reason: `the reply could not be read: ${r.error.message}` }
  if (!r.data) return { state: 'refused', reason: 'no such reply' }
  if (!r.data.needs_lawal) return { state: 'refused', reason: 'this reply is already answered' }
  const c = await db.from('organiser_contacts').select('address, channel, unsubscribe_token').eq('id', r.data.contact_id).maybeSingle()
  if (c.error || !c.data) return { state: 'refused', reason: `their contact could not be read${c.error ? `: ${c.error.message}` : ''}` }
  if (c.data.channel !== 'email') return { state: 'refused', reason: `they wrote by ${c.data.channel}; only email is answered from here` }
  const t = r.data.touch_id
    ? await db.from('outreach_touches').select('subject, internet_message_id').eq('id', r.data.touch_id).maybeSingle()
    : { data: null, error: null }
  if (t.error) return { state: 'refused', reason: `the message they answered could not be read: ${t.error.message}` }
  const theirs = (r.data.source_message_id as string | null) ?? null
  const ours = (t.data?.internet_message_id as string | null) ?? null
  const subject = replySubject(t.data?.subject as string | null)
  if (!subject) return { state: 'refused', reason: 'the thread has no subject to answer under' }
  if (!theirs && !ours) return { state: 'refused', reason: 'neither message of the thread has an id, so a reply could not sit in it' }

  let policy: VoicePolicy
  try {
    policy = readVoicePolicy()
  } catch {
    return { state: 'refused', reason: 'POLICY_UNAVAILABLE: the gateway policy could not be read; nothing is sent' }
  }
  const text = replyText(input.body)
  const to = (c.data.address as string).trim().toLowerCase()
  const problems = replyProblems({ from: cfg.mailbox, to, subject, greetingName: input.greetingName.trim(), text, threadRef: theirs ?? ours }, policy)
  if (problems.length > 0) return { state: 'refused', reason: 'the gateway refused these words; nothing was sent', problems }

  // Claim the reply, once.
  const claim = await db.from('outreach_replies').update({ needs_lawal: false, action_taken: `being sent: approved by ${input.by}` }).eq('id', input.replyId).eq('needs_lawal', true).select('id').maybeSingle()
  if (claim.error) return { state: 'refused', reason: `the reply could not be claimed: ${claim.error.message}` }
  if (!claim.data) return { state: 'refused', reason: 'this reply was answered a moment ago' }
  const release = async (why: string) => {
    await db.from('outreach_replies').update({ needs_lawal: true, action_taken: `not sent: ${why}`.slice(0, 500) }).eq('id', input.replyId)
  }

  const messageId = newMessageId()
  const approval = await db
    .from('comms_send_approvals')
    .insert({
      mailbox: cfg.mailbox,
      graph_message_id: messageId,
      content_sha256: replyHash(text),
      gateway_verdict: 'CLEARED_TO_SEND',
      gateway_policy_version: policy.version,
      approved_by: input.by,
      approval_words: 'APPROVE AND SEND pressed in /admin/comms',
      approved_at: now.toISOString(),
      contact_id: r.data.contact_id,
    })
    .select('id')
    .single()
  if (approval.error) {
    await release(`the approval could not be recorded: ${approval.error.message}`)
    return { state: 'refused', reason: `the approval could not be recorded: ${approval.error.message}` }
  }

  const mime = buildOutreachMime({
    fromAddress: cfg.mailbox,
    fromName: 'Lawal Adams',
    to,
    subject,
    text,
    messageId,
    inReplyTo: theirs ?? ours,
    references: [ours, theirs].filter((x): x is string => Boolean(x)),
    date: now,
    origin: input.origin,
    unsubscribeToken: c.data.unsubscribe_token as string,
  })
  try {
    await graphSendMime(cfg, mimeForGraph(mime), input.fetchImpl)
  } catch (fault) {
    const why = `Graph did not accept it: ${fault instanceof Error ? fault.message : String(fault)}`
    await db.from('comms_send_approvals').update({ refused_because: why.slice(0, 500) }).eq('id', approval.data.id)
    await release(why)
    return { state: 'refused', reason: why }
  }
  await db.from('comms_send_approvals').update({ sent_at: now.toISOString(), internet_message_id: messageId, refused_because: null }).eq('id', approval.data.id)
  await db.from('outreach_replies').update({ action_taken: `answered: approved by ${input.by} and sent by the platform at ${now.toISOString()}, ${messageId}` }).eq('id', input.replyId)
  const synced = await syncSentItems(db, cfg, { sinceIso: new Date(now.getTime() - 10 * 60_000).toISOString() }).catch((fault: unknown) => ({ state: 'not synced' as const, why: String(fault) }))
  return {
    state: 'sent',
    messageId,
    to,
    recorded: synced.state === 'synced' ? `Sent Items synced: ${synced.recorded} recorded` : `Sent Items not synced yet (the run every 15 minutes records it): ${synced.why}`,
  }
}
