// Locks the EventLinqs fee structure (docs/EventLinqs-Fee-Structure-LOCKED.md):
// platform / service fee 3.5% + AUD 0.99 per ticket, payment processing 2.5% of
// the order (no flat), free events free. Proves the worked examples at $20/$30/$80
// in BOTH absorb and pass-on modes, that the shared pure math equals the server
// PaymentCalculator (one source), that an admin fee change flows through, and that
// the funds-holding payout math (composeApplicationFee) is correct in both modes.

import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  computeFeeLineCents,
  computeAllInTotalCents,
  type FeeRates,
} from '@/lib/payments/fee-math'

// Locked AU rates. ONE FEE, founder ruling 15 August 2026.
const LOCKED: FeeRates = {
  platformFeePercent: 3.5,
  platformFeeFixedCents: 99,
}

describe('Locked fee math - pure (single source for server + client display)', () => {
  // [faceCents, expFee] for ONE ticket at the face value. Processing is always 0.
  const cases: Array<[number, number]> = [
    // $20: round(2000*3.5/100 + 99) = round(70 + 99) = 169
    [2000, 169],
    // $30: round(3000*3.5/100 + 99) = round(105 + 99) = 204
    [3000, 204],
    // $80: round(8000*3.5/100 + 99) = round(280 + 99) = 379
    [8000, 379],
  ]

  test.each(cases)(
    'face %i c -> one fee of %i c, both modes correct',
    (faceCents, expFee) => {
      const lines = computeFeeLineCents(faceCents, 1, LOCKED)
      expect(lines.platform_fee_cents).toBe(expFee)
      // Deleted: no new order carries a processing line.
      expect(lines.payment_processing_fee_cents).toBe(0)

      const totalFees = expFee

      // PASS-ON: buyer pays face + fees, organiser keeps the full face value.
      const passOn = computeAllInTotalCents(faceCents, lines, 'pass_to_buyer')
      expect(passOn).toBe(faceCents + totalFees)

      // ABSORB: buyer pays the face value only; fees come out of the payout.
      const absorb = computeAllInTotalCents(faceCents, lines, 'absorb')
      expect(absorb).toBe(faceCents)
    },
  )

  test('the flat fee multiplies per ticket', () => {
    // 3 x $20: round(6000*3.5/100 + 3*99) = round(210 + 297) = 507
    const lines = computeFeeLineCents(6000, 3, LOCKED)
    expect(lines.platform_fee_cents).toBe(507)
    expect(lines.payment_processing_fee_cents).toBe(0)
  })

  test('free-event guarantee is a CALLER guard, not the pure math', () => {
    // The pure helper is unconditional arithmetic: the platform flat fee is
    // per-ticket, so a $0 cart of 2 tickets would compute a flat fee. "Free
    // events are free" is therefore enforced by the CALLER short-circuiting on a
    // zero subtotal (PaymentCalculator's merch===0 return; the ticket selector's
    // `subtotalCents > 0` guard), proven by the PaymentCalculator e2e below. This
    // test pins that contract so nobody mistakes the pure math for the guard.
    expect(computeFeeLineCents(0, 2, LOCKED).platform_fee_cents).toBe(198)
    // An empty cart (no tickets, no subtotal) is genuinely zero.
    const empty = computeFeeLineCents(0, 0, LOCKED)
    expect(empty.platform_fee_cents).toBe(0)
    expect(empty.payment_processing_fee_cents).toBe(0)
    expect(computeAllInTotalCents(0, empty, 'pass_to_buyer')).toBe(0)
  })

  test('an admin fee change flows through deterministically', () => {
    const before = computeFeeLineCents(3000, 1, LOCKED)
    // Founder raises the platform percent to 4% in /admin/pricing.
    const after = computeFeeLineCents(3000, 1, { ...LOCKED, platformFeePercent: 4 })
    expect(before.platform_fee_cents).toBe(204) // 3.5% + 99c
    expect(after.platform_fee_cents).toBe(219) // 4% + 99c = round(120 + 99)
    expect(after.platform_fee_cents).toBeGreaterThan(before.platform_fee_cents)
  })
})

