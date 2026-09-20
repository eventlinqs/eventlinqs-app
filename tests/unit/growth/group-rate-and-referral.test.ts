/**
 * AQ2. THE ATTENDEE IS THE CHANNEL: TRACKED SHARING AND GROUP PURCHASE.
 *
 * The three acceptance lines, and what is asserted where:
 *
 *   1. a driven proof of a share link producing an attributed order
 *        scripts/verify/aq2-referral-and-group-rate-drive.mjs. Here: that both
 *        ticket surfaces actually carry a tracked share bar, which is the thing
 *        the driven proof needs to exist before it can prove anything.
 *   2. a test proving a group rate below the floor is refused by the database
 *        the REFUSAL is the database's and is driven against it. Here: the
 *        arithmetic that decides the floor, in both languages, compared rather
 *        than assumed equal.
 *   3. the referral coefficient computed and reported per event
 *        here, exhaustively, including the cascade in AQ2's own worked example.
 */
import { describe, it, expect } from 'vitest'
import { readRepoFile } from '../../helpers/read-repo-file'
import {
  groupRateFloorCents,
  judgeGroupRate,
  pricingCountryForCurrency,
  PRICING_COUNTRY_BY_CURRENCY,
  MINIMUM_GROUP_SIZE,
} from '@/lib/pricing/group-rate'
import {
  referralCoefficient,
  cascadeTotal,
  cascadeMultiplier,
  buildReferralCoefficient,
} from '@/lib/growth/referral-coefficient-math'
import { mySharesSentence, type MySharesSummary } from '@/lib/growth/my-shares-sentence'

const read = (p: string) => readRepoFile(p)

const MIGRATION = read('supabase/migrations/20260919000120_group_rate_and_its_floor.sql')
const CALCULATOR = read('src/lib/payments/payment-calculator.ts')
const TICKET_PAGE = read('src/app/t/[code]/page.tsx')
const CONFIRMATION = read('src/app/orders/[order_id]/confirmation/page.tsx')

// ---------------------------------------------------------------------------
// ACCEPTANCE 2: the floor, in both languages.
// ---------------------------------------------------------------------------

describe('AQ2: the group rate floor is derived from the fee, never typed', () => {
  it('is the smallest whole cent that clears the ROUNDED fee, not the algebraic one', () => {
    /*
     * 99 / (1 - 0.035) = 102.59, so the algebra says 103. The fee is charged in
     * whole cents: at 103 it rounds to 103 and the organiser nets EXACTLY
     * NOTHING. 104 is the first price that leaves anything. This test is the
     * reason the implementation asks the rounded question.
     */
    expect(groupRateFloorCents({ platformFeePercent: 3.5, platformFeeFixedCents: 99 })).toBe(104)
  })

  it('a price one cent under the floor really does fail to clear the fee, at every fee tried', () => {
    // The property, not a number: whatever the fee, the floor is positive and
    // the cent below it is not.
    for (const pct of [0, 1, 2.5, 3.5, 7, 12.25, 30, 50, 80, 99]) {
      for (const fixed of [0, 1, 30, 99, 150, 499]) {
        const floor = groupRateFloorCents({ platformFeePercent: pct, platformFeeFixedCents: fixed })
        const feeAt = (p: number) => Math.round((p * pct) / 100 + fixed)
        expect(floor - feeAt(floor), `floor ${floor} at ${pct}% + ${fixed}c`).toBeGreaterThan(0)
        if (floor > 1) {
          expect(floor - 1 - feeAt(floor - 1), `one under ${floor} at ${pct}% + ${fixed}c`).toBeLessThanOrEqual(0)
        }
      }
    }
  })

  it('a fee with no fixed component puts the floor at one cent, not at zero', () => {
    expect(groupRateFloorCents({ platformFeePercent: 10, platformFeeFixedCents: 0 })).toBe(1)
  })

  it('refuses to invent a floor when the fee cannot be cleared at any price', () => {
    expect(() => groupRateFloorCents({ platformFeePercent: 100, platformFeeFixedCents: 50 })).toThrow(
      /no ticket price clears it/,
    )
    expect(() => groupRateFloorCents({ platformFeePercent: 140, platformFeeFixedCents: 0 })).toThrow()
  })

  it('refuses a fee that did not resolve to numbers rather than treating it as zero', () => {
    expect(() =>
      groupRateFloorCents({ platformFeePercent: Number.NaN, platformFeeFixedCents: 99 }),
    ).toThrow(/did not resolve to numbers/)
  })

  it('the SQL says the same thing, step for step', () => {
    // A trigger cannot call TypeScript, so the arithmetic exists twice. These
    // are the two halves of one decision, and the day they disagree the
    // database refuses prices a form has just told somebody are fine. Both
    // START from the algebra and then step up against the ROUNDED fee, which
    // is the correction the boundary test above forced on both of them.
    expect(MIGRATION).toContain('v_floor := greatest(1, floor(v_fixed / (1 - v_pct / 100)));')
    expect(MIGRATION).toContain('if v_candidate - round(v_candidate * v_pct / 100 + v_fixed) > 0 then')
    expect(MIGRATION).toMatch(/if v_pct >= 100 then[\s\S]*raise exception/)
  })

  it('the SQL reads the fee from pricing_rules and never from a literal', () => {
    expect(MIGRATION).toContain("public.resolve_pricing_value(\n    'platform_fee_percentage'")
    expect(MIGRATION).toContain("'platform_fee_fixed'")
    // No fee rate is written into this file. The one source is pricing_rules.
    const feeShapedLiteral = /(^|[^0-9.])[0-9]+(\.[0-9]+)?\s*\/\s*100\b/m
    const withoutTheDerivation = MIGRATION.replace(/v_pct \/ 100/g, '')
    expect(feeShapedLiteral.test(withoutTheDerivation)).toBe(false)
  })

  it('the SQL resolves the fee by the same five steps as the application', () => {
    // Order matters: an event override must beat an organiser override, which
    // must beat a region default. A trigger that resolved them differently
    // would refuse prices the checkout would then happily charge.
    const order = ['event_id = p_event_id', 'organisation_id = p_organisation_id', 'organisation_id is null']
    let at = -1
    for (const step of order) {
      const next = MIGRATION.indexOf(step, at + 1)
      expect(next, `${step} appears after the step before it`).toBeGreaterThan(at)
      at = next
    }
    expect(MIGRATION).toContain("country_code = 'GLOBAL'")
  })
})

