import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Organisation } from '@/types/database'
import type { FeeBreakdown } from '@/lib/payments/payment-calculator'
import {
  ChargePreconditionError,
  assertCanCreateDestinationCharge,
  composeApplicationFee,
  computeApplicationFeeCents,
  computeOrganiserShareCents,
  computeReserveCents,
  getCurrencyForCountry,
} from '@/lib/payments/application-fee'

vi.mock('@/lib/payments/pricing-rules', () => {
  return {
    getApplicationFeeCompositionMode: vi.fn(),
    getReservePercentage: vi.fn(),
  }
})

import {
  getApplicationFeeCompositionMode,
  getReservePercentage,
} from '@/lib/payments/pricing-rules'

const mockedGetMode = vi.mocked(getApplicationFeeCompositionMode)
const mockedGetReserve = vi.mocked(getReservePercentage)

beforeEach(() => {
  mockedGetMode.mockReset()
  mockedGetReserve.mockReset()
  mockedGetMode.mockResolvedValue(1)
  mockedGetReserve.mockResolvedValue(20)
})

afterEach(() => {
  vi.restoreAllMocks()
})

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

function makeOrg(overrides: Partial<Organisation> = {}): Organisation {
  return {
    id: 'org_1',
    name: 'Test Org',
    slug: 'test-org',
    description: null,
    logo_url: null,
    website: null,
    email: null,
    phone: null,
    status: 'active',
    owner_id: 'owner_1',
    stripe_account_id: 'acct_test',
    stripe_onboarding_complete: true,
    stripe_account_country: 'AU',
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_capabilities: {},
    stripe_requirements: {},
    payout_schedule: 'post_event_only',
    payout_destination: null,
    refund_window_days: 7,
    risk_tier: 'standard',
    hold_amount_cents: 0,
    total_event_count: 0,
    total_volume_cents: 0,
    payout_status: 'active',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Organisation
}

describe('getCurrencyForCountry', () => {
  test.each([
    ['AU', 'AUD'],
    ['GB', 'GBP'],
    ['US', 'USD'],
    ['CA', 'CAD'],
    ['NZ', 'NZD'],
    ['IE', 'EUR'],
    ['DE', 'EUR'],
    ['FR', 'EUR'],
    ['SE', 'EUR'],
    ['PL', 'EUR'],
  ])('maps %s -> %s', (country, expected) => {
    expect(getCurrencyForCountry(country)).toBe(expected)
  })

  test('is case-insensitive', () => {
    expect(getCurrencyForCountry('au')).toBe('AUD')
    expect(getCurrencyForCountry('gb')).toBe('GBP')
  })

  test('returns null for unsupported countries (M6 v1 geography is AU/UK/US/EU only)', () => {
    expect(getCurrencyForCountry('NG')).toBeNull()
    expect(getCurrencyForCountry('ZA')).toBeNull()
    expect(getCurrencyForCountry('KE')).toBeNull()
    expect(getCurrencyForCountry('XX')).toBeNull()
  })

  test('returns null for null/undefined/empty', () => {
    expect(getCurrencyForCountry(null)).toBeNull()
    expect(getCurrencyForCountry(undefined)).toBeNull()
    expect(getCurrencyForCountry('')).toBeNull()
  })
})

describe('composeApplicationFee', () => {
  test('mode 1 (stripe_fee_inclusive) sums platform + processing', () => {
    const fees = makeFees({ platform_fee_cents: 500, payment_processing_fee_cents: 300 })
    expect(composeApplicationFee(fees, 1)).toBe(800)
  })

  test('mode 2 (stripe_fee_exclusive) returns only platform fee', () => {
    const fees = makeFees({ platform_fee_cents: 500, payment_processing_fee_cents: 300 })
    expect(composeApplicationFee(fees, 2)).toBe(500)
  })
})

describe('computeApplicationFeeCents (async, reads pricing_rules)', () => {
  test('mode 1 default: app_fee = platform + processing', async () => {
    mockedGetMode.mockResolvedValueOnce(1)
    const fees = makeFees({ platform_fee_cents: 500, payment_processing_fee_cents: 300 })
    await expect(computeApplicationFeeCents(fees, 'AU', 'AUD', 'org_1')).resolves.toBe(800)
    expect(mockedGetMode).toHaveBeenCalledWith('AU', 'AUD', 'org_1')
  })

  test('mode 2: app_fee = platform only (organiser keeps processing fee)', async () => {
    mockedGetMode.mockResolvedValueOnce(2)
    const fees = makeFees({ platform_fee_cents: 500, payment_processing_fee_cents: 300 })
    await expect(computeApplicationFeeCents(fees, 'AU', 'AUD', 'org_1')).resolves.toBe(500)
  })

  test('forwards null organisationId to pricing-rules service', async () => {
    mockedGetMode.mockResolvedValueOnce(1)
    await computeApplicationFeeCents(makeFees(), 'GB', 'GBP', null)
    expect(mockedGetMode).toHaveBeenCalledWith('GB', 'GBP', null)
  })
})

describe('computeOrganiserShareCents', () => {
  test('mode 1 (default): organiser receives total minus full app fee', async () => {
    mockedGetMode.mockResolvedValueOnce(1)
    const fees = makeFees({
      subtotal_cents: 10_000,
      tax_cents: 1_000,
      platform_fee_cents: 500,
      payment_processing_fee_cents: 300,
      total_cents: 11_800,
      fee_pass_type: 'pass_to_buyer',
    })
    await expect(computeOrganiserShareCents(fees, 'AU', 'AUD', 'org_1')).resolves.toBe(11_000)
  })

  test('mode 2: organiser receives total minus platform fee only', async () => {
    mockedGetMode.mockResolvedValueOnce(2)
    const fees = makeFees({
      subtotal_cents: 10_000,
      tax_cents: 1_000,
      platform_fee_cents: 500,
      payment_processing_fee_cents: 300,
      total_cents: 11_800,
      fee_pass_type: 'pass_to_buyer',
    })
    await expect(computeOrganiserShareCents(fees, 'AU', 'AUD', 'org_1')).resolves.toBe(11_300)
  })
})

describe('computeReserveCents (reads reserve_percentage from pricing_rules)', () => {
  test('floors to 20% of organiser share at the region default', async () => {
    mockedGetReserve.mockResolvedValue(20)
    await expect(computeReserveCents(10_000, 'AU', 'AUD', null)).resolves.toBe(2_000)
    await expect(computeReserveCents(10_001, 'AU', 'AUD', null)).resolves.toBe(2_000)
    await expect(computeReserveCents(10_004, 'AU', 'AUD', null)).resolves.toBe(2_000)
    await expect(computeReserveCents(10_005, 'AU', 'AUD', null)).resolves.toBe(2_001)
  })

  test('honours per-org override (e.g. enterprise account at 10%)', async () => {
    mockedGetReserve.mockResolvedValueOnce(10)
    await expect(computeReserveCents(10_000, 'AU', 'AUD', 'org_enterprise')).resolves.toBe(1_000)
    expect(mockedGetReserve).toHaveBeenCalledWith('AU', 'AUD', 'org_enterprise')
  })

  test('zero for non-positive share (no Stripe call needed)', async () => {
    await expect(computeReserveCents(0, 'AU', 'AUD', null)).resolves.toBe(0)
    await expect(computeReserveCents(-100, 'AU', 'AUD', null)).resolves.toBe(0)
    expect(mockedGetReserve).not.toHaveBeenCalled()
  })
})

describe('assertCanCreateDestinationCharge', () => {
  test('passes for a fully onboarded AU organisation', () => {
    expect(() => assertCanCreateDestinationCharge(makeOrg(), makeFees())).not.toThrow()
  })

  test('throws org_not_connected when stripe_account_id is missing', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(makeOrg({ stripe_account_id: null }), makeFees())
    )
    expect(err).toBeInstanceOf(ChargePreconditionError)
    expect((err as ChargePreconditionError).reason).toBe('org_not_connected')
  })

  test('throws org_charges_disabled when stripe_charges_enabled is false', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(makeOrg({ stripe_charges_enabled: false }), makeFees())
    )
    expect((err as ChargePreconditionError).reason).toBe('org_charges_disabled')
  })

  test('throws org_payouts_restricted when payout_status is on_hold', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(makeOrg({ payout_status: 'on_hold' }), makeFees())
    )
    expect((err as ChargePreconditionError).reason).toBe('org_payouts_restricted')
  })

  test('throws org_payouts_restricted when payout_status is restricted', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(makeOrg({ payout_status: 'restricted' }), makeFees())
    )
    expect((err as ChargePreconditionError).reason).toBe('org_payouts_restricted')
  })

  test('throws org_country_unsupported for African organisers (M11 territory)', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(makeOrg({ stripe_account_country: 'NG' }), makeFees())
    )
    expect((err as ChargePreconditionError).reason).toBe('org_country_unsupported')
  })

  test('throws org_country_unsupported when country is null', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(makeOrg({ stripe_account_country: null }), makeFees())
    )
    expect((err as ChargePreconditionError).reason).toBe('org_country_unsupported')
  })

  test('throws fee_breakdown_invalid when total is zero (free event misuse)', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(makeOrg(), makeFees({ total_cents: 0 }))
    )
    expect((err as ChargePreconditionError).reason).toBe('fee_breakdown_invalid')
  })

  test('throws fee_breakdown_invalid when application fee is zero (calculator drift)', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(
        makeOrg(),
        makeFees({ platform_fee_cents: 0, payment_processing_fee_cents: 0, total_cents: 10_000 })
      )
    )
    expect((err as ChargePreconditionError).reason).toBe('fee_breakdown_invalid')
  })

  test('throws fee_breakdown_invalid when application fee >= total (would zero out destination)', () => {
    const err = captureError(() =>
      assertCanCreateDestinationCharge(
        makeOrg(),
        makeFees({
          platform_fee_cents: 6_000,
          payment_processing_fee_cents: 5_000,
          total_cents: 10_000,
        })
      )
    )
    expect((err as ChargePreconditionError).reason).toBe('fee_breakdown_invalid')
  })
})

function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (err) {
    return err
  }
}
