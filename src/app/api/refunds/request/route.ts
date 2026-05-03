import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveBuyerScope, resolveOrganiserRefundScope } from '@/lib/refunds/auth'
import { createRefundRequest } from '@/lib/refunds/mutations'
import type { RefundReasonEnum } from '@/types/database'

const ALLOWED_REASONS: RefundReasonEnum[] = [
  'requested_by_buyer',
  'duplicate',
  'fraudulent',
  'event_cancelled',
  'cannot_attend',
  'other',
]

interface RequestBody {
  orderId?: string
  amountCents?: number
  reason?: string
  buyerMessage?: string | null
  organiserInternalNotes?: string | null
  asOrganiser?: boolean
}

export async function POST(request: Request) {
  const blocked = await applyRateLimit('refunds-request', request)
  if (blocked) return blocked

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body.orderId || typeof body.orderId !== 'string') {
    return NextResponse.json({ error: 'order_id_required' }, { status: 400 })
  }
  if (typeof body.amountCents !== 'number' || !Number.isInteger(body.amountCents) || body.amountCents <= 0) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }
  const reason = (body.reason ?? 'requested_by_buyer') as RefundReasonEnum
  if (!ALLOWED_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
  }

  if (body.asOrganiser) {
    const scope = await resolveOrganiserRefundScope()
    if (!scope.ok) return NextResponse.json({ error: scope.reason }, { status: scope.status })
    const result = await createRefundRequest({
      orderId: body.orderId,
      amountCents: body.amountCents,
      reason,
      organiserInternalNotes: body.organiserInternalNotes ?? null,
      requestedBy: scope.org.userId,
      creatorRole: 'organiser',
    })
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status })
    return NextResponse.json({ refund: result.refund }, { status: 201 })
  }

  const buyer = await resolveBuyerScope()
  if (!buyer.ok) return NextResponse.json({ error: buyer.reason }, { status: buyer.status })
  const result = await createRefundRequest({
    orderId: body.orderId,
    amountCents: body.amountCents,
    reason,
    buyerMessage: body.buyerMessage ?? null,
    requestedBy: buyer.buyer.userId,
    creatorRole: 'buyer',
  })
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status })
  return NextResponse.json({ refund: result.refund }, { status: 201 })
}
