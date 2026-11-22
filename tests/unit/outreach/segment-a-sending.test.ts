import { beforeEach, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { clearRecordedOutreachMail, recordedOutreachMail, runOutreachSender } from '@/lib/outreach/sender'

/*
 * THE TIMING RULE AGAIN AT THE MOMENT OF SENDING (the communication standard's Part 2 rule 4; the PM's 02:00 of
 * 18 November 2026): a segment A letter is checked against its night again before it is claimed, and one that would now
 * land less than 3 days before it is set aside with why, never sent. Other messages are not touched by the rule.
 */
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

const THU_10 = new Date('2026-11-18T23:00:00Z') // Thursday 19 November, 10:00 in Melbourne
const QUEUED = [
  { id: 'a-close', comms_category: 'PERM', contact_id: 'c1', subject: 'Helping more people find Close on 21 November', body: 'Hi Sam,\n\nhttps://www.eventlinqs.com.au/events/close-night', in_reply_to: null, outreach_templates: { key: 'segment_a_first' } },
  { id: 'a-far', comms_category: 'PERM', contact_id: 'c1', subject: 'Helping more people find Far on 23 November', body: 'Hi Sam,\n\nhttps://www.eventlinqs.com.au/events/far-night', in_reply_to: null, outreach_templates: { key: 'segment_a_first' } },
  { id: 'other', comms_category: 'PERM', contact_id: 'c1', subject: 'Your nights', body: 'Hi Sam,\nEventLinqs.', in_reply_to: null, outreach_templates: { key: 'anything_coming_up' } },
]
const NIGHTS: Record<string, string> = { 'close-night': '2026-11-21T08:00:00Z', 'far-night': '2026-11-22T08:00:00Z' }

function db() {
  return fakeDb((call, shape) => {
    if (call.table === 'outreach_sender') return { data: { mode: 'test', from_address: 'hello@eventlinqs.com', test_domain: 'eventlinqs.com' }, error: null }
    if (call.table === 'rpc:outreach_close_stuck_sends') return { data: 0, error: null }
    if (call.table === 'outreach_touches' && call.op === 'select' && call.filters.some(([k, v]) => k === 'eq:state' && v === 'queued')) return { data: QUEUED, error: null }
    if (call.table === 'outreach_touches' && call.op === 'select') return { data: [], error: null }
    if (call.table === 'events') {
      const slug = call.filters.find(([k]) => k === 'eq:slug')?.[1] as string
      return { data: { start_date: NIGHTS[slug], timezone: 'Australia/Melbourne' }, error: null }
    }
    if (call.table === 'organiser_contacts') return { data: { id: 'c1', organiser_id: 'o1', address: 'sam@eventlinqs.com', unsubscribe_token: 'tok', basis: 'conspicuous_publication' }, error: null }
    if (call.table === 'organiser_venues') return { data: [], error: null }
    // The contact policy's reads (src/lib/outreach/contact-policy.ts): an organiser with no account, nothing heard back,
    // no address suppressed, nothing bounced.
    if (call.table === 'organisations') return { data: [], error: null }
    if (call.table === 'organisers') return shape === 'many' ? { data: [], error: null } : { data: { organisation_id: null }, error: null }
    if (['outreach_replies', 'outreach_unsubscribes', 'outreach_delivery_events'].includes(call.table)) return { data: [], error: null }
    if (call.table === 'outreach_touches' && call.op === 'update') return { data: { id: call.filters.find(([k]) => k === 'eq:id')?.[1] }, error: null }
    return { data: null, error: { message: `unexpected ${call.op} on ${call.table}` } }
  })
}

describe('a segment A letter at the moment of sending', () => {
  beforeEach(() => clearRecordedOutreachMail())

  test('one whose night is now less than 3 days away is set aside, never claimed; the rest go', async () => {
    const { db: d, calls } = db()
    const r = await runOutreachSender(d, { now: THU_10, origin: 'https://www.eventlinqs.com.au', graph: null })
    expect(r.refused.map((x) => x.id)).toEqual(['a-close'])
    expect(r.refused[0].reason).toMatch(/less than 3 days before its night/)
    const voided = calls.find((c) => c.op === 'update' && (c.payload as { state: string }).state === 'void')
    expect(voided?.filters).toContainEqual(['eq:id', 'a-close'])
    expect(voided?.filters).toContainEqual(['eq:state', 'queued'])
    expect(calls.some((c) => c.op === 'update' && (c.payload as { state: string }).state === 'sending' && c.filters.some(([k, v]) => k === 'eq:id' && v === 'a-close'))).toBe(false)
    expect(r.sent).toEqual(['a-far', 'other'])
    expect(recordedOutreachMail()).toHaveLength(2)
  })
})
