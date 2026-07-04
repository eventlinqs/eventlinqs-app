import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/payments/pricing-rules', () => ({
  getVenueRevenueSharePercentage: vi.fn().mockResolvedValue(20),
}))

import {
  computeVenueShareCents,
  recordVenueShareAccrual,
  reverseVenueShareForRefund,
} from '@/lib/payments/venue-share'

// ── Locked fee structure (docs/EventLinqs-Fee-Structure-LOCKED.md) ───────────
const PLATFORM_PCT = 3.5
const PLATFORM_FIXED = 99
const PROCESSING_PCT = 2.5
const VENUE_RATE = 20

function platformFeeCents(subtotal: number): number {
  return Math.round((subtotal * PLATFORM_PCT) / 100 + PLATFORM_FIXED)
}
function processingFeeCents(subtotal: number): number {
  return Math.round((subtotal * PROCESSING_PCT) / 100)
}

// ── In-memory fake of the service-role Supabase client ───────────────────────
// Supports the exact chains venue-share.ts uses: select().eq()...maybeSingle(),
// select().eq()...(awaited array), and insert(). Filters are eq-only.
interface Seed {
  orders?: Record<string, unknown>[]
  events?: Record<string, unknown>[]
  venues?: Record<string, unknown>[]
  organisations?: Record<string, unknown>[]
  venue_share_ledger?: Record<string, unknown>[]
}

function makeFakeAdmin(seed: Seed) {
  const store: Record<string, Record<string, unknown>[]> = {
    orders: [...(seed.orders ?? [])],
    events: [...(seed.events ?? [])],
    venues: [...(seed.venues ?? [])],
    organisations: [...(seed.organisations ?? [])],
    venue_share_ledger: [...(seed.venue_share_ledger ?? [])],
  }
  let idSeq = 1

  function builder(table: string) {
    const filters: Array<[string, unknown]> = []
    const rows = () =>
      (store[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
    const api: Record<string, unknown> = {
      select() {
        return api
      },
      eq(col: string, val: unknown) {
        filters.push([col, val])
        return api
      },
      limit() {
        return api
      },
      async maybeSingle() {
        const m = rows()
        return { data: m[0] ?? null, error: null }
      },
      async insert(row: Record<string, unknown>) {
        const withId = { id: `row_${idSeq++}`, ...row }
        store[table] = store[table] ?? []
        store[table].push(withId)
        return { error: null }
      },
      then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows(), error: null }).then(resolve)
      },
    }
    return api
  }

  const client = { from: (table: string) => builder(table), __store: store }
  return client as unknown as SupabaseClient & { __store: typeof store }
}

const ENROLLED_VENUE = {
  id: 'venue_1',
  revenue_share_status: 'enrolled',
  organisation_id: 'venue_org_1',
}
const NON_ENROLLED_VENUE = {
  id: 'venue_2',
  revenue_share_status: 'not_enrolled',
  organisation_id: 'venue_org_2',
}

