import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { draftContentHash, draftWords } from '@/lib/outreach/draft-content.mjs'
import { sendApprovedDraft } from '@/lib/outreach/send-approved'
import { approvalInsert, sqlText } from '../../../scripts/ops/comms-approve.mjs'
import type { Database } from '@/types/database'

/*
 * THE PLATFORM SENDS AN APPROVED DRAFT (the PM's 11:55 of 19 November 2026; Lawal at 11:43: "Go send it right now").
 * The case: the reply to Aria of Asia Oasis, cleared by the gateway at 11:50, its send refused by the gateway's hook
 * because no agent sends. The platform sends it, by its Graph id, only when an approval names it and its words are the
 * cleared ones.
 */
const OWN = "<p>Hi Aria,</p><p>Thank you so much for the photographs, and for setting us straight on the venue.</p><p>I'm sorry the upload on our website didn't work for you. We've found why, and we're fixing it.</p><p>Kind regards,<br />Lawal Adams<br />Founder, EventLinqs</p>"
const QUOTE = "<hr /><div><b>From:</b> Asia Oasis Admin &lt;info@asiaoasis.com.au&gt;<br /><b>Sent:</b> Thursday, 19 November 2026 09:19:50</div><div><p>Hi Lawal,</p><p>20–22 November</p></div>"
const DRAFT_ID = 'AAMkADM1YWVjZGVjLTVjNzItNDY5Zi1hODdlLTU4MTEzOWI0ZTdjOABGAAAAAAEPAACoKtg7AAA='
const CFG = { tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: 'hello@eventlinqs.com' }

describe("a draft's own words", () => {
  it("are the gateway's own part: the quoted original is cut, so the full draft and its own words hash the same", () => {
    expect(draftWords(`\r\n${OWN}${QUOTE}`)).toBe("Hi Aria, Thank you so much for the photographs, and for setting us straight on the venue. I'm sorry the upload on our website didn't work for you. We've found why, and we're fixing it. Kind regards, Lawal Adams Founder, EventLinqs")
    expect(draftContentHash(`\r\n${OWN}${QUOTE}`)).toBe(draftContentHash(OWN))
  })
  it('DRILL: one word changed is a different hash', () => {
    expect(draftContentHash(OWN.replace('fixing it', 'looking at it'))).not.toBe(draftContentHash(OWN))
  })
})

type Call = { url: string; method: string }
function fakeGraph(draft: { isDraft: boolean; body: string }, sendStatus = 202) {
  const calls: Call[] = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' })
    if (url.includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'x', expires_in: 3600 }), { status: 200 })
    if (url.endsWith('/send')) return new Response(sendStatus === 202 ? null : 'Access is denied.', { status: sendStatus })
    if (url.includes('/messages/')) return new Response(JSON.stringify({ isDraft: draft.isDraft, subject: 'RE: Helping more people find Colours of Asia', toRecipients: [{ emailAddress: { address: 'info@asiaoasis.com.au' } }], body: { contentType: 'html', content: draft.body }, internetMessageId: '<reply@outlook>' }), { status: 200 })
    return new Response('not stubbed', { status: 500 })
  }
  return { fetchImpl, calls }
}

function fakeDb(row: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = []
  const chain = (table: string, op: string, payload?: Record<string, unknown>) => {
    if (op === 'update' && payload) updates.push(payload)
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lt', 'not']) b[m] = () => b
    const answer = table === 'comms_send_approvals' && op === 'select' ? { data: row, error: null } : table === 'comms_send_approvals' ? { data: null, error: null } : { data: null, error: { message: 'not in this test' } }
    b.maybeSingle = async () => answer
    b.single = async () => answer
    b.then = (ok: (v: unknown) => unknown) => ok(answer)
    return b
  }
  const db = { from: (t: string) => ({ select: () => chain(t, 'select'), update: (p: Record<string, unknown>) => chain(t, 'update', p), insert: () => chain(t, 'insert') }), rpc: async () => ({ data: null, error: { message: 'not in this test' } }) }
  return { db: db as unknown as SupabaseClient<Database>, updates }
}

const APPROVED = { id: 'a1', mailbox: 'hello@eventlinqs.com', content_sha256: draftContentHash(OWN), gateway_verdict: 'CLEARED_TO_SEND', approved_at: '2026-11-19T00:50:00Z', sent_at: null }
const sends = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/send'))

