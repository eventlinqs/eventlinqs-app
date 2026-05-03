import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveOrganiserRefundScope, resolveBuyerScope } from '@/lib/refunds/auth'
import { cancelRefundRequest } from '@/lib/refunds/mutations'

interface CancelBody {
  denialReason?: string | null
  asOrganiser?: boolean
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const blocked = await applyRateLimit('refunds-process', request)
  if (blocked) return blocked

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  let body: CancelBody = {}
  try {
    body = (await request.json()) as CancelBody
  } catch {
    body = {}
  }

  if (body.asOrganiser) {
    const scope = await resolveOrganiserRefundScope()
    if (!scope.ok) return NextResponse.json({ error: scope.reason }, { status: scope.status })
    const result = await cancelRefundRequest({
      refundId: id,
      actorRole: 'organiser',
      actorId: scope.org.userId,
      organisationId: scope.org.organisationId,
      denialReason: body.denialReason ?? null,
    })
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status })
    return NextResponse.json({ refund: result.refund })
  }

  const buyer = await resolveBuyerScope()
  if (!buyer.ok) return NextResponse.json({ error: buyer.reason }, { status: buyer.status })
  const result = await cancelRefundRequest({
    refundId: id,
    actorRole: 'buyer',
    actorId: buyer.buyer.userId,
  })
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status })
  return NextResponse.json({ refund: result.refund })
}
