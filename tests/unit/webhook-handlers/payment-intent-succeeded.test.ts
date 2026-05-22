// Triad refactor coverage (P2-1, P2-2, P2-6, P2-7).
//
// Exercises the Stripe webhook POST for payment_intent.succeeded:
//   - happy path: confirm_order runs BEFORE the payment is marked
//     completed, event recorded processed, 200
//   - confirm_order failure: non-2xx so Stripe retries; payment NOT
//     transitioned; event marked failed
//   - replay of an already-processed event_id: no-op 200, handler not run
//   - signature verification failure: 400, no dispatch
//
// The route's heavy import graph (supabase, redis, resend, plausible,
// next/cache) is mocked. The dedupe module (webhook-events) is NOT mocked:
// its claim-first lifecycle is part of what we are testing.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { NextRequest } from 'next/server'

type AnyRecord = Record<string, unknown>

interface Scenario {
  payment: { id: string; status: string; order_id: string } | null
  confirmOrderError: { message: string } | null
  transitionError: { message: string } | null
  // true => upsert claim insert won (fresh claim); false => conflict
  claimUpsertReturnsRow: boolean
  existingEvent: { event_id: string; status: string; attempts: number } | null
}

interface Recorder {
  rpcCalls: string[]
  pweUpdates: AnyRecord[]
}

const h = vi.hoisted(() => ({
  scenario: null as Scenario | null,
  recorder: null as Recorder | null,
  construct: { value: null as unknown, throws: false },
}))

// ── Chainable supabase mock ────────────────────────────────────────────────
function makeAdminMock(scenario: Scenario, recorder: Recorder) {
  function chain(table: string) {
    const ctx: { table: string; ops: string[]; value?: unknown } = {
      table,
      ops: [],
    }
    const resolve = (): { data: unknown; error: unknown } => {
      if (table === 'payments') {
        return { data: scenario.payment, error: null }
      }
      if (table === 'processed_webhook_events') {
        if (ctx.ops.includes('upsert')) {
          return {
            data: scenario.claimUpsertReturnsRow
              ? [{ event_id: 'evt_1', status: 'received', attempts: 1 }]
              : [],
            error: null,
          }
        }
        if (ctx.ops.includes('update')) {
          recorder.pweUpdates.push(ctx.value as AnyRecord)
          return { data: null, error: null }
        }
        // select ... eq(event_id) ... maybeSingle
        return { data: scenario.existingEvent, error: null }
      }
      if (table === 'orders') {
        // reservation fallback lookup -> no reservation; plausible lookup -> skip
        return { data: { reservation_id: null }, error: null }
      }
      if (table === 'order_items') {
        return { data: [], error: null }
      }
      return { data: null, error: null }
    }
    const builder: AnyRecord = {
      select: () => builder,
      insert: (v: unknown) => {
        ctx.ops.push('insert')
        ctx.value = v
        return builder
      },
      update: (v: unknown) => {
        ctx.ops.push('update')
        ctx.value = v
        return builder
      },
      upsert: (v: unknown) => {
        ctx.ops.push('upsert')
        ctx.value = v
        return builder
      },
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
      recorder.rpcCalls.push(name)
      if (name === 'confirm_order') {
        return { error: scenario.confirmOrderError }
      }
      if (name === 'transition_payment_status') {
        return { error: scenario.transitionError }
      }
      return { error: null }
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminMock(h.scenario!, h.recorder!),
}))
vi.mock('@/lib/payments/stripe-adapter', () => ({
  StripeAdapter: class {
    async constructWebhookEvent() {
      if (h.construct.throws) throw new Error('signature verification failed')
      return h.construct.value
    }
  },
}))
vi.mock('@/lib/payments/connect-ledger', () => ({
  recordOrderConfirmedLedger: vi.fn(async () => ({ status: 'written' })),
}))
vi.mock('@/lib/redis/inventory-cache', () => ({
  refreshInventoryCache: vi.fn(async () => {}),
}))
vi.mock('@/lib/waitlist/promote', () => ({
  promoteWaitlist: vi.fn(async () => {}),
}))
vi.mock('@/lib/analytics/plausible', () => ({
  trackTicketPurchaseCompleteServer: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/stripe/connect-handlers', () => ({
  handleConnectAccountUpdated: vi.fn(async () => {}),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/observability/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  isSentryEnabled: () => false,
}))

