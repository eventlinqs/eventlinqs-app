'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { RefundRow } from '@/lib/refunds/queries'
import type { RefundStatus } from '@/types/database'
import { formatCents, formatDate, reasonLabel, statusLabel } from './format'

const STATUS_OPTIONS: (RefundStatus | 'all')[] = [
  'all',
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  processing: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-ink-50 text-ink-600 ring-ink-200',
}

interface PageState {
  rows: RefundRow[]
  total: number
  limit: number
  offset: number
}

export function RefundsHistoryTable({
  initial,
}: {
  initial: PageState
}) {
  const [status, setStatus] = useState<RefundStatus | 'all'>('all')
  const [page, setPage] = useState<PageState>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    async function fetchPage() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (status !== 'all') params.set('status', status)
        params.set('limit', String(page.limit))
        params.set('offset', String(page.offset))
        const res = await fetch(`/api/refunds/list?${params.toString()}`)
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const json = (await res.json()) as PageState
        if (!aborted) setPage(json)
      } catch (e) {
        if (!aborted) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    fetchPage()
    return () => {
      aborted = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page.offset])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(page.total / page.limit)), [page.total, page.limit])
  const currentPage = Math.floor(page.offset / page.limit) + 1

  return (
    <div className="rounded-2xl border border-ink-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div>
          <h3 className="font-display text-base font-bold text-ink-900">Refund history</h3>
          <p className="mt-0.5 text-xs text-ink-500">{page.total} refunds total</p>
        </div>
        <label className="text-xs text-ink-600">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as RefundStatus | 'all')
              setPage((p) => ({ ...p, offset: 0 }))
            }}
            className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All statuses' : statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-100 text-sm">
          <thead className="bg-ink-50/50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Buyer</th>
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">Reason</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Requested</th>
              <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {page.rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-ink-500">
                  No refunds match the current filter.
                </td>
              </tr>
            )}
            {page.rows.map((row) => (
              <tr key={row.id}>
                <td className="px-5 py-3 font-mono text-xs text-ink-700">{row.order_number ?? row.order_id.slice(0, 8)}</td>
                <td className="px-5 py-3 text-ink-700">
                  <div className="font-medium">{row.buyer_name ?? 'Unknown'}</div>
                  <div className="text-xs text-ink-500">{row.buyer_email ?? '-'}</div>
                </td>
                <td className="px-5 py-3 font-semibold text-ink-900">{formatCents(row.amount_cents, row.currency)}</td>
                <td className="px-5 py-3 text-ink-700">{reasonLabel(row.reason)}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_PILL[row.status] ?? 'bg-ink-50 text-ink-700 ring-ink-200'}`}
                  >
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="px-5 py-3 text-ink-600">{formatDate(row.requested_at)}</td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/dashboard/refunds/${row.id}`}
                    className="text-xs font-semibold text-gold-700 hover:text-gold-800"
                  >
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {page.total > page.limit && (
        <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-5 py-3 text-xs text-ink-600">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
              disabled={page.offset === 0 || loading}
              className="min-h-[44px] rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => ({ ...p, offset: p.offset + p.limit }))}
              disabled={page.offset + page.limit >= page.total || loading}
              className="min-h-[44px] rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