describe('AQ2: the currency to country map is one decision in three places', () => {
  it('the calculator, the SQL and the pricing module all agree, entry for entry', () => {
    /*
     * THREE COPIES, HELD EQUAL. payment-calculator.ts keeps its map private and
     * derives the pricing country from the currency; the AQ2 trigger needs the
     * same mapping in SQL; the pricing module exports it so this test can hold
     * them together. If the platform ever adds a currency, this fails until all
     * three know about it, which is the only reason the third copy exists.
     */
    const fromCalculator = new Map<string, string>()
    const block = CALCULATOR.slice(
      CALCULATOR.indexOf('const CURRENCY_TO_COUNTRY'),
      CALCULATOR.indexOf('function countryFromCurrency'),
    )
    for (const m of block.matchAll(/([A-Z]{3}):\s*'([A-Z]{2})'/g)) fromCalculator.set(m[1], m[2])

    const fromSql = new Map<string, string>()
    const sqlCase = MIGRATION.slice(
      MIGRATION.indexOf('v_country := case upper(v_tier.currency)'),
      MIGRATION.indexOf("else 'GLOBAL'"),
    )
    for (const m of sqlCase.matchAll(/when '([A-Z]{3})' then '([A-Z]{2})'/g)) fromSql.set(m[1], m[2])

    expect(fromCalculator.size).toBeGreaterThan(5)
    expect([...fromSql.entries()].sort()).toEqual([...fromCalculator.entries()].sort())
    expect([...Object.entries(PRICING_COUNTRY_BY_CURRENCY)].sort()).toEqual(
      [...fromCalculator.entries()].sort(),
    )
  })

  it('an unknown currency falls back to GLOBAL in both languages', () => {
    expect(pricingCountryForCurrency('XYZ')).toBe('GLOBAL')
    expect(MIGRATION).toContain("else 'GLOBAL'")
  })
})