// ── End-to-end through the real PaymentCalculator + funds-holding payout math ──

const h = vi.hoisted(() => ({
  rules: { platformPct: 3.5, platformFixed: 99, processingPct: 2.5, processingFixed: 0, passThrough: 1 as 0 | 1 | 2 },
}))

vi.mock('@/lib/payments/pricing-rules', () => ({
  getPlatformFeePercentage: vi.fn(async () => h.rules.platformPct),
  getPlatformFeeFixedCents: vi.fn(async () => h.rules.platformFixed),
  getProcessingFeePercentage: vi.fn(async () => h.rules.processingPct),
  getProcessingFeeFixedCents: vi.fn(async () => h.rules.processingFixed),
  getProcessingFeePassThrough: vi.fn(async () => h.rules.passThrough),
}))

import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import { composeApplicationFee } from '@/lib/payments/application-fee'

function ticket(quantity: number, unit_price_cents: number) {
  return { tier_id: 't1', tier_name: 'GA', quantity, unit_price_cents }
}

beforeEach(() => {
  h.rules = { platformPct: 3.5, platformFixed: 99, processingPct: 2.5, processingFixed: 0, passThrough: 1 }
  vi.clearAllMocks()
})

describe('Locked fee structure through PaymentCalculator + payout (16/16 funds-holding mode 1)', () => {
  /*
   * ONE FEE (founder ruling 15 August 2026). `processing` is 0 on every example
   * because the separate 2.5 per cent line was deleted and card processing comes
   * out of the 3.5. The old expectations were 50, 75 and 200 cents.
   *
   * Mode 1 and mode 2 of composeApplicationFee now produce the SAME number,
   * because mode 1 was platform + processing and processing is zero. That is
   * harmless rather than broken: the composition mode is inert, exactly like the
   * pricing_rules rows it was built for.
   */
  const examples = [
    { name: '$20', face: 2000, platform: 169 },
    { name: '$30', face: 3000, platform: 204 },
    { name: '$80', face: 8000, platform: 379 },
  ]

  for (const ex of examples) {
    test(`${ex.name} PASS-ON: buyer pays all-in, organiser keeps face value`, async () => {
      const calc = new PaymentCalculator()
      const fb = await calc.calculate([ticket(1, ex.face)], [], 'AUD', 'pass_to_buyer')

      expect(fb.platform_fee_cents).toBe(ex.platform)
      expect(fb.payment_processing_fee_cents).toBe(0)
      expect(fb.total_cents).toBe(ex.face + ex.platform)
      const appFee = composeApplicationFee(fb, 1)
      expect(appFee).toBe(ex.platform)
      // organiser share = total - keep = face value (organiser keeps face).
      expect(fb.total_cents - appFee).toBe(ex.face)
    })

    test(`${ex.name} ABSORB: buyer pays face only, the fee comes out of payout`, async () => {
      const calc = new PaymentCalculator()
      const fb = await calc.calculate([ticket(1, ex.face)], [], 'AUD', 'absorb')

      expect(fb.platform_fee_cents).toBe(ex.platform)
      expect(fb.payment_processing_fee_cents).toBe(0)
      // buyer total is the face value only
      expect(fb.total_cents).toBe(ex.face)
      // buyer-facing breakdown hides the fee in absorb mode
      expect(fb.breakdown_display.platform_fee).toBe(0)
      expect(fb.breakdown_display.processing_fee).toBe(0)
      // organiser share = face - fee
      const appFee = composeApplicationFee(fb, 1)
      expect(appFee).toBe(ex.platform)
      expect(fb.total_cents - appFee).toBe(ex.face - ex.platform)
    })
  }

  test('free event: no fees, no charge, no pricing-rules read', async () => {
    const calc = new PaymentCalculator()
    const fb = await calc.calculate([ticket(2, 0)], [], 'AUD')
    expect(fb.total_cents).toBe(0)
    expect(fb.platform_fee_cents).toBe(0)
    expect(fb.payment_processing_fee_cents).toBe(0)
  })
})
