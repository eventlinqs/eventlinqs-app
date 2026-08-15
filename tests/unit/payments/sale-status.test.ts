import { describe, expect, test } from 'vitest'
import {
  eventIsPaid,
  isOrganiserSellable,
  ticketsOnSale,
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

describe('isOrganiserSellable', () => {
  test('true when every requirement is met', () => {
    expect(isOrganiserSellable(sellable)).toBe(true)
  })

  test('false when the organiser is not connected or cannot take charges', () => {
    expect(isOrganiserSellable(notConnected)).toBe(false)
    expect(isOrganiserSellable(connectedNoCharges)).toBe(false)
    expect(isOrganiserSellable(null)).toBe(false)
    expect(isOrganiserSellable(undefined)).toBe(false)
  })

  test('false when payouts are not enabled, because the platform holds the funds', () => {
    expect(isOrganiserSellable(without({ stripe_payouts_enabled: false }))).toBe(false)
  })

  test('false when the payout status is not active', () => {
    expect(isOrganiserSellable(without({ payout_status: 'on_hold' }))).toBe(false)
    expect(isOrganiserSellable(without({ payout_status: 'restricted' }))).toBe(false)
  })

  /**
   * THE REGION BLOCKER ITSELF. This is the case that stranded a buyer at the
   * payment step: connected, charges enabled, but no country recorded yet.
   */
  test('false when the country is absent or outside the Connect currency map', () => {
    expect(isOrganiserSellable(without({ stripe_account_country: null }))).toBe(false)
    expect(isOrganiserSellable(without({ stripe_account_country: 'ZZ' }))).toBe(false)
    // A supported country still sells.
    expect(isOrganiserSellable(without({ stripe_account_country: 'NZ' }))).toBe(true)
  })

  test('a missing field is refused, never assumed', () => {
    // Selecting fewer columns than the gate reads must fail CLOSED. This is what
    // stops a narrowed SELECT quietly re-opening the same hole.
    const partial = { stripe_account_id: 'acct_123', stripe_charges_enabled: true }
    expect(isOrganiserSellable(partial as never)).toBe(false)
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
