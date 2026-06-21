import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * FUN-04: a paid order must never reach the charge step without its
 * order_items (issue_tickets_for_order expands tickets FROM order_items, so a
 * no-items order would confirm and issue zero tickets - the buyer pays and
 * gets nothing). This test forces the order_items insert to fail and proves
 * processCheckout fails closed: returns an error, never creates a
 * PaymentIntent, and rolls back (deletes) the just-created order.
 */

const TIER = '44444444-4444-4444-8444-444444444444'
const RES = '33333333-3333-4333-8333-333333333333'

const h = vi.hoisted(() => ({
  itemsInsertError: { message: 'forced order_items failure' } as { message: string } | null,
  deletedOrderIds: [] as string[],
  paymentInserts: [] as unknown[],
  chargeSpy: vi.fn(async () => ({
    intent: { gateway_payment_id: 'pi_x', client_secret: 'cs_x', status: 'requires_payment_method' },
  })),
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
        total_cents: 10_800, // > 0: paid path, so a PaymentIntent WOULD be created if not aborted
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
  createPlatformCharge: h.chargeSpy,
}))

vi.mock('@/lib/auth/guest-session', () => ({ getGuestSessionId: vi.fn(async () => 'guest_1') }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
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
        // existing order_number uniqueness check
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      }
      throw new Error(`unexpected server table: ${table}`)
    },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'reservations') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({
            data: {
              id: RES, event_id: 'event_1', user_id: null, session_id: 'guest_1',
              status: 'active', expires_at: new Date(Date.now() + 600_000).toISOString(),
              items: [{ ticket_tier_id: TIER, quantity: 2 }],
            },
          }) }) }) }),
        }
      }
      if (table === 'orders') {
        return {
          insert: async () => ({ error: null }),
          delete: () => ({ eq: (_col: string, id: string) => { h.deletedOrderIds.push(id); return Promise.resolve({ error: null }) } }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'order_items') {
        return { insert: async () => ({ error: h.itemsInsertError }) }
      }
      if (table === 'payments') {
        return { insert: async (row: unknown) => { h.paymentInserts.push(row); return { error: null } }, update: () => ({ eq: async () => ({ error: null }) }) }
      }
      throw new Error(`unexpected admin table: ${table}`)
    },
  })),
}))

import { processCheckout } from '@/app/actions/checkout'

beforeEach(() => {
  h.itemsInsertError = { message: 'forced order_items failure' }
  h.deletedOrderIds = []
  h.paymentInserts = []
  h.chargeSpy.mockClear()
})
afterEach(() => vi.clearAllMocks())

describe('FUN-04: order_items insert failure fails closed with rollback', () => {
  test('returns an error, never creates a PaymentIntent, and deletes the order', async () => {
    const result = await processCheckout({
      reservation_id: RES,
      buyer_email: 'buyer@example.com',
      buyer_name: 'Jane Buyer',
      attendees: [],
    })

    // Failed closed: surfaced an error, no client_secret.
    expect(result.error).toBeTruthy()
    expect(result.client_secret).toBeUndefined()
    expect(result.order_id).toBeUndefined()

    // Never charged.
    expect(h.chargeSpy).not.toHaveBeenCalled()
    // Never even reached the payment record insert.
    expect(h.paymentInserts).toHaveLength(0)

    // Rolled back: the just-created order was deleted.
    expect(h.deletedOrderIds).toHaveLength(1)
  })

  test('happy path control: when order_items inserts cleanly, it proceeds to charge', async () => {
    h.itemsInsertError = null
    const result = await processCheckout({
      reservation_id: RES,
      buyer_email: 'buyer@example.com',
      buyer_name: 'Jane Buyer',
      attendees: [],
    })

    expect(result.error).toBeUndefined()
    expect(h.chargeSpy).toHaveBeenCalledTimes(1)
    expect(h.deletedOrderIds).toHaveLength(0)
    expect(result.client_secret).toBe('cs_x')
  })
})
