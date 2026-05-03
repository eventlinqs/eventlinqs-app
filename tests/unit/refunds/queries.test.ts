import { describe, expect, test, vi } from 'vitest'
import {
  getOrganiserRefunds,
  getBuyerRefundRequests,
  getRefundById,
  getRefundStatistics,
} from '@/lib/refunds/queries'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyRecord = Record<string, unknown>

interface MockState {
  refunds: AnyRecord[]
  refundsCount: number | null
  orders: AnyRecord[]
  capturedQueries: { table: string; filters: AnyRecord }[]
}

function makeState(overrides: Partial<MockState> = {}): MockState {
  return {
    refunds: [],
    refundsCount: null,
    orders: [],
    capturedQueries: [],
    ...overrides,
  }
}

function makeMockClient(state: MockState): SupabaseClient {
  function buildBuilder(table: string, payload: () => unknown) {
    const filters: AnyRecord = {}
    const builder: AnyRecord = {
      _filters: filters,
      eq(col: string, value: unknown) { filters[`eq:${col}`] = value; return builder },
      in(col: string, values: unknown[]) { filters[`in:${col}`] = values; return builder },
      gte(col: string, value: unknown) { filters[`gte:${col}`] = value; return builder },
      lte(col: string, value: unknown) { filters[`lte:${col}`] = value; return builder },
      order(col: string, opts?: AnyRecord) { filters[`order:${col}`] = opts ?? {}; return builder },
      range(from: number, to: number) { filters['range'] = [from, to]; return builder },
      limit(n: number) { filters['limit'] = n; return builder },
      maybeSingle() {
        state.capturedQueries.push({ table, filters: { ...filters } })
        return Promise.resolve(payload())
      },
      single() {
        state.capturedQueries.push({ table, filters: { ...filters } })
        return Promise.resolve(payload())
      },
      then(resolve: (v: unknown) => unknown) {
        state.capturedQueries.push({ table, filters: { ...filters } })
        return Promise.resolve(payload()).then(resolve)
      },
    }
    return builder
  }

  const from = vi.fn((table: string) => {
    return {
      select(_cols: string, opts?: { count?: string }) {
        const wantsCount = opts?.count === 'exact'
        const builder = buildBuilder(table, () => {
          switch (table) {
            case 'refunds':
              return { data: state.refunds, error: null, count: wantsCount ? state.refundsCount : undefined }
            case 'orders':
              return { data: state.orders, error: null }
            default:
              return { data: null, error: null }
          }
        })
        return builder
      },
    }
  })

  return { from } as unknown as SupabaseClient
}

