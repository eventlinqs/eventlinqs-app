import { Undo2 } from 'lucide-react'
import type { RefundImpactPage } from '@/lib/payouts/queries'
import { formatCents, formatDateTime } from './format'

interface RefundsListProps {
  page: RefundImpactPage
}

const REASON_LABEL: Record<string, string> = {
  refund_from_balance: 'Refund (from balance)',
  refund_from_reserve: 'Refund (from reserve)',
  refund_from_gateway: 'Refund (from gateway)',
  refund_platform_float: 'Refund (platform absorbed)',
  chargeback: 'Chargeback',
  chargeback_fee: 'Chargeback fee',
}

export function RefundsList({ page }: RefundsListProps) {
  return (
    <section
      aria-labelledby="refunds-history-heading"
      className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="refunds-history-heading" className="font-display text-lg font-bold text-ink-900">
            Refund and chargeback impact
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Every refund or chargeback that affected your balance.
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-700" aria-hidden="true">
          <Undo2 className="h-4 w-4" />
        </span>
      </header>

      {page.rows.length === 0 ? (
        <p className="mt-6 rounded-lg bg-ink-50 px-4 py-6 text-center text-sm text-ink-600">
          No refunds or chargebacks recorded.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-ink-100">
          {page.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">
                  {REASON_LABEL[row.reason] ?? row.reason}
                </p>
                <p className="text-xs text-ink-500">
                  {formatDateTime(row.created_at)}
                  {row.reference_id && (
                    <span className="ml-1 font-mono">
                      · ref {row.reference_id.slice(0, 8)}
                    </span>
                  )}
                </p>
              </div>
              <span
                className={`font-display text-base font-bold tabular-nums ${row.delta_cents < 0 ? 'text-red-700' : 'text-emerald-700'}`}
              >
                {row.delta_cents < 0 ? '-' : '+'}
                {formatCents(Math.abs(row.delta_cents), row.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
