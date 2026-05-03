import { describe, expect, test, vi } from 'vitest'
import {
  getOrganiserPayouts,
  getOrganiserPayoutSummary,
  getReserveReleaseSchedule,
  getRefundImpact,
} from '@/lib/payouts/queries'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyRecord = Record<string, unknown>

interface MockState {
  payouts: AnyRecord[]
  payoutsCount: number | null
  payoutHolds: AnyRecord[]
  ledger: AnyRecord[]
  ledgerCount: number | null
  org: AnyRecord | null
  capturedQueries: { table: string; filters: AnyRecord }[]
}

function makeState(overrides: Partial<MockState> = {}): MockState {
  return {
    payouts: [],
    payoutsCount: null,
    payoutHolds: [],
    ledger: [],
    ledgerCount: null,
    org: { stripe_account_country: 'AU' },
    capturedQueries: [],
    ...overrides,
  }
}

/**
 * Builds a chainable Supabase mock that records every filter applied so
 * tests can assert against the captured filter set rather than chasing
 * internal mock calls. The mock is tolerant: any chained call returns the
 * same builder, and the terminal `await` resolves to a configured payload.
 */
function makeMockClient(state: MockState): SupabaseClient {
  function buildBuilder(table: string, terminalPayload: () => unknown) {
    const filters: AnyRecord = {}

    const builder: AnyRecord = {
      _filters: filters,
      eq(col: string, value: unknown) {
        filters[`eq:${col}`] = value
        return builder
      },
      neq(col: string, value: unknown) {
        filters[`neq:${col}`] = value
        return builder
      },
      in(col: string, values: unknown[]) {
        filters[`in:${col}`] = values
        return builder
      },
      is(col: string, value: unknown) {
        filters[`is:${col}`] = value
        return builder
      },
      gte(col: string, value: unknown) {
        filters[`gte:${col}`] = value
        return builder
      },
      lte(col: string, value: unknown) {
        filters[`lte:${col}`] = value
        return builder
      },
      order(col: string, opts?: AnyRecord) {
        filters[`order:${col}`] = opts ?? {}
        return builder
      },
      range(from: number, to: number) {
        filters['range'] = [from, to]
        return builder
      },
      limit(n: number) {
        filters['limit'] = n
        return builder
      },
      maybeSingle() {
        state.capturedQueries.push({ table, filters: { ...filters } })
        return Promise.resolve(terminalPayload())
      },
      single() {
        state.capturedQueries.push({ table, filters: { ...filters } })
        return Promise.resolve(terminalPayload())
      },
      then(resolve: (value: unknown) => unknown) {
        state.capturedQueries.push({ table, filters: { ...filters } })
        return Promise.resolve(terminalPayload()).then(resolve)
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
            case 'payouts':
              return {
                data: state.payouts,
                error: null,
                count: wantsCount ? state.payoutsCount : undefined,
              }
            case 'payout_holds':
              return { data: state.payoutHolds, error: null }
            case 'organiser_balance_ledger':
              return {
                data: state.ledger,
                error: null,
                count: wantsCount ? state.ledgerCount : undefined,
              }
            case 'organisations':
              return { data: state.org, error: null }
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

describe('getOrganiserPayouts', () => {
  test('returns rows with default pagination and total count', async () => {
    const state = makeState({
      payouts: [
        {
          id: 'po_1',
          stripe_payout_id: 'po_stripe_1',
          amount_cents: 12345,
          currency: 'aud',
          arrival_date: '2026-05-10T00:00:00Z',
          status: 'paid',
          failure_reason: null,
          created_at: '2026-05-09T00:00:00Z',
          updated_at: '2026-05-10T00:00:00Z',
        },
      ],
      payoutsCount: 1,
    })
    const client = makeMockClient(state)

    const page = await getOrganiserPayouts('org-1', {}, client)

    expect(page.rows).toHaveLength(1)
    expect(page.rows[0].stripe_payout_id).toBe('po_stripe_1')
    expect(page.total).toBe(1)
    expect(page.limit).toBe(20)
    expect(page.offset).toBe(0)
  })

  test('clamps limit to MAX_PAGE_SIZE (100)', async () => {
    const state = makeState({ payouts: [], payoutsCount: 0 })
    const client = makeMockClient(state)

    const page = await getOrganiserPayouts('org-1', { limit: 999 }, client)
    expect(page.limit).toBe(100)
  })

  test('applies status filter when not "all"', async () => {
    const state = makeState({ payouts: [], payoutsCount: 0 })
    const client = makeMockClient(state)

    await getOrganiserPayouts('org-1', { status: 'paid' }, client)

    const q = state.capturedQueries.find((q) => q.table === 'payouts')
    expect(q?.filters['eq:status']).toBe('paid')
  })

  test('does not apply status filter when "all"', async () => {
    const state = makeState({ payouts: [], payoutsCount: 0 })
    const client = makeMockClient(state)

    await getOrganiserPayouts('org-1', { status: 'all' }, client)

    const q = state.capturedQueries.find((q) => q.table === 'payouts')
    expect(q?.filters['eq:status']).toBeUndefined()
  })

  test('lowercases currency filter', async () => {
    const state = makeState({ payouts: [], payoutsCount: 0 })
    const client = makeMockClient(state)

    await getOrganiserPayouts('org-1', { currency: 'AUD' }, client)
    const q = state.capturedQueries.find((q) => q.table === 'payouts')
    expect(q?.filters['eq:currency']).toBe('aud')
  })

  test('applies arrival date range filters', async () => {
    const state = makeState({ payouts: [], payoutsCount: 0 })
    const client = makeMockClient(state)

    await getOrganiserPayouts(
      'org-1',
      { fromDate: '2026-04-01', toDate: '2026-04-30' },
      client
    )
    const q = state.capturedQueries.find((q) => q.table === 'payouts')
    expect(q?.filters['gte:arrival_date']).toBe('2026-04-01')
    expect(q?.filters['lte:arrival_date']).toBe('2026-04-30')
  })

  test('respects offset for pagination', async () => {
    const state = makeState({ payouts: [], payoutsCount: 0 })
    const client = makeMockClient(state)
    await getOrganiserPayouts('org-1', { limit: 10, offset: 30 }, client)
    const q = state.capturedQueries.find((q) => q.table === 'payouts')
    expect(q?.filters['range']).toEqual([30, 39])
  })
})

describe('getOrganiserPayoutSummary', () => {
  test('aggregates pending, paid this month, on hold, lifetime totals', async () => {
    const state = makeState({
      payouts: [
        { amount_cents: 1000, currency: 'aud' },
        { amount_cents: 500, currency: 'aud' },
      ],
      payoutHolds: [
        { amount_cents: 2000, currency: 'aud' },
      ],
    })
    const client = makeMockClient(state)
    const summary = await getOrganiserPayoutSummary('org-1', client)

    expect(summary.currency).toBe('aud')
    expect(summary.pendingCents).toBe(1500)
    expect(summary.paidThisMonthCents).toBe(1500)
    expect(summary.onHoldCents).toBe(2000)
    expect(summary.lifetimeCents).toBe(1500)
  })

  test('falls back to org country currency when no rows exist', async () => {
    const state = makeState({
      payouts: [],
      payoutHolds: [],
      org: { stripe_account_country: 'GB' },
    })
    const client = makeMockClient(state)
    const summary = await getOrganiserPayoutSummary('org-1', client)
    expect(summary.currency).toBe('gbp')
    expect(summary.pendingCents).toBe(0)
  })

  test('defaults to AUD when no rows and no country', async () => {
    const state = makeState({ payouts: [], payoutHolds: [], org: null })
    const client = makeMockClient(state)
    const summary = await getOrganiserPayoutSummary('org-1', client)
    expect(summary.currency).toBe('aud')
  })
})

describe('getReserveReleaseSchedule', () => {
  test('returns rows in release_at order with event title flattened', async () => {
    const state = makeState({
      payoutHolds: [
        {
          id: 'hold_1',
          event_id: 'evt_1',
          hold_type: 'reserve',
          amount_cents: 5000,
          currency: 'aud',
          release_at: '2026-05-15T00:00:00Z',
          events: { title: 'Lagos Live' },
        },
        {
          id: 'hold_2',
          event_id: null,
          hold_type: 'admin_manual',
          amount_cents: 10000,
          currency: 'aud',
          release_at: '2026-05-20T00:00:00Z',
          events: null,
        },
      ],
    })
    const client = makeMockClient(state)
    const rows = await getReserveReleaseSchedule('org-1', 30, client)
    expect(rows).toHaveLength(2)
    expect(rows[0].event_title).toBe('Lagos Live')
    expect(rows[1].event_title).toBeNull()
  })

  test('handles array-shaped events relation', async () => {
    const state = makeState({
      payoutHolds: [
        {
          id: 'hold_3',
          event_id: 'evt_3',
          hold_type: 'reserve',
          amount_cents: 7000,
          currency: 'gbp',
          release_at: '2026-05-25T00:00:00Z',
          events: [{ title: 'London Funk Night' }],
        },
      ],
    })
    const client = makeMockClient(state)
    const rows = await getReserveReleaseSchedule('org-1', 30, client)
    expect(rows[0].event_title).toBe('London Funk Night')
  })

  test('respects daysAhead horizon', async () => {
    const state = makeState({ payoutHolds: [] })
    const client = makeMockClient(state)
    await getReserveReleaseSchedule('org-1', 7, client)
    const q = state.capturedQueries.find((q) => q.table === 'payout_holds')
    const horizon = q?.filters['lte:release_at']
    expect(typeof horizon).toBe('string')
    const horizonDate = new Date(horizon as string).getTime()
    const expected = Date.now() + 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(horizonDate - expected)).toBeLessThan(60_000)
  })

  test('only returns unreleased holds', async () => {
    const state = makeState({ payoutHolds: [] })
    const client = makeMockClient(state)
    await getReserveReleaseSchedule('org-1', 30, client)
    const q = state.capturedQueries.find((q) => q.table === 'payout_holds')
    expect(q?.filters['is:released_at']).toBeNull()
  })
})

describe('getRefundImpact', () => {
  test('queries only refund and chargeback ledger reasons', async () => {
    const state = makeState({ ledger: [], ledgerCount: 0 })
    const client = makeMockClient(state)
    await getRefundImpact('org-1', {}, client)
    const q = state.capturedQueries.find((q) => q.table === 'organiser_balance_ledger')
    expect(q?.filters['in:reason']).toEqual([
      'refund_from_balance',
      'refund_from_reserve',
      'refund_from_gateway',
      'refund_platform_float',
      'chargeback',
      'chargeback_fee',
    ])
  })

  test('returns paginated rows with total', async () => {
    const state = makeState({
      ledger: [
        {
          id: 'led_1',
          reason: 'refund_from_balance',
          delta_cents: -2500,
          currency: 'aud',
          reference_type: 'order',
          reference_id: 'order-uuid',
          created_at: '2026-05-01T00:00:00Z',
          metadata: {},
        },
      ],
      ledgerCount: 1,
    })
    const client = makeMockClient(state)
    const page = await getRefundImpact('org-1', { limit: 10 }, client)
    expect(page.total).toBe(1)
    expect(page.limit).toBe(10)
    expect(page.rows[0].delta_cents).toBe(-2500)
  })
})