function seedFor(opts: {
  venue: Record<string, unknown>
  subtotal: number
  orderId?: string
  free?: boolean
}): Seed {
  const orderId = opts.orderId ?? 'order_1'
  const subtotal = opts.subtotal
  const platform = opts.free ? 0 : platformFeeCents(subtotal)
  const processing = opts.free ? 0 : processingFeeCents(subtotal)
  const total = opts.free ? 0 : subtotal + platform + processing
  return {
    orders: [
      {
        id: orderId,
        organisation_id: 'organiser_org_1',
        event_id: 'event_1',
        status: 'confirmed',
        total_cents: total,
        platform_fee_cents: platform,
        currency: 'AUD',
      },
    ],
    events: [{ id: 'event_1', venue_id: opts.venue.id }],
    venues: [opts.venue],
    organisations: [{ id: 'organiser_org_1', stripe_account_country: 'AU' }],
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.clearAllMocks())

describe('computeVenueShareCents (pure: exactly 20% of the platform fee)', () => {
  test('$30 ticket: 20% of the 204c platform fee = 41c', () => {
    expect(platformFeeCents(3000)).toBe(204)
    expect(computeVenueShareCents(204, VENUE_RATE)).toBe(41) // round(40.8)
  })
  test('$80 ticket: 20% of the 379c platform fee = 76c', () => {
    expect(platformFeeCents(8000)).toBe(379)
    expect(computeVenueShareCents(379, VENUE_RATE)).toBe(76) // round(75.8)
  })
  test('free event (zero platform fee) yields zero share', () => {
    expect(computeVenueShareCents(0, VENUE_RATE)).toBe(0)
  })
  test('zero / negative rate yields zero share', () => {
    expect(computeVenueShareCents(204, 0)).toBe(0)
    expect(computeVenueShareCents(204, -5)).toBe(0)
  })
})

describe('full money reconciliation (no leakage, EventLinqs stays profitable)', () => {
  for (const subtotal of [3000, 8000]) {
    test(`$${subtotal / 100} ticket: organiser + venue + EventLinqs net = total`, () => {
      const platform = platformFeeCents(subtotal)
      const processing = processingFeeCents(subtotal)
      const total = subtotal + platform + processing
      const organiserShare = total - (platform + processing)
      const venueShare = computeVenueShareCents(platform, VENUE_RATE)
      const eventlinqsNetKeep = platform + processing - venueShare

      // Organiser keeps full face value, unchanged by the venue program.
      expect(organiserShare).toBe(subtotal)
      // The split reconciles to the cent with no leakage.
      expect(organiserShare + venueShare + eventlinqsNetKeep).toBe(total)
      // The venue share comes out of the platform fee only; EventLinqs keeps the
      // rest of the platform fee + processing, so its platform line stays positive.
      expect(platform - venueShare).toBeGreaterThan(0)
      expect(eventlinqsNetKeep).toBeGreaterThan(0)
    })
  }
})

describe('recordVenueShareAccrual (enrolled venues only)', () => {
  test('enrolled venue: writes one accrual = 20% of the platform fee', async () => {
    const admin = makeFakeAdmin(seedFor({ venue: ENROLLED_VENUE, subtotal: 3000 }))
    const res = await recordVenueShareAccrual(admin, { orderId: 'order_1' })
    expect(res.status).toBe('written')
    expect(res.venueId).toBe('venue_1')
    expect(res.shareCents).toBe(41)
    const ledger = (admin as unknown as { __store: { venue_share_ledger: Record<string, unknown>[] } }).__store
      .venue_share_ledger
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      venue_id: 'venue_1',
      event_id: 'event_1',
      order_id: 'order_1',
      delta_cents: 41,
      reason: 'accrual',
      platform_fee_cents: 204,
    })
  })

  test('NON-enrolled venue: no accrual is written', async () => {
    const admin = makeFakeAdmin(seedFor({ venue: NON_ENROLLED_VENUE, subtotal: 3000 }))
    const res = await recordVenueShareAccrual(admin, { orderId: 'order_1' })
    expect(res.status).toBe('skipped_venue_not_enrolled')
    const store = (admin as unknown as { __store: { venue_share_ledger: unknown[] } }).__store
    expect(store.venue_share_ledger).toHaveLength(0)
  })

  test('free event: no platform fee, no share', async () => {
    const admin = makeFakeAdmin(seedFor({ venue: ENROLLED_VENUE, subtotal: 0, free: true }))
    const res = await recordVenueShareAccrual(admin, { orderId: 'order_1' })
    expect(res.status).toBe('skipped_free_or_unpriced')
  })

  test('idempotent: a second call records nothing more', async () => {
    const admin = makeFakeAdmin(seedFor({ venue: ENROLLED_VENUE, subtotal: 8000 }))
    const first = await recordVenueShareAccrual(admin, { orderId: 'order_1' })
    expect(first.status).toBe('written')
    expect(first.shareCents).toBe(76)
    const second = await recordVenueShareAccrual(admin, { orderId: 'order_1' })
    expect(second.status).toBe('skipped_already_recorded')
    const store = (admin as unknown as { __store: { venue_share_ledger: unknown[] } }).__store
    expect(store.venue_share_ledger).toHaveLength(1)
  })

  test('un-enrolling stops FUTURE accruals without touching past ledger rows', async () => {
    // An enrolled venue accrues on order_1.
    const seed = seedFor({ venue: { ...ENROLLED_VENUE }, subtotal: 3000, orderId: 'order_1' })
    const admin = makeFakeAdmin(seed)
    await recordVenueShareAccrual(admin, { orderId: 'order_1' })
    const store = (admin as unknown as { __store: { venues: Record<string, unknown>[]; venue_share_ledger: unknown[]; orders: Record<string, unknown>[] } }).__store
    expect(store.venue_share_ledger).toHaveLength(1)

    // The venue is un-enrolled, then a new order sells.
    store.venues[0].revenue_share_status = 'not_enrolled'
    store.orders.push({
      id: 'order_2',
      organisation_id: 'organiser_org_1',
      event_id: 'event_1',
      status: 'confirmed',
      total_cents: 3279,
      platform_fee_cents: 204,
      currency: 'AUD',
    })
    const after = await recordVenueShareAccrual(admin, { orderId: 'order_2' })
    expect(after.status).toBe('skipped_venue_not_enrolled')
    // Past accrual untouched; no new row.
    expect(store.venue_share_ledger).toHaveLength(1)
  })
})

