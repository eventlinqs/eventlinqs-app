import { beforeEach, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildOutreachMime, encodeHeaderValue, outreachOneClickUrl } from '@/lib/outreach/mime'
import { forgetGraphToken, graphReadInbox, graphSendMime, graphToken, GraphError, type GraphConfig } from '@/lib/outreach/graph'
import { clearRecordedOutreachMail, inBusinessHours, recordedOutreachMail, runOutreachSender, transportForMode } from '@/lib/outreach/sender'

/**
 * THE SENDING PATH (src/lib/outreach/mime.ts, graph.ts, sender.ts). The database's own refusals are proved on TEST in
 * SQL (C:\dev\EVIDENCE\CRM-28OCT\send-GREEN.txt and auto-on-224.txt); these prove what this code does with them.
 */

const TOKEN = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
const decode = (mime: string) => Buffer.from(mime.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n/g, ''), 'base64').toString('utf8')

describe('the MIME message', () => {
  const base = {
    fromAddress: 'hello@eventlinqs.com',
    fromName: 'Lawal Adams',
    to: 'sam@venue.example',
    subject: "The Brewpub's Saturday live nights, could I ask you something?",
    text: 'Hi Sam,\nYour nights are on EventLinqs.\n\nKind regards,',
    messageId: '<abc@eventlinqs.com>',
    date: new Date('2026-10-29T00:00:00Z'),
    origin: 'https://www.eventlinqs.com.au',
    unsubscribeToken: TOKEN,
  }
  test('carries the one-click pair at the outreach route, our Message-ID, and a base64 text body', () => {
    const mime = buildOutreachMime(base)
    expect(mime).toContain(`List-Unsubscribe: <https://www.eventlinqs.com.au/api/outreach/one-click-unsubscribe/${TOKEN}>\r\n`)
    expect(mime).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n')
    expect(mime).toContain('Message-ID: <abc@eventlinqs.com>\r\n')
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8\r\n')
    expect(decode(mime)).toBe('Hi Sam,\r\nYour nights are on EventLinqs.\r\n\r\nKind regards,')
  })
  test('a follow-up names the message it follows', () => {
    const mime = buildOutreachMime({ ...base, inReplyTo: '<first@eventlinqs.com>', references: ['<first@eventlinqs.com>'] })
    expect(mime).toContain('In-Reply-To: <first@eventlinqs.com>\r\n')
    expect(mime).toContain('References: <first@eventlinqs.com>\r\n')
  })
  test('a header with a line break is refused, never sent', () => {
    expect(() => buildOutreachMime({ ...base, subject: 'Hello\r\nBcc: someone@else.example' })).toThrow('carries a line break')
  })
  test('the one-click address is https only', () => {
    expect(() => outreachOneClickUrl('http://www.eventlinqs.com.au', TOKEN)).toThrow('https')
  })
  test('a subject that is not plain ASCII is encoded', () => {
    expect(encodeHeaderValue('Café nights')).toBe(`=?UTF-8?B?${Buffer.from('Café nights').toString('base64')}?=`)
  })
})

