/**
 * LOCK 3: the founder's locked pricing anchors, asserted as arithmetic.
 *
 * These are the two figures the founder has repeatedly had to re-check by hand:
 *
 *   1. A 20.00 ticket at the public rates carries 2.19 in fees, and the
 *      organiser keeps the full 20.00.
 *   2. A 20.00 ticket during the founding fee-free period is 20.50 all in.
 *
 * The values are parsed out of docs/PRICING.md rather than typed here, so this
 * suite and the build guard and the prose are physically the same numbers. If
 * someone edits the document without founder approval, the build guard fails
 * against the database AND these tests change meaning in the same commit, which
 * is exactly the reviewable moment we want.
 */
import { describe, expect, it } from 'vitest'
import { computeAllInTotalCents, computeFeeLineCents, type FeeRates } from '@/lib/payments/fee-math'
import { parseLockedValues, LOCKED_RULE_TYPES } from '@/lib/health/pricing-lock.mjs'
import {
  applyFoundingWaiver,
  extendWaiver,
  initialWaiverUntil,
  isWaiverActive,
} from '@/lib/payments/founding-waiver'

const locked = parseLockedValues(process.cwd()) as Record<string, number | string>

const PUBLIC_RATES: FeeRates = {
  platformFeePercent: Number(locked.platform_fee_percentage),
  platformFeeFixedCents: Number(locked.platform_fee_fixed),
  processingFeePercent: Number(locked.processing_fee_percentage),
  processingFeeFixedCents: Number(locked.processing_fee_fixed_cents),
}

/**
 * The founding fee-free period waives the PLATFORM fee only. Payment processing
 * is a genuine third-party cost and is never waived, which is why a fee-free
 * 20.00 ticket is 20.50 all in rather than 20.00.
 */
const FOUNDING_RATES: FeeRates = {
  platformFeePercent: 0,
  platformFeeFixedCents: 0,
  processingFeePercent: Number(locked.processing_fee_percentage),
  processingFeeFixedCents: Number(locked.processing_fee_fixed_cents),
}

const TWENTY_DOLLARS = 2000

describe('docs/PRICING.md is the authority', () => {
  it('declares every locked rule as a number', () => {
    for (const r of LOCKED_RULE_TYPES) {
      expect(typeof locked[r.key], `${r.key} missing from the lock block`).toBe('number')
    }
    expect(locked.country).toBe('AU')
    expect(locked.currency).toBe('AUD')
  })

  it('carries the locked figures the founder signed off', () => {
    // Pinned so a silent edit to the document is a failing test, not a quiet
    // re-baseline. Changing these requires changing this assertion too.
    expect(PUBLIC_RATES.platformFeePercent).toBe(3.5)
    expect(PUBLIC_RATES.platformFeeFixedCents).toBe(99)
    expect(PUBLIC_RATES.processingFeePercent).toBe(2.5)
    expect(PUBLIC_RATES.processingFeeFixedCents).toBe(0)
  })
})

describe('ANCHOR 1: a 20.00 ticket at the public rates', () => {
  const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, PUBLIC_RATES)

  it('charges a platform fee of 1.69 (3.5% of 20.00 plus 0.99 per ticket)', () => {
    expect(fees.platform_fee_cents).toBe(169)
  })

  it('charges a payment processing fee of 0.50 (2.5% of 20.00, no flat part)', () => {
    expect(fees.payment_processing_fee_cents).toBe(50)
  })

  it('totals EXACTLY 2.19 in fees', () => {
    expect(fees.platform_fee_cents + fees.payment_processing_fee_cents).toBe(219)
  })

  it('bills the buyer 22.19 all in under pass-on', () => {
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')).toBe(2219)
  })

  it('leaves the organiser the FULL 20.00 under pass-on', () => {
    const buyerPays = computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')
    const organiserKeeps = buyerPays - fees.platform_fee_cents - fees.payment_processing_fee_cents
    expect(organiserKeeps).toBe(TWENTY_DOLLARS)
  })
})

describe('ANCHOR 2: a 20.00 ticket during the founding fee-free period', () => {
  const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, FOUNDING_RATES)

  it('waives the platform fee entirely', () => {
    expect(fees.platform_fee_cents).toBe(0)
  })

  it('still passes on the 0.50 processing fee, which is a real third-party cost', () => {
    expect(fees.payment_processing_fee_cents).toBe(50)
  })

  it('is EXACTLY 20.50 all in', () => {
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')).toBe(2050)
  })

  it('still leaves the organiser the full 20.00', () => {
    const buyerPays = computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')
    expect(buyerPays - fees.platform_fee_cents - fees.payment_processing_fee_cents).toBe(TWENTY_DOLLARS)
  })
})

