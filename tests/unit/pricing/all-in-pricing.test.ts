/**
 * THE PRICE A BUYER SEES IS THE PRICE A BUYER PAYS.
 *
 * ============================================================================
 * WHAT THIS FILE IS FOR
 * ============================================================================
 *
 * Close-out SEO4 names six tests, and a seventh that ties the display to the
 * charge. A live audit on 13 September 2026 found the event page showing
 * `From AUD $18.00` for an event nobody could leave for eighteen dollars, and
 * telling the buyer the booking fee would not be returned without ever saying
 * what the booking fee was.
 *
 * THE LOAD-BEARING TEST IS THE SEVENTH, `the displayed total equals the total
 * the checkout calculates`. Everything else here could be green while the
 * display quietly used a second, slightly different formula, and the failure
 * would be a buyer seeing one number on the event page and another at the
 * payment step, which is the exact practice the 2027 unfair trading regime
 * prohibits. So that test drives BOTH sides: the display path
 * (`allInPriceForOneTicket`) and the server charge path (`PaymentCalculator`),
 * on the same tier, and requires the cents to be equal.
 *
 * NO FEE VALUE IS TYPED IN THIS FILE except inside a fixture that is explicitly
 * labelled as one, and every fixture is fed to BOTH sides of every comparison,
 * so a test can never pass by agreeing with a number it invented.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  allInPriceForOneTicket,
  lowestAllInCents,
} from '@/lib/payments/all-in-price'
import { computeFeeLineCents, computeAllInTotalCents, type FeeRates } from '@/lib/payments/fee-math'
import { priceLabel } from '@/lib/events/price-label'

/**
 * A fee shape, NOT the platform's fee.
 *
 * Deliberately not 3.5 and 99. The live values live in `pricing_rules` and in
 * the PRICING-LOCK block of docs/PRICING.md, and a test that hardcoded them
 * would become a second place the rate is written down, which is precisely what
 * the fee law forbids. These are arbitrary numbers chosen so that the rounding
 * is visible: 7% of 1850 is 129.5 cents, which only a half-up rule turns into
 * 130.
 */
const RATES: FeeRates = { platformFeePercent: 7, platformFeeFixedCents: 55 }

