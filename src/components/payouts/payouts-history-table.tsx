'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import type { PayoutListPage, PayoutListRow } from '@/lib/payouts/queries'
import type { PayoutRecordStatus } from '@/types/database'
import { formatCents, formatDate } from './format'

interface PayoutsHistoryTableProps {
  initialPage: PayoutListPage
}

const STATUS_FILTERS: ReadonlyArray<{ value: PayoutRecordStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'canceled', label: 'Cancelled' },
]

export function PayoutsHistoryTable({ initialPage }: PayoutsHistoryTableProps) {
  const [page, setPage] = useState<PayoutListPage>(initialPage)
  const [status, setStatus] = useState<PayoutRecordStatus | 'all'>('all')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'all') return
    fetchPage({ status, offset: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function fetchPage(params: { status?: PayoutRecordStatus | 'all'; offset?: number }) {
    const search = new URLSearchParams()
    if (params.status) search.set('status', params.status)
    search.set('offset', String(params.offset ?? 0))
    search.set('limit', String(page.limit))
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/payouts/list?${search.toString()}`, {
          credentials: 'same-origin',
        })
        const json = (await res.json()) as { ok: boolean } & PayoutListPage
        if (!json.ok) {
          setError('Could not load payouts. Please refresh.')
          return
        }
        setPage(json)
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  const showingFrom = page.total === 0 ? 0 : page.offset + 1
  const showingTo = Math.min(page.offset + page.limit, page.total)
  const canPrev = page.offset > 0
  const canNext = page.offset + page.limit < page.total

  return (
    <section
      aria-labelledby="payouts-history-heading"
      className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="payouts-history-heading" className="font-display text-lg font-bold text-ink-900">
            Payout history
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Every payout Stripe sent to your connected account.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="payouts-status-filter">
            Status filter
          </label>
          <select
            id="payouts-status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as PayoutRecordStatus | 'all')}
            className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-100 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink-500">
              <th scope="col" className="px-3 py-2">Arrival</th>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2 text-right">Amount</th>
              <th scope="col" className="px-3 py-2">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {page.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-sm text-ink-500">
                  No payouts to show. New payouts appear here when Stripe schedules them.
                </td>
              </tr>
            ) : (
              page.rows.map((row) => <PayoutRow key={row.id} row={row} />)
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-4 flex items-center justify-between gap-3 text-xs text-ink-600">
        <span aria-live="polite">
          Showing {showingFrom}-{showingTo} of {page.total}
        </span>
        <div className="flex items-center gap-2">
          {isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-500" aria-hidden="true" />
          )}
          <button
            type="button"
            disabled={!canPrev || isPending}
            onClick={() => fetchPage({ status, offset: Math.max(0, page.offset - page.limit) })}
            className="min-h-[36px] rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 disabled:cursor-not-allowed disabled:opacity-40 hover:border-ink-300"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!canNext || isPending}
            onClick={() => fetchPage({ status, offset: page.offset + page.limit })}
            className="min-h-[36px] rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 disabled:cursor-not-allowed disabled:opacity-40 hover:border-ink-300"
          >
            Next
          </button>
        </div>
      </footer>
    </section>
  )
}

function PayoutRow({ row }: { row: PayoutListRow }) {
  return (
    <tr className="text-ink-900">
      <td className="px-3 py-3 whitespace-nowrap">
        {formatDate(row.arrival_date)}
        {row.failure_reason && (
          <p className="text-xs text-red-600">{row.failure_reason}</p>
        )}
      </td>
      <td className="px-3 py-3"><StatusPill status={row.status} /></td>
      <td className="px-3 py-3 text-right tabular-nums font-semibold">
        {formatCents(row.amount_cents, row.currency)}
      </td>
      <td className="px-3 py-3 font-mono text-xs text-ink-500">{row.stripe_payout_id}</td>
    </tr>
  )
}

function StatusPill({ status }: { status: PayoutRecordStatus }) {
  const map: Record<PayoutRecordStatus, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
    in_transit: { label: 'In transit', cls: 'bg-blue-100 text-blue-800' },
    paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800' },
    failed: { label: 'Failed', cls: 'bg-red-100 text-red-800' },
    canceled: { label: 'Cancelled', cls: 'bg-ink-200 text-ink-800' },
  }
  const m = map[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${m.cls}`}>
      {m.label}
    </span>
  )
}
