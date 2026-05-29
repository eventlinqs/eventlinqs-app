// Duplicate-delivery idempotency proof (option-2 verification, layer 1).
//
// Drives the REAL Stripe webhook POST and the REAL dedupe module
// (webhook-events) through two deliveries of the SAME payment_intent.succeeded
// event, backed by a STATEFUL in-memory processed_webhook_events ledger and a
// stateful issuance model standing in for confirm_order + the DB issuance
// trigger. It asserts that across two deliveries:
//   - confirm_order (the sole ticket-issuance chokepoint) runs EXACTLY once
//   - exactly ONE ticket is "issued"
//   - the second delivery is reported as a duplicate no-op (200)
//
// This exercises the application-level dedupe end to end. The two DB-enforced
// layers (confirm_order early-return; tickets_unit_unique UNIQUE
// (order_item_id, idx_in_item) with ON CONFLICT DO NOTHING in
// issue_tickets_for_order) are cited from
// supabase/migrations/20260517000001_ticketing_system_v1.sql and are only
// fully observable against Postgres (the manual live test purchase).
//
// Heavy imports (redis, resend, plausible, next/cache, ledger, sentry) are
// mocked exactly as in payment-intent-succeeded.test.ts. The dedupe module is
// deliberately NOT mocked.

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { NextRequest } from 'next/server'

type AnyRecord = Record<string, unknown>

// Stateful world shared with the admin-client mock via vi.hoisted.
const h = vi.hoisted(() => ({
  state: null as null | {
    pwe: Map<string, { status: string; attempts: number }>
    unitKeys: Set<string>
    ticketsIssued: number
    confirmOrderCalls: number
    orderConfirmed: boolean
    orderItems: { id: string; quantity: number }[]
  },
}))

function resetState() {
  h.state = {
    pwe: new Map(),
    unitKeys: new Set(),
    ticketsIssued: 0,
    confirmOrderCalls: 0,
    orderConfirmed: false,
    // One ticket order item, quantity 1 -> one admittable unit.
    orderItems: [{ id: 'oi_1', quantity: 1 }],
  }
}

// Models confirm_order + the AFTER UPDATE issuance trigger + the
// tickets_unit_unique constraint as one observable behaviour:
//   - early-return when already confirmed (no UPDATE -> trigger no-op)
//   - on the genuine transition, issue one row per (order_item_id, idx)
//     unit, ON CONFLICT (unit key) DO NOTHING.
function runConfirmOrderModel() {
  const s = h.state!
  s.confirmOrderCalls += 1
  if (s.orderConfirmed) return // confirm_order early-returns; trigger does not fire
  s.orderConfirmed = true
  for (const item of s.orderItems) {
    for (let idx = 0; idx < item.quantity; idx++) {
      const key = `${item.id}:${idx}`
      if (!s.unitKeys.has(key)) {
        s.unitKeys.add(key)
        s.ticketsIssued += 1
      }
    }
  }
}

