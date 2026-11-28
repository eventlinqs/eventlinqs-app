import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/*
 * A TEST ORDER IS NEVER A SALE IN THE DAILY STATE (the PM's 22:50 of 28 November 2026, fix (d);
 * C:\dev\EVIDENCE\EL-28NOV\incident\V4-qa-orders.md). The 13:58 email of 28 November said "13 tickets sold in total, 6 of
 * them in the last 24 hours" and "6 paid orders in the last 24 hours": all six were the QA journey's $0 orders, is_test
 * on the order, its night and its organisation, and /api/ops/state counted every confirmed order and every ticket with no
 * is_test, and called a $0 order paid. History is kept: nothing is deleted, the counts leave the tests out.
 * The store below is production's of 28 Nov 11:38 UTC in shape: 6 test orders of the last day and their 6 tickets, one
 * real paid order with 2 tickets inside the same 24 hours, one real free order. Red on main: 8 paid orders, 8 tickets.
 */
const NOW = new Date('2026-11-28T02:58:00.000Z')
type Row = Record<string, unknown>
const order = (id: string, isTest: boolean, total: number, confirmedAt: string): Row => ({ id, status: 'confirmed', is_test: isTest, total_cents: total, confirmed_at: confirmedAt })
const ORDERS: Row[] = [
  ...[0, 1, 2, 3, 4, 5].map((i) => order(`qa${i}`, true, 0, `2026-11-28T0${i % 2}:${10 + i}:00.000Z`)),
  order('real-paid', false, 4500, '2026-11-27T05:00:00.000Z'),
  order('real-free', false, 0, '2026-11-28T01:00:00.000Z'),
]
const TICKETS: Row[] = [
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `tq${i}`, order_id: `qa${i}`, refunded_at: null, created_at: ORDERS[i].confirmed_at })),
  { id: 'tr1', order_id: 'real-paid', refunded_at: null, created_at: '2026-11-27T05:00:00.000Z' },
  { id: 'tr2', order_id: 'real-paid', refunded_at: null, created_at: '2026-11-27T05:00:00.000Z' },
]
const tables: Record<string, Row[]> = {
  events: [{ id: 'e1', status: 'published', is_test: false }, { id: 'e2', status: 'published', is_test: true }],
  orders: ORDERS,
  // Each ticket carries its order as PostgREST's orders!inner embed answers it.
  tickets: TICKETS.map((t) => ({ ...t, orders: ORDERS.find((o) => o.id === t.order_id) })),
  organisations: [{ id: 'o1', is_test: true, created_at: '2026-11-28T00:00:00.000Z' }],
}
const value = (r: Row, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Row)[k] : undefined), r)
function chain(table: string) {
  const tests: ((r: Row) => boolean)[] = []
  let head = false
  const at = (v: unknown) => Date.parse(String(v))
  const q: Record<string, unknown> = {
    select: (_c?: string, o?: { head?: boolean }) => ((head = o?.head === true), q),
    eq: (k: string, v: unknown) => (tests.push((r) => String(value(r, k)) === String(v)), q),
    is: (k: string, v: unknown) => (tests.push((r) => (value(r, k) ?? null) === v), q),
    gte: (k: string, v: unknown) => (tests.push((r) => at(value(r, k)) >= at(v)), q),
    gt: (k: string, v: unknown) => (tests.push((r) => Number(value(r, k)) > Number(v)), q),
    lt: (k: string, v: unknown) => (tests.push((r) => at(value(r, k)) < at(v)), q),
    or: () => q,
    ilike: () => q,
    not: () => q,
    in: () => q,
    limit: () => q,
    then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => {
          const rows = (tables[table] ?? []).filter((r) => tests.every((t) => t(r)))
          return head ? { data: null, count: rows.length, error: null } : { data: rows, count: rows.length, error: null }
        })
        .then(ok, no),
  }
  return q
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => chain(t) }) }))
vi.mock('@/lib/admin/morning-report', () => ({ readMorningReport: async () => ({}) }))
vi.mock('@/lib/growth/weekly-report-digest', () => ({ readWeeklyDigest: async () => ({}) }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.stubEnv('CRON_SECRET', 'drill')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('the daily state counts', () => {
  it('leave every test order and its tickets out, and a $0 order is never a paid one', async () => {
    const { GET } = await import('@/app/api/ops/state/route')
    const res = await GET(new NextRequest('https://www.eventlinqs.com.au/api/ops/state', { headers: { authorization: 'Bearer drill' } }))
    const body = (await res.json()) as { ok: boolean; counts: Record<string, number> }
    expect(body.ok).toBe(true)
    expect(body.counts.ordersPaid24h).toBe(1)
    expect(body.counts.ticketsSold24h).toBe(2)
    expect(body.counts.ticketsSold).toBe(2)
    expect(body.counts.eventsLive).toBe(1)
    expect(body.counts.newOrganisers24h).toBe(0)
  })
})
