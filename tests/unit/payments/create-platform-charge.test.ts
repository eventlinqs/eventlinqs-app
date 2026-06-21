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
      stripe_payouts_enabled: true,
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
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message } })
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
})

async function captureRejection(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return null
  } catch (err) {
    return err
  }
}