describe('Graph', () => {
  const cfg: GraphConfig = { tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: 'hello@eventlinqs.com' }
  beforeEach(() => forgetGraphToken())

  test('one token request, reused until shortly before it expires', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3599 }), { status: 200 })
    }
    expect(await graphToken(cfg, fetchImpl, 0)).toBe('tok')
    expect(await graphToken(cfg, fetchImpl, 1000)).toBe('tok')
    expect(calls).toEqual(['https://login.microsoftonline.com/t/oauth2/v2.0/token'])
  })
  test('a send is done only on 202', async () => {
    const fetchImpl = async (url: string, init?: RequestInit) =>
      url.includes('/token') ? new Response(JSON.stringify({ access_token: 'tok', expires_in: 3599 })) : new Response(init?.body === 'b64' ? '' : 'bad', { status: init?.body === 'b64' ? 202 : 400 })
    await expect(graphSendMime(cfg, 'b64', fetchImpl)).resolves.toBeUndefined()
    await expect(graphSendMime(cfg, 'other', fetchImpl)).rejects.toBeInstanceOf(GraphError)
  })
  test('the inbox read asks for text bodies and headers, and follows the next page', async () => {
    const seen: { url: string; prefer: string | null }[] = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      if (url.includes('/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3599 }))
      seen.push({ url, prefer: new Headers(init?.headers).get('prefer') })
      const page = seen.length === 1
        ? { value: [{ id: '1', internetMessageId: '<r1@venue>', subject: 'Re: x', receivedDateTime: '2026-10-29T01:00:00Z', from: { emailAddress: { address: 'Sam@Venue.example', name: 'Sam' } }, body: { content: 'Yes please' }, internetMessageHeaders: [{ name: 'In-Reply-To', value: '<abc@eventlinqs.com>' }] }], '@odata.nextLink': 'https://graph.microsoft.com/next' }
        : { value: [] }
      return new Response(JSON.stringify(page))
    }
    const got = await graphReadInbox(cfg, '2026-10-29T00:00:00Z', fetchImpl)
    expect(seen[0].prefer).toBe('outlook.body-content-type="text"')
    expect(seen[0].url).toContain('internetMessageHeaders')
    expect(seen[1].url).toBe('https://graph.microsoft.com/next')
    expect(got).toEqual([{ graphId: '1', internetMessageId: '<r1@venue>', subject: 'Re: x', fromAddress: 'sam@venue.example', fromName: 'Sam', receivedAt: '2026-10-29T01:00:00Z', text: 'Yes please', headers: { 'in-reply-to': '<abc@eventlinqs.com>' } }])
  })
})

describe('business hours in the recipient zone', () => {
  test('Thursday 10:00 in Melbourne is in; 18:00 and Saturday are not', () => {
    expect(inBusinessHours(new Date('2026-10-28T23:00:00Z'), 'Australia/Melbourne')).toBe(true)
    expect(inBusinessHours(new Date('2026-10-29T07:00:00Z'), 'Australia/Melbourne')).toBe(false)
    expect(inBusinessHours(new Date('2026-10-31T00:00:00Z'), 'Australia/Melbourne')).toBe(false)
  })
  test('the same instant read in Perth is three hours earlier', () => {
    expect(inBusinessHours(new Date('2026-10-28T23:00:00Z'), 'Australia/Perth')).toBe(false)
  })
})

describe('the transport a mode allows', () => {
  test('hold has none; live without credentials has none', () => {
    expect(transportForMode('hold', 'eventlinqs.com', null)).toBeNull()
    expect(transportForMode('live', 'eventlinqs.com', null)).toBeNull()
  })
  test('test mode refuses any address outside the test domain', async () => {
    const t = transportForMode('test', 'eventlinqs.com', null)!
    await expect(t.send({ to: 'sam@venue.example', base64Mime: 'x', messageId: '<a@b>' })).rejects.toThrow('test mode reaches only @eventlinqs.com')
  })
})

/** A stand-in for the service client: every call is answered by the test's own table of answers. */
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
function fakeDb(answer: (call: Call, shape: 'many' | 'one') => { data: unknown; error: { message: string } | null }) {
  const calls: Call[] = []
  const builder = (call: Call) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'limit']) b[m] = () => b
    for (const m of ['eq', 'lte', 'neq']) b[m] = (col: string, val: unknown) => (call.filters.push([`${m}:${col}`, val]), b)
    b.not = (col: string, _op: string, val: unknown) => (call.filters.push([`not:${col}`, val]), b)
    b.single = async () => answer(call, 'one')
    b.maybeSingle = async () => answer(call, 'one')
    b.then = (resolve: (v: unknown) => unknown) => resolve(answer(call, 'many'))
    return b
  }
  const db = {
    from: (table: string) => ({
      select: () => { const call = { table, op: 'select', filters: [] }; calls.push(call); return builder(call) },
      update: (payload: unknown) => { const call = { table, op: 'update', payload, filters: [] }; calls.push(call); return builder(call) },
    }),
    rpc: async (name: string) => { calls.push({ table: `rpc:${name}`, op: 'rpc', filters: [] }); return answer({ table: `rpc:${name}`, op: 'rpc', filters: [] }, 'one') },
  }
  return { db: db as unknown as SupabaseClient<Database>, calls }
}

