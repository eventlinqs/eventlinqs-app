'use client'

import { useState, useTransition } from 'react'
import { approveRequest, declineRequest } from './actions'
import { formatPlatformDate } from '@/lib/dates/event-time'

/**
 * THE ORGANISER'S REFUND QUEUE.
 *
 * A DECLINE CANNOT BE SUBMITTED WITHOUT AN EXPLANATION, and the form says why
 * rather than just disabling a button. The rule is enforced again on the server;
 * this is the half that explains it while there is still time to type something.
 */

export interface RequestRow {
  id: string
  status: string
  created_at: string
  decided_at: string | null
  buyer_message: string | null
  decision_note: string | null
  decline_reason: string | null
  auto_approved: boolean
  auto_decision_reason: string | null
  requester_email: string
  order_number: string | null
  total_cents: number | null
  currency: string | null
  ticket_count: number
}

const DECLINE_REASONS: Array<{ value: string; label: string }> = [
  { value: 'outside_policy', label: 'Outside the refund policy' },
  { value: 'event_proceeding', label: 'The event is going ahead as planned' },
  { value: 'non_refundable_costs', label: 'Costs already committed' },
  { value: 'suspected_abuse', label: 'Suspected abuse' },
  { value: 'other', label: 'Other' },
]

const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-gold-100 text-ink-900',
  approved: 'bg-emerald-600/10 text-emerald-800',
  refunded: 'bg-emerald-600/10 text-emerald-800',
  declined: 'bg-ink-100 text-ink-600',
  failed: 'bg-warning/15 text-warning',
  cancelled: 'bg-ink-100 text-ink-400',
}

const money = (c: number | null, cur: string | null) =>
  `${cur ?? 'AUD'} $${((c ?? 0) / 100).toFixed(2)}`

export function RefundRequestList({ eventId, rows }: { eventId: string; rows: RequestRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center">
        <p className="font-display text-lg font-bold text-ink-900">No refund requests</p>
        <p className="mt-2 text-sm text-ink-600">
          When somebody asks for a refund on this event, it appears here and you get an email.
        </p>
      </div>
    )
  }

  return (
    <ul role="list" className="space-y-4">
      {rows.map(r => (
        <RequestCard key={r.id} eventId={eventId} row={r} />
      ))}
    </ul>
  )
}

function RequestCard({ eventId, row }: { eventId: string; row: RequestRow }) {
  const [mode, setMode] = useState<'idle' | 'declining'>('idle')
  const [reason, setReason] = useState('outside_policy')
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const open = row.status === 'submitted'

  return (
    <li className="rounded-2xl border border-ink-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-ink-900">
            {row.order_number ?? 'Order'} · {money(row.total_cents, row.currency)}
          </p>
          <p className="mt-1 text-sm text-ink-600">
            {row.requester_email} · {row.ticket_count} ticket{row.ticket_count === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {/* The shared platform formatter, which pins the zone. A bare
              *  toLocaleDateString formats in the runtime zone, so the server and the
              *  browser disagree about the DAY either side of midnight. */}
            Asked {formatPlatformDate(row.created_at)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[row.status] ?? 'bg-ink-100 text-ink-600'}`}>
          {row.status === 'refunded' ? 'Refunded' : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
          {row.auto_approved ? ' automatically' : ''}
        </span>
      </div>

      {row.buyer_message && (
        <blockquote className="mt-4 border-l-2 border-gold-500 pl-4 text-sm italic text-ink-600">
          {row.buyer_message}
        </blockquote>
      )}

      {row.status === 'submitted' && row.auto_decision_reason && (
        <p className="mt-3 rounded-lg bg-canvas p-3 text-xs text-ink-600">
          Why this needs you: {row.auto_decision_reason}
        </p>
      )}

      {row.decision_note && row.status !== 'submitted' && (
        <p className="mt-3 rounded-lg bg-canvas p-3 text-sm text-ink-600">
          You told the buyer: {row.decision_note}
        </p>
      )}

      {result && (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-600/30 text-ink-900' : 'border-ink-300 text-ink-900'}`}
          role="status"
        >
          {result.message}
        </p>
      )}

      {open && !result && mode === 'idle' && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const r = await approveRequest({ eventId, requestId: row.id })
              setResult(r)
            })}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
          >
            {pending ? 'Refunding' : 'Approve and refund'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setMode('declining')}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-300"
          >
            Decline
          </button>
        </div>
      )}

      {open && !result && mode === 'declining' && (
        <form
          className="mt-5"
          onSubmit={e => {
            e.preventDefault()
            startTransition(async () => {
              const r = await declineRequest({ eventId, requestId: row.id, reason, note })
              setResult(r)
              if (!r.ok) setMode('declining')
            })
          }}
        >
          <label htmlFor={`reason-${row.id}`} className="block text-sm font-medium text-ink-900">
            Why are you declining?
          </label>
          <select
            id={`reason-${row.id}`}
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="mt-2 w-full rounded-lg border border-ink-200 p-3 text-sm text-ink-900"
          >
            {DECLINE_REASONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <label htmlFor={`note-${row.id}`} className="mt-4 block text-sm font-medium text-ink-900">
            What should the buyer be told?
          </label>
          <textarea
            id={`note-${row.id}`}
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            minLength={10}
            maxLength={1000}
            required
            placeholder="They will receive this word for word."
            className="mt-2 w-full rounded-lg border border-ink-200 p-3 text-sm text-ink-900 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
          <p className="mt-2 text-xs text-ink-400">
            A decline with no explanation is the most common cause of a card chargeback,
            which costs you the money and a fee on top.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || note.trim().length < 10}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
            >
              {pending ? 'Sending' : 'Decline and tell the buyer'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode('idle')}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:border-ink-300"
            >
              Back
            </button>
          </div>
        </form>
      )}
    </li>
  )
}
