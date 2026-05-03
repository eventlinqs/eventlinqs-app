import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBuyerRefundRequests } from '@/lib/refunds/queries'
import { formatCents, formatDate, reasonLabel, statusLabel } from '@/components/dashboard/refunds/format'

export const metadata = {
  title: 'My refund requests | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  processing: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-ink-50 text-ink-600 ring-ink-200',
}

export default async function MyRefundRequestsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account/refund-requests')

  const page = await getBuyerRefundRequests(user.id, { limit: 50 })

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink-900">My refund requests</h1>
      <p className="mt-1 text-sm text-ink-600">
        Track refunds you have requested. Funds typically arrive 5 to 10 business days after a refund is processed.
      </p>

      {page.rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-8 text-center text-sm text-ink-600">
          You have no refund requests.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {page.rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-ink-100 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/orders/${row.order_id}/confirmation`}
                    className="font-display text-base font-semibold text-ink-900 hover:text-gold-700"
                  >
                    {row.event_title ?? 'Order'}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Order <span className="font-mono">{row.order_number ?? row.order_id.slice(0, 8)}</span>
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_PILL[row.status] ?? 'bg-ink-50 text-ink-700 ring-ink-200'}`}
                >
                  {statusLabel(row.status)}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-4 text-xs text-ink-600">
                <div>
                  <dt className="font-semibold uppercase tracking-wide">Amount</dt>
                  <dd className="mt-0.5 text-ink-900">{formatCents(row.amount_cents, row.currency)}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">Reason</dt>
                  <dd className="mt-0.5 text-ink-900">{reasonLabel(row.reason)}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">Requested</dt>
                  <dd className="mt-0.5 text-ink-900">{formatDate(row.requested_at)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
