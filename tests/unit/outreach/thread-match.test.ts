import { describe, expect, it } from 'vitest'
import { handleInbox } from '@/lib/outreach/replies'
import { HELLO_MAILBOX } from '@/lib/outreach/addresses'

/*
 * EVERY MESSAGE MATCHED TO ITS THREAD (the PM's 16:28 of 25 November 2026, directive 3.4). Red before: Bendigo Tourism's
 * yes of 15:44 came from an address we held no contact for (tourismshared@), answering a message Lawal sent by hand from
 * Outlook, and the inbox matched our own engine's ids alone (@eventlinqs.com), then the sender's address, so it matched
 * nobody and said nothing. Now: the ids its headers name, any domain, against every message we hold; then Outlook's
 * conversation; then the address. A new address in a known thread becomes a contact of the same organiser. A message
 * that matches nothing is recorded unmatched, for the leads watch. Against a stand-in database.
 */
type Query = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }

function chain(answer: (q: Query) => { data?: unknown; error: unknown }) {
  const queries: Query[] = []
  const from = (table: string) => {
    const q: Query = { table, op: 'select', filters: [] }
    queries.push(q)
    const b: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'in', 'gte', 'lt', 'lte', 'order', 'limit', 'is', 'not', 'ilike']) {
      b[m] = (column: string, value: unknown) => (q.filters.push([m, column, value]), b)
    }
    b.select = () => b
    for (const op of ['insert', 'update', 'upsert']) b[op] = (payload: unknown) => ((q.op = op), (q.payload = payload), b)
    b.single = async () => answer(q)
    b.maybeSingle = async () => answer(q)
    b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(answer(q)).then(ok, bad)
    return b
  }
  return { db: { from, rpc: async () => ({ data: null, error: null }) }, queries }
}
const has = (q: Query, op: string, column: string) => q.filters.some(([m, c]) => m === op && c === column)

const HAND_ID = '<SYYP282MB14696B1C08E787FAA75FB038D2442@SYYP282MB1469.AUSP282.PROD.OUTLOOK.COM>'
const message = (over: Partial<{ text: string; headers: Record<string, string>; fromAddress: string; conversationId: string }> = {}) => ({
  graphId: 'g1',
  internetMessageId: '<her-yes@bendigo.example>',
  subject: 'RE: Bendigo Region events on EventLinqs',
  fromAddress: over.fromAddress ?? 'shared@bendigo.example',
  fromName: 'Bendigo',
  receivedAt: '2026-11-25T04:44:10Z',
  text: over.text ?? 'Anyone is free to access our Events calendar, and we thank you for linking back to our website for event information.',
  headers: over.headers ?? {},
  hasAttachments: false,
  conversationId: over.conversationId ?? '',
})
const run = (db: unknown, m: ReturnType<typeof message>) =>
  handleInbox(db as never, [m] as never, { mailbox: HELLO_MAILBOX, origin: 'https://www.eventlinqs.com.au', actingUser: 'u-founder', now: new Date('2026-11-25T05:00:00Z') })