describe('ABSORB mode: the organiser carries the fees', () => {
  const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, PUBLIC_RATES)

  it('bills the buyer the face value only', () => {
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'absorb')).toBe(2000)
  })

  it('leaves the organiser 17.81 after the 2.19 in fees', () => {
    const organiserReceives =
      TWENTY_DOLLARS - fees.platform_fee_cents - fees.payment_processing_fee_cents
    expect(organiserReceives).toBe(1781)
  })

  it('never charges the buyer more than face value, whatever the rates', () => {
    const silly: FeeRates = {
      platformFeePercent: 50,
      platformFeeFixedCents: 5000,
      processingFeePercent: 20,
      processingFeeFixedCents: 900,
    }
    const f = computeFeeLineCents(TWENTY_DOLLARS, 1, silly)
    expect(computeAllInTotalCents(TWENTY_DOLLARS, f, 'absorb')).toBe(2000)
  })
})

describe('GST: the inclusive posture adds no line to a buyer total', () => {
  const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, PUBLIC_RATES)

  it('adds nothing when taxCents defaults to 0', () => {
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')).toBe(2219)
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer', 0)).toBe(2219)
  })

  it('does not add 10% GST on top of the fee (not GST-registered yet)', () => {
    // The defect this pins: a previous build added 10% on top, over-charging
    // every buyer. EventLinqs is the organiser's limited collection agent; the
    // organiser remits GST on the ticket price, and EventLinqs deals with GST
    // on its OWN fee only once registered.
    const gstOnFees = Math.round((fees.platform_fee_cents + fees.payment_processing_fee_cents) * 0.1)
    const withGst = computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer', gstOnFees)
    expect(withGst).not.toBe(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer'))
    // The shipped call site never passes a tax argument, so the buyer total is
    // the untaxed one. Asserted explicitly so a future default change fails here.
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')).toBe(2219)
  })

  it('carries a tax line through untouched when one is genuinely supplied', () => {
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer', 137)).toBe(2219 + 137)
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'absorb', 137)).toBe(2000 + 137)
  })
})

describe('free events are free', () => {
  it('charges nothing on a zero subtotal', () => {
    const fees = computeFeeLineCents(0, 0, PUBLIC_RATES)
    expect(fees.platform_fee_cents).toBe(0)
    expect(fees.payment_processing_fee_cents).toBe(0)
    expect(computeAllInTotalCents(0, fees, 'pass_to_buyer')).toBe(0)
  })
})

describe('the flat components apply at the right cardinality', () => {
  it('multiplies the platform flat fee PER TICKET', () => {
    const three = computeFeeLineCents(TWENTY_DOLLARS * 3, 3, PUBLIC_RATES)
    // 3.5% of 60.00 = 210c, plus 3 x 99c = 297c
    expect(three.platform_fee_cents).toBe(210 + 297)
  })

  it('applies the processing flat component PER ORDER, not per ticket', () => {
    const rates: FeeRates = { ...PUBLIC_RATES, processingFeeFixedCents: 30 }
    const three = computeFeeLineCents(TWENTY_DOLLARS * 3, 3, rates)
    // 2.5% of 60.00 = 150c, plus ONE 30c, not three
    expect(three.payment_processing_fee_cents).toBe(150 + 30)
  })
})

