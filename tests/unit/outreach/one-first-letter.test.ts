import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test } from 'vitest'
import { firstLetterBlocked, organisationDomain, type LetterRecord } from '@/lib/outreach/one-first-letter'
import { clearRecordedOutreachMail, recordedOutreachMail, runOutreachSender } from '@/lib/outreach/sender'
import type { Database } from '@/types/database'

/*
 * ONE FIRST LETTER PER ORGANISER (the PM's 09:45 of 19 November 2026, item 1 (d)). The case: Asia Oasis was written at
 * info@asiaoasis.com.au on 18 November, replied at 09:19 on 19 November, and the run of 09:30 logged the reply and three
 * seconds later sent a first letter to partnership@asiaoasis.com.au. Each case below is that record or a part of it.
 */
const INFO = { contactId: 'c-info', organiserId: 'o-asia', address: 'info@asiaoasis.com.au' }
const PARTNERSHIP = { contactId: 'c-partner', organiserId: 'o-asia', address: 'partnership@asiaoasis.com.au' }

describe('the rule', () => {
  test('DRILL, the morning of 19 November: replied and written on another address, so no first letter goes', () => {
    const record: LetterRecord = {
      candidate: PARTNERSHIP,
      sent: [{ ...INFO, sentAt: '2026-11-18T04:30:07Z' }],
      replies: [{ ...INFO, receivedAt: '2026-11-18T22:19:59Z' }],
    }
    expect(firstLetterBlocked(record)).toMatch(/^they have replied \(info@asiaoasis\.com\.au/)
    // The old rule looked at the candidate's own contact only, and so let it go: the drill shows that rule red.
    const oldRule = (r: LetterRecord) => (r.sent.some((s) => s.contactId === r.candidate.contactId) ? 'already written' : null)
    expect(oldRule(record)).toBeNull()
  })
  test('written on another address of the same organiser, no reply yet: still one first letter only', () => {
    expect(firstLetterBlocked({ candidate: PARTNERSHIP, sent: [{ ...INFO, sentAt: '2026-11-18T04:30:07Z' }], replies: [] })).toMatch(/^already written at info@asiaoasis\.com\.au/)
  })
  test('the same organisation domain held by another organiser row counts as the same organisation', () => {
    const other = { contactId: 'c-x', organiserId: 'o-asia-adelaide', address: 'events@asiaoasis.com.au' }
    expect(firstLetterBlocked({ candidate: PARTNERSHIP, sent: [{ ...other, sentAt: null }], replies: [] })).toMatch(/^already written at events@asiaoasis\.com\.au/)
  })
  test('a free mail domain says nothing about who it is: two organisers on gmail are two organisers', () => {
    const a = { contactId: 'c-a', organiserId: 'o-a', address: 'band.one@gmail.com' }
    const b = { contactId: 'c-b', organiserId: 'o-b', address: 'band.two@gmail.com' }
    expect(organisationDomain(a.address)).toBeNull()
    expect(firstLetterBlocked({ candidate: b, sent: [{ ...a, sentAt: null }], replies: [{ ...a, receivedAt: null }] })).toBeNull()
  })
  test('an organiser never written and never replied takes its one first letter', () => {
    expect(firstLetterBlocked({ candidate: INFO, sent: [], replies: [] })).toBeNull()
  })
})

/** A stand-in for the service client with the filters the sender's reads use. */
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
function fakeDb(answer: (call: Call) => { data: unknown; error: { message: string } | null }) {
  const calls: Call[] = []
  const builder = (call: Call) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'limit']) b[m] = () => b
    for (const m of ['eq', 'lte', 'neq', 'in', 'ilike']) b[m] = (col: string, val: unknown) => (call.filters.push([`${m}:${col}`, val]), b)
    b.not = (col: string, _op: string, val: unknown) => (call.filters.push([`not:${col}`, val]), b)
    b.single = async () => answer(call)
    b.maybeSingle = async () => answer(call)
    b.then = (resolve: (v: unknown) => unknown) => resolve(answer(call))
    return b
  }
  const db = {
    from: (table: string) => ({
      select: () => { const call = { table, op: 'select', filters: [] }; calls.push(call); return builder(call) },
      update: (payload: unknown) => { const call = { table, op: 'update', payload, filters: [] }; calls.push(call); return builder(call) },
    }),
    rpc: async (name: string) => { calls.push({ table: `rpc:${name}`, op: 'rpc', filters: [] }); return answer({ table: `rpc:${name}`, op: 'rpc', filters: [] }) },
  }
  return { db: db as unknown as SupabaseClient<Database>, calls }
}

describe('the sender holds the rule at the one send path', () => {
  test('DRILL: the queued first letter to partnership@ is voided with why and never handed to the transport', async () => {
    clearRecordedOutreachMail()
    const has = (c: Call, k: string, v?: unknown) => c.filters.some(([key, val]) => key === k && (v === undefined || val === v))
    const { db, calls } = fakeDb((call) => {
      if (call.table === 'outreach_sender') return { data: { mode: 'test', from_address: 'hello@eventlinqs.com', test_domain: 'asiaoasis.com.au' }, error: null }
      if (call.table === 'rpc:outreach_close_stuck_sends') return { data: 0, error: null }
      if (call.table === 'outreach_touches' && call.op === 'select' && has(call, 'eq:state', 'queued')) {
        return { data: [{ id: 't-second', contact_id: 'c-partner', step: 1, subject: 'Helping more people find Colours of Asia: Garden of Wonders on 22 November', body: 'Hi Asia Oasis team,\n/events/colours-of-asia-garden-of-wonders-asia-oasis-2026-11-22', in_reply_to: null, outreach_templates: { key: 'segment_a_first' } }], error: null }
      }
      if (call.table === 'organiser_contacts' && has(call, 'eq:id', 'c-partner')) return { data: { id: 'c-partner', organiser_id: 'o-asia', address: PARTNERSHIP.address }, error: null }
      if (call.table === 'organiser_contacts') return { data: [{ id: 'c-info', organiser_id: 'o-asia', address: INFO.address }, { id: 'c-partner', organiser_id: 'o-asia', address: PARTNERSHIP.address }], error: null }
      if (call.table === 'organiser_venues') return { data: [], error: null }
      // The old per-contact read: partnership@ itself was never written, which is how it got through on 19 November.
      if (call.table === 'outreach_touches' && call.op === 'select' && has(call, 'eq:contact_id', 'c-partner')) return { data: [], error: null }
      if (call.table === 'outreach_touches' && call.op === 'select' && has(call, 'eq:state', 'sent') && has(call, 'in:contact_id')) return { data: [{ contact_id: 'c-info', sent_at: '2026-11-18T04:30:07Z' }], error: null }
      if (call.table === 'outreach_replies') return { data: [{ contact_id: 'c-info', received_at: '2026-11-18T22:19:59Z' }], error: null }
      if (call.table === 'outreach_touches' && call.op === 'update') return { data: { id: 't-second' }, error: null }
      return { data: null, error: { message: `unexpected ${call.op} on ${call.table}` } }
    })
    const report = await runOutreachSender(db, { now: new Date('2026-11-18T22:30:14Z'), origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(report.sent).toEqual([])
    expect(report.refused).toHaveLength(1)
    expect(report.refused[0].reason).toMatch(/^they have replied/)
    const voided = calls.find((c) => c.table === 'outreach_touches' && c.op === 'update')
    expect(voided?.payload).toMatchObject({ state: 'void' })
    expect(calls.some((c) => c.op === 'update' && (c.payload as { state?: string }).state === 'sending')).toBe(false)
    expect(recordedOutreachMail()).toHaveLength(0)
  })
})