import { POST } from '@/app/api/webhooks/stripe/route'
import { captureException } from '@/lib/observability/sentry'

function makeReq(body = '{}'): NextRequest {
  return {
    text: async () => body,
    headers: {
      get: (k: string) => (k.toLowerCase() === 'stripe-signature' ? 'sig_test' : null),
    },
  } as unknown as NextRequest
}

function succeededEvent() {
  return {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_1',
        metadata: { order_id: 'order_1' },
        latest_charge: null,
      },
    },
  }
}

function baseScenario(): Scenario {
  return {
    payment: { id: 'pay_1', status: 'processing', order_id: 'order_1' },
    confirmOrderError: null,
    transitionError: null,
    claimUpsertReturnsRow: true,
    existingEvent: null,
  }
}

beforeEach(() => {
  h.recorder = { rpcCalls: [], pweUpdates: [] }
  h.scenario = baseScenario()
  h.construct = { value: succeededEvent(), throws: false }
  delete process.env.RESEND_API_KEY
  vi.clearAllMocks()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/webhooks/stripe - payment_intent.succeeded', () => {
  test('happy path: confirm_order runs BEFORE payment is marked completed, 200', async () => {
    const res = await POST(makeReq())

    expect(res.status).toBe(200)
    const body = (await res.json()) as { received: boolean; duplicate?: boolean }
    expect(body.received).toBe(true)
    expect(body.duplicate).toBeUndefined()

    // P2-1/P2-7: the authoritative gate is called, and it is called
    // strictly before the payment-status transition.
    expect(h.recorder!.rpcCalls).toContain('confirm_order')
    expect(h.recorder!.rpcCalls).toContain('transition_payment_status')
    expect(h.recorder!.rpcCalls.indexOf('confirm_order')).toBeLessThan(
      h.recorder!.rpcCalls.indexOf('transition_payment_status')
    )

    // P2-6: event recorded processed (not failed).
    const statuses = h.recorder!.pweUpdates.map(u => u.status)
    expect(statuses).toContain('processed')
    expect(statuses).not.toContain('failed')
  })

  test('confirm_order failure returns non-2xx and does NOT mark payment completed', async () => {
    h.scenario!.confirmOrderError = { message: 'tier structure mismatch' }

    const res = await POST(makeReq())

    // P2-2: failure is no longer swallowed behind a 200.
    expect(res.status).toBe(500)

    // Gate failed, so the payment transition must NOT have run.
    expect(h.recorder!.rpcCalls).toContain('confirm_order')
    expect(h.recorder!.rpcCalls).not.toContain('transition_payment_status')

    // P2-6: event marked failed (so a retry re-processes, not a no-op).
    const statuses = h.recorder!.pweUpdates.map(u => u.status)
    expect(statuses).toContain('failed')
    expect(statuses).not.toContain('processed')

    // P3-1: the failure was captured for observability.
    expect(captureException).toHaveBeenCalled()
  })

  test('replay of an already-processed event_id is a no-op (200 duplicate)', async () => {
    // Claim upsert hits a conflict and the existing row is already processed.
    h.scenario!.claimUpsertReturnsRow = false
    h.scenario!.existingEvent = { event_id: 'evt_1', status: 'processed', attempts: 1 }

    const res = await POST(makeReq())

    expect(res.status).toBe(200)
    const body = (await res.json()) as { received: boolean; duplicate?: boolean }
    expect(body.received).toBe(true)
    expect(body.duplicate).toBe(true)

    // The handler never ran: no gate call on a duplicate delivery.
    expect(h.recorder!.rpcCalls).not.toContain('confirm_order')
    expect(h.recorder!.rpcCalls).not.toContain('transition_payment_status')
  })

  test('signature verification failure returns 400 and does not dispatch', async () => {
    h.construct = { value: null, throws: true }

    const res = await POST(makeReq())

    expect(res.status).toBe(400)
    expect(h.recorder!.rpcCalls).toHaveLength(0)
    expect(captureException).toHaveBeenCalled()
  })
})
