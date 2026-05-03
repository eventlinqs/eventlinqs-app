import { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { resolveOrganiserRefundScope, resolveBuyerScope } from '@/lib/refunds/auth'
import { getRefundById } from '@/lib/refunds/queries'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const blocked = await applyRateLimit('refunds-read', request)
  if (blocked) return blocked

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  const orgScope = await resolveOrganiserRefundScope()
  const buyerScope = orgScope.ok ? null : await resolveBuyerScope()

  if (!orgScope.ok && (!buyerScope || !buyerScope.ok)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const refund = await getRefundById(id)
  if (!refund) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (orgScope.ok && refund.organisation_id !== orgScope.org.organisationId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (buyerScope?.ok && refund.requested_by !== buyerScope.buyer.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return NextResponse.json({ refund })
}
