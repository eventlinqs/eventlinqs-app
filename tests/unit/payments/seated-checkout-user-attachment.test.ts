import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Seated checkout user attachment: an order created by a LOGGED-IN buyer must
 * carry that buyer's user_id, identically to the general-admission path, so
 * the ticket is visible in My Tickets (RLS: orders.user_id = auth.uid()) and
 * transferable by the owner. A genuine guest (no session) must still produce
 * user_id null with the guest contact fields populated.
 */

const TIER = '44444444-4444-4444-8444-444444444444'
const RES = '33333333-3333-4333-8333-333333333333'
const USER = '55555555-5555-4555-8555-555555555555'
const SEAT_A = '66666666-6666-4666-8666-666666666661'
const SEAT_B = '66666666-6666-4666-8666-666666666662'

type OrderInsert = {
  user_id: string | null
  guest_email: string | null
  guest_name: string | null
}

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  guestSessionId: null as string | null,
  reservationItems: { seat_ids: ['66666666-6666-4666-8666-666666666661', '66666666-6666-4666-8666-666666666662'] } as unknown,
  reservationUserId: null as string | null,
  reservationSessionId: null as string | null,
  orderInserts: [] as OrderInsert[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/pricing/dynamic-pricing', () => ({
  getDynamicPriceMap: vi.fn(async () => new Map<string, number>()),
}))

vi.mock('@/app/actions/discount-codes', () => ({
  validateDiscountCode: vi.fn(async () => ({ valid: false })),
}))

vi.mock('@/lib/payments/payment-calculator', () => ({
  PaymentCalculator: class {
    async calculate() {
      return {
        subtotal_cents: 10_000,
        addon_total_cents: 0,
        platform_fee_cents: 500,
        payment_processing_fee_cents: 300,
        tax_cents: 0,
        discount_cents: 0,
        total_cents: 10_800,
        currency: 'AUD',
        fee_pass_type: 'pass_to_buyer',
        breakdown_display: {
          tickets: [], addons: [], subtotal: 10_000,
          platform_fee: 500, processing_fee: 300, discount: 0, tax: 0, total: 10_800,
        },
      }
    }
  },
}))

vi.mock('@/lib/payments/gateway-factory', () => ({ getDefaultGateway: vi.fn(() => ({ name: 'mock' })) }))

vi.mock('@/lib/payments/create-platform-charge', () => ({
  createPlatformCharge: vi.fn(async () => ({
    intent: { gateway_payment_id: 'pi_x', client_secret: 'cs_x', status: 'requires_payment_method' },
  })),
}))

vi.mock('@/lib/auth/guest-session', () => ({
  getGuestSessionId: vi.fn(async () => h.guestSessionId),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: (table: string) => {
      if (table === 'events') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'event_1', title: 'Test Event', slug: 'test-event', organisation_id: 'org_1', fee_pass_type: 'pass_to_buyer' } }) }) }),
        }
      }
      if (table === 'ticket_tiers') {
        return { select: () => ({ in: async () => ({ data: [{ id: TIER, name: 'GA', price: 5000, currency: 'AUD' }], error: null }) }) }
      }
      if (table === 'orders') {
        // order_number uniqueness check
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      }
      throw new Error(`unexpected server table: ${table}`)
    },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: async (fn: string) => {
      if (fn === 'get_current_tier_price') return { data: 5000, error: null }
      throw new Error(`unexpected admin rpc: ${fn}`)
    },
    from: (table: string) => {
      if (table === 'reservations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({
            data: {
              id: RES, event_id: 'event_1',
              user_id: h.reservationUserId, session_id: h.reservationSessionId,
              status: 'active', expires_at: new Date(Date.now() + 600_000).toISOString(),
              items: h.reservationItems,
            },
          }) }) }) }),
        }
      }
      if (table === 'organisations') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Test Org' } }) }) }) }
      }
      if (table === 'seats') {
        return {
          select: () => ({ in: () => ({ eq: async () => ({
            data: [
              { id: SEAT_A, seat_number: '1', row_label: 'A', seat_type: 'standard', status: 'reserved', price_cents: 5000, ticket_tier_id: TIER },
              { id: SEAT_B, seat_number: '2', row_label: 'A', seat_type: 'standard', status: 'reserved', price_cents: 5000, ticket_tier_id: TIER },
            ],
            error: null,
          }) }) }),
        }
      }
      if (table === 'ticket_tiers') {
        return { select: () => ({ in: async () => ({ data: [{ id: TIER, name: 'GA', price: 5000, currency: 'AUD' }], error: null }) }) }
      }
      if (table === 'orders') {
        return {
          insert: async (row: OrderInsert) => { h.orderInserts.push(row); return { error: null } },
          delete: () => ({ eq: async () => ({ error: null }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'order_items') {
        return { insert: async () => ({ error: null }) }
      }
      if (table === 'payments') {
        return { insert: async () => ({ error: null }), update: () => ({ eq: async () => ({ error: null }) }) }
      }
      throw new Error(`unexpected admin table: ${table}`)
    },
  })),
}))

import { processCheckout } from '@/app/actions/checkout'

beforeEach(() => {
  h.user = null
  h.guestSessionId = null
  h.reservationItems = { seat_ids: [SEAT_A, SEAT_B] }
  h.reservationUserId = null
  h.reservationSessionId = null
  h.orderInserts = []
})
afterEach(() => vi.clearAllMocks())

describe('seated checkout order user attachment', () => {
  test('logged-in buyer: the seated order carries the buyer user_id, guest fields null', async () => {
    h.user = { id: USER }
    h.reservationUserId = USER

    const result = await processCheckout({
      reservation_id: RES,
      buyer_email: 'member@example.com',
      buyer_name: 'Mia Member',
      attendees: [],
    })

    expect(result.error).toBeUndefined()
    expect(h.orderInserts).toHaveLength(1)
    expect(h.orderInserts[0].user_id).toBe(USER)
    expect(h.orderInserts[0].guest_email).toBeNull()
    expect(h.orderInserts[0].guest_name).toBeNull()
  })

  test('guest buyer: the seated order keeps user_id null with guest contact fields', async () => {
    h.guestSessionId = 'guest_1'
    h.reservationSessionId = 'guest_1'

    const result = await processCheckout({
      reservation_id: RES,
      buyer_email: 'guest@example.com',
      buyer_name: 'Gus Guest',
      attendees: [],
    })

    expect(result.error).toBeUndefined()
    expect(h.orderInserts).toHaveLength(1)
    expect(h.orderInserts[0].user_id).toBeNull()
    expect(h.orderInserts[0].guest_email).toBe('guest@example.com')
    expect(h.orderInserts[0].guest_name).toBe('Gus Guest')
  })

  test('logged-in buyer on the GA path attaches identically (control)', async () => {
    h.user = { id: USER }
    h.reservationUserId = USER
    h.reservationItems = [{ ticket_tier_id: TIER, quantity: 1 }]

    const result = await processCheckout({
      reservation_id: RES,
      buyer_email: 'member@example.com',
      buyer_name: 'Mia Member',
      attendees: [],
    })

    expect(result.error).toBeUndefined()
    expect(h.orderInserts).toHaveLength(1)
    expect(h.orderInserts[0].user_id).toBe(USER)
    expect(h.orderInserts[0].guest_email).toBeNull()
    expect(h.orderInserts[0].guest_name).toBeNull()
  })
})
