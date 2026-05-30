// Pins PaymentCalculator rounding + composition behaviour to CURRENT
// behaviour. The P2-4 rounding correctness fix lands in PR3 (out of scope
// for the triad refactor draft); these tests exist so that fix is a
// deliberate, reviewed change and any accidental drift before then fails
// loudly. See docs/TRIAD-REFACTOR-DESIGN.md section 9.

import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  rules: {
    platformPct: 0,
    platformFixed: 0,
    processingPct: 0,
    processingFixed: 0,
    passThrough: 1 as 0 | 1 | 2,
  },
  taxRow: null as { tax_rate: number } | null,
}))

vi.mock('@/lib/payments/pricing-rules', () => ({
  getPlatformFeePercentage: vi.fn(async () => h.rules.platformPct),
  getPlatformFeeFixedCents: vi.fn(async () => h.rules.platformFixed),
  getProcessingFeePercentage: vi.fn(async () => h.rules.processingPct),
  getProcessingFeeFixedCents: vi.fn(async () => h.rules.processingFixed),
  getProcessingFeePassThrough: vi.fn(async () => h.rules.passThrough),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: h.taxRow }),
          }),
        }),
      }),
    }),
  })),
}))

import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import * as pricingRules from '@/lib/payments/pricing-rules'

function ticket(quantity: number, unit_price_cents: number) {
  return { tier_id: 't1', tier_name: 'GA', quantity, unit_price_cents }
}
function addon(quantity: number, unit_price_cents: number) {
  return { addon_id: 'a1', addon_name: 'Parking', quantity, unit_price_cents }
}

beforeEach(() => {
  h.rules = {
    platformPct: 0,
    platformFixed: 0,
    processingPct: 0,
    processingFixed: 0,
    passThrough: 1,
  }
  h.taxRow = null
  vi.clearAllMocks()
})

describe('PaymentCalculator rounding + composition (current behaviour)', () => {
  test('Math.round is half-up on the platform fee (62.5 -> 63)', async () => {
    h.rules.platformPct = 5 // 1250 * 5 / 100 = 62.5
    const calc = new PaymentCalculator()
    const fb = await calc.calculate([ticket(1, 1250)], [], 'AUD')

    expect(fb.platform_fee_cents).toBe(63)
    expect(fb.payment_processing_fee_cents).toBe(0)
    expect(fb.tax_cents).toBe(0)
    expect(fb.fee_pass_type).toBe('pass_to_buyer')
    expect(fb.total_cents).toBe(1250 + 63)
  })

  test('platform fixed cents is multiplied per ticket; processing fixed is not', async () => {
    h.rules.platformPct = 1.5 // 3000 * 1.5 / 100 = 45
    h.rules.platformFixed = 30 // + 3 tickets * 30 = 90  -> round(135) = 135
    h.rules.processingPct = 2.9 // 3000 * 2.9 / 100 = 87
    h.rules.processingFixed = 30 // + 30 (NOT * ticketCount) -> round(117) = 117
    const calc = new PaymentCalculator()
    const fb = await calc.calculate([ticket(3, 1000)], [], 'AUD')

    expect(fb.platform_fee_cents).toBe(135)
    expect(fb.payment_processing_fee_cents).toBe(117)
    expect(fb.total_cents).toBe(3000 + 135 + 117)
  })

  test('discount is clamped to merch subtotal; absorb mode hides fees', async () => {
    h.rules.platformPct = 10
    h.rules.passThrough = 0 // absorb
    const calc = new PaymentCalculator()
    // subtotal 5000 + addons 1000 = 6000; discount 9999 clamps to 6000
    const fb = await calc.calculate([ticket(1, 5000)], [addon(2, 500)], 'AUD', undefined, 9999)

    expect(fb.discount_cents).toBe(6000) // clamped, not 9999
    expect(fb.fee_pass_type).toBe('absorb')
    // discounted_subtotal = 0 -> all fees round to 0, absorb total = 0
    expect(fb.platform_fee_cents).toBe(0)
    expect(fb.payment_processing_fee_cents).toBe(0)
    expect(fb.total_cents).toBe(0)
    expect(fb.breakdown_display.total).toBe(0)
    // absorb hides fees in the buyer-facing breakdown
    expect(fb.breakdown_display.platform_fee).toBe(0)
    expect(fb.breakdown_display.processing_fee).toBe(0)
  })

  test('free order short-circuits before any pricing-rules read', async () => {
    const calc = new PaymentCalculator()
    const fb = await calc.calculate([ticket(2, 0)], [], 'AUD')

    expect(fb.total_cents).toBe(0)
    expect(fb.platform_fee_cents).toBe(0)
    expect(fb.payment_processing_fee_cents).toBe(0)
    expect(fb.tax_cents).toBe(0)
    expect(fb.fee_pass_type).toBe('pass_to_buyer')
    // The zero-merch short circuit returns before resolving any rule.
    expect(pricingRules.getPlatformFeePercentage).not.toHaveBeenCalled()
    expect(pricingRules.getProcessingFeePercentage).not.toHaveBeenCalled()
  })

  test('GST is inclusive: no consumption tax is added on top of the all-in total', async () => {
    // Regression for order EL-6HBNEYY9: AUD 65 face value was billed as
    // AUD 75.82 because 10 per cent GST was added on top of the ticket
    // subtotal. Under all-in pricing the ticket and the platform fee are
    // GST-inclusive, so no separate GST amount is ever added to the buyer.
    h.taxRow = { tax_rate: 0.1 } // an active GST rule must NOT change the total
    h.rules.platformPct = 2.5
    h.rules.platformFixed = 50
    const calc = new PaymentCalculator()
    // platform = round(6500 * 2.5 / 100 + 50) = round(212.5) = 213
    const fb = await calc.calculate([ticket(1, 6500)], [], 'AUD')

    expect(fb.platform_fee_cents).toBe(213)
    expect(fb.tax_cents).toBe(0)
    expect(fb.total_cents).toBe(6500 + 213)
  })

  test('explicit fee_pass_type overrides the pricing-rules default', async () => {
    h.rules.passThrough = 1 // default would be pass_to_buyer
    const calc = new PaymentCalculator()
    const fb = await calc.calculate([ticket(1, 2000)], [], 'AUD', 'absorb')

    expect(fb.fee_pass_type).toBe('absorb')
    expect(fb.total_cents).toBe(2000) // absorb: subtotal only, no fees added
  })
})
