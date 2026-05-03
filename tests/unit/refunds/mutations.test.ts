import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { executeStripeRefundMock, sendRefundEmailMock } = vi.hoisted(() => ({
  executeStripeRefundMock: vi.fn(),
  sendRefundEmailMock: vi.fn(),
}))

vi.mock('@/lib/stripe/refunds', () => ({
  executeStripeRefund: executeStripeRefundMock,
}))
vi.mock('@/lib/refunds/email', () => ({
  sendRefundEmail: sendRefundEmailMock,
}))

import { createRefundRequest, processRefund, cancelRefundRequest, escalateToDispute } from '@/lib/refunds/mutations'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyRecord = Record<string, unknown>

interface FakeDb {
  orders: AnyRecord[]
  refunds: AnyRecord[]
  inserts: AnyRecord[]
  updates: { table: string; values: AnyRecord; filters: AnyRecord }[]
}

function makeDb(overrides: Partial<FakeDb> = {}): FakeDb {
  return { orders: [], refunds: [], inserts: [], updates: [], ...overrides }
}

function makeClient(db: FakeDb): SupabaseClient {
  function builderFor(table: string, action: 'select' | 'insert' | 'update', values?: AnyRecord) {
    const filters: AnyRecord = {}
    const builder: AnyRecord = {
      eq(col: string, v: unknown) { filters[`eq:${col}`] = v; return builder },
      in(col: string, v: unknown[]) { filters[`in:${col}`] = v; return builder },
      neq(col: string, v: unknown) { filters[`neq:${col}`] = v; return builder },
      order() { return builder },
      limit() { return builder },
      maybeSingle() {
        if (table === 'orders') {
          const row = db.orders.find((o) => Object.entries(filters).every(([k, val]) => k.startsWith('eq:') ? o[k.slice(3)] === val : true))
          return Promise.resolve({ data: row ?? null, error: null })
        }
        if (table === 'refunds') {
          const row = db.refunds.find((r) => Object.entries(filters).every(([k, val]) => k.startsWith('eq:') ? r[k.slice(3)] === val : true))
          return Promise.resolve({ data: row ?? null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      single() {
        if (action === 'insert') {
          const row = { id: `r-${db.refunds.length + 1}`, ...values, status: (values as AnyRecord)?.status ?? 'pending' }
          db.refunds.push(row)
          db.inserts.push({ table, ...values })
          return Promise.resolve({ data: row, error: null })
        }
        if (action === 'update') {
          // Apply update + return updated
          const row = db.refunds.find((r) => Object.entries(filters).every(([k, v]) => k.startsWith('eq:') ? r[k.slice(3)] === v : true))
          if (row && values) Object.assign(row, values)
          db.updates.push({ table, values: values ?? {}, filters: { ...filters } })
          return Promise.resolve({ data: row ?? null, error: row ? null : new Error('no row') })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then(resolve: (v: unknown) => unknown) {
        if (table === 'refunds' && action === 'select') {
          const rows = db.refunds.filter((r) => Object.entries(filters).every(([k, v]) => k.startsWith('eq:') ? r[k.slice(3)] === v : true))
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        }
        if (table === 'orders' && action === 'update') {
          db.updates.push({ table, values: values ?? {}, filters: { ...filters } })
          return Promise.resolve({ data: null, error: null }).then(resolve)
        }
        if (action === 'update') {
          db.updates.push({ table, values: values ?? {}, filters: { ...filters } })
          return Promise.resolve({ data: null, error: null }).then(resolve)
        }
        return Promise.resolve({ data: null, error: null }).then(resolve)
      },
      select() { return builder },
    }
    return builder
  }

  return {
    from: vi.fn((table: string) => ({
      select: (_cols: string) => builderFor(table, 'select'),
      insert: (values: AnyRecord) => builderFor(table, 'insert', values),
      update: (values: AnyRecord) => builderFor(table, 'update', values),
    })),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  executeStripeRefundMock.mockReset()
  sendRefundEmailMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('createRefundRequest', () => {
  test('rejects invalid amount', async () => {
    const db = makeDb()
    const client = makeClient(db)
    const r = await createRefundRequest({
      orderId: 'o1', amountCents: 0, reason: 'requested_by_buyer',
      requestedBy: 'u1', creatorRole: 'buyer',
    }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid_amount')
  })

  test('rejects when order not found', async () => {
    const db = makeDb()
    const client = makeClient(db)
    const r = await createRefundRequest({
      orderId: 'missing', amountCents: 100, reason: 'requested_by_buyer',
      requestedBy: 'u1', creatorRole: 'buyer',
    }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('order_not_found')
  })

  test('rejects buyer who does not own the order', async () => {
    const db = makeDb({
      orders: [{ id: 'o1', organisation_id: 'org-1', user_id: 'somebody-else', status: 'confirmed', total_cents: 5000, currency: 'aud' }],
    })
    const client = makeClient(db)
    const r = await createRefundRequest({
      orderId: 'o1', amountCents: 100, reason: 'requested_by_buyer',
      requestedBy: 'u1', creatorRole: 'buyer',
    }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not_buyer_of_order')
  })

  test('rejects amount exceeding refundable', async () => {
    const db = makeDb({
      orders: [{ id: 'o1', organisation_id: 'org-1', user_id: 'u1', status: 'confirmed', total_cents: 100, currency: 'aud' }],
    })
    const client = makeClient(db)
    const r = await createRefundRequest({
      orderId: 'o1', amountCents: 200, reason: 'requested_by_buyer',
      requestedBy: 'u1', creatorRole: 'buyer',
    }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('amount_exceeds_refundable')
  })

  test('rejects when an active request already exists', async () => {
    const db = makeDb({
      orders: [{ id: 'o1', organisation_id: 'org-1', user_id: 'u1', status: 'confirmed', total_cents: 5000, currency: 'aud' }],
      refunds: [{ id: 'r0', order_id: 'o1', amount_cents: 100, status: 'pending' }],
    })
    const client = makeClient(db)
    const r = await createRefundRequest({
      orderId: 'o1', amountCents: 100, reason: 'requested_by_buyer',
      requestedBy: 'u1', creatorRole: 'buyer',
    }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('refund_already_in_progress')
  })

  test('creates a pending refund and notifies organiser', async () => {
    const db = makeDb({
      orders: [{ id: 'o1', organisation_id: 'org-1', user_id: 'u1', status: 'confirmed', total_cents: 5000, currency: 'aud' }],
    })
    const client = makeClient(db)
    const r = await createRefundRequest({
      orderId: 'o1', amountCents: 1500, reason: 'cannot_attend',
      buyerMessage: 'Schedule conflict', requestedBy: 'u1', creatorRole: 'buyer',
    }, client)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.refund.status).toBe('pending')
      expect(r.refund.amount_cents).toBe(1500)
    }
    expect(sendRefundEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'refund_requested',
      expect.objectContaining({ amountCents: 1500 })
    )
  })

  test('organiser-initiated request marks initiator=organiser', async () => {
    const db = makeDb({
      orders: [{ id: 'o1', organisation_id: 'org-1', user_id: 'u1', status: 'confirmed', total_cents: 5000, currency: 'aud' }],
    })
    const client = makeClient(db)
    const r = await createRefundRequest({
      orderId: 'o1', amountCents: 500, reason: 'event_cancelled',
      requestedBy: 'organiser-1', creatorRole: 'organiser',
    }, client)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.refund.initiator).toBe('organiser')
  })
})

describe('processRefund', () => {
  test('returns 404 when refund missing', async () => {
    const db = makeDb()
    const client = makeClient(db)
    const r = await processRefund({ refundId: 'missing', processedBy: 'u1', organisationId: 'org-1' }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(404)
  })

  test('returns 403 when refund belongs to different org', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', organisation_id: 'org-other', order_id: 'o1', status: 'pending', amount_cents: 100, currency: 'aud', reason: 'requested_by_buyer' }],
    })
    const client = makeClient(db)
    const r = await processRefund({ refundId: 'r1', processedBy: 'u1', organisationId: 'org-1' }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  test('on completed status: emits refund_processed email', async () => {
    const db = makeDb({
      orders: [{ id: 'o1', total_cents: 1000, status: 'confirmed' }],
      refunds: [{ id: 'r1', organisation_id: 'org-1', order_id: 'o1', status: 'pending', amount_cents: 1000, currency: 'aud', reason: 'requested_by_buyer' }],
    })
    const client = makeClient(db)
    executeStripeRefundMock.mockResolvedValueOnce({ status: 'completed', stripeRefundId: 're_1' })
    const r = await processRefund({ refundId: 'r1', processedBy: 'u1', organisationId: 'org-1' }, client)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.status).toBe('completed')
    expect(sendRefundEmailMock).toHaveBeenCalledWith(expect.anything(), 'org-1', 'refund_processed', expect.any(Object))
  })

  test('on failed status: emits refund_failed email', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', organisation_id: 'org-1', order_id: 'o1', status: 'pending', amount_cents: 1000, currency: 'aud', reason: 'requested_by_buyer' }],
    })
    const client = makeClient(db)
    executeStripeRefundMock.mockResolvedValueOnce({ status: 'failed', failureReason: 'card_declined' })
    const r = await processRefund({ refundId: 'r1', processedBy: 'u1', organisationId: 'org-1' }, client)
    expect(r.ok).toBe(true)
    expect(sendRefundEmailMock).toHaveBeenCalledWith(expect.anything(), 'org-1', 'refund_failed', expect.objectContaining({ failureReason: 'card_declined' }))
  })
})

describe('cancelRefundRequest', () => {
  test('organiser denial flips to cancelled and notifies buyer', async () => {
    const db = makeDb({
      refunds: [{
        id: 'r1', organisation_id: 'org-1', order_id: 'o1', status: 'pending',
        amount_cents: 100, currency: 'aud', reason: 'requested_by_buyer', requested_by: 'u1',
        organiser_internal_notes: null,
      }],
    })
    const client = makeClient(db)
    const r = await cancelRefundRequest({
      refundId: 'r1', actorRole: 'organiser', actorId: 'org-owner',
      organisationId: 'org-1', denialReason: 'Within 24 hours of event',
    }, client)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.refund.status).toBe('cancelled')
      expect(r.refund.organiser_internal_notes).toContain('Within 24 hours of event')
    }
    expect(sendRefundEmailMock).toHaveBeenCalledWith(expect.anything(), 'org-1', 'refund_denied', expect.any(Object))
  })

  test('buyer can withdraw own pending request without sending denial email', async () => {
    const db = makeDb({
      refunds: [{
        id: 'r1', organisation_id: 'org-1', order_id: 'o1', status: 'pending',
        amount_cents: 100, currency: 'aud', reason: 'requested_by_buyer', requested_by: 'u1',
      }],
    })
    const client = makeClient(db)
    const r = await cancelRefundRequest({
      refundId: 'r1', actorRole: 'buyer', actorId: 'u1',
    }, client)
    expect(r.ok).toBe(true)
    expect(sendRefundEmailMock).not.toHaveBeenCalled()
  })

  test('rejects cancel of non-pending refund', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', organisation_id: 'org-1', status: 'completed' }],
    })
    const client = makeClient(db)
    const r = await cancelRefundRequest({ refundId: 'r1', actorRole: 'organiser', actorId: 'x', organisationId: 'org-1' }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not_pending')
  })

  test('rejects buyer attempting to cancel another buyer\'s request', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', organisation_id: 'org-1', status: 'pending', requested_by: 'someone-else' }],
    })
    const client = makeClient(db)
    const r = await cancelRefundRequest({ refundId: 'r1', actorRole: 'buyer', actorId: 'u1' }, client)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })
})

describe('escalateToDispute', () => {
  test('only allows escalation of cancelled or failed refunds', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', organisation_id: 'org-1', status: 'pending' }],
    })
    const client = makeClient(db)
    const r = await escalateToDispute({ refundId: 'r1', organisationId: 'org-1', actorId: 'u1', rationale: 'fraud' }, client)
    expect(r.ok).toBe(false)
  })

  test('annotates internal notes when escalating cancelled refund', async () => {
    const db = makeDb({
      refunds: [{ id: 'r1', organisation_id: 'org-1', status: 'cancelled', organiser_internal_notes: 'orig' }],
    })
    const client = makeClient(db)
    const r = await escalateToDispute({ refundId: 'r1', organisationId: 'org-1', actorId: 'u1', rationale: 'fraud' }, client)
    expect(r.ok).toBe(true)
    expect(db.updates.find((u) => u.values.organiser_internal_notes && String(u.values.organiser_internal_notes).includes('escalated_to_dispute'))).toBeTruthy()
  })
})
