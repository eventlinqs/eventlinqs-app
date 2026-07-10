import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/payments/refund-scope', () => ({
  resolveRefundScope: vi.fn(),
}))
vi.mock('@/lib/payments/refund', () => ({
  refundOrder: vi.fn(),
}))

import { requestTicketRefund, RefundNotAuthorisedError } from '@/lib/payments/refund-service'
import { resolveRefundScope } from '@/lib/payments/refund-scope'
import { refundOrder } from '@/lib/payments/refund'

interface UpdateCall { values: Record<string, unknown>; id: string }

function makeAdmin(rpcResult: unknown, rpcError: unknown = null) {
  const updates: UpdateCall[] = []
  const rpc = vi.fn(async () => ({ data: rpcResult, error: rpcError }))
  const admin = {
    rpc,
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              if (table === 'refunds') updates.push({ values, id })
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }
  return { admin, updates, rpc }
}

const input = {
  orderId: 'o1', ticketIds: ['t1', 't2'], reason: 'requested_by_buyer' as const,
  initiator: 'admin' as const, actorId: 'u1', buyerMessage: 'sorry',
}
const rpcRow = { refund_id: 'rf1', amount_cents: 5000, currency: 'AUD', payment_intent_id: 'pi_1' }

beforeEach(() => vi.clearAllMocks())

describe('requestTicketRefund', () => {
  it('rejects when scope denies, without calling rpc or Stripe', async () => {
    vi.mocked(resolveRefundScope).mockResolvedValue({ allowed: false, reason: 'not_authorised' })
    const { admin, rpc } = makeAdmin([rpcRow])
    await expect(requestTicketRefund(admin as never, input)).rejects.toBeInstanceOf(RefundNotAuthorisedError)
    expect(rpc).not.toHaveBeenCalled()
    expect(refundOrder).not.toHaveBeenCalled()
  })

  it('happy path: rpc -> Stripe with refund-row idempotency key -> updates row, status processing', async () => {
    vi.mocked(resolveRefundScope).mockResolvedValue({ allowed: true, via: 'admin', organisationId: 'org1' })
    vi.mocked(refundOrder).mockResolvedValue({
      stripeRefundId: 're_1', status: 'succeeded', amountCents: 5000, currency: 'AUD',
    })
    const { admin, updates, rpc } = makeAdmin([rpcRow])

    const res = await requestTicketRefund(admin as never, input)

    expect(rpc).toHaveBeenCalledWith('create_refund_request', {
      p_order_id: 'o1', p_ticket_ids: ['t1', 't2'], p_reason: 'requested_by_buyer',
      p_initiator: 'admin', p_actor_id: 'u1', p_buyer_message: 'sorry',
    })
    expect(vi.mocked(refundOrder).mock.calls[0][0]).toMatchObject({
      orderId: 'o1', paymentIntentId: 'pi_1', amountCents: 5000,
      idempotencyKey: 'refund:rf1', metadata: { refund_id: 'rf1' },
    })
    expect(updates[0]).toMatchObject({ id: 'rf1', values: { stripe_refund_id: 're_1', processed_by: 'u1' } })
    expect(res).toMatchObject({ refundId: 'rf1', amountCents: 5000, stripeRefundId: 're_1', status: 'processing' })
  })

  it('on Stripe failure: marks the row failed and rethrows', async () => {
    vi.mocked(resolveRefundScope).mockResolvedValue({ allowed: true, via: 'admin', organisationId: 'org1' })
    vi.mocked(refundOrder).mockRejectedValue(new Error('card_declined'))
    const { admin, updates } = makeAdmin([rpcRow])

    await expect(requestTicketRefund(admin as never, input)).rejects.toThrow('card_declined')
    expect(updates[0]).toMatchObject({ id: 'rf1', values: { status: 'failed', failure_reason: 'card_declined' } })
  })
})
