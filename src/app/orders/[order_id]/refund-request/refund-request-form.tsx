'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RefundReasonEnum } from '@/types/database'

const REASONS: { value: RefundReasonEnum; label: string }[] = [
  { value: 'cannot_attend', label: 'I can no longer attend' },
  { value: 'event_cancelled', label: 'The event was cancelled or changed' },
  { value: 'duplicate', label: 'I was charged more than once' },
  { value: 'requested_by_buyer', label: 'Other personal reason' },
  { value: 'other', label: 'Something else' },
]

interface Props {
  orderId: string
  totalCents: number
  currency: string
  alreadyRequested: boolean
}

export function RefundRequestForm({ orderId, totalCents, currency, alreadyRequested }: Props) {
  const router = useRouter()
  const [amountString, setAmountString] = useState((totalCents / 100).toFixed(2))
  const [reason, setReason] = useState<RefundReasonEnum>('cannot_attend')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  if (alreadyRequested) {
    return (
      <div role="status" className="rounded-2xl border border-ink-100 bg-white p-6 text-sm text-ink-700">
        A refund request for this order is already in progress. Check{' '}
        <a href="/account/refund-requests" className="font-semibold text-gold-700 underline">
          your refund requests
        </a>{' '}
        for status.
      </div>
    )
  }

  if (submitted) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
        Refund request submitted. The organiser will review it and notify you by email. Track status in{' '}
        <a href="/account/refund-requests" className="font-semibold underline">
          your refund requests
        </a>
        .
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const cents = Math.round(parseFloat(amountString) * 100)
      if (!Number.isFinite(cents) || cents <= 0) throw new Error('Please enter a valid amount.')
      if (cents > totalCents) throw new Error(`Refund cannot exceed the order total.`)
      const res = await fetch('/api/refunds/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amountCents: cents,
          reason,
          buyerMessage: message.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Failed (${res.status})`)
      }
      setSubmitted(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-ink-100 bg-white p-6">
      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Refund amount ({currency.toUpperCase()})
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          max={totalCents / 100}
          value={amountString}
          onChange={(e) => setAmountString(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
          required
        />
        <span className="mt-1 block text-xs text-ink-500">
          Order total: {(totalCents / 100).toFixed(2)} {currency.toUpperCase()}
        </span>
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Reason</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as RefundReasonEnum)}
          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Message to organiser (optional)
        </span>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
          placeholder="Add any context the organiser should know."
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] inline-flex items-center rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
      >
        {submitting ? 'Submitting...' : 'Submit refund request'}
      </button>
    </form>
  )
}
