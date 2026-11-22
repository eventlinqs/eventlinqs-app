import { beforeEach, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildOutreachMime, encodeHeaderValue, outreachOneClickUrl } from '@/lib/outreach/mime'
import { forgetGraphToken, graphReadInbox, graphSendMime, graphToken, GraphError, type GraphConfig } from '@/lib/outreach/graph'
import {
  businessHoursApply,
  clearRecordedOutreachMail,
  DEFAULT_SEND_WINDOW,
  inBusinessHours,
  recordedOutreachMail,
  runOutreachSender,
  sendWindowOf,
  sendWindowWords,
  transportForMode,
} from '@/lib/outreach/sender'
import { HELLO_MAILBOX, LAWAL_MAILBOX } from '@/lib/outreach/addresses'

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
    expect(got).toEqual([{ graphId: '1', internetMessageId: '<r1@venue>', subject: 'Re: x', fromAddress: 'sam@venue.example', fromName: 'Sam', receivedAt: '2026-10-29T01:00:00Z', text: 'Yes please', headers: { 'in-reply-to': '<abc@eventlinqs.com>' }, hasAttachments: false }])
  })
})

describe('business hours in the recipient zone', () => {
  // LAW 44 (Lawal, 21 November 2026, 01:16): Monday to Saturday, from 06:00 and out before 09:00 in the recipient's
  // city; never on a Sunday, never between nine and five.
  test('Saturday 07:00 and Thursday 06:00 in Melbourne are in; a Sunday, 09:00, Thursday 10:00 and 05:59 are refused', () => {
    expect(inBusinessHours(new Date('2026-10-30T20:00:00Z'), 'Australia/Melbourne')).toBe(true)
    expect(inBusinessHours(new Date('2026-10-28T19:00:00Z'), 'Australia/Melbourne')).toBe(true)
    expect(inBusinessHours(new Date('2026-10-31T20:00:00Z'), 'Australia/Melbourne')).toBe(false)
    expect(inBusinessHours(new Date('2026-10-30T22:00:00Z'), 'Australia/Melbourne')).toBe(false)
    expect(inBusinessHours(new Date('2026-10-28T23:00:00Z'), 'Australia/Melbourne')).toBe(false)
    expect(inBusinessHours(new Date('2026-10-30T18:59:00Z'), 'Australia/Melbourne')).toBe(false)
  })
  test('the stored window is read, and a malformed one is never guessed at', () => {
    const sundays = sendWindowOf({ send_days: [7], send_from_minute: 360, send_until_minute: 540 })
    expect(inBusinessHours(new Date('2026-10-31T20:00:00Z'), 'Australia/Melbourne', sundays)).toBe(true)
    expect(inBusinessHours(new Date('2026-10-30T20:00:00Z'), 'Australia/Melbourne', sundays)).toBe(false)
    expect(sendWindowOf(null)).toEqual(DEFAULT_SEND_WINDOW)
    expect(sendWindowOf({ send_days: [], send_from_minute: 360, send_until_minute: 540 })).toEqual(DEFAULT_SEND_WINDOW)
    expect(sendWindowOf({ send_days: [1, 8], send_from_minute: 360, send_until_minute: 540 })).toEqual(DEFAULT_SEND_WINDOW)
    expect(sendWindowOf({ send_days: [6], send_from_minute: 540, send_until_minute: 360 })).toEqual(DEFAULT_SEND_WINDOW)
    expect(DEFAULT_SEND_WINDOW).toEqual({ days: [1, 2, 3, 4, 5, 6], fromMinute: 360, untilMinute: 540 })
    expect(sendWindowWords(DEFAULT_SEND_WINDOW)).toBe('Monday to Saturday, 06:00 to 09:00')
  })
  test('the same instant read in Perth is three hours earlier: 07:00 in Melbourne is 04:00 there, outside', () => {
    expect(inBusinessHours(new Date('2026-10-28T20:00:00Z'), 'Australia/Melbourne')).toBe(true)
    expect(inBusinessHours(new Date('2026-10-28T20:00:00Z'), 'Australia/Perth')).toBe(false)
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
    for (const m of ['select', 'order', 'limit', 'range']) b[m] = () => b
    for (const m of ['eq', 'lte', 'neq', 'in', 'gte', 'ilike', 'is']) b[m] = (col: string, val: unknown) => (call.filters.push([`${m}:${col}`, val]), b)
    b.not = (col: string, _op: string, val: unknown) => (call.filters.push([`not:${col}`, val]), b)
    b.single = async () => answer(call, 'one')
    b.maybeSingle = async () => answer(call, 'one')
    // A read of many rows answers a list, as PostgREST does, whatever row the test's table names.
    b.then = (resolve: (v: unknown) => unknown) => {
      const r = answer(call, 'many')
      return resolve(r.data !== null && typeof r.data === 'object' && !Array.isArray(r.data) ? { ...r, data: [r.data] } : r)
    }
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

// Inside law 44's window (Monday to Saturday, 06:00 to before 09:00 in the recipient's city): Thursday 07:00, Melbourne.
const THURSDAY_7_MELBOURNE = new Date('2026-10-28T20:00:00Z')
const QUEUED = [
  { id: 'q-ok', comms_category: 'PERM', contact_id: 'c-ok', subject: 'Your nights', body: 'Hi Sam,\nEventLinqs.', in_reply_to: null },
  { id: 'q-refused', comms_category: 'PERM', contact_id: 'c-ok', subject: 'Your nights', body: 'Hi Jo,\nEventLinqs.', in_reply_to: null },
]

function standardDb(mode: string, opts: { refuse?: string[]; address?: string; queued?: unknown[] } = {}) {
  return fakeDb((call, shape) => {
    if (call.table === 'outreach_sender') return { data: { mode, from_address: 'hello@eventlinqs.com', test_domain: 'eventlinqs.com' }, error: null }
    if (call.table === 'rpc:outreach_close_stuck_sends') return { data: 0, error: null }
    if (call.table === 'outreach_touches' && call.op === 'select' && call.filters.some(([k, v]) => k === 'eq:state' && v === 'queued')) return { data: opts.queued ?? QUEUED, error: null }
    if (call.table === 'outreach_touches' && call.op === 'select') return { data: [], error: null }
    if (call.table === 'organiser_contacts' && call.op === 'select') return { data: { id: 'c-ok', organiser_id: 'o1', address: opts.address ?? 'sam@eventlinqs.com', unsubscribe_token: TOKEN, basis: 'conspicuous_publication' }, error: null }
    if (call.table === 'organiser_venues') return { data: [], error: null }
    // The contact policy's reads (src/lib/outreach/contact-policy.ts): an organiser with no account, nothing heard back,
    // no address suppressed, nothing bounced.
    if (call.table === 'organisations') return { data: [], error: null }
    if (call.table === 'organisers') return shape === 'many' ? { data: [], error: null } : { data: { organisation_id: null }, error: null }
    if (['outreach_replies', 'outreach_unsubscribes', 'outreach_delivery_events'].includes(call.table)) return { data: [], error: null }
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
    const r = await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.note).toBe('the sender is on hold: nothing is claimed')
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  test('a claim the database refuses stays queued and is reported in its words; the other is sent with our Message-ID', async () => {
    const { db, calls } = standardDb('test', { refuse: ['q-refused'] })
    const r = await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
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
    const r = await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.sent).toEqual([])
    expect(r.failed[0].reason).toContain('test mode reaches only @eventlinqs.com')
    expect(calls.some((c) => c.op === 'update' && (c.payload as { state: string }).state === 'failed')).toBe(true)
    expect(recordedOutreachMail()).toHaveLength(0)
  })

  test('on a Sunday nothing is claimed for an organiser (07:00 on Sunday in Melbourne)', async () => {
    const { db, calls } = standardDb('test', { address: 'sam@venue.example' })
    const r = await runOutreachSender(db, { now: new Date('2026-10-31T20:00:00Z'), origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.outsideHours).toBe(2)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  // The PM's 00:10 of 21 November 2026, item 2 (Lawal's 'start now'): business hours protect a recipient; our own test
  // mailbox is not one, so a letter to an address on the sender's own test domain goes at any hour.
  test('our own test mailbox is sent outside business hours; an organiser never is', async () => {
    const { db } = standardDb('test')
    const r = await runOutreachSender(db, { now: new Date('2026-10-31T20:00:00Z'), origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.outsideHours).toBe(0)
    expect(r.sent.length).toBeGreaterThan(0)
    expect(businessHoursApply('sam@eventlinqs.com', 'eventlinqs.com')).toBe(false)
    expect(businessHoursApply('SAM@EventLinqs.com', 'eventlinqs.com')).toBe(false)
    expect(businessHoursApply('sam@venue.example', 'eventlinqs.com')).toBe(true)
    expect(businessHoursApply('sam@eventlinqs.com.evil.example', 'eventlinqs.com')).toBe(true)
    expect(businessHoursApply(null, 'eventlinqs.com')).toBe(true)
    expect(businessHoursApply('sam@eventlinqs.com', null)).toBe(true)
  })

  // LAW 42 (Lawal, 20 November 2026, 23:58): a letter whose slot fell on a missed day is never sent as that day's.
  test('a letter from a missed day is re planned from today; one whose words name a time is held for a redraft', async () => {
    const yesterday = '2026-10-27T20:00:00Z' // Wednesday 28 October, 07:00 in Melbourne; the run is Thursday the 29th
    const { db, calls } = standardDb('test', {
      queued: [
        { ...QUEUED[0], scheduled_for: yesterday },
        { ...QUEUED[1], id: 'q-dated', body: 'Hi Jo,\nYour night on Saturday is on our guide. EventLinqs.', scheduled_for: yesterday },
      ],
    })
    const r = await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    const updates = calls.filter((c) => c.op === 'update' && c.table === 'outreach_touches')
    const ofRow = (id: string) => updates.filter((c) => c.filters.some(([k, v]) => k === 'eq:id' && v === id)).map((c) => c.payload as Record<string, unknown>)
    expect(ofRow('q-ok')[0]).toEqual({ scheduled_for: THURSDAY_7_MELBOURNE.toISOString() })
    expect(ofRow('q-dated')[0]).toMatchObject({ state: 'held' })
    expect(String((ofRow('q-dated')[0].held_because as string[])[0])).toContain("its words name a time ('Saturday')")
    expect(ofRow('q-dated').some((p) => p.state === 'sending' || p.state === 'sent')).toBe(false)
    expect(r.replanned).toHaveLength(2)
  })

  // LAW 33 (a), the PM's 00:50 of 21 November 2026, item 1: the run itself, not only the table, sends an acquisition
  // letter from lawal@ and a permission request from hello@, whatever outreach_sender.from_address reads.
  test('an acquisition letter leaves the run from lawal@, a permission request from hello@', async () => {
    const { db } = standardDb('test', { queued: [{ ...QUEUED[0], comms_category: 'ACQ' }, { ...QUEUED[1], comms_category: 'PERM' }] })
    await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    const mail = recordedOutreachMail()
    expect(mail.map((m) => m.from)).toEqual([LAWAL_MAILBOX, HELLO_MAILBOX])
  })

  test("a letter slotted earlier today, or with no slot, is today's and is not re planned", async () => {
    const { db } = standardDb('test', { queued: [{ ...QUEUED[0], scheduled_for: '2026-10-28T19:30:00Z' }, { ...QUEUED[1] }] })
    const r = await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.replanned ?? []).toEqual([])
  })
})

/*
 * ONE LETTER A RUN (the PM's 08:20 of 18 November 2026): the letters go 15 minutes apart, one each run of the outreach cron
 * (vercel.json, every 15 minutes), never all at once; ten minutes apart would need the cron changed, which is Lawal's
 * (law 20). The sender claimed up to 25 a run.
 */
describe('one letter a run', () => {
  test('the sender claims one queued letter a run, and claims by that one number', async () => {
    const { SEND_BATCH } = await import('@/lib/outreach/sender')
    expect(SEND_BATCH).toBe(1)
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/outreach/sender.ts', 'utf8')
    expect(src).toMatch(/\.limit\(SEND_BATCH\)/)
    expect(src).not.toMatch(/const BATCH = /)
  })
})

/*
 * ONE SEND PATH, NO DOUBLES (the PM's 09:15 of 18 November 2026, item 2): the 14 letters wait as drafts in hello@'s
 * Outlook for Lawal's review, and the play sends them on his go. If he sends one himself, the sync records it from
 * hello@'s Sent Items (src/lib/outreach/sent-sync.ts) as a sent touch, and the engine never writes that recipient a
 * first letter again. The run read Sent Items AFTER the sender (route.ts), so a draft he sent between runs could go
 * twice; and the sender never asked whether the contact was already written.
 */
describe('one send path, no doubles', () => {
  beforeEach(() => clearRecordedOutreachMail())

  test('a first letter to a contact already written (Lawal sent the draft himself) is voided, never sent', async () => {
    const queued = [{ id: 'q-first', comms_category: 'PERM', contact_id: 'c-lawal', subject: 'Helping more people find your night', body: 'Hi Sam,\nEventLinqs.', in_reply_to: null, outreach_templates: { key: 'segment_a_first' } }]
    const { db, calls } = fakeDb((call) => {
      if (call.table === 'outreach_sender') return { data: { mode: 'test', from_address: 'hello@eventlinqs.com', test_domain: 'eventlinqs.com' }, error: null }
      if (call.table === 'rpc:outreach_close_stuck_sends') return { data: 0, error: null }
      if (call.table === 'outreach_touches' && call.op === 'select' && call.filters.some(([k, v]) => k === 'eq:state' && v === 'queued')) return { data: queued, error: null }
      // The sync recorded his own message from hello@'s Sent Items as a sent touch for the same contact.
      if (call.table === 'outreach_touches' && call.op === 'select' && call.filters.some(([k, v]) => k === 'eq:state' && v === 'sent')) return { data: [{ id: 'his-own', sent_at: '2026-11-18T23:05:00Z' }], error: null }
      if (call.table === 'outreach_touches' && call.op === 'select') return { data: [], error: null }
      if (call.table === 'organiser_contacts' && call.op === 'select') return { data: { organiser_id: 'o1', address: 'sam@eventlinqs.com', unsubscribe_token: TOKEN }, error: null }
      if (call.table === 'organiser_venues') return { data: [], error: null }
      if (call.table === 'outreach_touches' && call.op === 'update') return { data: { id: 'q-first' }, error: null }
      return { data: null, error: { message: `unexpected ${call.op} on ${call.table}` } }
    })
    const r = await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.sent).toEqual([])
    expect(recordedOutreachMail()).toHaveLength(0)
    const voided = calls.find((c) => c.op === 'update' && (c.payload as { state: string }).state === 'void')
    expect((voided?.payload as { void_reason: string }).void_reason).toMatch(/already written/)
    expect(calls.some((c) => c.op === 'update' && (c.payload as { state: string }).state === 'sending')).toBe(false)
  })

  test('the run reads hello@ Sent Items before it sends anything', async () => {
    const { readFileSync } = await import('node:fs')
    const route = readFileSync('src/app/api/cron/outreach-run/route.ts', 'utf8')
    expect(route.indexOf('await syncSentItems(')).toBeGreaterThan(-1)
    expect(route.indexOf('await syncSentItems(')).toBeLessThan(route.indexOf('await runOutreachSender('))
  })
})

/*
 * ITS WORDS, READ AGAIN AT SEND TIME (the PM's 20:40 of 19 November 2026, item 2): a letter carrying the founder sentence
 * went at 9.30 am that day. Every queued message passes the voice gate's word rules at the one send path.
 */
describe('its words, read again at send time', () => {
  beforeEach(() => clearRecordedOutreachMail())
  const SENTENCE = "I'm Lawal Adams, and I'm building EventLinqs, a new Australian platform that builds a community around every event it lists."
  test('a queued letter carrying the founder sentence is voided with why and never sent; the clean one goes', async () => {
    const queued = [{ ...QUEUED[0], id: 'q-v1', body: `Hi Sam,\n${SENTENCE}\nEventLinqs.` }, { ...QUEUED[0], id: 'q-clean' }]
    const { db, calls } = standardDb('test', { queued })
    const r = await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.sent).toEqual(['q-clean'])
    expect(r.refused.map((x) => x.id)).toEqual(['q-v1'])
    expect(r.refused[0].reason).toMatch(/founder sentence/)
    const voided = calls.find((c) => c.op === 'update' && (c.payload as { state: string }).state === 'void')
    expect(voided?.filters).toContainEqual(['eq:id', 'q-v1'])
    expect(voided?.filters).toContainEqual(['eq:state', 'queued'])
    expect(recordedOutreachMail()).toHaveLength(1)
  })
  test('the drill: the same letter without it is sent', async () => {
    const { db } = standardDb('test', { queued: [{ ...QUEUED[0], id: 'q-v2' }] })
    const r = await runOutreachSender(db, { now: THURSDAY_7_MELBOURNE, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.sent).toEqual(['q-v2'])
    expect(r.refused).toEqual([])
  })
})
