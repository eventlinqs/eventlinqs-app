import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/payments/pricing-rules', () => ({
  getApplicationFeeCompositionMode: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { ChargePreconditionError } from '@/lib/payments/application-fee'
import { createPlatformCharge } from '@/lib/payments/create-platform-charge'
import type { FeeBreakdown } from '@/lib/payments/payment-calculator'
import type { CreatePaymentIntentParams, PaymentGateway } from '@/lib/payments/gateway'
import { getApplicationFeeCompositionMode } from '@/lib/payments/pricing-rules'

const mockedGetMode = vi.mocked(getApplicationFeeCompositionMode)

function makeFees(overrides: Partial<FeeBreakdown> = {}): FeeBreakdown {
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
    founding_fee_waived_cents: 0,
    fee_waived: false,
    breakdown_display: {
      tickets: [],
      addons: [],
      subtotal: 10_000,
      platform_fee: 500,
      processing_fee: 300,
      discount: 0,
      tax: 0,
      total: 10_800,
    },
    ...overrides,
  }
}

/**
 * The admin client double, now TABLE-AWARE.
 *
 * MONEY FIX A4 made the charge write to `orders` before it asks Stripe for an
 * intent, so a double that answered every table the same way stopped being a
 * description of the thing under test. `orderUpdates` collects what was written
 * so the tests can assert the four facts rather than only that nothing threw.
 */
const orderUpdates: Record<string, unknown>[] = []
/** What the orders UPDATE reports back; a test can make it match no rows. */
let orderUpdateResult: { data: unknown; error: { message: string } | null } = {
  data: [{ id: 'order_1' }],
  error: null,
}

function mockAdmin(orgResult: { data: unknown; error: { message: string } | null }): void {
  const from = vi.fn((table: string) => {
    if (table === 'orders') {
      return {
        update: vi.fn((row: Record<string, unknown>) => {
          orderUpdates.push(row)
          return { eq: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue(orderUpdateResult) }) }
        }),
      }
    }
    // organisations, and events for the statement descriptor.
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(orgResult) }) }) }
  })
  vi.mocked(createAdminClient).mockReturnValue({ from } as never)
}

function mockOrgRow(overrides: Record<string, unknown> = {}): void {
  mockAdmin({
    data: {
      id: 'org_1',
      stripe_account_id: 'acct_test',
      stripe_payouts_enabled: true,
      stripe_account_country: 'AU',
      payout_status: 'active',
      ...overrides,
    },
    error: null,
  })
}

function mockOrgRowMissing(): void {
  mockAdmin({ data: null, error: null })
}

function mockOrgRowError(message: string): void {
  mockAdmin({ data: null, error: { message } })
}

