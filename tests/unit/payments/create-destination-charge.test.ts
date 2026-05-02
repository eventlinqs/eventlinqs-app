import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/payments/pricing-rules', () => ({
  getApplicationFeeCompositionMode: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { ChargePreconditionError } from '@/lib/payments/application-fee'
import { createDestinationCharge } from '@/lib/payments/create-destination-charge'
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

function mockOrgRow(overrides: Record<string, unknown> = {}): void {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'org_1',
      stripe_account_id: 'acct_test',
      stripe_charges_enabled: true,
      stripe_account_country: 'AU',
      payout_status: 'active',
      ...overrides,
    },
    error: null,
  })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  vi.mocked(createAdminClient).mockReturnValue({ from } as never)
}

function mockOrgRowMissing(): void {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  vi.mocked(createAdminClient).mockReturnValue({ from } as never)
}

function mockOrgRowError(message: string): void {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: null,
    error: { message },
  })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  vi.mocked(createAdminClient).mockReturnValue({ from } as never)
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
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('createDestinationCharge', () => {
  test('mode 1 (inclusive default): app_fee = platform + processing, organiser share excludes both', async () => {
    mockOrgRow()
    const { gateway, calls } = makeGateway()

    const result = await createDestinationCharge({
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
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      amount_cents: 10_800,
      currency: 'AUD',
      idempotency_key: 'order_1',
      connected_account_id: 'acct_test',
      application_fee_cents: 800,
      on_behalf_of: 'acct_test',
    })
    expect(result).toMatchObject({
      applicationFeeCents: 800,
      connectedAccountId: 'acct_test',
      currency: 'AUD',
      organiserShareCents: 10_000,
    })
    expect(result.intent.gateway_payment_id).toBe('pi_mock_1')
    expect(mockedGetMode).toHaveBeenCalledWith('AU', 'AUD', 'org_1')
  })

  test('mode 2 (exclusive): app_fee = platform only, processing bonuses to organiser', async () => {
    mockOrgRow()
    mockedGetMode.mockResolvedValueOnce(2)
    const { gateway, calls } = makeGateway()

    const result = await createDestinationCharge({
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
    })

    expect(calls[0].application_fee_cents).toBe(500)
    expect(result.applicationFeeCents).toBe(500)
    expect(result.organiserShareCents).toBe(10_300)
  })

  test('rejects when org has no Stripe account', async () => {
    mockOrgRow({ stripe_account_id: null })
    const { gateway, calls } = makeGateway()

    const err = await captureRejection(() =>
      createDestinationCharge({
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
      })
    )
    expect(err).toBeInstanceOf(ChargePreconditionError)
    expect((err as ChargePreconditionError).reason).toBe('org_not_connected')
    expect(calls).toHaveLength(0)
  })

  test('rejects when fees currency mismatches the org country currency', async () => {
    mockOrgRow({ stripe_account_country: 'AU' })
    const { gateway, calls } = makeGateway()

    const err = await captureRejection(() =>
      createDestinationCharge({
        gateway,
        organisationId: 'org_1',
        fees: makeFees({ currency: 'USD' }),
        metadata: {
          order_id: 'order_1',
          event_id: 'event_1',
          organisation_id: 'org_1',
          buyer_email: 'buyer@example.com',
        },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
      })
    )
    expect(err).toBeInstanceOf(ChargePreconditionError)
    expect((err as ChargePreconditionError).reason).toBe('fee_breakdown_invalid')
    expect(calls).toHaveLength(0)
  })

  test('throws when organisation row is missing', async () => {
    mockOrgRowMissing()
    const { gateway } = makeGateway()

    const err = await captureRejection(() =>
      createDestinationCharge({
        gateway,
        organisationId: 'org_missing',
        fees: makeFees(),
        metadata: {
          order_id: 'order_1',
          event_id: 'event_1',
          organisation_id: 'org_missing',
          buyer_email: 'buyer@example.com',
        },
        customerEmail: 'buyer@example.com',
        idempotencyKey: 'order_1',
      })
    )
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/not found/)
  })

  test('throws on Supabase error', async () => {
    mockOrgRowError('connection refused')
    const { gateway } = makeGateway()

    const err = await captureRejection(() =>
      createDestinationCharge({
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
      })
    )
    expect((err as Error).message).toMatch(/connection refused/)
  })

  test('rejects on_hold organisation', async () => {
    mockOrgRow({ payout_status: 'on_hold' })
    const { gateway, calls } = makeGateway()

    const err = await captureRejection(() =>
      createDestinationCharge({
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
      })
    )
    expect((err as ChargePreconditionError).reason).toBe('org_payouts_restricted')
    expect(calls).toHaveLength(0)
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