describe('SEO4', () => {
  it('all_in_total_equals_ticket_plus_fee_from_configuration', () => {
    const price = allInPriceForOneTicket(1850, RATES, 'pass_to_buyer')

    // Composed, never re-derived: the expected value comes from the SAME pure
    // functions the server charges through, so this asserts the composition
    // rather than re-implementing the arithmetic and agreeing with itself.
    const fees = computeFeeLineCents(1850, 1, RATES)
    const expected = computeAllInTotalCents(1850, fees, 'pass_to_buyer')

    expect(price.totalCents).toBe(expected)
    expect(price.faceCents).toBe(1850)
    expect(price.feeCents).toBe(expected - 1850)
    expect(price.feeIsAddedOnTop).toBe(true)
    // Half-up rounding is applied once, to the whole fee line: 129.5 -> 130.
    expect(price.feeCents).toBe(130 + 55)
  })

  it('from_price_is_the_lowest_all_in_total_not_the_lowest_ticket_price', () => {
    const tiers = [
      { price: 4500, currency: 'AUD' },
      { price: 1850, currency: 'AUD' },
      { price: 0, currency: 'AUD' },
    ]

    const faceValue = priceLabel(tiers, 'Free entry')
    const allIn = priceLabel(tiers, 'Free entry', { rates: RATES, feePassType: 'pass_to_buyer' })

    expect(faceValue).toBe('From AUD $18.50')
    // The lowest ALL-IN total, which is a different and larger number.
    const lowest = lowestAllInCents(tiers, RATES, 'pass_to_buyer')
    expect(lowest).toBe(allInPriceForOneTicket(1850, RATES, 'pass_to_buyer').totalCents)
    expect(allIn).toBe(`From AUD $${((lowest as number) / 100).toFixed(2)}`)
    expect(allIn).not.toBe(faceValue)

    // THE $0 TIER DOES NOT WIN. An event is free only when EVERY tier is free,
    // the rule src/lib/events/price-label.ts already owned; a community pass
    // beside paid tiers must not make the event advertise itself as free.
    expect(allIn.startsWith('From')).toBe(true)
  })

  it('changing_the_fee_configuration_changes_every_displayed_total_with_no_deploy', () => {
    // The owner edits pricing_rules in /admin/pricing; the resolver hands the
    // new values to the display. Nothing here is compiled in, so moving the
    // configuration moves the total, the breakdown and the from-price together.
    const cheaper: FeeRates = { platformFeePercent: 1, platformFeeFixedCents: 10 }
    const dearer: FeeRates = { platformFeePercent: 12, platformFeeFixedCents: 300 }
    const tiers = [{ price: 1850, currency: 'AUD' }]

    const a = allInPriceForOneTicket(1850, cheaper, 'pass_to_buyer')
    const b = allInPriceForOneTicket(1850, dearer, 'pass_to_buyer')
    expect(b.totalCents).toBeGreaterThan(a.totalCents)
    expect(b.feeCents).toBeGreaterThan(a.feeCents)

    // And the from-price moves with it, on the same tiers.
    expect(priceLabel(tiers, 'Free entry', { rates: cheaper, feePassType: 'pass_to_buyer' })).not.toBe(
      priceLabel(tiers, 'Free entry', { rates: dearer, feePassType: 'pass_to_buyer' }),
    )

    // ABSORB is the other configuration the organiser controls, per event, and
    // it moves the displayed total too: the buyer pays face value.
    expect(allInPriceForOneTicket(1850, dearer, 'absorb').totalCents).toBe(1850)
    expect(allInPriceForOneTicket(1850, dearer, 'absorb').feeIsAddedOnTop).toBe(false)
  })

  it('free_event_shows_no_fee_and_no_total_line', () => {
    // A zero subtotal short-circuits before any fee applies, which is the
    // platform's own rule (docs/PRICING.md, "Free events are free"). The danger
    // this pins is the flat PER-TICKET fee: handing zero to the fee math would
    // return 55 cents of fee on a free ticket.
    const free = allInPriceForOneTicket(0, RATES, 'pass_to_buyer')
    expect(free.totalCents).toBe(0)
    expect(free.feeCents).toBe(0)
    expect(free.feeIsAddedOnTop).toBe(false)

    // And an all-free event has no lowest all-in total to show at all.
    expect(lowestAllInCents([{ price: 0 }, { price: 0 }], RATES, 'pass_to_buyer')).toBeNull()
    expect(priceLabel([{ price: 0 }], 'Free entry', { rates: RATES, feePassType: 'pass_to_buyer' })).toBe(
      'Free entry',
    )
  })

  it('breakdown_sums_to_the_total', () => {
    // Every price the buyer is shown is made of two numbers and they must add
    // up, at every price point, including the ones where the rounding lands on
    // a half cent.
    for (const face of [1, 99, 100, 333, 1850, 4500, 9999, 100_00]) {
      const p = allInPriceForOneTicket(face, RATES, 'pass_to_buyer')
      expect(p.faceCents + p.feeCents).toBe(p.totalCents)
      expect(p.feeCents).toBeGreaterThan(0)
    }
    // And under absorb the breakdown is a fee of zero, which also sums.
    const absorbed = allInPriceForOneTicket(1850, RATES, 'absorb')
    expect(absorbed.faceCents + absorbed.feeCents).toBe(absorbed.totalCents)
    expect(absorbed.feeCents).toBe(0)
  })

  it('no_price_anywhere_is_a_literal', async () => {
    // THE STATIC HALF IS THE GUARD; this is the runtime half of the same rule.
    //
    // Every displayed total is a function of the rates it is handed, so handing
    // it absurd rates must move every number. A surface that had a fee value
    // baked in would be unmoved by this and would return the same total twice.
    const absurd: FeeRates = { platformFeePercent: 0, platformFeeFixedCents: 0 }
    const zeroFee = allInPriceForOneTicket(1850, absurd, 'pass_to_buyer')
    expect(zeroFee.totalCents).toBe(1850)
    expect(zeroFee.feeCents).toBe(0)

    // And the fallback constant is not a second source: it is only reachable
    // through the catch path of the resolver. Assert its role rather than its
    // value, so this test does not become the third place the rate is written.
    const { PUBLIC_PLATFORM_FEE } = await import('@/lib/pricing/public-fee')
    expect(typeof PUBLIC_PLATFORM_FEE.percent).toBe('number')
    expect(PUBLIC_PLATFORM_FEE.percent).toBeGreaterThan(0)
  })
})

