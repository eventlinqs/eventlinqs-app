/**
 * MONEY FIX, PART A. The money chain under the funds-holding model.
 *
 * WHAT THESE PROTECT, stated because the names alone read as if this platform
 * used destination charges, and it does not. EventLinqs is the merchant of
 * record (docs/PAYMENTS-FUNDS-HOLDING.md): the buyer is charged on the PLATFORM
 * account with no `transfer_data`, and the organiser is paid afterwards by a
 * platform->connected Transfer. So "routes to the organiser" is a statement
 * about the DESTINATION ACCOUNT RESOLVED AND THE SHARE COMPOSED at charge time,
 * which is what the later transfer is built from, and not about a Connect field
 * on the PaymentIntent.
 *
 * THE DEFECT THESE WERE WRITTEN FOR (close-out MONEY FIX, A1.7). A founding
 * organiser inside their fee-free window resolves to a platform fee of exactly
 * zero. `assertOrganiserCanReceiveFunds` (now assertOrganiserCanTakeSales) refused any zero fee as "calculator
 * drift", so EVERY PAID TICKET for a fee-waived organiser was refused at
 * checkout and the buyer was told "There was a pricing issue with this
 * checkout." The waiver is the growth plan's first ranked lever, so the
 * organisers the platform most wants were the only ones who could not sell.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Organisation } from '@/types/database'
import type { FeeBreakdown } from '@/lib/payments/payment-calculator'
import {
  ChargePreconditionError,
  assertOrganiserCanTakeSales,
  composeApplicationFee,
  computeOrganiserShareCents,
} from '@/lib/payments/application-fee'

vi.mock('@/lib/payments/pricing-rules', () => ({
  getApplicationFeeCompositionMode: vi.fn(),
  getReservePercentage: vi.fn(),
}))

import { getApplicationFeeCompositionMode } from '@/lib/payments/pricing-rules'

const mockedGetMode = vi.mocked(getApplicationFeeCompositionMode)

beforeEach(() => {
  mockedGetMode.mockReset()
  mockedGetMode.mockResolvedValue(1)
})

/** A $50.00 ticket at the launch rate, 3.5% + 99c, one fee. */
function makeFees(overrides: Partial<FeeBreakdown> = {}): FeeBreakdown {
  return {
    subtotal_cents: 5_000,
    addon_total_cents: 0,
    platform_fee_cents: 274,
    payment_processing_fee_cents: 0,
    tax_cents: 0,
    discount_cents: 0,
    total_cents: 5_274,
    currency: 'AUD',
    fee_pass_type: 'pass_to_buyer',
    fee_waived: false,
    founding_fee_waived_cents: 0,
    breakdown_display: {
      tickets: [],
      addons: [],
      subtotal: 5_000,
      platform_fee: 274,
      processing_fee: 0,
      discount: 0,
      tax: 0,
      total: 5_274,
    },
    ...overrides,
  }
}

/** The fee-waived shape the calculator produces inside a founding window. */
function makeWaivedFees(overrides: Partial<FeeBreakdown> = {}): FeeBreakdown {
  return makeFees({
    platform_fee_cents: 0,
    payment_processing_fee_cents: 0,
    total_cents: 5_000,
    fee_waived: true,
    // The waived amount is the fee that WOULD have been charged (close-out FO1):
    // the same 274c the standard shape above charges, recorded so the offer's
    // cost is a sum over a column rather than an archaeology exercise.
    founding_fee_waived_cents: 274,
    breakdown_display: {
      tickets: [],
      addons: [],
      subtotal: 5_000,
      platform_fee: 0,
      processing_fee: 0,
      discount: 0,
      tax: 0,
      total: 5_000,
    },
    ...overrides,
  })
}

type ChargeOrg = Pick<
  Organisation,
  'stripe_account_id' | 'stripe_payouts_enabled' | 'stripe_account_country' | 'payout_status'
>

function makeOrg(overrides: Partial<ChargeOrg> = {}): ChargeOrg {
  return {
    stripe_account_id: 'acct_test',
    stripe_payouts_enabled: true,
    stripe_account_country: 'AU',
    payout_status: 'active',
    ...overrides,
  }
}

function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (err) {
    return err
  }
}

