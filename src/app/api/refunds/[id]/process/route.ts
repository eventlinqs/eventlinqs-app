import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveOrganiserRefundScope } from '@/lib/refunds/auth'
import { processRefund } from '@/lib/refunds/mutations'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const blocked = await applyRateLimit('refunds-process', request)
  if (blocked) return blocked

  const scope = await resolveOrganiserRefundScope()
  if (!scope.ok) return NextResponse.json({ error: scope.reason }, { status: scope.status })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  const result = await processRefund({
    refundId: id,
    processedBy: scope.org.userId,
    organisationId: scope.org.organisationId,
  })
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status })

  if (result.status === 'failed') {
    return NextResponse.json(
      { status: 'failed', stripeRefundId: result.stripeRefundId ?? null },
      { status: 502 }
    )
  }
  if (result.status === 'missing_payment_intent') {
    return NextResponse.json({ status: 'missing_payment_intent' }, { status: 409 })
  }
  return NextResponse.json({ status: result.status, stripeRefundId: result.stripeRefundId ?? null })
}