/* ======================================================================== */
/* THE ONE THAT TIES THE DISPLAY TO THE CHARGE                              */
/* ======================================================================== */

/*
 * THE CHARGE AUTHORITY IS DRIVEN, NOT IMITATED.
 *
 * `PaymentCalculator` reads its fee values through the pricing-rules service and
 * reads the founding waiver through the admin client. Both are stubbed at the
 * SEAM, handing it exactly the values the display side is handed, so the only
 * thing that can differ between the two paths is the arithmetic, which is the
 * whole point of the comparison. Stubbing anything further in would let the two
 * sides share a formula and agree with themselves.
 */
vi.mock('@/lib/payments/pricing-rules', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/payments/pricing-rules')>()
  return {
    ...original,
    getPlatformFeePercentage: async () => 7,
    getPlatformFeeFixedCents: async () => 55,
    getProcessingFeePassThrough: async () => 1,
  }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/payments/founding-waiver', () => ({
  // No waiver: the organiser pays the ordinary fee, which is the case a buyer
  // sees on an ordinary event. The waived case is covered by that module's own
  // tests and would only mask a mismatch here.
  getFoundingWaiver: async () => null,
  applyFoundingWaiver: (rates: FeeRates) => rates,
}))

describe('the total displayed on the event page equals the total the checkout calculates', () => {
  it('agrees with PaymentCalculator on the same tier, cent for cent', async () => {
    const FACE = 1850
    const { PaymentCalculator } = await import('@/lib/payments/payment-calculator')

    for (const quantity of [1, 2, 3, 7]) {
      const charged = await new PaymentCalculator().calculate(
        [
          {
            tier_id: 'tier-lane-c-seo4',
            tier_name: 'Lane C general admission',
            quantity,
            unit_price_cents: FACE,
          },
        ],
        [],
        'AUD',
        'pass_to_buyer',
      )

      // The DISPLAY side, exactly as the ticket panel composes it.
      const displayedFees = computeFeeLineCents(FACE * quantity, quantity, RATES)
      const displayedTotal = computeAllInTotalCents(FACE * quantity, displayedFees, 'pass_to_buyer')

      expect(charged.total_cents).toBe(displayedTotal)
      expect(charged.platform_fee_cents).toBe(displayedFees.platform_fee_cents)
      // ONE FEE: nothing new is ever charged on the processing line.
      expect(charged.payment_processing_fee_cents).toBe(0)
    }
  })

  it('the per-ticket price beside a tier is exactly what one of them costs', async () => {
    const { PaymentCalculator } = await import('@/lib/payments/payment-calculator')
    for (const face of [1, 99, 333, 1850, 4500, 9999]) {
      const charged = await new PaymentCalculator().calculate(
        [{ tier_id: 't', tier_name: 'Lane C', quantity: 1, unit_price_cents: face }],
        [],
        'AUD',
        'pass_to_buyer',
      )
      expect(allInPriceForOneTicket(face, RATES, 'pass_to_buyer').totalCents).toBe(charged.total_cents)
    }
  })

  /**
   * THE ROUNDING FINDING, PINNED RATHER THAN PAPERED OVER.
   *
   * The first draft of this file asserted that the per-ticket price times the
   * quantity equals the cart total. It does not, and the test found it: at
   * AUD 18.50 on these rates, one ticket is 2035 cents and two are 4069, not
   * 4070.
   *
   * The cause is not a bug. `computeFeeLineCents` applies `Math.round` ONCE to
   * the whole fee line, which is what the charge does and therefore what the
   * display must do. Rounding a per-ticket fee and then multiplying is a
   * different operation and gives a different answer, by at most a cent or so.
   *
   * IT CAN GO EITHER WAY, and that matters more than the size. With a fee whose
   * fraction is below a half, the cart fee can be a cent MORE than the
   * per-ticket fee times the quantity. So "the per-ticket number times N" is not
   * a safe understatement, it is simply not the cart total, and the panel must
   * never present it as one.
   *
   * WHICH IS WHY THE PANEL DOES NOT. The per-tier line answers "what does one of
   * these cost", exactly and verifiably (the test above). The cart total is
   * computed with the cart math and is the number on the checkout button. A
   * buyer is never shown a multiplication they did not make.
   *
   * This test exists so that the gap stays BOUNDED and known. If it ever grew,
   * something would have changed about how the fee is composed, and that is a
   * thing to find here rather than in a complaint about a total.
   */
  it('per-ticket times quantity differs from the cart only by fee-line rounding', async () => {
    const { PaymentCalculator } = await import('@/lib/payments/payment-calculator')
    const charge = (quantity: number, face: number) =>
      new PaymentCalculator().calculate(
        [{ tier_id: 't', tier_name: 'Lane C', quantity, unit_price_cents: face }],
        [],
        'AUD',
        'pass_to_buyer',
      )

    // THE WORKED EXAMPLE, exact, because a bound alone teaches nobody the shape.
    // At AUD 18.50 on these rates one ticket is 2035 cents and two are 4069.
    expect(allInPriceForOneTicket(1850, RATES, 'pass_to_buyer').totalCents).toBe(2035)
    expect((await charge(2, 1850)).total_cents).toBe(4069)

    /*
     * AND THE BOUND, DERIVED RATHER THAN OBSERVED. With x the exact fee for one
     * ticket, the display rounds x and multiplies; the charge multiplies and
     * rounds once. The first introduces at most half a cent per ticket and the
     * second at most half a cent in total, so the gap cannot exceed
     * quantity/2 + 1/2, which is `Math.ceil(quantity / 2)` in whole cents.
     *
     * The first draft of this line asserted a flat one cent, from one observed
     * case, and the sweep immediately found two. A bound taken from the first
     * example that fitted is not a bound.
     */
    for (const face of [1, 99, 333, 1850, 4500, 9999]) {
      for (const quantity of [2, 3, 7, 10]) {
        const charged = await charge(quantity, face)
        const naive = allInPriceForOneTicket(face, RATES, 'pass_to_buyer').totalCents * quantity
        expect(Math.abs(naive - charged.total_cents)).toBeLessThanOrEqual(Math.ceil(quantity / 2))
      }
    }
  })

  it('agrees on an absorb event too, where the buyer pays face value', async () => {
    const FACE = 1850
    const { PaymentCalculator } = await import('@/lib/payments/payment-calculator')
    const charged = await new PaymentCalculator().calculate(
      [{ tier_id: 't', tier_name: 'Lane C', quantity: 2, unit_price_cents: FACE }],
      [],
      'AUD',
      'absorb',
    )

    expect(charged.total_cents).toBe(FACE * 2)
    expect(allInPriceForOneTicket(FACE, RATES, 'absorb').totalCents * 2).toBe(charged.total_cents)
    // The fee still EXISTS under absorb, it just comes out of the payout rather
    // than out of the buyer, so the charge records it and the buyer is not
    // shown it as an addition.
    expect(charged.platform_fee_cents).toBeGreaterThan(0)
  })
})
