import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type Stripe from 'stripe'
import { __setStripeClientForTests, refundOrder } from '@/lib/payments/refund'

interface RefundCall {
  params: Stripe.RefundCreateParams
  options?: Stripe.RequestOptions
}

function makeStubStripe(): { stripe: Stripe; calls: RefundCall[] } {
  const calls: RefundCall[] = []
  const stripe = {
    refunds: {
      create: vi.fn(async (params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => {
        calls.push({ params, options })
        return {
          id: 're_test_1',
          object: 'refund',
          amount: params.amount ?? 0,
          currency: 'aud',
          status: 'succeeded',
          payment_intent: params.payment_intent,
        } as unknown as Stripe.Refund
      }),
    },
  } as unknown as Stripe
  return { stripe, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  __setStripeClientForTests(null)
  vi.clearAllMocks()
})

describe('refundOrder', () => {
  test('issues a destination-charge refund with reverse_transfer + refund_application_fee', async () => {
    const { stripe, calls } = makeStubStripe()
    __setStripeClientForTests(stripe)

    const result = await refundOrder({
      orderId: 'order_1',
      paymentIntentId: 'pi_test_1',
      amountCents: 5_000,
      reason: 'requested_by_buyer',
      initiatedBy: 'buyer',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].params).toMatchObject({
      payment_intent: 'pi_test_1',
      amount: 5_000,
      reason: 'requested_by_customer',
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: {
        order_id: 'order_1',
        initiated_by: 'buyer',
        platform_reason: 'requested_by_buyer',
      },
    })
    expect(calls[0].options?.idempotencyKey).toBe('refund:order_1:5000:buyer')
    expect(result.stripeRefundId).toBe('re_test_1')
    expect(result.amountCents).toBe(5_000)
    expect(result.currency).toBe('AUD')
  })

  test('partial refund preserves the requested amount', async () => {
    const { stripe, calls } = makeStubStripe()
    __setStripeClientForTests(stripe)

    await refundOrder({
      orderId: 'order_2',
      paymentIntentId: 'pi_test_2',
      amountCents: 2_500,
      reason: 'requested_by_buyer',
      initiatedBy: 'organiser',
    })

    expect(calls[0].params.amount).toBe(2_500)
    expect(calls[0].options?.idempotencyKey).toBe('refund:order_2:2500:organiser')
  })

  test('maps event_cancelled to requested_by_customer but preserves platform_reason in metadata', async () => {
    const { stripe, calls } = makeStubStripe()
    __setStripeClientForTests(stripe)

    await refundOrder({
      orderId: 'order_3',
      paymentIntentId: 'pi_test_3',
      amountCents: 10_000,
      reason: 'event_cancelled',
      initiatedBy: 'organiser',
    })

    expect(calls[0].params.reason).toBe('requested_by_customer')
    const metadata = calls[0].params.metadata as Record<string, string> | null | undefined
    expect(metadata?.platform_reason).toBe('event_cancelled')
  })

  test('maps fraudulent and duplicate to native Stripe reasons', async () => {
    const { stripe, calls } = makeStubStripe()
    __setStripeClientForTests(stripe)

    await refundOrder({
      orderId: 'order_4',
      paymentIntentId: 'pi_test_4',
      amountCents: 1_000,
      reason: 'fraudulent',
      initiatedBy: 'admin',
    })
    await refundOrder({
      orderId: 'order_5',
      paymentIntentId: 'pi_test_5',
      amountCents: 1_000,
      reason: 'duplicate',
      initiatedBy: 'admin',
    })

    expect(calls[0].params.reason).toBe('fraudulent')
    expect(calls[1].params.reason).toBe('duplicate')
  })

  test('passes through additional metadata', async () => {
    const { stripe, calls } = makeStubStripe()
    __setStripeClientForTests(stripe)

    await refundOrder({
      orderId: 'order_6',
      paymentIntentId: 'pi_test_6',
      amountCents: 500,
      reason: 'requested_by_buyer',
      initiatedBy: 'system',
      metadata: { reason_text: 'event delayed', case_id: 'CS-123' },
    })

    expect(calls[0].params.metadata).toMatchObject({
      order_id: 'order_6',
      initiated_by: 'system',
      platform_reason: 'requested_by_buyer',
      reason_text: 'event delayed',
      case_id: 'CS-123',
    })
  })

  test('rejects non-positive integer amounts', async () => {
    const { stripe } = makeStubStripe()
    __setStripeClientForTests(stripe)

    await expect(
      refundOrder({
        orderId: 'order_x',
        paymentIntentId: 'pi_test_x',
        amountCents: 0,
        reason: 'requested_by_buyer',
        initiatedBy: 'buyer',
      })
    ).rejects.toThrow(/positive integer/)

    await expect(
      refundOrder({
        orderId: 'order_x',
        paymentIntentId: 'pi_test_x',
        amountCents: -1,
        reason: 'requested_by_buyer',
        initiatedBy: 'buyer',
      })
    ).rejects.toThrow(/positive integer/)

    await expect(
      refundOrder({
        orderId: 'order_x',
        paymentIntentId: 'pi_test_x',
        amountCents: 1.5,
        reason: 'requested_by_buyer',
        initiatedBy: 'buyer',
      })
    ).rejects.toThrow(/positive integer/)
  })

  test('rejects empty paymentIntentId', async () => {
    const { stripe } = makeStubStripe()
    __setStripeClientForTests(stripe)

    await expect(
      refundOrder({
        orderId: 'order_x',
        paymentIntentId: '',
        amountCents: 100,
        reason: 'requested_by_buyer',
        initiatedBy: 'buyer',
      })
    ).rejects.toThrow(/paymentIntentId is required/)
  })
})