describe('getOrganiserRefunds', () => {
  test('returns paginated rows with total and flattened order data', async () => {
    const state = makeState({
      refunds: [
        {
          id: 'r1',
          order_id: 'o1',
          organisation_id: 'org-1',
          amount_cents: 1000,
          currency: 'aud',
          reason: 'requested_by_buyer',
          status: 'pending',
          initiator: 'buyer',
          stripe_refund_id: null,
          stripe_application_fee_refund_id: null,
          refund_reverse_transfer: true,
          buyer_message: null,
          organiser_internal_notes: null,
          failure_reason: null,
          requested_by: 'user-1',
          processed_by: null,
          requested_at: '2026-05-01T00:00:00Z',
          processed_at: null,
          cancelled_at: null,
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
          orders: {
            order_number: 'EL-12345678',
            guest_email: null,
            guest_name: null,
            total_cents: 5000,
            status: 'confirmed',
            events: { title: 'Lagos Live' },
            profiles: { email: 'buyer@example.com', full_name: 'Test Buyer' },
          },
        },
      ],
      refundsCount: 1,
    })
    const client = makeMockClient(state)
    const page = await getOrganiserRefunds('org-1', {}, client)
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0].order_number).toBe('EL-12345678')
    expect(page.rows[0].buyer_email).toBe('buyer@example.com')
    expect(page.rows[0].event_title).toBe('Lagos Live')
    expect(page.total).toBe(1)
    expect(page.limit).toBe(20)
  })

  test('clamps limit to MAX (100)', async () => {
    const state = makeState({ refunds: [], refundsCount: 0 })
    const client = makeMockClient(state)
    const page = await getOrganiserRefunds('org-1', { limit: 999 }, client)
    expect(page.limit).toBe(100)
  })

  test('omits status filter when "all"', async () => {
    const state = makeState({ refunds: [], refundsCount: 0 })
    const client = makeMockClient(state)
    await getOrganiserRefunds('org-1', { status: 'all' }, client)
    const q = state.capturedQueries.find((c) => c.table === 'refunds')
    expect(q?.filters['eq:status']).toBeUndefined()
  })

  test('applies date range filters', async () => {
    const state = makeState({ refunds: [], refundsCount: 0 })
    const client = makeMockClient(state)
    await getOrganiserRefunds('org-1', { fromDate: '2026-04-01', toDate: '2026-04-30' }, client)
    const q = state.capturedQueries.find((c) => c.table === 'refunds')
    expect(q?.filters['gte:created_at']).toBe('2026-04-01')
    expect(q?.filters['lte:created_at']).toBe('2026-04-30')
  })

  test('respects offset', async () => {
    const state = makeState({ refunds: [], refundsCount: 0 })
    const client = makeMockClient(state)
    await getOrganiserRefunds('org-1', { limit: 10, offset: 30 }, client)
    const q = state.capturedQueries.find((c) => c.table === 'refunds')
    expect(q?.filters['range']).toEqual([30, 39])
  })

  test('handles array-shaped events relation', async () => {
    const state = makeState({
      refunds: [
        {
          id: 'r1',
          order_id: 'o1',
          organisation_id: 'org-1',
          amount_cents: 100,
          currency: 'aud',
          status: 'pending',
          orders: { events: [{ title: 'Array Event' }], profiles: null },
        },
      ],
      refundsCount: 1,
    })
    const client = makeMockClient(state)
    const page = await getOrganiserRefunds('org-1', {}, client)
    expect(page.rows[0].event_title).toBe('Array Event')
  })
})

describe('getBuyerRefundRequests', () => {
  test('queries by requested_by', async () => {
    const state = makeState({ refunds: [], refundsCount: 0 })
    const client = makeMockClient(state)
    await getBuyerRefundRequests('user-1', {}, client)
    const q = state.capturedQueries.find((c) => c.table === 'refunds')
    expect(q?.filters['eq:requested_by']).toBe('user-1')
  })
})

describe('getRefundById', () => {
  test('returns null when not found', async () => {
    const customClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient
    const r = await getRefundById('does-not-exist', customClient)
    expect(r).toBeNull()
  })

  test('shapes the detail with order_total_cents', async () => {
    const customClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id: 'r1',
                  order_id: 'o1',
                  organisation_id: 'org-1',
                  amount_cents: 500,
                  currency: 'aud',
                  status: 'completed',
                  orders: {
                    order_number: 'EL-FOO',
                    total_cents: 5000,
                    status: 'partially_refunded',
                    events: { title: 'Detail' },
                    profiles: { email: 'b@x.com', full_name: 'B' },
                  },
                },
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient
    const r = await getRefundById('r1', customClient)
    expect(r?.order_total_cents).toBe(5000)
    expect(r?.order_status).toBe('partially_refunded')
  })
})

describe('getRefundStatistics', () => {
  test('aggregates counts and refund rate', async () => {
    const customClient = {
      from: vi.fn((table: string) => {
        const select = (_c: string) => ({
          eq: () => {
            if (table === 'refunds') {
              return {
                eq: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ amount_cents: 1000, currency: 'aud' }], error: null }).then(r) }),
                then: (r: (v: unknown) => unknown) => Promise.resolve({
                  data: [{ status: 'completed' }, { status: 'pending' }, { status: 'completed' }],
                  error: null,
                }).then(r),
              }
            }
            return {
              in: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ total_cents: 10000 }, { total_cents: 5000 }], error: null }).then(r) }),
            }
          },
        })
        return { select }
      }),
    } as unknown as SupabaseClient
    const stats = await getRefundStatistics('org-1', customClient)
    expect(stats.completed_count).toBe(2)
    expect(stats.pending_count).toBe(1)
    expect(stats.total_refunded_cents).toBe(1000)
    expect(stats.refund_rate_percent).toBeCloseTo((1000 / 15000) * 100, 2)
  })
})
