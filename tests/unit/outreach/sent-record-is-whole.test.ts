import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { forgetGraphToken } from '@/lib/outreach/graph'
import { clearRecordedOutreachMail, runOutreachSender } from '@/lib/outreach/sender'

/*
 * A SENT LETTER'S RECORD IS WHOLE (18 November 2026). The first two approved ACQ letters were delivered by Graph at 14:00
 * and 14:15, and each record was refused by production's check outreach_touches_sent_is_whole:
 *   CHECK ((state = 'sent') = (sent_at IS NOT NULL AND basis_at_send IS NOT NULL AND provider IS NOT NULL AND
 *          (sent_by IS NOT NULL OR (provider = 'graph' AND internet_message_id IS NOT NULL))))
 * because the sender's 'sent' write never named its provider, and the queue step left provider NULL, which
 * outreach_touches_queued_is_scheduled let through (a CHECK passes on NULL). The tests' fake database never held that
 * rule, so every gate passed. This one does: the row as the database holds it after the claim (basis_at_send set,
 * provider as queued), merged with the sender's 'sent' write, must satisfy the rule.
 */
const TOKEN = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

function fakeDb() {
  const calls: Call[] = []
  const answer = (call: Call) => {
    if (call.table === 'outreach_sender') return { data: { mode: 'test', from_address: 'hello@eventlinqs.com', test_domain: 'eventlinqs.com' }, error: null }
    if (call.table === 'rpc:outreach_close_stuck_sends') return { data: 0, error: null }
    if (call.table === 'outreach_touches' && call.op === 'select' && call.filters.some(([k, v]) => k === 'eq:state' && v === 'queued')) {
      return { data: [{ id: 'q-1', comms_category: 'PERM', contact_id: 'c-1', subject: 'Your nights', body: 'Hi Sam,\nEventLinqs.', in_reply_to: null }], error: null }
    }
    if (call.table === 'outreach_touches' && call.op === 'select') return { data: [], error: null }
    if (call.table === 'organiser_contacts') return { data: { organiser_id: 'o1', address: 'sam@eventlinqs.com', unsubscribe_token: TOKEN }, error: null }
    if (call.table === 'organiser_venues') return { data: [], error: null }
    if (call.table === 'outreach_touches' && call.op === 'update') return { data: { id: 'q-1' }, error: null }
    return { data: null, error: { message: `unexpected ${call.op} on ${call.table}` } }
  }
  const builder = (call: Call) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'limit']) b[m] = () => b
    for (const m of ['eq', 'lte', 'neq']) b[m] = (col: string, val: unknown) => (call.filters.push([`${m}:${col}`, val]), b)
    b.not = (col: string, _op: string, val: unknown) => (call.filters.push([`not:${col}`, val]), b)
    b.in = (col: string, val: unknown) => (call.filters.push([`in:${col}`, val]), b)
    b.single = async () => answer(call)
    b.maybeSingle = async () => answer(call)
    b.then = (resolve: (v: unknown) => unknown) => resolve(answer(call))
    return b
  }
  const db = {
    from: (table: string) => ({
      select: () => { const call: Call = { table, op: 'select', filters: [] }; calls.push(call); return builder(call) },
      update: (payload: unknown) => { const call: Call = { table, op: 'update', payload, filters: [] }; calls.push(call); return builder(call) },
    }),
    rpc: async (name: string) => answer({ table: `rpc:${name}`, op: 'rpc', filters: [] }),
  }
  return { db: db as unknown as SupabaseClient<Database>, calls }
}

/** Microsoft's two answers: a token, then 202 Accepted for sendMail. */
const graphNetwork = async (url: string) =>
  url.includes('login.microsoftonline.com')
    ? new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
    : new Response('', { status: 202 })

/** Production's rule, outreach_touches_sent_is_whole, on a row. */
const sentIsWhole = (row: Record<string, unknown>) =>
  (row.state === 'sent') ===
  (row.sent_at != null && row.basis_at_send != null && row.provider != null && (row.sent_by != null || (row.provider === 'graph' && row.internet_message_id != null)))

describe('a sent letter is recorded whole', () => {
  beforeEach(() => {
    clearRecordedOutreachMail()
    forgetGraphToken()
  })

  test('a letter Graph sends gets a sent record production accepts, even if it was queued with no provider', async () => {
    const { db, calls } = fakeDb()
    const r = await runOutreachSender(db, {
      now: new Date('2026-10-28T23:00:00Z'),
      origin: 'https://www.eventlinqs.com.au',
      graph: { tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: 'hello@eventlinqs.com' },
      fetchImpl: graphNetwork,
    })
    expect(r.sent).toEqual(['q-1'])
    const sent = calls.find((c) => c.op === 'update' && (c.payload as { state: string }).state === 'sent')
    // The row as the database holds it after the claim: basis_at_send written by the claim, provider NULL as queued.
    const row = { state: 'sending', basis_at_send: { basis: 'conspicuous_publication' }, provider: null, sent_by: null, ...(sent?.payload as object) }
    expect(sentIsWhole(row)).toBe(true)
  })

  test('the queue step names the one transport, so a queued letter is whole too', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'outreach', 'segment-a-play.ts'), 'utf8')
    expect(src).toMatch(/\.update\(\{ state: 'queued', scheduled_for: [^}]*provider: 'graph' \}\)/)
  })
})