const THURSDAY_10_MELBOURNE = new Date('2026-10-28T23:00:00Z')
const QUEUED = [
  { id: 'q-ok', contact_id: 'c-ok', subject: 'Your nights', body: 'Hi Sam,\nEventLinqs.', in_reply_to: null },
  { id: 'q-refused', contact_id: 'c-ok', subject: 'Your nights', body: 'Hi Jo,\nEventLinqs.', in_reply_to: null },
]

function standardDb(mode: string, opts: { refuse?: string[]; address?: string } = {}) {
  return fakeDb((call) => {
    if (call.table === 'outreach_sender') return { data: { mode, from_address: 'hello@eventlinqs.com', test_domain: 'eventlinqs.com' }, error: null }
    if (call.table === 'rpc:outreach_close_stuck_sends') return { data: 0, error: null }
    if (call.table === 'outreach_touches' && call.op === 'select' && call.filters.some(([k, v]) => k === 'eq:state' && v === 'queued')) return { data: QUEUED, error: null }
    if (call.table === 'outreach_touches' && call.op === 'select') return { data: [], error: null }
    if (call.table === 'organiser_contacts' && call.op === 'select') return { data: { organiser_id: 'o1', address: opts.address ?? 'sam@eventlinqs.com', unsubscribe_token: TOKEN }, error: null }
    if (call.table === 'organiser_venues') return { data: [], error: null }
    if (call.table === 'outreach_touches' && call.op === 'update') {
      const id = call.filters.find(([k]) => k === 'eq:id')?.[1] as string
      const to = (call.payload as { state: string }).state
      if (to === 'sending' && opts.refuse?.includes(id)) return { data: null, error: { message: 'refused: the play has sent its 20 for today.' } }
      return { data: { id }, error: null }
    }
    return { data: null, error: { message: `unexpected ${call.op} on ${call.table}` } }
  })
}

describe('the run', () => {
  beforeEach(() => clearRecordedOutreachMail())

  test('on hold nothing is claimed and nothing leaves', async () => {
    const { db, calls } = standardDb('hold')
    const r = await runOutreachSender(db, { now: THURSDAY_10_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.note).toBe('the sender is on hold: nothing is claimed')
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  test('a claim the database refuses stays queued and is reported in its words; the other is sent with our Message-ID', async () => {
    const { db, calls } = standardDb('test', { refuse: ['q-refused'] })
    const r = await runOutreachSender(db, { now: THURSDAY_10_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.sent).toEqual(['q-ok'])
    expect(r.refused).toEqual([{ id: 'q-refused', reason: 'the play has sent its 20 for today.' }])
    const sentUpdate = calls.find((c) => c.op === 'update' && (c.payload as { state: string }).state === 'sent')
    const mail = recordedOutreachMail()
    expect(mail).toHaveLength(1)
    expect((sentUpdate?.payload as { internet_message_id: string }).internet_message_id).toBe(mail[0].messageId)
    expect(sentUpdate?.filters).toContainEqual(['eq:state', 'sending'])
  })

  test('test mode fails a message to an outside address, and the row says why', async () => {
    const { db, calls } = standardDb('test', { address: 'sam@venue.example' })
    const r = await runOutreachSender(db, { now: THURSDAY_10_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.sent).toEqual([])
    expect(r.failed[0].reason).toContain('test mode reaches only @eventlinqs.com')
    expect(calls.some((c) => c.op === 'update' && (c.payload as { state: string }).state === 'failed')).toBe(true)
    expect(recordedOutreachMail()).toHaveLength(0)
  })

  test('outside business hours nothing is claimed', async () => {
    const { db, calls } = standardDb('test')
    const r = await runOutreachSender(db, { now: new Date('2026-10-31T00:00:00Z'), origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.outsideHours).toBe(2)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })
})
