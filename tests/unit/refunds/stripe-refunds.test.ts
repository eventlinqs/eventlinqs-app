import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { refundOrderMock } = vi.hoisted(() => ({ refundOrderMock: vi.fn() }))

vi.mock('@/lib/payments/refund', async () => {
  const actual = await vi.importActual<typeof import('@/lib/payments/refund')>('@/lib/payments/refund')
  return { ...actual, refundOrder: refundOrderMock }
})

import { executeStripeRefund } from '@/lib/stripe/refunds'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyRecord = Record<string, unknown>

interface FakeDb {
  refunds: AnyRecord[]
  payments: AnyRecord[]
  updates: { table: string; values: AnyRecord; filters: AnyRecord }[]
}

function makeDb(overrides: Partial<FakeDb> = {}): FakeDb {
  return { refunds: [], payments: [], updates: [], ...overrides }
}

function makeClient(db: FakeDb): SupabaseClient {
  function builder(table: string, action: 'select' | 'update', values?: AnyRecord) {
    const filters: AnyRecord = {}
    const b: AnyRecord = {
      eq(c: string, v: unknown) { filters[`eq:${c}`] = v; return b },
      order() { return b },
      limit() { return b },
      maybeSingle() {
        if (table === 'refunds') {
          const row = db.refunds.find((r) => Object.entries(filters).every(([k, v]) => k.startsWith('eq:') ? r[k.slice(3)] === v : true))
          return Promise.resolve({ data: row ?? null, error: null })
        }
        if (table === 'payments') {
          const rows = db.payments.filter((p) => Object.entries(filters).every(([k, v]) => k.startsWith('eq:') ? p[k.slice(3)] === v : true))
          return Promise.resolve({ data: rows[0] ?? null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then(resolve: (v: unknown) => unknown) {
        if (action === 'update') {
          const row = db.refunds.find((r) => Object.entries(filters).every(([k, v]) => k.startsWith('eq:') ? r[k.slice(3)] === v : true))
          if (row && values) Object.assign(row, values)
          db.updates.push({ table, values: values ?? {}, filters: { ...filters } })
        }
        return Promise.resolve({ data: null, error: null }).then(resolve)
      },
      select() { return b },
      single() {
        if (action === 'update') {
          const row = db.refunds.find((r) => Object.entries(filters).every(([k, v]) => k.startsWith('eq:') ? r[k.slice(3)] === v : true))
          if (row && values) Object.assign(row, values)
          db.updates.push({ table, values: values ?? {}, filters: { ...filters } })
          return Promise.resolve({ data: row, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
    }
    return b
  }
  return {
    from: vi.fn((table: string) => ({
      select: () => builder(table, 'select'),
      update: (values: AnyRecord) => builder(table, 'update', values),
    })),
  } as unknown as SupabaseClient
}

beforeEach(() => refundOrderMock.mockReset())
afterEach(() => vi.clearAllMocks())

describe('executeStripeRefund', () => {
  test('returns missing_payment_intent when no completed payment row', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', order_id: 'o1', organisation_id: 'org-1', amount_cents: 100, currency: 'aud', reason: 'requested_by_buyer', status: 'pending', initiator: 'buyer' }],
      payments: [],
    })
    const client = makeClient(db)
    const r = await executeStripeRefund(client, { refundId: 'r1', processedBy: 'u1' })
    expect(r.status).toBe('missing_payment_intent')
  })

  test('on success: marks completed and stores stripe_refund_id', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', order_id: 'o1', organisation_id: 'org-1', amount_cents: 100, currency: 'aud', reason: 'requested_by_buyer', status: 'pending', initiator: 'buyer' }],
      payments: [{ order_id: 'o1', status: 'completed', gateway_payment_id: 'pi_test', created_at: '2026-05-01' }],
    })
    const client = makeClient(db)
    refundOrderMock.mockResolvedValueOnce({ stripeRefundId: 're_test', status: 'succeeded' })
    const r = await executeStripeRefund(client, { refundId: 'r1', processedBy: 'u1' })
    expect(r.status).toBe('completed')
    expect(r.stripeRefundId).toBe('re_test')
    const row = db.refunds[0]
    expect(row.status).toBe('completed')
    expect(row.stripe_refund_id).toBe('re_test')
  })

  test('on Stripe failure: marks failed with reason', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', order_id: 'o1', organisation_id: 'org-1', amount_cents: 100, currency: 'aud', reason: 'requested_by_buyer', status: 'pending', initiator: 'buyer' }],
      payments: [{ order_id: 'o1', status: 'completed', gateway_payment_id: 'pi_test', created_at: '2026-05-01' }],
    })
    const client = makeClient(db)
    refundOrderMock.mockRejectedValueOnce(new Error('charge_already_refunded'))
    const r = await executeStripeRefund(client, { refundId: 'r1', processedBy: 'u1' })
    expect(r.status).toBe('failed')
    const row = db.refunds[0]
    expect(row.status).toBe('failed')
    expect(row.failure_reason).toBe('charge_already_refunded')
  })

  test('skips when refund is not pending', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', order_id: 'o1', organisation_id: 'org-1', amount_cents: 100, currency: 'aud', reason: 'requested_by_buyer', status: 'completed', initiator: 'buyer' }],
    })
    const client = makeClient(db)
    const r = await executeStripeRefund(client, { refundId: 'r1', processedBy: 'u1' })
    expect(r.status).toBe('skipped_not_pending')
    expect(refundOrderMock).not.toHaveBeenCalled()
  })
})