describe('a message matched to its thread', () => {
  it('by the id of a message we sent by hand from Outlook: its contact, and the new address becomes theirs', async () => {
    const { db, queries } = chain((q) => {
      if (q.table === 'outreach_touches' && has(q, 'in', 'internet_message_id')) return { data: [{ id: 't-hand', contact_id: 'c-thread', subject: 'RE: Bendigo Region events on EventLinqs', context_key: null }], error: null }
      if (q.table === 'organiser_contacts' && q.op === 'select' && has(q, 'eq', 'address')) return { data: null, error: null }
      if (q.table === 'organiser_contacts' && q.op === 'select' && has(q, 'eq', 'id')) return { data: { organiser_id: 'o-bendigo' }, error: null }
      if (q.table === 'organiser_contacts' && q.op === 'insert') return { data: { id: 'c-new' }, error: null }
      if (q.table === 'outreach_replies' && q.op === 'insert') return { data: { id: 'r1' }, error: null }
      return { data: null, error: null }
    })
    const report = await run(db, message({ headers: { 'in-reply-to': HAND_ID, references: `<ours@eventlinqs.com> ${HAND_ID}` } }))
    expect(report.failed).toEqual([])
    expect(report.matched).toBe(1)
    expect(queries.find((q) => q.table === 'outreach_touches' && has(q, 'in', 'internet_message_id'))?.filters).toContainEqual(['in', 'internet_message_id', [HAND_ID, '<ours@eventlinqs.com>']])
    expect(queries.find((q) => q.table === 'outreach_replies' && q.op === 'insert')?.payload).toMatchObject({ contact_id: 'c-thread', touch_id: 't-hand' })
    expect(queries.find((q) => q.table === 'organiser_contacts' && q.op === 'insert')?.payload).toMatchObject({ organiser_id: 'o-bendigo', channel: 'email', address: 'shared@bendigo.example', basis: 'none' })
    expect(queries.find((q) => q.table === 'outreach_message_mailboxes')?.payload).toMatchObject({ direction: 'received', counterpart_address: 'shared@bendigo.example', contact_id: 'c-thread', mailbox: HELLO_MAILBOX })
    expect(report.replies[0].action).toContain('a new address in their thread: recorded as a contact of the same organiser')
  })

  it("by the id of their own earlier message we logged", async () => {
    const { db, queries } = chain((q) => {
      if (q.table === 'outreach_replies' && q.op === 'select' && has(q, 'in', 'source_message_id')) return { data: [{ contact_id: 'c-earlier', touch_id: null }], error: null }
      if (q.table === 'organiser_contacts' && q.op === 'select' && has(q, 'eq', 'address')) return { data: { id: 'c-earlier' }, error: null }
      if (q.table === 'outreach_replies' && q.op === 'insert') return { data: { id: 'r2' }, error: null }
      if (q.table === 'outreach_touches') return { data: [], error: null }
      return { data: null, error: null }
    })
    await run(db, message({ fromAddress: 'info@earlier.example', headers: { 'in-reply-to': '<their-first@earlier.example>' } }))
    expect(queries.find((q) => q.table === 'outreach_replies' && q.op === 'insert')?.payload).toMatchObject({ contact_id: 'c-earlier' })
    expect(queries.some((q) => q.table === 'organiser_contacts' && q.op === 'insert')).toBe(false)
  })

  it("with no thread headers, by Outlook's conversation id", async () => {
    const { db, queries } = chain((q) => {
      if (q.table === 'outreach_message_mailboxes' && q.op === 'select' && has(q, 'eq', 'conversation_id')) return { data: [{ contact_id: 'c-conv', internet_message_id: '<x@outlook>' }], error: null }
      if (q.table === 'organiser_contacts' && q.op === 'select' && has(q, 'eq', 'address')) return { data: { id: 'c-conv' }, error: null }
      if (q.table === 'outreach_replies' && q.op === 'insert') return { data: { id: 'r3' }, error: null }
      if (q.table === 'outreach_touches') return { data: [], error: null }
      return { data: null, error: null }
    })
    await run(db, message({ fromAddress: 'info@conv.example', conversationId: 'AAQkAGI2' }))
    expect(queries.find((q) => q.table === 'outreach_replies' && q.op === 'insert')?.payload).toMatchObject({ contact_id: 'c-conv' })
  })

  it('a message that matches nothing is recorded unmatched and listed, never dropped in silence', async () => {
    const { db, queries } = chain((q) => {
      if (q.table === 'outreach_touches' || (q.table === 'outreach_replies' && q.op === 'select') || (q.table === 'outreach_message_mailboxes' && q.op === 'select')) return { data: [], error: null }
      return { data: null, error: null }
    })
    const report = await run(db, message({ fromAddress: 'someone@new.example', headers: { 'in-reply-to': '<unknown@elsewhere.example>' }, conversationId: 'AAQkUNKNOWN' }))
    expect(report.unmatched).toBe(1)
    expect(report.unmatchedMessages).toEqual([{ messageId: '<her-yes@bendigo.example>', from: 'someone@new.example', subject: 'RE: Bendigo Region events on EventLinqs', receivedAt: '2026-11-25T04:44:10Z' }])
    expect(queries.find((q) => q.table === 'outreach_message_mailboxes' && q.op === 'upsert')?.payload).toMatchObject({ direction: 'received', counterpart_address: 'someone@new.example', contact_id: null, conversation_id: 'AAQkUNKNOWN' })
    expect(queries.some((q) => q.table === 'outreach_replies' && q.op === 'insert')).toBe(false)
  })

  it('a read that fails leaves the message unhandled, read again next run, never matched on a guess', async () => {
    const { db } = chain((q) => (q.table === 'outreach_touches' ? { data: null, error: { message: 'timeout' } } : { data: null, error: null }))
    const report = await run(db, message({ headers: { 'in-reply-to': HAND_ID } }))
    expect(report.failed).toEqual([{ messageId: '<her-yes@bendigo.example>', error: 'the messages it answers could not be read: timeout' }])
    expect(report.matched + report.unmatched).toBe(0)
  })
})
