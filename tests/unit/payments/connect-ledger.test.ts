import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/payments/pricing-rules', () => ({
  getReservePercentage: vi.fn(),
  getPayoutScheduleDays: vi.fn(),
}))

import {
  addBusinessDays,
  addThreeBusinessDays,
  recordOrderConfirmedLedger,
} from '@/lib/payments/connect-ledger'
import { getReservePercentage, getPayoutScheduleDays } from '@/lib/payments/pricing-rules'

const mockedReserve = vi.mocked(getReservePercentage)
const mockedPayoutDays = vi.mocked(getPayoutScheduleDays)

type AnyRecord = Record<string, unknown>
type SelectResult<T = AnyRecord | null> = { data: T; error: { message: string } | null }
type WriteResult = { error: { message: string } | null }

interface AdminMock {
  ledgerExisting: SelectResult
  orderRow: SelectResult
  orgRow: SelectResult
  eventRow: SelectResult
  ledgerInsertResults: WriteResult[]
  holdInsertResult: SelectResult<{ id: string } | null>
  confirmedCountResult: { count: number | null; error: { message: string } | null }
  orgUpdateResult: WriteResult
  orgCountersRead: SelectResult

  ledgerInserts: AnyRecord[]
  holdInserts: AnyRecord[]
  orgUpdates: AnyRecord[]
}

function buildAdminMock(overrides: Partial<AdminMock> = {}): AdminMock {
  return {
    ledgerExisting: { data: null, error: null },
    orderRow: { data: null, error: null },
    orgRow: { data: { stripe_account_country: 'AU' }, error: null },
    eventRow: { data: { end_date: '2026-06-15T20:00:00Z' }, error: null },
    ledgerInsertResults: [{ error: null }, { error: null }],
    holdInsertResult: { data: { id: 'hold_1' }, error: null },
    confirmedCountResult: { count: 0, error: null },
    orgUpdateResult: { error: null },
    orgCountersRead: {
      data: { hold_amount_cents: 0, total_volume_cents: 0, total_event_count: 0 },
      error: null,
    },
    ledgerInserts: [],
    holdInserts: [],
    orgUpdates: [],
    ...overrides,
  }
}

