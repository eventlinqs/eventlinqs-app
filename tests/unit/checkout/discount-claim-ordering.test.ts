/**
 * THE DISCOUNT CLAIM HAPPENS BEFORE THE PRICE, AND CONVERTS RATHER THAN
 * INCREMENTING AGAIN.
 *
 * WHY THESE ARE ORDERING TESTS. The behaviour of the claim itself is SQL under a
 * row lock and is driven for real by scripts/verify/discount-claim-drive.mjs
 * (eight simultaneous buyers at one remaining use, one winner, a later buyer
 * refused before anybody has paid, the hold released when the cart lapses).
 * A unit test cannot take a row lock and must not pretend to.
 *
 * What it CAN pin is the part that a refactor moves silently, and that is where
 * this defect lived for three months: WHERE in the sequence the claim sits, and
 * whether the confirmation path converts the hold or increments a second time.
 *
 * The two failure modes both cost the organiser money and neither changes any
 * return value:
 *
 *   CLAIM AFTER THE PRICE. If the claim moves below the PaymentCalculator call,
 *   the discount has already been applied to the total by the time the cap is
 *   tested, which is the original defect exactly.
 *
 *   CONVERT AND INCREMENT. If recordDiscountUse ever calls both
 *   convert_discount_claim and increment_discount_uses for the same order, one
 *   redemption is counted twice and the organiser's code is exhausted at half
 *   its stated limit.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from '../../../scripts/guards/lib/source.mjs'

/*
 * READ CODE, NOT PROSE ABOUT CODE.
 *
 * The first version of this file compared raw text and failed twice on its own
 * subject matter: discount-usage.ts explains increment_discount_uses in a
 * comment ABOVE the convert call, so the ordering assertion read the comment
 * and concluded the calls were the wrong way round; and discount-codes.ts
 * quotes the old `current_uses >= max_uses` test in the comment explaining why
 * it was replaced.
 *
 * This is the third time in one day that a check of mine has matched an
 * explanation rather than the thing explained. lib/source.mjs exists for
 * exactly this and every guard in the repository already uses it.
 */
const codeOf = (rel: string): string =>
  stripComments(readFileSync(join(process.cwd(), rel), 'utf8')) as string

const CHECKOUT = codeOf('src/app/actions/checkout.ts')
const USAGE = codeOf('src/lib/payments/discount-usage.ts')
const VALIDATE = codeOf('src/app/actions/discount-codes.ts')
const CRON = codeOf('src/app/api/cron/reservation-expire/route.ts')

describe('the discount claim', () => {
  it('is taken at checkout, against the reservation', () => {
    expect(CHECKOUT).toContain('claim_discount_use')
    expect(CHECKOUT).toContain('p_reservation_id: reservation_id')
  })

  it('is taken BEFORE the price is calculated, not after', () => {
    const claim = CHECKOUT.indexOf('claim_discount_use')
    const calculate = CHECKOUT.indexOf('new PaymentCalculator()')
    expect(claim, 'the claim must exist').toBeGreaterThan(-1)
    expect(calculate, 'the calculator call must exist').toBeGreaterThan(-1)
    // The whole defect was a cap tested after the discount had been granted.
    expect(claim).toBeLessThan(calculate)
  })

  it('only applies the discount when the claim actually succeeded', () => {
    // A claim whose result is ignored is the same as no claim at all.
    expect(CHECKOUT).toMatch(/if\s*\(\s*claimed === true\s*\)/)
  })

  it('reads the cap as confirmed PLUS held uses, so a hold refuses the next buyer', () => {
    expect(VALIDATE).toContain('reserved_uses')
    expect(VALIDATE).not.toMatch(/dc\.current_uses\s*>=\s*dc\.max_uses/)
  })

  it('converts the hold on confirmation rather than incrementing a second time', () => {
    expect(USAGE).toContain('convert_discount_claim')
    const convert = USAGE.indexOf('convert_discount_claim')
    const increment = USAGE.indexOf('increment_discount_uses')
    expect(convert).toBeLessThan(increment)
    // The direct increment must be reachable ONLY when nothing was held.
    expect(USAGE).toMatch(/if \(claimed === null && !claimError\)/)
  })

  it('releases lapsed holds in the same sweep that releases lapsed seats', () => {
    expect(CRON).toContain('release_expired_discount_claims')
    const seats = CRON.indexOf('release_expired_seat_reservations')
    const discounts = CRON.indexOf('release_expired_discount_claims')
    expect(seats).toBeGreaterThan(-1)
    // After the seat sweep, so anything just marked expired is caught this tick.
    expect(discounts).toBeGreaterThan(seats)
  })

  it('names the migration when the function is absent, rather than failing mutely', () => {
    expect(CHECKOUT).toContain('20260829000003')
    expect(CRON).toContain('20260829000003')
  })
})