function makeStatefulAdminMock() {
  const s = h.state!
  function chain(table: string) {
    const ctx: { ops: string[]; value?: unknown } = { ops: [] }
    const resolve = (): { data: unknown; error: unknown } => {
      if (table === 'payments') {
        return { data: { id: 'pay_1', status: 'processing', order_id: 'order_1' }, error: null }
      }
      if (table === 'processed_webhook_events') {
        if (ctx.ops.includes('upsert')) {
          // INSERT ... ON CONFLICT DO NOTHING (ignoreDuplicates). Fresh key
          // wins the claim and returns the row; existing key returns [].
          const v = ctx.value as { event_id: string; event_type: string; status: string }
          if (!s.pwe.has(v.event_id)) {
            s.pwe.set(v.event_id, { status: 'received', attempts: 1 })
            return { data: [{ event_id: v.event_id, status: 'received', attempts: 1 }], error: null }
          }
          return { data: [], error: null }
        }
        if (ctx.ops.includes('update')) {
          const v = ctx.value as { status?: string; attempts?: number }
          const row = s.pwe.get('evt_dup_1')
          if (row) {
            if (v.status) row.status = v.status
            if (typeof v.attempts === 'number') row.attempts = v.attempts
          }
          return { data: null, error: null }
        }
        // select ... eq(event_id) ... maybeSingle
        const row = s.pwe.get('evt_dup_1')
        return { data: row ? { event_id: 'evt_dup_1', ...row } : null, error: null }
      }
      if (table === 'orders') {
        // Covers both the reservation fallback (reservation_id) and the
        // plausible hydrate (order_number/total/currency/event_id/order_items).
        return {
          data: {
            reservation_id: null,
            order_number: 'EL-TESTDUP1',
            total_cents: 4500,
            currency: 'AUD',
            event_id: 'event_1',
            order_items: [],
          },
          error: null,
        }
      }
      if (table === 'order_items') {
        return { data: [], error: null }
      }
      return { data: null, error: null }
    }
    const builder: AnyRecord = {
      select: () => builder,
      insert: (v: unknown) => { ctx.ops.push('insert'); ctx.value = v; return builder },
      update: (v: unknown) => { ctx.ops.push('update'); ctx.value = v; return builder },
      upsert: (v: unknown) => { ctx.ops.push('upsert'); ctx.value = v; return builder },
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => resolve(),
      single: async () => resolve(),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onF, onR),
    }
    return builder
  }
  return {
    from: (table: string) => chain(table),
    rpc: vi.fn(async (name: string) => {
      if (name === 'confirm_order') {
        runConfirmOrderModel()
        return { error: null }
      }
      return { error: null }
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeStatefulAdminMock() }))
vi.mock('@/lib/payments/stripe-adapter', () => ({
  StripeAdapter: class {
    async constructWebhookEvent() {
      return {
        id: 'evt_dup_1',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_dup_1', metadata: { order_id: 'order_1' }, latest_charge: null } },
      }
    }
  },
}))
vi.mock('@/lib/payments/connect-ledger', () => ({
  recordOrderConfirmedLedger: vi.fn(async () => ({ status: 'written' })),
}))
vi.mock('@/lib/redis/inventory-cache', () => ({ refreshInventoryCache: vi.fn(async () => {}) }))
vi.mock('@/lib/waitlist/promote', () => ({ promoteWaitlist: vi.fn(async () => {}) }))
vi.mock('@/lib/analytics/plausible', () => ({
  trackTicketPurchaseCompleteServer: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/stripe/connect-handlers', () => ({ handleConnectAccountUpdated: vi.fn(async () => {}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  isSentryEnabled: () => false,
}))

import { POST } from '@/app/api/webhooks/stripe/route'

function makeReq(): NextRequest {
  return {
    text: async () => '{}',
    headers: { get: (k: string) => (k.toLowerCase() === 'stripe-signature' ? 'sig_test' : null) },
  } as unknown as NextRequest
}

beforeEach(() => {
  resetState()
  delete process.env.RESEND_API_KEY
  vi.clearAllMocks()
})

describe('Stripe webhook duplicate delivery -> exactly one ticket', () => {
  test('two deliveries of the same event issue exactly one ticket', async () => {
    // First delivery: claims the event, runs the gate, issues, marks processed.
    const res1 = await POST(makeReq())
    expect(res1.status).toBe(200)
    const body1 = (await res1.json()) as { received: boolean; duplicate?: boolean }
    expect(body1.received).toBe(true)
    expect(body1.duplicate).toBeUndefined()

    // After delivery 1: one issuance, one ticket, ledger row marked processed.
    expect(h.state!.confirmOrderCalls).toBe(1)
    expect(h.state!.ticketsIssued).toBe(1)
    expect(h.state!.pwe.get('evt_dup_1')?.status).toBe('processed')

    // Second delivery: SAME event id. Dedupe must short-circuit it.
    const res2 = await POST(makeReq())
    expect(res2.status).toBe(200)
    const body2 = (await res2.json()) as { received: boolean; duplicate?: boolean }
    expect(body2.received).toBe(true)
    expect(body2.duplicate).toBe(true)

    // The whole point: the gate did NOT run again and NO second ticket.
    expect(h.state!.confirmOrderCalls).toBe(1)
    expect(h.state!.ticketsIssued).toBe(1)
  })
})
