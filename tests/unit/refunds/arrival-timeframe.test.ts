/**
 * ONE REFUND TIMEFRAME, ON EVERY SURFACE, FROM STRIPE'S OWN DOCUMENTATION.
 *
 * THE DEFECT THIS FILE WAS WRITTEN FOR. On 23 August 2026 the platform stated
 * how long a refund takes on eight buyer-facing surfaces and disagreed with
 * itself on two:
 *
 *   refund-confirmation.ts   "within 3 to 5 business days. Some banks may take
 *                             up to 10 days."            UNDERSTATED
 *   event-state-banner.tsx   "within 5 business days"     UNDERSTATED
 *
 * A buyer who was refused, then approved, then emailed was told 5-10, then
 * 5-10, then 3-5. The shortest number is the one they hold us to, and it was in
 * the email they keep. Under the Australian Consumer Law a timeframe stated
 * three ways in a refund flow is a representation about the service, not sloppy
 * copy.
 *
 * THE NUMBER IS SOURCED (Law 7). Stripe's own refunds documentation:
 * "Your customer sees the refund as a credit approximately 5-10 business days
 * later, depending upon the bank." https://docs.stripe.com/refunds (fetched
 * 2026-08-23). Stripe is the processor that actually moves the money.
 *
 * The sweep below carries a negative control fed each of the two wordings that
 * shipped, so it cannot pass vacuously if its detector stops matching.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  REFUND_ARRIVAL_WINDOW,
  REFUND_ARRIVAL_MIN_BUSINESS_DAYS,
  REFUND_ARRIVAL_MAX_BUSINESS_DAYS,
  refundArrivalSentence,
  refundArrivalSentenceWithAmount,
  refundArrivalSentenceWithReversal,
} from '@/lib/refunds/arrival-timeframe'

const REPO_ROOT = process.cwd()

describe('the number matches Stripe, exactly', () => {
  it('is 5 to 10 business days', () => {
    expect(REFUND_ARRIVAL_MIN_BUSINESS_DAYS).toBe(5)
    expect(REFUND_ARRIVAL_MAX_BUSINESS_DAYS).toBe(10)
    expect(REFUND_ARRIVAL_WINDOW).toBe('5 to 10 business days')
  })

  it('every sentence builder states that window and no other', () => {
    for (const s of [
      refundArrivalSentence(),
      refundArrivalSentenceWithAmount('$45.00'),
      refundArrivalSentenceWithReversal('$45.00'),
    ]) {
      expect(s).toContain(REFUND_ARRIVAL_WINDOW)
      expect(s).not.toMatch(/3 to 5 business days/)
      expect(s).not.toMatch(/within 5 business days/)
    }
  })

  it('the long sentence explains the reversal case', () => {
    // Stripe, same page: a refund issued shortly after the charge appears "in
    // the form of a reversal", the original charge drops off the statement and
    // no separate credit is issued. A buyer hunting a credit that will never
    // appear contacts support, and the sentence is cheaper than the ticket.
    expect(refundArrivalSentenceWithReversal('$45.00')).toMatch(/remove the original charge/i)
  })
})

/** Every .ts/.tsx under src, so the sweep cannot miss a surface. */
const SOURCE_FILES = readdirSync(join(REPO_ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter(e => e.isFile() && /\.tsx?$/.test(e.name))
  .map(e => join(e.parentPath, e.name))

/**
 * Finds a hardcoded REFUND-ARRIVAL timeframe.
 *
 * Deliberately narrow. Three other "business days" figures on this platform
 * measure different things and must keep their own numbers:
 *   organiser payout (3 to 5 business days after the event ends),
 *   our response SLA (2 business days to reply, 10 to decide a dispute),
 *   privacy acknowledgement (5 business days).
 * So this matches only the phrasings used for money reaching a BUYER's card.
 */
function hardcodedRefundArrival(source: string): string[] {
  const patterns = [
    /within \d+ to \d+ business days/gi,
    /in about \d+ to \d+ business days/gi,
    /show it within \d+ business days/gi,
    /payment method within \d+ business days/gi,
  ]
  const found: string[] = []
  for (const re of patterns) for (const m of source.matchAll(re)) found.push(m[0])
  return found
}

/** Strips comments so a historical quote in a docblock is not a hit. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trimStart().startsWith('//'))
    .join('\n')
}

describe('no surface states its own refund timeframe', () => {
  it('scans a real, non-empty set of files', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(500)
  })

  it('finds no hardcoded refund-arrival timeframe anywhere under src/', () => {
    const offenders = SOURCE_FILES.flatMap(file => {
      // The single source is allowed to contain the number: it IS the number.
      if (file.replace(/\\/g, '/').endsWith('src/lib/refunds/arrival-timeframe.ts')) return []
      return hardcodedRefundArrival(code(readFileSync(file, 'utf8'))).map(
        h => `${file.slice(REPO_ROOT.length + 1)}: ${h}`,
      )
    })
    expect(offenders).toEqual([])
  })

  it('negative control: the detector flags BOTH wordings that shipped', () => {
    expect(
      hardcodedRefundArrival(
        'Your refund will appear on your statement within 3 to 5 business days.',
      ),
    ).toHaveLength(1)
    expect(
      hardcodedRefundArrival(
        'Refunds are processed automatically to the original payment method within 5 business days.',
      ),
    ).toHaveLength(1)
    expect(
      hardcodedRefundArrival('Most banks show it within 5 to 10 business days.'),
    ).toHaveLength(1)
  })

  it('negative control: it does NOT flag the payout or SLA figures', () => {
    // These are different promises about different parties and must survive.
    expect(hardcodedRefundArrival('Paid to your account within 5 business days of your event ending.')).toEqual([])
    expect(hardcodedRefundArrival('First response: within 2 business days of receiving')).toEqual([])
    expect(hardcodedRefundArrival('We acknowledge your request within 5 business days.')).toEqual([])
  })
})