describe('the last-resort fallback cannot become a second source', () => {
  // public-fee.ts holds NUMERIC literals by design: it is the documented
  // degradation path so a marketing page cannot 500 when the database is
  // unreachable. The copy gate scans string literals, so it cannot see these.
  // This assertion is what stops the fallback drifting away from the document.
  it('PUBLIC_PLATFORM_FEE equals docs/PRICING.md', async () => {
    const { PUBLIC_PLATFORM_FEE } = await import('@/lib/pricing/public-fee')
    expect(PUBLIC_PLATFORM_FEE.percent).toBe(Number(locked.platform_fee_percentage))
    expect(PUBLIC_PLATFORM_FEE.fixedCents).toBe(Number(locked.platform_fee_fixed))
    expect(PUBLIC_PLATFORM_FEE.currency).toBe(locked.currency)
  })

  it('PUBLIC_PROCESSING_FEE equals docs/PRICING.md', async () => {
    const { PUBLIC_PROCESSING_FEE } = await import('@/lib/pricing/public-fee')
    expect(PUBLIC_PROCESSING_FEE.percent).toBe(Number(locked.processing_fee_percentage))
    expect(PUBLIC_PROCESSING_FEE.fixedCents).toBe(Number(locked.processing_fee_fixed_cents))
  })

  it('the fallback produces the same 2.19 as the live rates', async () => {
    const { PUBLIC_PLATFORM_FEE, PUBLIC_PROCESSING_FEE } = await import('@/lib/pricing/public-fee')
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, {
      platformFeePercent: PUBLIC_PLATFORM_FEE.percent,
      platformFeeFixedCents: PUBLIC_PLATFORM_FEE.fixedCents,
      processingFeePercent: PUBLIC_PROCESSING_FEE.percent,
      processingFeeFixedCents: PUBLIC_PROCESSING_FEE.fixedCents,
    })
    expect(fees.platform_fee_cents + fees.payment_processing_fee_cents).toBe(219)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The Founding Organiser waiver (founder decision 2026-07-27: a DATE WINDOW).
// The waiver zeroes the PLATFORM fee only; the processing fee is a real
// third-party cost and is never waived, which is why an inside-window 20.00
// ticket is 20.50 all in and not 20.00.
// ─────────────────────────────────────────────────────────────────────────────
describe('FOUNDING WAIVER: a 20.00 ticket inside and outside the window', () => {
  const NOW = new Date('2026-07-27T00:00:00.000Z')
  const INSIDE = new Date('2026-08-01T00:00:00.000Z').toISOString()
  const EXPIRED_YESTERDAY = new Date('2026-07-26T00:00:00.000Z').toISOString()

  const ratesFor = (until: string | null) =>
    applyFoundingWaiver(PUBLIC_RATES, isWaiverActive(until, NOW))

  it('treats a future date as active and a past date as expired', () => {
    expect(isWaiverActive(INSIDE, NOW)).toBe(true)
    expect(isWaiverActive(EXPIRED_YESTERDAY, NOW)).toBe(false)
    expect(isWaiverActive(null, NOW)).toBe(false)
    // The boundary itself is NOT free: the window ends at the instant it ends.
    expect(isWaiverActive(NOW.toISOString(), NOW)).toBe(false)
  })

  it('INSIDE the window is EXACTLY 20.50 all in, pass-on', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, ratesFor(INSIDE))
    expect(fees.platform_fee_cents).toBe(0)
    expect(fees.payment_processing_fee_cents).toBe(50)
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')).toBe(2050)
  })

  it('INSIDE the window the organiser still keeps the full 20.00', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, ratesFor(INSIDE))
    const buyerPays = computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')
    expect(buyerPays - fees.platform_fee_cents - fees.payment_processing_fee_cents).toBe(2000)
  })

  it('ONE DAY AFTER expiry the same ticket is 22.19 all in', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, ratesFor(EXPIRED_YESTERDAY))
    expect(fees.platform_fee_cents).toBe(169)
    expect(fees.payment_processing_fee_cents).toBe(50)
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'pass_to_buyer')).toBe(2219)
  })

  it('ABSORB inside the window: buyer pays 20.00 and the organiser keeps 19.50', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, ratesFor(INSIDE))
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'absorb')).toBe(2000)
    // Only the 50c processing fee comes out of the payout, not the platform fee.
    expect(TWENTY_DOLLARS - fees.platform_fee_cents - fees.payment_processing_fee_cents).toBe(1950)
  })

  it('ABSORB after expiry: buyer pays 20.00 and the organiser keeps 17.81', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, ratesFor(EXPIRED_YESTERDAY))
    expect(computeAllInTotalCents(TWENTY_DOLLARS, fees, 'absorb')).toBe(2000)
    expect(TWENTY_DOLLARS - fees.platform_fee_cents - fees.payment_processing_fee_cents).toBe(1781)
  })

  it('NEVER waives the processing fee, at any quantity', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS * 4, 4, ratesFor(INSIDE))
    expect(fees.platform_fee_cents).toBe(0)
    // 2.5% of 80.00 = 200c, still charged in full.
    expect(fees.payment_processing_fee_cents).toBe(200)
  })
})

describe('FOUNDING WAIVER: referrals stack from the current expiry', () => {
  const NOW = new Date('2026-07-27T00:00:00.000Z')

  it('extends from the CURRENT expiry, not from today', () => {
    const current = new Date('2027-01-27T00:00:00.000Z').toISOString()
    const next = extendWaiver(current, 3, NOW)
    // 27 Jan 2027 plus three months, NOT 27 July 2026 plus three months.
    expect(next.slice(0, 10)).toBe('2027-04-27')
  })

  it('stacks two referrals to six months rather than overwriting', () => {
    const start = initialWaiverUntil(NOW) // 2027-01-27
    const afterOne = extendWaiver(start, 3, NOW)
    const afterTwo = extendWaiver(afterOne, 3, NOW)
    expect(start.slice(0, 10)).toBe('2027-01-27')
    expect(afterOne.slice(0, 10)).toBe('2027-04-27')
    expect(afterTwo.slice(0, 10)).toBe('2027-07-27')
  })

  it('extends from TODAY when the window has already lapsed, so the grant is real', () => {
    const lapsed = new Date('2026-01-01T00:00:00.000Z').toISOString()
    const next = extendWaiver(lapsed, 3, NOW)
    expect(next.slice(0, 10)).toBe('2026-10-27')
    expect(isWaiverActive(next, NOW)).toBe(true)
  })

  it('grants six months at onboarding', () => {
    expect(initialWaiverUntil(NOW).slice(0, 10)).toBe('2027-01-27')
  })
})