describe('money chain: sell first, the organiser is paid after they connect (Lawal, 15:22 on 14 November 2026)', () => {
  test('an organiser with no connected account can take a sale; the money is held for them', () => {
    // A2 (29 September): EventLinqs holds the money until after the event. The
    // transfer waits for the organiser's own connected account (10 October), so
    // a missing account no longer refuses the buyer.
    expect(captureError(() => assertOrganiserCanTakeSales(makeOrg({ stripe_account_id: null }), makeFees()))).toBeNull()
    expect(
      captureError(() =>
        assertOrganiserCanTakeSales(
          makeOrg({ stripe_account_id: null, stripe_payouts_enabled: false, stripe_account_country: null }),
          makeFees(),
        ),
      ),
    ).toBeNull()
  })

  test('payouts not yet enabled, or a Stripe restriction, do not refuse the sale', () => {
    expect(captureError(() => assertOrganiserCanTakeSales(makeOrg({ stripe_payouts_enabled: false }), makeFees()))).toBeNull()
    expect(captureError(() => assertOrganiserCanTakeSales(makeOrg({ payout_status: 'restricted' }), makeFees()))).toBeNull()
  })

  test('a hold placed by EventLinqs refuses the charge with its own named reason', () => {
    const err = captureError(() => assertOrganiserCanTakeSales(makeOrg({ payout_status: 'on_hold' }), makeFees()))
    expect(err).toBeInstanceOf(ChargePreconditionError)
    expect((err as ChargePreconditionError).reason).toBe('org_on_hold')
    const notConnectedHeld = captureError(() =>
      assertOrganiserCanTakeSales(makeOrg({ stripe_account_id: null, payout_status: 'on_hold' }), makeFees()),
    )
    expect((notConnectedHeld as ChargePreconditionError).reason).toBe('org_on_hold')
  })

  test('a connected account in a country we cannot settle in refuses the charge', () => {
    const err = captureError(() => assertOrganiserCanTakeSales(makeOrg({ stripe_account_country: 'ZZ' }), makeFees()))
    expect((err as ChargePreconditionError).reason).toBe('org_country_unsupported')
  })
})

describe('money chain: the routing decision does not depend on the fee', () => {
  test('zero_platform_fee_still_routes_to_the_organiser', () => {
    // The whole of A1.7. A waived fee must NOT refuse the sale.
    const err = captureError(() => assertOrganiserCanTakeSales(makeOrg(), makeWaivedFees()))
    expect(err).toBeNull()
  })

  test('zero_platform_fee_retains_nothing', async () => {
    const fees = makeWaivedFees()
    expect(composeApplicationFee(fees, 1)).toBe(0)

    // And the organiser's share is the whole of what the buyer paid.
    const share = await computeOrganiserShareCents(fees, 'AU', 'AUD', 'org_1', null)
    expect(share).toBe(fees.total_cents)
    expect(share).toBe(5_000)
  })

  test('standard_fee_retains_exactly_the_configured_amount', async () => {
    const fees = makeFees()
    expect(composeApplicationFee(fees, 1)).toBe(274)

    const share = await computeOrganiserShareCents(fees, 'AU', 'AUD', 'org_1', null)
    expect(share).toBe(fees.total_cents - 274)
    expect(share).toBe(5_000)
  })

  test('a zero fee that was NOT waived is still refused as calculator drift', () => {
    // The refusal this fix narrows must survive for the case it was written
    // for: pricing_rules returning nothing is still a fault, and selling at a
    // silent zero take-rate is not a thing that may happen by accident.
    const drift = makeWaivedFees({ fee_waived: false })
    const err = captureError(() => assertOrganiserCanTakeSales(makeOrg(), drift))
    expect((err as ChargePreconditionError).reason).toBe('fee_breakdown_invalid')
  })

  test('a negative platform fee is refused even when the fee is waived', () => {
    const negative = makeWaivedFees({ platform_fee_cents: -1 })
    const err = captureError(() => assertOrganiserCanTakeSales(makeOrg(), negative))
    expect((err as ChargePreconditionError).reason).toBe('fee_breakdown_invalid')
  })

  test('a fee at or above the total is refused whether waived or not', () => {
    const swallowed = makeFees({ platform_fee_cents: 5_274, total_cents: 5_274 })
    expect(
      (captureError(() => assertOrganiserCanTakeSales(makeOrg(), swallowed)) as ChargePreconditionError)
        .reason
    ).toBe('fee_breakdown_invalid')

    const swallowedWaived = makeFees({
      platform_fee_cents: 5_274,
      total_cents: 5_274,
      fee_waived: true,
    })
    expect(
      (
        captureError(() =>
          assertOrganiserCanTakeSales(makeOrg(), swallowedWaived)
        ) as ChargePreconditionError
      ).reason
    ).toBe('fee_breakdown_invalid')
  })

  test('a zero total is refused: a free event must never reach Stripe', () => {
    const free = makeWaivedFees({ total_cents: 0, subtotal_cents: 0 })
    const err = captureError(() => assertOrganiserCanTakeSales(makeOrg(), free))
    expect((err as ChargePreconditionError).reason).toBe('fee_breakdown_invalid')
  })
})
