import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/payments/pricing-rules', () => ({
  getApplicationFeeCompositionMode: vi.fn().mockResolvedValue(1),
  getReservePercentage: vi.fn().mockResolvedValue(20),
  getPayoutScheduleDays: vi.fn().mockResolvedValue(3),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { createPlatformCharge } from '@/lib/payments/create-platform-charge'
import { recordOrderConfirmedLedger } from '@/lib/payments/connect-ledger'
import type { FeeBreakdown } from '@/lib/payments/payment-calculator'
import type { CreatePaymentIntentParams, PaymentGateway } from '@/lib/payments/gateway'

/**
 * Funds-holding model end-to-end (no network):
 *
 *   processCheckout -> createPlatformCharge (PLATFORM charge, no Connect fields)
 *     -> gateway.createPaymentIntent (StripeAdapter, mocked)
 *   payment_intent.succeeded webhook -> recordOrderConfirmedLedger
 *     -> ledger records the organiser's net share as an EVENT-SCOPED held
 *        liability + the reserve hold (both carry event_id).
 *
 * Verifies the data contract between charge-time and webhook-time: same
 * order_id, same fee math (organiser transfer = total - platform - processing),
 * same currency, event attribution on every ledger row.
 */

type AnyRecord = Record<string, unknown>

interface IntegrationState {
  orgRow: { data: AnyRecord | null; error: { message: string } | null }
  orderRow: { data: AnyRecord | null; error: { message: string } | null }
  eventRow: { data: AnyRecord | null; error: { message: string } | null }
  orgCounters: { data: AnyRecord | null; error: { message: string } | null }
  ledgerRows: AnyRecord[]
  holdRows: AnyRecord[]
  orgUpdates: AnyRecord[]
}

function buildState(): IntegrationState {
  return {
    orgRow: {
      data: {
        id: 'org_1',
        stripe_account_id: 'acct_test_1',
        stripe_payouts_enabled: true,
        stripe_account_country: 'AU',
        payout_status: 'active',
      },
      error: null,
    },
    orderRow: {
      data: {
        id: 'order_1',
        organisation_id: 'org_1',
        event_id: 'event_1',
        status: 'confirmed',
        total_cents: 10_800,
        platform_fee_cents: 500,
        processing_fee_cents: 300,
        currency: 'AUD',
      },
      error: null,
    },
    eventRow: { data: { end_date: '2026-06-15T20:00:00Z' }, error: null },
    orgCounters: {
      data: { hold_amount_cents: 0, total_volume_cents: 0, total_event_count: 0 },
      error: null,
    },
    ledgerRows: [],
    holdRows: [],
    orgUpdates: [],
  }
}

function buildAdminClient(state: IntegrationState) {
  const from = vi.fn((table: string) => {
    if (table === 'organisations') {
      return {
        select: vi.fn((cols: string) => {
          if (cols.includes('hold_amount_cents')) {
            return { eq: () => ({ maybeSingle: vi.fn().mockResolvedValue(state.orgCounters) }) }
          }
          if (cols.trim() === 'stripe_account_country') {
            return {
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: state.orgRow.data
                    ? { stripe_account_country: state.orgRow.data.stripe_account_country }
                    : null,
                  error: state.orgRow.error,
                }),
              }),
            }
          }
          return { eq: () => ({ maybeSingle: vi.fn().mockResolvedValue(state.orgRow) }) }
        }),
        update: vi.fn((row: AnyRecord) => {
          state.orgUpdates.push(row)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'organiser_balance_ledger') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
            }),
          }),
        }),
        insert: vi.fn((row: AnyRecord) => {
          state.ledgerRows.push(row)
          return Promise.resolve({ error: null })
        }),
      }
    }
    if (table === 'orders') {
      return {
        select: vi.fn((cols: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === 'exact' && options?.head) {
            return { eq: () => ({ eq: () => ({ neq: vi.fn().mockResolvedValue({ count: 0, error: null }) }) }) }
          }
          return { eq: () => ({ maybeSingle: vi.fn().mockResolvedValue(state.orderRow) }) }
        }),
      }
    }
    if (table === 'events') {
      return { select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue(state.eventRow) }) }) }
    }
    if (table === 'payout_holds') {
      return {
        insert: vi.fn((row: AnyRecord) => {
          state.holdRows.push(row)
          return {
            select: () => ({
              single: vi.fn().mockResolvedValue({ data: { id: `hold_${state.holdRows.length}` }, error: null }),
            }),
          }
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from } as unknown as ReturnType<typeof createAdminClient>
}

function makeFees(): FeeBreakdown {
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
      tickets: [{ name: 'GA', qty: 2, unit_price_cents: 5_000, line_total_cents: 10_000 }],
      addons: [],
      subtotal: 10_000,
      platform_fee: 500,
      processing_fee: 300,
      discount: 0,
      tax: 0,
      total: 10_800,
    },
  }
}

