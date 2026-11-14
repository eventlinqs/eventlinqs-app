/**
 * SELL FIRST, CONNECT BEFORE THE PAYOUT, held across every module that decides it.
 *
 * Lawal's yes, 15:22 on 14 November 2026: "Yes, you let organisers publish and
 * sell straight away ... Finish my platform and let this be live." Under his A2
 * (29 September) the buyer pays EventLinqs, which holds the money until after
 * the event; under his payout rule (10 October) the money goes only to the
 * organiser's own connected account. So an organiser needs no Stripe account to
 * publish or sell, and needs a connected, payable one to be paid.
 *
 * FOUR PLACES DECIDE THIS and they must never disagree, because a disagreement
 * strands someone: the event page offers tickets (ticketsOnSale), the organiser
 * publishes (checkPublishGate), the charge is taken (assertOrganiserCanTakeSales)
 * and the form names the step left (showsConnectBankStep). This file walks every
 * organiser state through all four and asserts one answer, so an edit to any one
 * of them that breaks the agreement fails here without anybody thinking of the
 * case.
 *
 * WHAT THIS FILE REPLACES, kept so its history reads: it was
 * tests/unit/events/publish-needs-a-fresh-enabled-account.test.ts, MONEY FIX A3
 * layer two's "an event cannot go on sale on a cached yes nobody can date". That
 * rule guarded a publish that depended on Stripe; since sell first nothing about
 * a publish does, and the freshness module keeps its own test
 * (connect-verification-freshness.test.ts) for the payouts page that reads it.
 */
import { describe, expect, it, vi } from 'vitest'
import type { FeeBreakdown } from '@/lib/payments/payment-calculator'

vi.mock('@/lib/payments/pricing-rules', () => ({
  getApplicationFeeCompositionMode: vi.fn(),
  getReservePercentage: vi.fn(),
}))

import { ChargePreconditionError, assertOrganiserCanTakeSales } from '@/lib/payments/application-fee'
import { checkPublishGate } from '@/lib/events/publish-gate'
import { showsConnectBankStep } from '@/lib/events/paid-publish-blocked'
import {
  isOrganiserPayable,
  isOrganiserSellable,
  ticketsOnSale,
  verifyOrgSaleFields,
} from '@/lib/payments/sale-status'

const PAID = {
  organisationId: 'org_1',
  tiersHavePaid: true,
  coverImageUrl: 'https://x/y.jpg',
  endsAt: new Date(Date.now() + 7 * 864e5).toISOString(),
  isPhysical: true,
  venueName: 'The Wool Exchange',
  venueAddress: '44 Moorabool St, Geelong',
  walkIn: null,
}

/** A $50.00 ticket at the launch rate, as money-chain.test.ts builds it. */
const FEES: FeeBreakdown = {
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
  breakdown_display: { tickets: [], addons: [], subtotal: 5_000, platform_fee: 274, processing_fee: 0, discount: 0, tax: 0, total: 5_274 },
}

function clientReturning(row: Record<string, unknown>) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
  } as never
}

function chargeTaken(row: Record<string, unknown>): boolean {
  try {
    assertOrganiserCanTakeSales(row as never, FEES)
    return true
  } catch (err) {
    if (err instanceof ChargePreconditionError) return false
    throw err
  }
}

/** Every organiser state that matters: no account to fully enabled, each payout status, each kind of country. */
const STATES: Record<string, unknown>[] = []
for (const stripe_account_id of [null, 'acct_x']) {
  for (const enabled of [false, true]) {
    for (const stripe_account_country of [null, 'AU', 'NZ', 'ZZ']) {
      for (const payout_status of ['active', 'unset', 'restricted', 'on_hold']) {
        STATES.push({
          stripe_account_id,
          stripe_charges_enabled: enabled,
          stripe_payouts_enabled: enabled,
          stripe_account_country,
          payout_status,
        })
      }
    }
  }
}

describe('the four places that decide a sale agree on every organiser state', () => {
  it(`walks ${STATES.length} states`, () => {
    expect(STATES).toHaveLength(2 * 2 * 4 * 4)
  })

  it('the event page, the publish gate and the charge give one answer', async () => {
    const disagreements: string[] = []
    for (const row of STATES) {
      const offered = ticketsOnSale({ isPaidEvent: true, org: row as never })
      const published = (await checkPublishGate(clientReturning(row), PAID)).ok
      const charged = chargeTaken(row)
      if (!(offered === published && published === charged)) {
        disagreements.push(`${JSON.stringify(row)} offered=${offered} published=${published} charged=${charged}`)
      }
    }
    expect(disagreements, disagreements.join('\n')).toEqual([])
  })

  it('the only states refused are a hold placed by EventLinqs and a country we cannot settle in', () => {
    for (const row of STATES) {
      const verdict = verifyOrgSaleFields(row)
      if (!verdict.complete) throw new Error('fixture incomplete')
      const expected = row.payout_status !== 'on_hold' && row.stripe_account_country !== 'ZZ'
      expect(isOrganiserSellable(verdict.org), JSON.stringify(row)).toBe(expected)
    }
  })
})

describe('being paid is a separate, stricter question', () => {
  it('every organiser who can be paid can also sell', () => {
    for (const row of STATES) {
      const verdict = verifyOrgSaleFields(row)
      if (!verdict.complete) throw new Error('fixture incomplete')
      if (isOrganiserPayable(verdict.org)) expect(isOrganiserSellable(verdict.org), JSON.stringify(row)).toBe(true)
    }
  })

  it('only a connected, enabled, active account in a settled currency can be paid', () => {
    const payable = STATES.filter((row) => {
      const verdict = verifyOrgSaleFields(row)
      return verdict.complete && isOrganiserPayable(verdict.org)
    })
    expect(payable).toEqual([
      { stripe_account_id: 'acct_x', stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_account_country: 'AU', payout_status: 'active' },
      { stripe_account_id: 'acct_x', stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_account_country: 'NZ', payout_status: 'active' },
    ])
  })
})

describe('the form names the one step left, and never blocks on it', () => {
  it('shows "Connect your bank" exactly when the organiser can sell and cannot yet be paid', () => {
    for (const row of STATES) {
      const verdict = verifyOrgSaleFields(row)
      if (!verdict.complete) throw new Error('fixture incomplete')
      const canSellPaid = isOrganiserSellable(verdict.org)
      const canBePaid = isOrganiserPayable(verdict.org)
      const step = showsConnectBankStep({ canSellPaid, canBePaid, editMode: false, tierPrices: [{ price: '25' }] })
      expect(step, JSON.stringify(row)).toBe(canSellPaid && !canBePaid)
    }
  })

  it('shows nothing for a free event, or when editing, or when the payout state could not be read', () => {
    const base = { canSellPaid: true, canBePaid: false, editMode: false, tierPrices: [{ price: '25' }] }
    expect(showsConnectBankStep({ ...base, tierPrices: [{ price: '0' }] })).toBe(false)
    expect(showsConnectBankStep({ ...base, editMode: true })).toBe(false)
    // canBePaid defaults to true at the call site when the read fails, so an unread state shows no false step.
    expect(showsConnectBankStep({ ...base, canBePaid: true })).toBe(false)
  })

  it('a held organisation gets its own notice, not the bank step', () => {
    expect(showsConnectBankStep({ canSellPaid: false, canBePaid: false, editMode: false, tierPrices: [{ price: '25' }] })).toBe(false)
  })
})