describe('AQ2: a proposed group rate is judged the way the database judges it', () => {
  const fees = { platformFeePercent: 3.5, platformFeeFixedCents: 99 }
  const tier = 3500

  it('accepts a rate that is below the price and clears the fee', () => {
    const v = judgeGroupRate({ unitPriceCents: 2800, minGroupSize: 3, tierPriceCents: tier, fees })
    expect(v.ok).toBe(true)
    expect(v.refusal).toBeNull()
  })

  it('refuses a group of two before it looks at the price at all', () => {
    // The order is the trigger's order. "Your rate is below the floor" is a
    // confusing thing to tell somebody whose real mistake was the group size.
    const v = judgeGroupRate({ unitPriceCents: 1, minGroupSize: 2, tierPriceCents: tier, fees })
    expect(v.refusal).toBe('group-too-small')
    expect(MINIMUM_GROUP_SIZE).toBe(3)
  })

  it('refuses a group rate on a free ticket', () => {
    const v = judgeGroupRate({ unitPriceCents: 100, minGroupSize: 3, tierPriceCents: 0, fees })
    expect(v.refusal).toBe('free-tier')
  })

  it('refuses a rate that is not below the ticket price, including exactly equal', () => {
    expect(judgeGroupRate({ unitPriceCents: tier, minGroupSize: 3, tierPriceCents: tier, fees }).refusal).toBe(
      'not-below-the-ticket-price',
    )
    expect(
      judgeGroupRate({ unitPriceCents: tier + 1, minGroupSize: 3, tierPriceCents: tier, fees }).refusal,
    ).toBe('not-below-the-ticket-price')
  })

  it('refuses one cent under the floor and accepts the floor exactly', () => {
    const floor = groupRateFloorCents(fees)
    expect(
      judgeGroupRate({ unitPriceCents: floor - 1, minGroupSize: 3, tierPriceCents: tier, fees }).refusal,
    ).toBe('below-the-floor')
    expect(judgeGroupRate({ unitPriceCents: floor, minGroupSize: 3, tierPriceCents: tier, fees }).ok).toBe(true)
  })

  it('always reports the floor, even when it is refusing for another reason', () => {
    // A form that says no without saying what would be a yes is a form somebody
    // guesses at.
    const v = judgeGroupRate({ unitPriceCents: 1, minGroupSize: 2, tierPriceCents: tier, fees })
    expect(v.floorCents).toBe(groupRateFloorCents(fees))
  })
})

describe('AQ2: the database is the enforcement, not a form', () => {
  it('the trigger fires on INSERT and on UPDATE, so a rate cannot be edited under the floor later', () => {
    expect(MIGRATION).toContain('before insert or update on public.event_group_rates')
  })

  it('a group of fewer than three is refused by a CHECK, not only by a trigger', () => {
    expect(MIGRATION).toContain('check (min_group_size >= 3)')
  })

  it('the rate is set ONCE per tier, which is what AQ2 asks for', () => {
    expect(MIGRATION).toContain('unique (ticket_tier_id)')
  })

  it('the migration states that nothing charges this rate yet, where somebody would look', () => {
    // A rate that is configured and never spent is a placeholder unless the
    // file that holds it says so.
    expect(MIGRATION).toContain('It does not charge anybody')
  })
})

// ---------------------------------------------------------------------------
// ACCEPTANCE 3: the referral coefficient.
// ---------------------------------------------------------------------------

