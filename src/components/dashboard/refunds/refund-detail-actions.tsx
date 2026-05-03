'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  refundId: string
  status: string
}

export function RefundDetailActions({ refundId, status }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'process' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [denialReason, setDenialReason] = useState('')

  if (status !== 'pending') return null

  async function process() {
    setBusy('process')
    setError(null)
    try {
      const res = await fetch(`/api/refunds/${refundId}/process`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Failed (${res.status})`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  async function deny() {
    setBusy('cancel')
    setError(null)
    try {
      const res = await fetch(`/api/refunds/${refundId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ asOrganiser: true, denialReason: denialReason || null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Failed (${res.status})`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5">
      <h3 className="font-display text-base font-bold text-ink-900">Decide on this refund</h3>
      <p className="mt-1 text-sm text-ink-600">
        Approving issues a refund through the original payment method and pulls organiser funds back. Denying notifies the buyer with your reason.
      </p>
      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-500">
        Denial reason (optional)
        <textarea
          value={denialReason}
          onChange={(e) => setDenialReason(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
          placeholder="Shown to the buyer if you deny."
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={process}
          disabled={busy !== null}
          className="min-h-[44px] inline-flex items-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy === 'process' ? 'Processing...' : 'Approve and refund'}
        </button>
        <button
          type="button"
          onClick={deny}
          disabled={busy !== null}
          className="min-h-[44px] inline-flex items-center rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60"
        >
          {busy === 'cancel' ? 'Sending...' : 'Deny request'}
        </button>
      </div>
    </div>
  )
}
