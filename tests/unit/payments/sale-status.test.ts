import { describe, expect, test } from 'vitest'
import {
  ORG_SALE_FIELDS_SELECT,
  ORG_SALE_FIELD_KEYS,
  eventIsPaid,
  isOrganiserSellable,
  ticketsOnSale,
  verifyOrgSaleFields,
} from '@/lib/payments/sale-status'

/**
 * THE GATE NOW MIRRORS THE CHARGE PRECONDITION, on all five fields.
 *
 * It used to require two, a connected account and charges_enabled, while
 * `assertOrganiserCanReceiveFunds` required four: connected, payouts_enabled,
 * payout_status active, and a country in the Connect currency map. An organiser
 * missing any of the extra three passed the gate and was refused at the payment
 * step, so a buyer chose tickets and was then told "Payments for this region are
 * not yet supported" with the button still enabled.
 *
 * `getCurrencyForCountry(null)` returns null, and a null country is the DEFAULT
 * for an account that has connected but not finished onboarding, so this was
 * reachable rather than theoretical.
 */
/** Mirrors the real column nullability on `organisations`. */
type OrgFixture = {
  stripe_account_id: string | null
  stripe_charges_enabled: boolean
  stripe_payouts_enabled: boolean
  stripe_account_country: string | null
  payout_status: string
}

const sellable: OrgFixture = {
  stripe_account_id: 'acct_123',
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_account_country: 'AU',
  payout_status: 'active',
}

/** The same organiser with exactly one requirement removed. */
const without = (patch: Partial<OrgFixture>): OrgFixture => ({ ...sellable, ...patch })

const notConnected = without({ stripe_account_id: null })
const connectedNoCharges = without({ stripe_charges_enabled: false })

/**
 * The only way to reach the gate, and that is the point.
 *
 * `isOrganiserSellable` takes `VerifiedOrgSaleFields`, whose brand cannot be
 * produced outside sale-status.ts, so every caller including this test must go
 * through the verifier. Founder ruling, 18 August 2026: if a value is required,
 * the type system refuses to compile without it.
 */
const verified = (org: OrgFixture) => {
  const verdict = verifyOrgSaleFields(org)
  if (!verdict.complete) throw new Error(`fixture missing ${verdict.missing.join(', ')}`)
  return verdict.org
}

describe('isOrganiserSellable', () => {
  test('true when every requirement is met', () => {
    expect(isOrganiserSellable(verified(sellable))).toBe(true)
  })

  test('false when the organiser is not connected or cannot take charges', () => {
    expect(isOrganiserSellable(verified(notConnected))).toBe(false)
    expect(isOrganiserSellable(verified(connectedNoCharges))).toBe(false)
  })

  test('false when payouts are not enabled, because the platform holds the funds', () => {
    expect(isOrganiserSellable(verified(without({ stripe_payouts_enabled: false })))).toBe(false)
  })

  test('false when the payout status is not active', () => {
    expect(isOrganiserSellable(verified(without({ payout_status: 'on_hold' })))).toBe(false)
    expect(isOrganiserSellable(verified(without({ payout_status: 'restricted' })))).toBe(false)
  })

  /**
   * THE REGION BLOCKER ITSELF. This is the case that stranded a buyer at the
   * payment step: connected, charges enabled, but no country recorded yet.
   */
  test('false when the country is absent or outside the Connect currency map', () => {
    expect(isOrganiserSellable(verified(without({ stripe_account_country: null })))).toBe(false)
    expect(isOrganiserSellable(verified(without({ stripe_account_country: 'ZZ' })))).toBe(false)
    // A supported country still sells.
    expect(isOrganiserSellable(verified(without({ stripe_account_country: 'NZ' })))).toBe(true)
  })
})

/**
 * ABSENT AND FALSE ARE DIFFERENT ANSWERS.
 *
 * This codebase has been bitten by collapsing them twice in one week: a security
 * migration narrowed a select on 15 August, and a select named a column that did
 * not exist on 18 August. Both made a gate field arrive `undefined`, and
 * `undefined !== true` refused every paid event on the platform while telling
 * organisers their payment setup was incomplete.
 */
describe('a missing gate field is a programming error, not a refusal', () => {
  const partial = { stripe_account_id: 'acct_123', stripe_charges_enabled: true }

  test('the verifier names exactly which fields are absent', () => {
    // It THROWS outside production, which is the loud failure the ruling asks
    // for, so the message is asserted from the throw.
    expect(() => verifyOrgSaleFields(partial)).toThrow(/stripe_payouts_enabled/)
    expect(() => verifyOrgSaleFields(partial)).toThrow(/stripe_account_country/)
    expect(() => verifyOrgSaleFields(partial)).toThrow(/payout_status/)
  })

  test('presence is decided by the KEY, not by the value', () => {
    // A NULL country is a legitimate value that refuses the sale. A MISSING
    // country column is a bug. Collapsing those two is the whole defect.
    const nullCountry = { ...sellable, stripe_account_country: null }
    const verdict = verifyOrgSaleFields(nullCountry)
    expect(verdict.complete).toBe(true)
    if (verdict.complete) expect(isOrganiserSellable(verdict.org)).toBe(false)
  })

  test('the select list the gate publishes carries all five keys', () => {
    for (const key of [
      'stripe_account_id',
      'stripe_charges_enabled',
      'stripe_payouts_enabled',
      'stripe_account_country',
      'payout_status',
    ]) {
      expect(ORG_SALE_FIELDS_SELECT).toContain(key)
    }
    expect(ORG_SALE_FIELD_KEYS).toHaveLength(5)
  })
})

describe('eventIsPaid', () => {
  test('paid when any tier base price is above zero', () => {
    expect(eventIsPaid([{ price: 0 }, { price: 4500 }])).toBe(true)
    expect(eventIsPaid([{ price: 100 }])).toBe(true)
  })
  test('free when all tiers are zero or there are none', () => {
    expect(eventIsPaid([{ price: 0 }, { price: 0 }])).toBe(false)
    expect(eventIsPaid([])).toBe(false)
  })
})

describe('ticketsOnSale', () => {
  test('free events are always on sale regardless of organiser state', () => {
    expect(ticketsOnSale({ isPaidEvent: false, org: notConnected })).toBe(true)
    expect(ticketsOnSale({ isPaidEvent: false, org: null })).toBe(true)
  })
  test('paid events need an organiser the money can actually move for', () => {
    expect(ticketsOnSale({ isPaidEvent: true, org: sellable })).toBe(true)
    expect(ticketsOnSale({ isPaidEvent: true, org: notConnected })).toBe(false)
    expect(ticketsOnSale({ isPaidEvent: true, org: connectedNoCharges })).toBe(false)
    // The region case, at the gate that decides whether tickets are offered.
    expect(ticketsOnSale({ isPaidEvent: true, org: without({ stripe_account_country: null }) })).toBe(false)
  })
})
