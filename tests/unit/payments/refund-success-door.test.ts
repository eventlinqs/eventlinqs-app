import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEPRECATED_REFUND_EVENTS,
  REFUND_NOT_COMPLETED_EVENTS,
  REFUND_SUCCESS_EVENTS,
  STRIPE_MINIMUM_REFUND_EVENT,
  classifyRefundEvent,
  refundChargeSource,
} from '@/lib/payments/refund-events'

/**
 * CLOSE-OUT R1. A refund issued from the Stripe Dashboard was received and
 * dropped, because the webhook route reached its successful-refund handler from
 * exactly one event, `charge.refunded`, and Stripe announced that refund with
 * `refund.created`.
 *
 * WHAT A UNIT TEST CAN AND CANNOT PROVE HERE, said plainly because the drive is
 * the real proof and this file must not be mistaken for it. It cannot issue a
 * refund, so it cannot prove a seat comes back; that is
 * scripts/verify/r1-out-of-app-refund-drive.mjs, which refunds a real payment
 * intent from outside the application and reads the outcome out of the database.
 * What it CAN do exhaustively is the DECISION: which events mean success, which
 * mean failure, which are deprecated, and how a refund names the charge it
 * belongs to. That decision is what shrank to one, silently.
 */

const ROUTE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'webhooks', 'stripe', 'route.ts'),
  'utf8',
)

describe('the set of events that mean a refund succeeded', () => {
  test('contains the event Stripe names as the minimum', () => {
    // "At a minimum, Stripe recommends that you listen for the `refund.created`
    // event." https://docs.stripe.com/refunds (fetched 14 September 2026)
    expect(STRIPE_MINIMUM_REFUND_EVENT).toBe('refund.created')
    expect(REFUND_SUCCESS_EVENTS).toContain(STRIPE_MINIMUM_REFUND_EVENT)
  })

  test('still contains charge.refunded, which Stripe documents and has not deprecated', () => {
    expect(REFUND_SUCCESS_EVENTS).toContain('charge.refunded')
  })

  test('is exactly the two doors, so a third cannot arrive without a test saying so', () => {
    expect([...REFUND_SUCCESS_EVENTS].sort()).toEqual(['charge.refunded', 'refund.created'])
  })

  test('shares no event with the not-completed path', () => {
    const overlap = REFUND_SUCCESS_EVENTS.filter((e) =>
      (REFUND_NOT_COMPLETED_EVENTS as readonly string[]).includes(e),
    )
    expect(overlap).toEqual([])
  })

  test('shares no event with the deprecated list', () => {
    const overlap = REFUND_SUCCESS_EVENTS.filter((e) =>
      (DEPRECATED_REFUND_EVENTS as readonly string[]).includes(e),
    )
    expect(overlap).toEqual([])
  })
})

describe('classifyRefundEvent is total over what Stripe can send', () => {
  const CASES: Array<[string, ReturnType<typeof classifyRefundEvent>]> = [
    ['refund.created', 'success'],
    ['charge.refunded', 'success'],
    ['refund.failed', 'not-completed'],
    ['refund.updated', 'not-completed'],
    ['charge.refund.updated', 'deprecated'],
    ['source.refund_attributes_required', 'deprecated'],
    // Not refund events at all. An unknown type must answer null rather than
    // throw: the route sees every event on the endpoint, not only these.
    ['payment_intent.succeeded', null],
    ['charge.succeeded', null],
    ['account.updated', null],
    ['some.event.stripe.adds.next.year', null],
    ['', null],
  ]
  for (const [type, role] of CASES) {
    test(`${type || '(the empty string)'} is ${role ?? 'not a refund event'}`, () => {
      expect(classifyRefundEvent(type)).toBe(role)
    })
  }
})

describe('a refund names the charge it belongs to', () => {
  test('a charge id given as a string', () => {
    expect(refundChargeSource({ charge: 'ch_123', payment_intent: 'pi_123' })).toEqual({
      chargeId: 'ch_123',
      paymentIntentId: 'pi_123',
    })
  })

  test('a charge given expanded', () => {
    expect(refundChargeSource({ charge: { id: 'ch_456' } })).toEqual({
      chargeId: 'ch_456',
      paymentIntentId: null,
    })
  })

  test('no charge, but an intent to retrieve it from', () => {
    expect(refundChargeSource({ charge: null, payment_intent: 'pi_789' })).toEqual({
      chargeId: null,
      paymentIntentId: 'pi_789',
    })
  })

  test('an intent given expanded', () => {
    expect(refundChargeSource({ payment_intent: { id: 'pi_abc' } })).toEqual({
      chargeId: null,
      paymentIntentId: 'pi_abc',
    })
  })

  test('neither, which is the case that has to reach a person', () => {
    expect(refundChargeSource({})).toEqual({ chargeId: null, paymentIntentId: null })
    expect(refundChargeSource({ charge: null, payment_intent: null })).toEqual({
      chargeId: null,
      paymentIntentId: null,
    })
  })

  test('an empty string is not an id', () => {
    // An expanded object with no id, or a blank string, must read as absent
    // rather than as a charge called "", which would make Stripe 404 and the
    // refund look like a Stripe fault instead of a missing field.
    expect(refundChargeSource({ charge: '', payment_intent: '' })).toEqual({
      chargeId: null,
      paymentIntentId: null,
    })
    expect(refundChargeSource({ charge: {} })).toEqual({ chargeId: null, paymentIntentId: null })
  })
})

describe('the route wires every declared door, and the failure is retryable', () => {
  /*
   * These four read the route's source. The registered guard
   * scripts/guards/refund-success-door.mjs is the blocking form of the same
   * invariants and follows the call chain properly; these are here because the
   * suite runs on every lane's cheap gate and a red test names the defect in the
   * place a developer is already looking.
   */
  for (const type of REFUND_SUCCESS_EVENTS) {
    test(`the route has a case for ${type}`, () => {
      expect(ROUTE).toContain(`case '${type}':`)
    })
  }

  test('refund.created reaches the reconcile through the charge handler', () => {
    expect(ROUTE).toContain('await handleRefundCreated(refund)')
    expect(ROUTE).toContain('await handleChargeRefunded(charge)')
  })

  test('the reconcile failure throws the one error type the outer catch answers with 500', () => {
    // A plain Error here is answered 200, which tells Stripe the delivery
    // succeeded. That was the state until 14 September 2026.
    expect(ROUTE).toMatch(/throw new WebhookProcessingError\(`reconcile_refund failed/)
  })

  test('the deprecated charge.refund.updated is not wired at all', () => {
    expect(ROUTE).not.toContain("case 'charge.refund.updated':")
  })
})