function makeGateway(): { gateway: PaymentGateway; calls: CreatePaymentIntentParams[] } {
  const calls: CreatePaymentIntentParams[] = []
  const gateway: PaymentGateway = {
    name: 'mock',
    async createPaymentIntent(params) {
      calls.push(params)
      return { gateway_payment_id: 'pi_test_1', client_secret: 'pi_test_1_secret_xyz', status: 'requires_payment_method' }
    },
    async confirmPaymentIntent() {
      return { status: 'succeeded' }
    },
    async cancelPaymentIntent() {},
    async constructWebhookEvent() {
      return {}
    },
  }
  return { gateway, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('Funds-holding platform charge end-to-end flow', () => {
  test('charge-time PI (no Connect fields) and webhook-time ledger agree; ledger rows are event-scoped', async () => {
    const state = buildState()
    vi.mocked(createAdminClient).mockReturnValue(buildAdminClient(state))
    const { gateway, calls: gatewayCalls } = makeGateway()
    const fees = makeFees()

    const charge = await createPlatformCharge({
      gateway,
      organisationId: 'org_1',
      eventId: 'event_1',
      fees,
      customerEmail: 'buyer@example.com',
      idempotencyKey: 'order_1',
      transferGroup: 'order_1',
      metadata: {
        order_id: 'order_1',
        event_id: 'event_1',
        organisation_id: 'org_1',
        buyer_email: 'buyer@example.com',
      },
    })

    expect(gatewayCalls).toHaveLength(1)
    expect(gatewayCalls[0]).toMatchObject({
      amount_cents: 10_800,
      currency: 'AUD',
      idempotency_key: 'order_1',
      transfer_group: 'order_1',
    })
    // Platform is merchant of record: no destination-charge fields.
    expect(gatewayCalls[0].on_behalf_of).toBeUndefined()
    expect(gatewayCalls[0].application_fee_cents).toBeUndefined()
    expect(gatewayCalls[0].connected_account_id).toBeUndefined()
    expect(charge.organiserTransferCents).toBe(10_000)

    const ledgerResult = await recordOrderConfirmedLedger(buildAdminClient(state), {
      orderId: 'order_1',
      stripePaymentIntentId: 'pi_test_1',
      stripeChargeId: 'ch_test_1',
    })

    expect(ledgerResult.status).toBe('written')
    expect(ledgerResult.organiserShareCents).toBe(charge.organiserTransferCents)

    expect(state.ledgerRows).toHaveLength(2)
    expect(state.ledgerRows[0]).toMatchObject({
      event_id: 'event_1',
      delta_cents: 10_000,
      reason: 'order_confirmed',
      reference_type: 'order',
      reference_id: 'order_1',
      currency: 'AUD',
    })
    expect(state.ledgerRows[1]).toMatchObject({
      event_id: 'event_1',
      delta_cents: -2_000,
      reason: 'reserve_hold',
      reference_type: 'hold',
    })

    expect(state.holdRows).toHaveLength(1)
    expect(state.holdRows[0]).toMatchObject({ hold_type: 'reserve', amount_cents: 2_000, event_id: 'event_1' })
  })

  test('absorb fee mode: organiser transfer = subtotal - all fees', async () => {
    const state = buildState()
    state.orderRow.data = { ...(state.orderRow.data as AnyRecord), total_cents: 10_000, platform_fee_cents: 500, processing_fee_cents: 300 }
    vi.mocked(createAdminClient).mockReturnValue(buildAdminClient(state))
    const { gateway, calls } = makeGateway()
    const fees = makeFees()
    fees.fee_pass_type = 'absorb'
    fees.total_cents = 10_000

    const charge = await createPlatformCharge({
      gateway,
      organisationId: 'org_1',
      eventId: 'event_1',
      fees,
      customerEmail: 'buyer@example.com',
      idempotencyKey: 'order_2',
      transferGroup: 'order_2',
      metadata: {
        order_id: 'order_2',
        event_id: 'event_1',
        organisation_id: 'org_1',
        buyer_email: 'buyer@example.com',
      },
    })

    expect(calls[0]).toMatchObject({ amount_cents: 10_000, transfer_group: 'order_2' })
    expect(calls[0].application_fee_cents).toBeUndefined()
    expect(charge.organiserTransferCents).toBe(9_200)
  })
})