function buildAdminClient(state: AdminMock) {
  let ledgerInsertCallIdx = 0

  const from = vi.fn((table: string) => {
    if (table === 'organiser_balance_ledger') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: vi.fn().mockResolvedValue(state.ledgerExisting),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn((row: AnyRecord) => {
          state.ledgerInserts.push(row)
          const result = state.ledgerInsertResults[ledgerInsertCallIdx] ?? { error: null }
          ledgerInsertCallIdx += 1
          return Promise.resolve(result)
        }),
      }
    }
    if (table === 'orders') {
      return {
        select: vi.fn((cols: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === 'exact' && options?.head) {
            return {
              eq: () => ({
                eq: () => ({
                  neq: vi.fn().mockResolvedValue(state.confirmedCountResult),
                }),
              }),
            }
          }
          return {
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue(state.orderRow),
            }),
          }
        }),
      }
    }
    if (table === 'organisations') {
      return {
        select: vi.fn((cols: string) => {
          if (cols.includes('hold_amount_cents')) {
            return {
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue(state.orgCountersRead),
              }),
            }
          }
          return {
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue(state.orgRow),
            }),
          }
        }),
        update: vi.fn((row: AnyRecord) => {
          state.orgUpdates.push(row)
          return {
            eq: vi.fn().mockResolvedValue(state.orgUpdateResult),
          }
        }),
      }
    }
    if (table === 'events') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue(state.eventRow),
          }),
        }),
      }
    }
    if (table === 'payout_holds') {
      return {
        insert: vi.fn((row: AnyRecord) => {
          state.holdInserts.push(row)
          return {
            select: () => ({
              single: vi.fn().mockResolvedValue(state.holdInsertResult),
            }),
          }
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from } as unknown as Parameters<typeof recordOrderConfirmedLedger>[0]
}

const baseOrder = {
  id: 'order_1',
  organisation_id: 'org_1',
  event_id: 'event_1',
  status: 'confirmed',
  total_cents: 10_800,
  platform_fee_cents: 500,
  processing_fee_cents: 300,
  currency: 'AUD',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedReserve.mockResolvedValue(20)
  mockedPayoutDays.mockResolvedValue(3)
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('addBusinessDays', () => {
  test('zero or negative returns the same date', () => {
    const wed = new Date('2026-05-06T00:00:00Z')
    expect(addBusinessDays(wed, 0).toISOString()).toBe(wed.toISOString())
    expect(addBusinessDays(wed, -5).toISOString()).toBe(wed.toISOString())
  })

  test('Friday + 1 = next Monday (skips weekend)', () => {
    const fri = new Date('2026-05-08T00:00:00Z')
    expect(addBusinessDays(fri, 1).toISOString()).toBe('2026-05-11T00:00:00.000Z')
  })

  test('Wednesday + 5 = next Wednesday', () => {
    const wed = new Date('2026-05-06T00:00:00Z')
    expect(addBusinessDays(wed, 5).toISOString()).toBe('2026-05-13T00:00:00.000Z')
  })
})

describe('addThreeBusinessDays (legacy wrapper)', () => {
  test('Wednesday + 3 = next Monday', () => {
    const wed = new Date('2026-05-06T00:00:00Z')
    expect(addThreeBusinessDays(wed).toISOString()).toBe('2026-05-11T00:00:00.000Z')
  })

  test('Friday + 3 = next Wednesday', () => {
    const fri = new Date('2026-05-08T00:00:00Z')
    expect(addThreeBusinessDays(fri).toISOString()).toBe('2026-05-13T00:00:00.000Z')
  })

  test('Monday + 3 = Thursday', () => {
    const mon = new Date('2026-05-04T00:00:00Z')
    expect(addThreeBusinessDays(mon).toISOString()).toBe('2026-05-07T00:00:00.000Z')
  })
})

describe('recordOrderConfirmedLedger', () => {
  test('writes credit + reserve hold + mirror debit + counters at the AU 20% region default', async () => {
    const state = buildAdminMock({
      orderRow: { data: { ...baseOrder }, error: null },
    })
    const adminClient = buildAdminClient(state)

    const result = await recordOrderConfirmedLedger(adminClient, {
      orderId: 'order_1',
      stripePaymentIntentId: 'pi_test_1',
      stripeChargeId: 'ch_test_1',
    })

    expect(result.status).toBe('written')
    expect(result.applicationFeeCents).toBe(800)
    expect(result.organiserShareCents).toBe(10_000)
    expect(result.reserveCents).toBe(2_000)

    expect(mockedReserve).toHaveBeenCalledWith('AU', 'AUD', 'org_1')
    expect(mockedPayoutDays).toHaveBeenCalledWith('AU', 'AUD', 'org_1')

    expect(state.ledgerInserts).toHaveLength(2)
    expect(state.ledgerInserts[0]).toMatchObject({
      organisation_id: 'org_1',
      delta_cents: 10_000,
      currency: 'AUD',
      reason: 'order_confirmed',
      reference_type: 'order',
      reference_id: 'order_1',
    })
    expect(state.ledgerInserts[1]).toMatchObject({
      organisation_id: 'org_1',
      delta_cents: -2_000,
      currency: 'AUD',
      reason: 'reserve_hold',
      reference_type: 'hold',
      reference_id: 'hold_1',
    })

    expect(state.holdInserts).toHaveLength(1)
    expect(state.holdInserts[0]).toMatchObject({
      organisation_id: 'org_1',
      event_id: 'event_1',
      hold_type: 'reserve',
      amount_cents: 2_000,
      currency: 'AUD',
    })
    expect(state.holdInserts[0].metadata).toMatchObject({
      reserve_percent: 20,
      payout_schedule_days: 3,
      order_id: 'order_1',
    })

    expect(state.orgUpdates).toHaveLength(1)
    expect(state.orgUpdates[0]).toMatchObject({
      hold_amount_cents: 2_000,
      total_volume_cents: 10_500,
      total_event_count: 1,
    })
  })

  test('skips when an order_confirmed ledger row already exists', async () => {
    const state = buildAdminMock({
      ledgerExisting: { data: { id: 'existing_1' }, error: null },
    })
    const adminClient = buildAdminClient(state)

    const result = await recordOrderConfirmedLedger(adminClient, {
      orderId: 'order_1',
      stripePaymentIntentId: 'pi_test_1',
      stripeChargeId: null,
    })

    expect(result.status).toBe('skipped_already_recorded')
    expect(state.ledgerInserts).toHaveLength(0)
    expect(state.holdInserts).toHaveLength(0)
    expect(state.orgUpdates).toHaveLength(0)
  })

  test('skips when the order is unconfirmed', async () => {
    const state = buildAdminMock({
      orderRow: { data: { ...baseOrder, status: 'pending' }, error: null },
    })
    const adminClient = buildAdminClient(state)

    const result = await recordOrderConfirmedLedger(adminClient, {
      orderId: 'order_1',
      stripePaymentIntentId: 'pi_test_1',
      stripeChargeId: null,
    })

    expect(result.status).toBe('skipped_unconfirmed_order')
    expect(state.ledgerInserts).toHaveLength(0)
  })

  test('skips for free events (total_cents === 0)', async () => {
    const state = buildAdminMock({
      orderRow: {
        data: { ...baseOrder, total_cents: 0, platform_fee_cents: 0, processing_fee_cents: 0 },
        error: null,
      },
    })
    const adminClient = buildAdminClient(state)

    const result = await recordOrderConfirmedLedger(adminClient, {
      orderId: 'order_1',
      stripePaymentIntentId: 'pi_test_1',
      stripeChargeId: null,
    })

    expect(result.status).toBe('skipped_free_event')
    expect(state.ledgerInserts).toHaveLength(0)
  })

  test('does not increment total_event_count when the event already has confirmed orders', async () => {
    const state = buildAdminMock({
      orderRow: { data: { ...baseOrder }, error: null },
      confirmedCountResult: { count: 3, error: null },
    })
    const adminClient = buildAdminClient(state)

    await recordOrderConfirmedLedger(adminClient, {
      orderId: 'order_1',
      stripePaymentIntentId: 'pi_test_1',
      stripeChargeId: null,
    })

    expect(state.orgUpdates[0]).toMatchObject({
      hold_amount_cents: 2_000,
      total_volume_cents: 10_500,
      total_event_count: 0,
    })
  })

  test('honours per-org override (e.g. enterprise reserve at 10%)', async () => {
    mockedReserve.mockResolvedValueOnce(10)
    const state = buildAdminMock({
      orderRow: { data: { ...baseOrder }, error: null },
    })
    const adminClient = buildAdminClient(state)

    const result = await recordOrderConfirmedLedger(adminClient, {
      orderId: 'order_1',
      stripePaymentIntentId: 'pi_test_1',
      stripeChargeId: null,
    })

    expect(result.reserveCents).toBe(1_000)
    expect(state.holdInserts[0]).toMatchObject({ amount_cents: 1_000 })
  })
})
