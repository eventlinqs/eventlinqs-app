import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { draftContentHash } from './draft-content.mjs'
import { graphToken, GraphError, type GraphConfig } from './graph'
import { syncSentItems } from './sent-sync'

/**
 * THE PLATFORM SENDS AN APPROVED DRAFT (the PM's 11:55 of 19 November 2026; Lawal at 11:43: "Go send it right now";
 * the standing rule since the PM's 11:50: when Lawal says send, the platform sends, and no one hands him a Send button).
 *
 * A draft in the outreach mailbox is sent by its own Graph id, so it goes as itself, a reply in its own thread, never a
 * new message. It goes only when an approval record names it (comms_send_approvals: the gateway's CLEARED_TO_SEND for
 * that exact content, the approval's own words, who gave it) AND the draft Graph holds now has the same own words as
 * the cleared ones (./draft-content.mjs). Anything else is refused and says why; a refusal is kept on the record.
 * After Graph accepts it (202), the sent message is recorded as a touch by the Sent Items sync (./sent-sync.ts), through
 * the database's own rules, as every message from this mailbox is.
 *
 * Graph, from Microsoft's own pages (read 19 November 2026):
 *   read   GET /users/{mailbox}/messages/{id}?$select=... with Prefer: outlook.body-content-type="html"
 *          https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0
 *   send   POST /users/{mailbox}/messages/{id}/send, no body; 202 Accepted. Application permission Mail.Send.
 *          https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0
 */

type Admin = SupabaseClient<Database>
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const GRAPH = 'https://graph.microsoft.com/v1.0'

export type DraftRead = {
  readonly isDraft: boolean
  readonly subject: string
  readonly to: readonly string[]
  readonly bodyHtml: string
  readonly internetMessageId: string | null
}

/** The draft as Graph holds it now. */
export async function graphReadDraft(cfg: GraphConfig, id: string, fetchImpl: Fetch = fetch): Promise<DraftRead> {
  const token = await graphToken(cfg, fetchImpl)
  const url = `${GRAPH}/users/${encodeURIComponent(cfg.mailbox)}/messages/${encodeURIComponent(id)}?$select=isDraft,subject,toRecipients,body,internetMessageId`
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, prefer: 'outlook.body-content-type="html"' } })
  if (!res.ok) throw new GraphError('read', res.status, await res.text().catch(() => ''))
  const m = (await res.json()) as {
    isDraft?: boolean
    subject?: string
    toRecipients?: { emailAddress?: { address?: string } }[]
    body?: { content?: string }
    internetMessageId?: string
  }
  return {
    isDraft: m.isDraft === true,
    subject: m.subject ?? '',
    to: (m.toRecipients ?? []).map((r) => (r.emailAddress?.address ?? '').toLowerCase()).filter(Boolean),
    bodyHtml: m.body?.content ?? '',
    internetMessageId: m.internetMessageId ?? null,
  }
}

/** Sends the draft as itself. 202 is accepted; anything else is thrown with Graph's own words. */
export async function graphSendDraft(cfg: GraphConfig, id: string, fetchImpl: Fetch = fetch): Promise<void> {
  const token = await graphToken(cfg, fetchImpl)
  const res = await fetchImpl(`${GRAPH}/users/${encodeURIComponent(cfg.mailbox)}/messages/${encodeURIComponent(id)}/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-length': '0' },
  })
  if (res.status !== 202) throw new GraphError('send', res.status, await res.text().catch(() => ''))
}

export type SendAnswer =
  | { readonly state: 'sent'; readonly internetMessageId: string | null; readonly recorded: string }
  | { readonly state: 'refused'; readonly reason: string }

/** Sends one approved draft by its Graph id, or refuses and says why. */
export async function sendApprovedDraft(db: Admin, cfg: GraphConfig, graphMessageId: string, deps: { fetchImpl?: Fetch; now?: Date } = {}): Promise<SendAnswer> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? new Date()
  const row = await db
    .from('comms_send_approvals')
    .select('id, mailbox, content_sha256, gateway_verdict, approved_at, sent_at')
    .eq('graph_message_id', graphMessageId)
    .maybeSingle()
  if (row.error) return { state: 'refused', reason: `the approval could not be read: ${row.error.message}` }
  if (!row.data) return { state: 'refused', reason: 'no approval record names this draft' }
  const refuse = async (reason: string): Promise<SendAnswer> => {
    await db.from('comms_send_approvals').update({ refused_because: reason }).eq('id', row.data!.id).is('sent_at', null)
    return { state: 'refused', reason }
  }
  if (row.data.sent_at) return { state: 'refused', reason: `already sent at ${row.data.sent_at}` }
  if (row.data.gateway_verdict !== 'CLEARED_TO_SEND') return refuse('the gateway did not clear it')
  if ((row.data.mailbox as string).toLowerCase() !== cfg.mailbox.toLowerCase()) return refuse(`it was approved for ${row.data.mailbox}, not ${cfg.mailbox}`)

  let draft: DraftRead
  try {
    draft = await graphReadDraft(cfg, graphMessageId, fetchImpl)
  } catch (fault) {
    return refuse(`the draft could not be read: ${fault instanceof Error ? fault.message : String(fault)}`)
  }
  if (!draft.isDraft) return refuse('it is no longer a draft (sent or moved)')
  const hash = draftContentHash(draft.bodyHtml)
  if (hash !== row.data.content_sha256) return refuse(`the draft's words changed after their approval (now ${hash.slice(0, 12)}, approved ${(row.data.content_sha256 as string).slice(0, 12)})`)

  try {
    await graphSendDraft(cfg, graphMessageId, fetchImpl)
  } catch (fault) {
    return refuse(`Graph did not accept it: ${fault instanceof Error ? fault.message : String(fault)}`)
  }
  const done = await db
    .from('comms_send_approvals')
    .update({ sent_at: now.toISOString(), internet_message_id: draft.internetMessageId ?? `graph:${graphMessageId}`, refused_because: null })
    .eq('id', row.data.id)
  if (done.error) return { state: 'sent', internetMessageId: draft.internetMessageId, recorded: `sent, but its record was not written: ${done.error.message}` }
  // The touch: the Sent Items sync records it through the database's own rules, as every message from this mailbox is.
  const since = new Date(Date.parse(row.data.approved_at as string) - 10 * 60_000).toISOString()
  const synced = await syncSentItems(db, cfg, { sinceIso: since }).catch((fault: unknown) => ({ state: 'not synced' as const, why: String(fault) }))
  return {
    state: 'sent',
    internetMessageId: draft.internetMessageId,
    recorded: synced.state === 'synced' ? `Sent Items synced: ${synced.recorded} recorded, ${synced.alreadyRecorded} already` : `Sent Items not synced yet: ${synced.why}`,
  }
}