describe('AQ2: the referral coefficient, and the cascade AQ2 works out by hand', () => {
  it('reproduces the item’s own example: 0.3 turns 200 seats into 286', () => {
    expect(Math.round(cascadeTotal(200, 0.3) as number)).toBe(286)
  })

  it('is new buyers per buyer, not a percentage of anything', () => {
    expect(referralCoefficient(30, 100)).toBeCloseTo(0.3, 10)
    expect(referralCoefficient(1, 4)).toBe(0.25)
  })

  it('is null rather than zero when nobody has bought, because there is nothing to divide by', () => {
    expect(referralCoefficient(0, 0)).toBeNull()
    expect(cascadeTotal(200, null)).toBeNull()
    expect(cascadeMultiplier(null)).toBeNull()
  })

  it('refuses to report a cascade that does not converge', () => {
    // At k = 1 every buyer replaces themselves for ever. On real data that
    // means the attribution is counting something twice, not that the event
    // has gone viral, and a platform printing "infinite" has stopped measuring.
    expect(cascadeTotal(200, 1)).toBeNull()
    expect(cascadeTotal(200, 1.4)).toBeNull()
    expect(cascadeTotal(200, -0.1)).toBeNull()
    expect(cascadeTotal(200, 0.999)).toBeCloseTo(200000, 0)
  })

  it('computes the coefficient from what can be PROVED, not from every attributed order', () => {
    const r = buildReferralCoefficient({
      soldOrders: 100,
      attributedToAShareLink: 40,
      fromAKnownBuyer: 10,
    })
    expect(r.coefficient).toBeCloseTo(0.1, 10)
    expect(r.coefficientUpperBound).toBeCloseTo(0.4, 10)
    expect(r.fromAnUnknownSharer).toBe(30)
  })

  it('never lets a numerator exceed its denominator, whatever it is handed', () => {
    const r = buildReferralCoefficient({
      soldOrders: 10,
      attributedToAShareLink: 999,
      fromAKnownBuyer: 999,
    })
    expect(r.attributedToAShareLink).toBe(10)
    expect(r.fromAKnownBuyer).toBe(10)
    expect(r.coefficient).toBe(1)
    expect(r.multiplier).toBeNull()
  })

  it('says something true when nobody has referred anybody, and does not call it zero', () => {
    const none = buildReferralCoefficient({ soldOrders: 50, attributedToAShareLink: 0, fromAKnownBuyer: 0 })
    expect(none.sentence).toContain('No buyer of this event has yet brought another one')

    const unknown = buildReferralCoefficient({ soldOrders: 50, attributedToAShareLink: 7, fromAKnownBuyer: 0 })
    expect(unknown.sentence).toContain('7 orders did arrive through a share link')
    expect(unknown.sentence).toContain('cannot be shown to hold a ticket')
  })

  it('reports the cascade in the sentence when it converges', () => {
    const r = buildReferralCoefficient({ soldOrders: 200, attributedToAShareLink: 60, fromAKnownBuyer: 60 })
    expect(r.sentence).toContain('0.30 new buyers per buyer')
    expect(r.sentence).toContain('200 buyers become 286')
  })

  it('says nothing to divide by when no tickets are sold', () => {
    const r = buildReferralCoefficient({ soldOrders: 0, attributedToAShareLink: 0, fromAKnownBuyer: 0 })
    expect(r.sentence).toContain('nothing to divide by')
  })
})

describe('AQ2: what the sharer is told', () => {
  const summary = (byEvent: MySharesSummary['byEvent']): MySharesSummary => ({
    byEvent,
    totalClicks: byEvent.reduce((n, e) => n + e.clicks, 0),
    totalJoined: byEvent.reduce((n, e) => n + e.joined, 0),
  })
  const row = (clicks: number, joined: number) => ({
    eventId: 'e1',
    eventTitle: 'A night',
    eventSlug: 'a-night',
    clicks,
    joined,
  })

  it('invites somebody who has never shared, rather than reporting a zero at them', () => {
    expect(mySharesSentence(summary([]))).toContain('this is where you will see what it did')
  })

  it('credits the looking when nobody has bought yet', () => {
    // Somebody who sent five links and had five people look IS doing the thing.
    // Being told they produced nothing is how they stop.
    expect(mySharesSentence(summary([row(5, 0)]))).toBe('5 people have opened a link you shared.')
    expect(mySharesSentence(summary([row(1, 0)]))).toBe('One person has opened a link you shared.')
  })

  it('counts people, never money, because a sharer is owed nothing here', () => {
    const sentence = mySharesSentence(summary([row(9, 2)]))
    expect(sentence).toBe('2 people have bought a ticket through a link you shared.')
    expect(sentence).not.toMatch(/\$|cent|earn/i)
  })

  it('gets the grammar right for one person', () => {
    expect(mySharesSentence(summary([row(9, 1)]))).toBe(
      '1 person has bought a ticket through a link you shared.',
    )
  })
})

// ---------------------------------------------------------------------------
// ACCEPTANCE 1's precondition: both ticket surfaces carry a tracked share link.
// ---------------------------------------------------------------------------

describe('AQ2: every ticket carries a tracked share link', () => {
  it('the confirmation page has one', () => {
    expect(CONFIRMATION).toContain('EventShareBar')
  })

  it('the ticket page has one, which it did not before AQ2', () => {
    expect(TICKET_PAGE).toContain('EventShareBar')
    expect(TICKET_PAGE).toContain('Bring someone with you')
  })

  it('the ticket page share points at the EVENT, not at the bearer ticket link', () => {
    // Sharing the bearer link would hand somebody else the holder's own ticket.
    expect(TICKET_PAGE).toMatch(/eventUrl=\{`\$\{siteUrl\}\/events\/\$\{ticket\.event\.slug\}`\}/)
    expect(TICKET_PAGE).not.toMatch(/eventUrl=\{[^}]*\/t\//)
  })

  it('the share bar is the shared one, so the links are tracked wherever they are made', () => {
    const bar = read('src/components/features/events/event-share-bar.tsx')
    expect(bar).toContain('/api/broadcast/share-link')
  })
})
