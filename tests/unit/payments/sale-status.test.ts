import { describe, expect, test } from 'vitest'
import {
  ORG_SALE_FIELDS_SELECT,
  ORG_SALE_FIELD_KEYS,
  eventIsPaid,
  isOrganiserPayable,
  isOrganiserSellable,
  ticketsOnSale,
  verifyOrgSaleFields,
} from '@/lib/payments/sale-status'

/**
 * SELL FIRST, CONNECT BEFORE THE PAYOUT (Lawal's yes, 15:22 on 14 November 2026:
 * "Yes, you let organisers publish and sell straight away").
 *
 * The buyer pays EventLinqs, which holds the money until after the event (A2,
 * 29 September) and then pays it to the organiser's own connected account
 * (10 October). So the SALE needs no Stripe account: it is refused only by a
 * hold a person at EventLinqs placed, or by a connected account in a country we
 * cannot settle in. The PAYOUT keeps the five checks, as isOrganiserPayable.
 *
 * Before that day the gate required all five to sell (bfdc66684, 30 April 2026,
 * before A2), so an organiser who had not finished Stripe could not publish a
 * paid event at all; every case below that now reads true for a sale was false.
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

/** An organiser who has signed up and never opened Stripe: the commonest new organiser there is. */
const neverConnected: OrgFixture = {
  stripe_account_id: null,
  stripe_charges_enabled: false,
  stripe_payouts_enabled: false,
  stripe_account_country: null,
  payout_status: 'active',
}

describe('isOrganiserSellable (sell first)', () => {
  test('a fully connected organiser sells', () => {
    expect(isOrganiserSellable(verified(sellable))).toBe(true)
  })

  test('an organiser who has not connected or finished Stripe sells, the money held for them', () => {
    expect(isOrganiserSellable(verified(neverConnected))).toBe(true)
    expect(isOrganiserSellable(verified(notConnected))).toBe(true)
    expect(isOrganiserSellable(verified(connectedNoCharges))).toBe(true)
    expect(isOrganiserSellable(verified(without({ stripe_payouts_enabled: false })))).toBe(true)
  })

  test('a hold placed by EventLinqs stops the sale, connected or not', () => {
    expect(isOrganiserSellable(verified(without({ payout_status: 'on_hold' })))).toBe(false)
    expect(isOrganiserSellable(verified({ ...neverConnected, payout_status: 'on_hold' }))).toBe(false)
  })

  test('a Stripe restriction does not stop the sale: the money is held and the payout waits', () => {
    expect(isOrganiserSellable(verified(without({ payout_status: 'restricted' })))).toBe(true)
  })

  test('a connected account in a country we cannot settle in stops the sale; no country yet sells in Australia', () => {
    expect(isOrganiserSellable(verified(without({ stripe_account_country: 'ZZ' })))).toBe(false)
    expect(isOrganiserSellable(verified(without({ stripe_account_country: 'NZ' })))).toBe(true)
    expect(isOrganiserSellable(verified(without({ stripe_account_country: null })))).toBe(true)
  })
})

describe('isOrganiserPayable (the post-event payout keeps all five)', () => {
  test('true only when connected, charges and payouts enabled, active, and in a currency we settle in', () => {
    expect(isOrganiserPayable(verified(sellable))).toBe(true)
    const missingOne: Partial<OrgFixture>[] = [
      { stripe_account_id: null },
      { stripe_charges_enabled: false },
      { stripe_payouts_enabled: false },
      { payout_status: 'on_hold' },
      { payout_status: 'restricted' },
      { stripe_account_country: null },
      { stripe_account_country: 'ZZ' },
    ]
    for (const patch of missingOne) expect(isOrganiserPayable(verified(without(patch)))).toBe(false)
  })

  test('an organiser who has never connected can sell today and cannot be paid until they connect', () => {
    expect(isOrganiserSellable(verified(neverConnected))).toBe(true)
    expect(isOrganiserPayable(verified(neverConnected))).toBe(false)
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
    // A NULL country is a legitimate value: it sells in Australia and refuses
    // the payout until the account has one. A MISSING country column is a bug.
    // Collapsing those two is the whole defect.
    const nullCountry = { ...sellable, stripe_account_country: null }
    const verdict = verifyOrgSaleFields(nullCountry)
    expect(verdict.complete).toBe(true)
    if (verdict.complete) {
      expect(isOrganiserSellable(verdict.org)).toBe(true)
      expect(isOrganiserPayable(verdict.org)).toBe(false)
    }
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
  test('paid events go on sale whether or not the organiser has connected (sell first)', () => {
    expect(ticketsOnSale({ isPaidEvent: true, org: sellable })).toBe(true)
    expect(ticketsOnSale({ isPaidEvent: true, org: notConnected })).toBe(true)
    expect(ticketsOnSale({ isPaidEvent: true, org: connectedNoCharges })).toBe(true)
    expect(ticketsOnSale({ isPaidEvent: true, org: without({ stripe_account_country: null }) })).toBe(true)
  })
  test('a hold placed by EventLinqs, or a country we cannot settle in, takes paid tickets off sale', () => {
    expect(ticketsOnSale({ isPaidEvent: true, org: without({ payout_status: 'on_hold' }) })).toBe(false)
    expect(ticketsOnSale({ isPaidEvent: true, org: without({ stripe_account_country: 'ZZ' }) })).toBe(false)
  })
})