describe('reverseVenueShareForRefund (claw back, never overpay)', () => {
  async function seededWithAccrual(subtotal: number) {
    const admin = makeFakeAdmin(seedFor({ venue: ENROLLED_VENUE, subtotal }))
    await recordVenueShareAccrual(admin, { orderId: 'order_1' })
    return admin
  }

  test('full refund reverses the entire accrued share', async () => {
    const admin = await seededWithAccrual(3000) // accrued 41
    const total = 3000 + platformFeeCents(3000) + processingFeeCents(3000)
    const res = await reverseVenueShareForRefund(admin, {
      orderId: 'order_1',
      refundId: 'refund_1',
      refundedAmountCents: total,
    })
    expect(res.status).toBe('reversed')
    expect(res.reversedCents).toBe(41)
    // Net venue balance for the order is now zero.
    const store = (admin as unknown as { __store: { venue_share_ledger: Array<{ delta_cents: number }> } }).__store
    const net = store.venue_share_ledger.reduce((s, r) => s + r.delta_cents, 0)
    expect(net).toBe(0)
  })

  test('partial refund reverses a proportional slice', async () => {
    const admin = await seededWithAccrual(8000) // accrued 76
    const total = 8000 + platformFeeCents(8000) + processingFeeCents(8000) // 8579
    // Refund half the order value.
    const res = await reverseVenueShareForRefund(admin, {
      orderId: 'order_1',
      refundId: 'refund_1',
      refundedAmountCents: Math.round(total / 2),
    })
    expect(res.status).toBe('reversed')
    // round(76 * 4290/8579) = round(37.99) = 38
    expect(res.reversedCents).toBe(38)
  })

  test('idempotent per refund: a redelivery reverses nothing more', async () => {
    const admin = await seededWithAccrual(3000)
    const total = 3000 + platformFeeCents(3000) + processingFeeCents(3000)
    await reverseVenueShareForRefund(admin, { orderId: 'order_1', refundId: 'refund_1', refundedAmountCents: total })
    const again = await reverseVenueShareForRefund(admin, { orderId: 'order_1', refundId: 'refund_1', refundedAmountCents: total })
    expect(again.status).toBe('skipped_already_reversed')
  })

  test('no accrual (venue was not enrolled): nothing to reverse', async () => {
    const admin = makeFakeAdmin(seedFor({ venue: NON_ENROLLED_VENUE, subtotal: 3000 }))
    const res = await reverseVenueShareForRefund(admin, { orderId: 'order_1', refundId: 'refund_1', refundedAmountCents: 3279 })
    expect(res.status).toBe('skipped_no_accrual')
  })
})
