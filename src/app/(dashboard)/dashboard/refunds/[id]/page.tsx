import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRefundById } from '@/lib/refunds/queries'
import { RefundDetailActions } from '@/components/dashboard/refunds/refund-detail-actions'
import { formatCents, formatDateTime, reasonLabel, statusLabel } from '@/components/dashboard/refunds/format'

export const dynamic = 'force-dynamic'

export default async function RefundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/dashboard/refunds/${id}`)

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organisations')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!org) redirect('/dashboard/organisation/create')

  const refund = await getRefundById(id)
  if (!refund) notFound()
  if (refund.organisation_id !== (org as { id: string }).id) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/refunds"
          className="inline-flex items-center gap-2 text-sm text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to refunds
        </Link>
      </div>

      <header className="rounded-2xl border border-ink-100 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-900">
              Refund of {formatCents(refund.amount_cents, refund.currency)}
            </h1>
            <p className="mt-1 text-sm text-ink-600">
              Order <span className="font-mono">{refund.order_number ?? refund.order_id.slice(0, 8)}</span>
              {refund.event_title ? ` - ${refund.event_title}` : ''}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${refund.status === 'completed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : refund.status === 'failed' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}
          >
            {statusLabel(refund.status)}
          </span>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Reason</dt>
            <dd className="mt-1 text-ink-900">{reasonLabel(refund.reason)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Buyer</dt>
            <dd className="mt-1 text-ink-900">{refund.buyer_name ?? 'Unknown'}</dd>
            <dd className="text-xs text-ink-500">{refund.buyer_email ?? '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Requested</dt>
            <dd className="mt-1 text-ink-900">{formatDateTime(refund.requested_at)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Processed</dt>
            <dd className="mt-1 text-ink-900">{formatDateTime(refund.processed_at)}</dd>
          </div>
          {refund.stripe_refund_id && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Stripe refund</dt>
              <dd className="mt-1 font-mono text-xs text-ink-700">{refund.stripe_refund_id}</dd>
            </div>
          )}
          {refund.failure_reason && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Failure reason</dt>
              <dd className="mt-1 text-rose-700">{refund.failure_reason}</dd>
            </div>
          )}
        </dl>

        {refund.buyer_message && (
          <div className="mt-6 rounded-lg border border-ink-100 bg-ink-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Buyer message</p>
            <p className="mt-2 text-sm text-ink-800 whitespace-pre-wrap">{refund.buyer_message}</p>
          </div>
        )}

        {refund.organiser_internal_notes && (
          <div className="mt-4 rounded-lg border border-ink-100 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Internal notes</p>
            <p className="mt-2 text-sm text-ink-800 whitespace-pre-wrap">{refund.organiser_internal_notes}</p>
          </div>
        )}
      </header>

      <RefundDetailActions refundId={refund.id} status={refund.status} />
    </div>
  )
}
