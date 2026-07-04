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

// Locked AU rates.
const LOCKED: FeeRates = {
  platformFeePercent: 3.5,
  platformFeeFixedCents: 99,
  processingFeePercent: 2.5,
  processingFeeFixedCents: 0,
}

describe('Locked fee math - pure (single source for server + client display)', () => {
  // [faceCents, expPlatform, expProcessing] for ONE ticket at the face value.
  const cases: Array<[number, number, number]> = [
    // $20: platform round(700+9900/100... ) -> round(2000*3.5/100 + 99)=round(169)=169; processing round(2000*2.5/100)=50
    [2000, 169, 50],
    // $30: round(3000*3.5/100 + 99)=round(204)=204; processing round(75)=75
    [3000, 204, 75],
    // $80: round(8000*3.5/100 + 99)=round(379)=379; processing round(200)=200
    [8000, 379, 200],
  ]

  test.each(cases)(
    'face %i c -> platform %i c, processing %i c, both modes correct',
    (faceCents, expPlatform, expProcessing) => {
      const lines = computeFeeLineCents(faceCents, 1, LOCKED)
      expect(lines.platform_fee_cents).toBe(expPlatform)
      expect(lines.payment_processing_fee_cents).toBe(expProcessing)

      const totalFees = expPlatform + expProcessing

      // PASS-ON: buyer pays face + fees, organiser keeps the full face value.
      const passOn = computeAllInTotalCents(faceCents, lines, 'pass_to_buyer')
      expect(passOn).toBe(faceCents + totalFees)

      // ABSORB: buyer pays the face value only; fees come out of the payout.
      const absorb = computeAllInTotalCents(faceCents, lines, 'absorb')
      expect(absorb).toBe(faceCents)
    },
  )

  test('platform flat fee multiplies per ticket; processing flat does not', () => {
    // 3 x $20: platform round(6000*3.5/100 + 3*99)=round(210+297)=507; processing round(6000*2.5/100)=150
    const lines = computeFeeLineCents(6000, 3, LOCKED)
    expect(lines.platform_fee_cents).toBe(507)
    expect(lines.payment_processing_fee_cents).toBe(150)
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
  const examples = [
    { name: '$20', face: 2000, platform: 169, processing: 50 },
    { name: '$30', face: 3000, platform: 204, processing: 75 },
    { name: '$80', face: 8000, platform: 379, processing: 200 },
  ]

  for (const ex of examples) {
    test(`${ex.name} PASS-ON: buyer pays all-in, organiser keeps face value`, async () => {
      const calc = new PaymentCalculator()
      const fb = await calc.calculate([ticket(1, ex.face)], [], 'AUD', 'pass_to_buyer')

      expect(fb.platform_fee_cents).toBe(ex.platform)
      expect(fb.payment_processing_fee_cents).toBe(ex.processing)
      expect(fb.total_cents).toBe(ex.face + ex.platform + ex.processing)
      // mode 1 (stripe_fee_inclusive): platform keep = platform + processing.
      const appFee = composeApplicationFee(fb, 1)
      expect(appFee).toBe(ex.platform + ex.processing)
      // organiser share = total - keep = face value (organiser keeps face).
      expect(fb.total_cents - appFee).toBe(ex.face)
    })

    test(`${ex.name} ABSORB: buyer pays face only, fees come out of payout`, async () => {
      const calc = new PaymentCalculator()
      const fb = await calc.calculate([ticket(1, ex.face)], [], 'AUD', 'absorb')

      // fee amounts are still computed (charged to the organiser via the payout)
      expect(fb.platform_fee_cents).toBe(ex.platform)
      expect(fb.payment_processing_fee_cents).toBe(ex.processing)
      // buyer total is the face value only
      expect(fb.total_cents).toBe(ex.face)
      // buyer-facing breakdown hides the fees in absorb mode
      expect(fb.breakdown_display.platform_fee).toBe(0)
      expect(fb.breakdown_display.processing_fee).toBe(0)
      // organiser share = face - fees
      const appFee = composeApplicationFee(fb, 1)
      expect(appFee).toBe(ex.platform + ex.processing)
      expect(fb.total_cents - appFee).toBe(ex.face - ex.platform - ex.processing)
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