function makeGateway(): { gateway: PaymentGateway; calls: CreatePaymentIntentParams[] } {
  const calls: CreatePaymentIntentParams[] = []
  const gateway: PaymentGateway = {
    name: 'mock',
    async createPaymentIntent(params) {
      calls.push(params)
      return {
        gateway_payment_id: 'pi_mock_1',
        client_secret: 'pi_mock_1_secret',
        status: 'requires_payment_method',
      }
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
  mockedGetMode.mockResolvedValue(1)
  orderUpdates.length = 0
  orderUpdateResult = { data: [{ id: 'order_1' }], error: null }
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('createPlatformCharge (separate charges and transfers)', () => {
  test('platform charge: NO Connect fields, transfer_group set, organiser transfer = total - (platform + processing) under mode 1', async () => {
    mockOrgRow()
    const { gateway, calls } = makeGateway()

    const result = await createPlatformCharge({
      gateway,
      organisationId: 'org_1',
      fees: makeFees(),
      metadata: {
        order_id: 'order_1',
        event_id: 'event_1',
        organisation_id: 'org_1',
        buyer_email: 'buyer@example.com',
      },
      customerEmail: 'buyer@example.com',
      idempotencyKey: 'order_1',
      transferGroup: 'order_1',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      amount_cents: 10_800,
      currency: 'AUD',
      idempotency_key: 'order_1',
      transfer_group: 'order_1',
    })
    // The platform is merchant of record: NO destination-charge fields.
    expect(calls[0].connected_account_id).toBeUndefined()
    expect(calls[0].application_fee_cents).toBeUndefined()
    expect(calls[0].on_behalf_of).toBeUndefined()

    expect(result).toMatchObject({
      organiserTransferCents: 10_000,
      connectedAccountId: 'acct_test',
      currency: 'AUD',
    })
    expect(result.intent.gateway_payment_id).toBe('pi_mock_1')
    expect(mockedGetMode).toHaveBeenCalledWith('AU', 'AUD', 'org_1', null)
  })

  test('mode 2 (exclusive): processing bonuses to organiser, transfer = total - platform', async () => {
    mockOrgRow()
    mockedGetMode.mockResolvedValueOnce(2)
    const { gateway, calls } = makeGateway()

    const result = await createPlatformCharge({
      gateway,
      organisationId: 'org_1',
      fees: makeFees(),
      metadata: {
        order_id: 'order_2',
        event_id: 'event_1',
        organisation_id: 'org_1',
        buyer_email: 'buyer@example.com',
      },
      customerEmail: 'buyer@example.com',
      idempotencyKey: 'order_2',
      transferGroup: 'order_2',
    })

    expect(calls[0].application_fee_cents).toBeUndefined()
    expect(result.organiserTransferCents).toBe(10_300)
  })

  test('rejects when org has no Stripe account', async () => {
    mockOrgRow({ stripe_account_id: null })
    const { gateway, calls } = makeGateway()

    const err = await captureRejection(() =>
      createPlatformCharge({
        gateway,
        organisationId: 'org_1',
        fees: makeFees(),
        metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
        transferGroup: 'order_1',
      })
    )
    expect(err).toBeInstanceOf(ChargePreconditionError)
    expect((err as ChargePreconditionError).reason).toBe('org_not_connected')
    expect(calls).toHaveLength(0)
  })

  test('rejects when org payouts are not enabled (cannot receive funds)', async () => {
    mockOrgRow({ stripe_payouts_enabled: false })
    const { gateway, calls } = makeGateway()

    const err = await captureRejection(() =>
      createPlatformCharge({
        gateway,
        organisationId: 'org_1',
        fees: makeFees(),
        metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
        transferGroup: 'order_1',
      })
    )
    expect((err as ChargePreconditionError).reason).toBe('org_charges_disabled')
    expect(calls).toHaveLength(0)
  })

  test('rejects when fees currency mismatches the org country currency', async () => {
    mockOrgRow({ stripe_account_country: 'AU' })
    const { gateway, calls } = makeGateway()

    const err = await captureRejection(() =>
      createPlatformCharge({
        gateway,
        organisationId: 'org_1',
        fees: makeFees({ currency: 'USD' }),
        metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
        transferGroup: 'order_1',
      })
    )
    expect((err as ChargePreconditionError).reason).toBe('fee_breakdown_invalid')
    expect(calls).toHaveLength(0)
  })

  test('throws when organisation row is missing', async () => {
    mockOrgRowMissing()
    const { gateway } = makeGateway()

    const err = await captureRejection(() =>
      createPlatformCharge({
        gateway,
        organisationId: 'org_missing',
        fees: makeFees(),
        metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_missing', buyer_email: 'buyer@example.com' },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
        transferGroup: 'order_1',
      })
    )
    expect((err as Error).message).toMatch(/not found/)
  })

  test('throws on Supabase error', async () => {
    mockOrgRowError('connection refused')
    const { gateway } = makeGateway()

    const err = await captureRejection(() =>
      createPlatformCharge({
        gateway,
        organisationId: 'org_1',
        fees: makeFees(),
        metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
        transferGroup: 'order_1',
      })
    )
    expect((err as Error).message).toMatch(/connection refused/)
  })

  test('rejects on_hold organisation', async () => {
    mockOrgRow({ payout_status: 'on_hold' })
    const { gateway, calls } = makeGateway()

    const err = await captureRejection(() =>
      createPlatformCharge({
        gateway,
        organisationId: 'org_1',
        fees: makeFees(),
        metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
        transferGroup: 'order_1',
      })
    )
    expect((err as ChargePreconditionError).reason).toBe('org_payouts_restricted')
    expect(calls).toHaveLength(0)
  })

  /* ═══════════════════════════════════════════════════════════════════════
   * MONEY FIX A4. WHERE THIS ORDER'S MONEY IS OWED IS WRITTEN DOWN BEFORE
   * THE CHARGE EXISTS.
   *
   * Two charges settled to the platform account on 10 September 2026 with
   * nothing anywhere recording who they belonged to. Under funds-holding that
   * is by design on the Stripe side, so the record has to be ours.
   * ═══════════════════════════════════════════════════════════════════════ */

  test('order_stores_destination_account_fee_and_amount_due, on the real charge path', async () => {
    mockOrgRow()
    const { gateway } = makeGateway()
    const result = await createPlatformCharge({
      gateway,
      organisationId: 'org_1',
      fees: makeFees(),
      metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
      customerEmail: 'buyer@example.com',
      idempotencyKey: 'order_1',
      transferGroup: 'order_1',
    })

    expect(orderUpdates).toHaveLength(1)
    const written = orderUpdates[0]
    expect(written.destination_account_id).toBe('acct_test')
    expect(written.organiser_amount_due_cents).toBe(result.organiserTransferCents)
    // Derived, never passed: what is left of the charge after the organiser.
    expect(written.platform_fee_retained_cents).toBe(10_800 - result.organiserTransferCents)
    // 1.7% of 10,800c is 184c, plus the 30c flat component.
    expect(written.stripe_processing_estimate_cents).toBe(214)
    expect(typeof written.destination_recorded_at).toBe('string')
  })

  test('the destination is recorded BEFORE Stripe is asked for an intent', async () => {
    // The ordering is the fail-closed part: a record that cannot be written
    // must mean there is no charge, not a charge nobody can attribute.
    mockOrgRow()
    const order: string[] = []
    const { gateway } = makeGateway()
    const spy: typeof gateway = {
      ...gateway,
      async createPaymentIntent(params) {
        order.push('intent')
        return gateway.createPaymentIntent(params)
      },
    }
    vi.mocked(createAdminClient).mockImplementation(
      () =>
        ({
          from: (table: string) =>
            table === 'orders'
              ? {
                  update: (row: Record<string, unknown>) => {
                    order.push('record')
                    orderUpdates.push(row)
                    return { eq: () => ({ select: async () => orderUpdateResult }) }
                  },
                }
              : {
                  select: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: 'org_1',
                          stripe_account_id: 'acct_test',
                          stripe_payouts_enabled: true,
                          stripe_account_country: 'AU',
                          payout_status: 'active',
                        },
                        error: null,
                      }),
                    }),
                  }),
                },
        }) as never,
    )

    await createPlatformCharge({
      gateway: spy,
      organisationId: 'org_1',
      fees: makeFees(),
      metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
      customerEmail: 'buyer@example.com',
      idempotencyKey: 'order_1',
      transferGroup: 'order_1',
    })
    expect(order).toEqual(['record', 'intent'])
  })

  test('missing_connected_account_refuses_the_charge_with_a_named_error, and no record is written', async () => {
    mockOrgRow({ stripe_account_id: null })
    const { gateway, calls } = makeGateway()
    const err = await captureRejection(() =>
      createPlatformCharge({
        gateway,
        organisationId: 'org_1',
        fees: makeFees(),
        metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
        transferGroup: 'order_1',
      }),
    )
    expect((err as ChargePreconditionError).reason).toBe('org_not_connected')
    expect(orderUpdates).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  test('an order the record cannot reach REFUSES the charge rather than creating one', async () => {
    // An UPDATE that matches nothing SUCCEEDS: no error, zero rows. Without the
    // row-count assertion the charge would be created against an order carrying
    // no destination, which is the exact silence this item exists to end.
    mockOrgRow()
    orderUpdateResult = { data: [], error: null }
    const { gateway, calls } = makeGateway()
    const err = await captureRejection(() =>
      createPlatformCharge({
        gateway,
        organisationId: 'org_1',
        fees: makeFees(),
        metadata: { order_id: 'order_1', event_id: 'event_1', organisation_id: 'org_1', buyer_email: 'buyer@example.com' },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
        transferGroup: 'order_1',
      }),
    )
    expect((err as ChargePreconditionError).reason).toBe('destination_not_recorded')
    expect(calls, 'no charge may exist when nothing recorded where it is owed').toHaveLength(0)
  })
})

async function captureRejection(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return null
  } catch (err) {
    return err
  }
}