describe('the send', () => {
  it('an approved draft whose words are the cleared ones is sent as itself, by its Graph id, and recorded', async () => {
    const g = fakeGraph({ isDraft: true, body: `\r\n${OWN}${QUOTE}` })
    const { db, updates } = fakeDb(APPROVED)
    const answer = await sendApprovedDraft(db, CFG, DRAFT_ID, { fetchImpl: g.fetchImpl, now: new Date('2026-11-19T03:00:00Z') })
    expect(answer).toMatchObject({ state: 'sent', internetMessageId: '<reply@outlook>' })
    expect(sends(g.calls).map((c) => c.url)).toEqual([`https://graph.microsoft.com/v1.0/users/hello%40eventlinqs.com/messages/${encodeURIComponent(DRAFT_ID)}/send`])
    expect(updates).toContainEqual({ sent_at: '2026-11-19T03:00:00.000Z', internet_message_id: '<reply@outlook>', refused_because: null })
  })
  it('DRILL: no approval record names it, so nothing is read or sent', async () => {
    const g = fakeGraph({ isDraft: true, body: OWN })
    const answer = await sendApprovedDraft(fakeDb(null).db, CFG, DRAFT_ID, { fetchImpl: g.fetchImpl })
    expect(answer).toEqual({ state: 'refused', reason: 'no approval record names this draft' })
    expect(g.calls).toEqual([])
  })
  it('DRILL: the draft was edited after its approval, so it is refused and never sent', async () => {
    const g = fakeGraph({ isDraft: true, body: OWN.replace('fixing it', 'looking at it') })
    const { db, updates } = fakeDb(APPROVED)
    const answer = await sendApprovedDraft(db, CFG, DRAFT_ID, { fetchImpl: g.fetchImpl })
    expect(answer.state).toBe('refused')
    expect((answer as { reason: string }).reason).toMatch(/^the draft's words changed after their approval/)
    expect(sends(g.calls)).toEqual([])
    expect(updates[0]).toMatchObject({ refused_because: expect.stringMatching(/changed after their approval/) })
  })
  it('a draft already sent, or one Graph refuses, is said in words and never marked sent', async () => {
    expect(await sendApprovedDraft(fakeDb({ ...APPROVED, sent_at: '2026-11-19T02:00:00Z' }).db, CFG, DRAFT_ID, { fetchImpl: fakeGraph({ isDraft: true, body: OWN }).fetchImpl })).toEqual({ state: 'refused', reason: 'already sent at 2026-11-19T02:00:00Z' })
    expect(await sendApprovedDraft(fakeDb(APPROVED).db, CFG, DRAFT_ID, { fetchImpl: fakeGraph({ isDraft: false, body: OWN }).fetchImpl })).toMatchObject({ state: 'refused', reason: 'it is no longer a draft (sent or moved)' })
    const refused = fakeDb(APPROVED)
    const answer = await sendApprovedDraft(refused.db, CFG, DRAFT_ID, { fetchImpl: fakeGraph({ isDraft: true, body: OWN }, 403).fetchImpl })
    expect((answer as { reason: string }).reason).toMatch(/^Graph did not accept it: Graph send answered 403: Access is denied/)
    expect(refused.updates.some((u) => 'sent_at' in u)).toBe(false)
  })
})

describe('the route and the approval workflow', () => {
  it('the route is a machine call behind CRON_SECRET and answers with state and ids, never the words of the letter', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/ops/comms/send-approved/route.ts'), 'utf8')
    expect(route).toContain('const denied = requireCronAuth(request)')
    expect(route).not.toMatch(/bodyHtml|draftWords/)
  })
  it('the approval is one insert, every value quoted, and it never overwrites an approval already recorded', () => {
    expect(sqlText("Aria's")).toBe("'Aria''s'")
    const sql = approvalInsert({ mailbox: 'hello@eventlinqs.com', graphMessageId: DRAFT_ID, sha: 'a'.repeat(64), policy: 'p1', by: 'lawal', words: "Go send it right now" })
    expect(sql).toMatch(/^insert into public\.comms_send_approvals \(/)
    expect(sql).toContain("'CLEARED_TO_SEND'")
    expect(sql).toMatch(/on conflict \(graph_message_id\) do nothing returning id;$/)
  })
})
