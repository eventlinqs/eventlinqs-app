import { describe, expect, test } from 'vitest'
import { RefundRequestError } from '@/lib/payments/refund-service'
import { toOrganiserRefundFailure } from '@/lib/payments/refund-failure'

/**
 * FOUNDER RULING 18 August 2026: "Never expose Stripe internals to an organiser; a
 * failure says what happened and what to do, in plain words."
 *
 * Both refund actions previously returned the caught error's own message, so an
 * organiser could be shown a database status enum ("order not refundable in status
 * pending"), an internal payments concept ("no payment intent for order"), or a
 * Stripe sentence naming a charge id. These tests are the executable form of the
 * ruling: the LEAK test is the important one, because it fails for any future
 * failure mode somebody forgets to translate.
 */

/** A Stripe SDK error, shaped as the SDK shapes it, without importing the SDK. */
function stripeError(code: string, message: string, statusCode = 400) {
  return { type: 'StripeInvalidRequestError', code, message, statusCode }
}

/** Every internal token that must never reach an organiser's screen. */
const FORBIDDEN = [
  /\bch_[A-Za-z0-9]+/,            // a Stripe charge id
  /\bpi_[A-Za-z0-9]+/,            // a Stripe payment intent id
  /\bre_[A-Za-z0-9]+/,            // a Stripe refund id
  /\bacct_[A-Za-z0-9]+/,          // a Stripe account id
  /payment intent/i,              // an internal concept, not organiser language
  /\bStripe\b/i,                  // the processor is ours to know, not theirs
  /\bSQL|SQLSTATE|check_violation|insufficient_privilege|no_data_found/i,
  /\brpc\b|reconcile_refund|create_refund_request/i,
  /status pending|partially_refunded|order_status/i,
]

const CASES: Array<{ name: string; err: unknown; reason: string; mustSay: RegExp }> = [
  {
    name: 'a Stripe charge already refunded, message carrying a charge id',
    err: stripeError('charge_already_refunded', 'Charge ch_3U5mGQGqHIQtgS8t0KKuTQVr has already been refunded.'),
    reason: 'already_refunded',
    mustSay: /already been refunded/i,
  },
  {
    name: 'a Stripe balance problem',
    err: stripeError('balance_insufficient', 'Insufficient funds in your Stripe account.'),
    reason: 'payment_provider_declined',
    mustSay: /try again/i,
  },
  {
    name: 'a Stripe rate limit',
    err: { type: 'StripeRateLimitError', code: 'rate_limit', message: 'Too many requests', statusCode: 429 },
    reason: 'temporarily_unavailable',
    mustSay: /try again/i,
  },
  {
    name: 'a Stripe outage',
    err: { type: 'StripeAPIError', code: 'api_error', message: 'An unexpected error', statusCode: 503 },
    reason: 'temporarily_unavailable',
    mustSay: /no refund has been sent/i,
  },
  {
    name: 'an unrecognised Stripe error',
    err: stripeError('some_new_code', 'Charge ch_abc123 is in a state we do not name yet.'),
    reason: 'payment_provider_declined',
    mustSay: /no money has moved/i,
  },
  {
    name: 'the order is not in a refundable status (a DB enum leak)',
    err: new RefundRequestError('order not refundable in status pending', '23514'),
    reason: 'order_not_refundable',
    mustSay: /payment is not complete/i,
  },
  {
    name: 'tickets already claimed by another refund',
    err: new RefundRequestError('one or more tickets are not refundable or already claimed', '23514'),
    reason: 'already_refunded',
    mustSay: /reload the order/i,
  },
  {
    name: 'a free order',
    err: new RefundRequestError('free orders are not refundable', '23514'),
    reason: 'free_order',
    mustSay: /nothing to refund/i,
  },
  {
    name: 'no payment intent recorded (the worst leak: reads as lost money)',
    err: new RefundRequestError('no payment intent for order', 'P0002'),
    reason: 'no_payment_found',
    mustSay: /contact eventlinqs support/i,
  },
  {
    name: 'no tickets selected',
    err: new RefundRequestError('no tickets selected', '23514'),
    reason: 'no_tickets_selected',
    mustSay: /choose at least one ticket/i,
  },
  {
    name: 'not authorised, classified on SQLSTATE 42501 rather than prose',
    err: new RefundRequestError('permission denied somewhere deep', '42501'),
    reason: 'not_authorised',
    mustSay: /not authorised/i,
  },
  {
    name: 'a zero computed amount',
    err: new RefundRequestError('cannot allocate refund amount (zero face value)', '23514'),
    reason: 'amount_invalid',
    mustSay: /contact eventlinqs support/i,
  },
  {
    name: 'an order that vanished',
    err: new RefundRequestError('order not found', 'P0002'),
    reason: 'order_not_refundable',
    mustSay: /could not be found/i,
  },
  {
    name: 'a plain Error from nowhere in particular',
    err: new Error('ECONNRESET'),
    reason: 'unknown',
    mustSay: /no money has moved/i,
  },
  { name: 'a thrown string', err: 'boom', reason: 'unknown', mustSay: /could not be completed/i },
  { name: 'a thrown null', err: null, reason: 'unknown', mustSay: /could not be completed/i },
]

describe('toOrganiserRefundFailure: plain words, no internals', () => {
  test.each(CASES.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const out = toOrganiserRefundFailure(c.err)
    expect(out.reason).toBe(c.reason)
    expect(out.message).toMatch(c.mustSay)
  })

  test('NO case leaks an internal identifier, vendor name or database term', () => {
    const leaks: string[] = []
    for (const c of CASES) {
      const { message } = toOrganiserRefundFailure(c.err)
      for (const pattern of FORBIDDEN) {
        if (pattern.test(message)) leaks.push(`${c.name}: matched ${pattern} in "${message}"`)
      }
    }
    expect(leaks).toEqual([])
  })

  test('every message tells the organiser what to DO, not only what went wrong', () => {
    // A message that names a problem and stops leaves somebody stuck, which is the
    // half of the ruling that is easy to satisfy on paper and miss in practice.
    const ACTION = /try again|reload|contact|choose|cancel it instead|wait a minute|\bask\b/i
    const missing = CASES
      .map(c => ({ c, m: toOrganiserRefundFailure(c.err).message }))
      .filter(x => !ACTION.test(x.m))
      .map(x => `${x.c.name}: "${x.m}"`)
    expect(missing).toEqual([])
  })

  test('a message never blames the organiser for a provider outage', () => {
    const out = toOrganiserRefundFailure({ type: 'StripeAPIError', code: 'api_error', message: 'x', statusCode: 500 })
    expect(out.message).not.toMatch(/you (did|entered|chose)/i)
    expect(out.message).toMatch(/no refund has been sent/i)
  })

  test('no message contains an em-dash, an en-dash or an exclamation mark', () => {
    // CLAUDE.md copy law, applied to strings a user actually reads.
    const offenders = CASES
      .map(c => toOrganiserRefundFailure(c.err).message)
      .filter(m => /[—–!]/.test(m))
    expect(offenders).toEqual([])
  })

  test('Australian English: no -ize spellings in organiser-facing copy', () => {
    const offenders = CASES
      .map(c => toOrganiserRefundFailure(c.err).message)
      .filter(m => /\b\w+ize[ds]?\b|\b\w+ization\b/i.test(m))
    expect(offenders).toEqual([])
  })
})
