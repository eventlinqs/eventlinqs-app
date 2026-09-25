/**
 * WHAT STRIPE IS EXPECTED TO TAKE, AND WHAT THE ESTIMATE REFUSES TO GUESS.
 *
 * MONEY FIX A4 asks the order to record "the Stripe processing estimate". The
 * number is only meaningful where a rate has actually been published and read,
 * so the cases that matter most here are the ones that return null: a currency
 * with no recorded rate must never receive the Australian arithmetic wearing a
 * confident face.
 */
import { describe, expect, it } from 'vitest'
import {
  CURRENCIES_WITH_A_RECORDED_RATE,
  STRIPE_AU_DOMESTIC_CARD_FIXED_CENTS,
  STRIPE_AU_DOMESTIC_CARD_PERCENT,
  estimateStripeProcessingCents,
} from '@/lib/payments/stripe-processing-estimate'

describe('estimateStripeProcessingCents', () => {
  it('applies the published Australian rate to an AUD charge', () => {
    // 1.7% of 10,000c is 170c, plus the 30c flat component.
    expect(estimateStripeProcessingCents(10_000, 'AUD')).toBe(200)
  })

  it('is derived from the two published constants rather than typed', () => {
    const total = 3_717
    const expected =
      Math.round((total * STRIPE_AU_DOMESTIC_CARD_PERCENT) / 100) +
      STRIPE_AU_DOMESTIC_CARD_FIXED_CENTS
    expect(estimateStripeProcessingCents(total, 'AUD')).toBe(expected)
  })

  it('accepts the currency in any case, because a column is not a style guide', () => {
    expect(estimateStripeProcessingCents(10_000, 'aud')).toBe(200)
  })

  it('returns null for every settlement currency with no recorded rate', () => {
    // CONNECT_CURRENCY_MAP carries GBP, USD, CAD, NZD and EUR as well as AUD.
    // Stripe publishes a different rate in each market, so the honest answer for
    // all of them is that this module does not know.
    for (const currency of ['GBP', 'USD', 'CAD', 'NZD', 'EUR']) {
      expect(estimateStripeProcessingCents(10_000, currency)).toBeNull()
    }
  })

  it('returns null rather than zero when the currency is missing entirely', () => {
    expect(estimateStripeProcessingCents(10_000, null)).toBeNull()
    expect(estimateStripeProcessingCents(10_000, undefined)).toBeNull()
    expect(estimateStripeProcessingCents(10_000, '')).toBeNull()
  })

  it('takes nothing on a charge of nothing', () => {
    expect(estimateStripeProcessingCents(0, 'AUD')).toBe(0)
    expect(estimateStripeProcessingCents(-1, 'AUD')).toBe(0)
  })

  it('declares exactly the currencies it has a rate for', () => {
    expect([...CURRENCIES_WITH_A_RECORDED_RATE]).toEqual(['AUD'])
  })
})
