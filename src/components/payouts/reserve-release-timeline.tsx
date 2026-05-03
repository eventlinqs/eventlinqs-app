import { CalendarCheck2 } from 'lucide-react'
import type { ReserveReleaseRow } from '@/lib/payouts/queries'
import { formatCents, formatDate } from './format'

interface ReserveReleaseTimelineProps {
  rows: ReserveReleaseRow[]
}

export function ReserveReleaseTimeline({ rows }: ReserveReleaseTimelineProps) {
  return (
    <section
      aria-labelledby="reserve-release-heading"
      className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="reserve-release-heading"
            className="font-display text-lg font-bold text-ink-900"
          >
            Reserve release schedule
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Funds held against ticket sales release on these dates and roll into
            your next payout.
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-100 text-gold-700" aria-hidden="true">
          <CalendarCheck2 className="h-4 w-4" />
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg bg-ink-50 px-4 py-6 text-center text-sm text-ink-600">
          No reserves scheduled for release in the next 30 days.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {row.event_title ?? 'Event reserve'}
                </p>
                <p className="text-xs text-ink-600">
                  {labelForHoldType(row.hold_type)} releases on{' '}
                  <span className="font-semibold text-ink-900">
                    {formatDate(row.release_at)}
                  </span>
                </p>
              </div>
              <span className="font-display text-base font-bold text-ink-900 tabular-nums">
                {formatCents(row.amount_cents, row.currency)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function labelForHoldType(t: ReserveReleaseRow['hold_type']): string {
  switch (t) {
    case 'reserve':
      return 'Event reserve'
    case 'chargeback':
      return 'Chargeback hold'
    case 'admin_manual':
      return 'Admin hold'
    case 'negative_balance':
      return 'Negative balance hold'
    case 'new_organiser':
      return 'New organiser hold'
  }
}
