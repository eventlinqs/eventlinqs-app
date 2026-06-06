'use client'

import { useMemo, useState } from 'react'
import { allocateRefundAmountCents } from '@/lib/payments/refund-amount'

/**
 * Shared by-ticket refund dialog, used by the admin order view and the
 * organiser order page. Operator selects tickets (or all remaining), picks a
 * reason, optionally adds a buyer message, sees a live amount preview, and
 * confirms. The only side effect is onSubmit; the host page wires it to its
 * server action. Money/ticket reconciliation happens later in the webhook.
 *
 * Theming: `tone` switches the surface palette so the same component matches
 * the dark M7 admin panel and the lighter organiser dashboard.
 */

export type RefundDialogReason =
  | 'requested_by_buyer'
  | 'duplicate'
  | 'fraudulent'
  | 'event_cancelled'
  | 'cannot_attend'
  | 'other'

export interface RefundDialogTicket {
  id: string
  code: string
  holderName: string | null
  status: string
  faceCents: number
}

const REASON_LABELS: Record<RefundDialogReason, string> = {
  requested_by_buyer: 'Requested by buyer',
  cannot_attend: 'Buyer cannot attend',
  event_cancelled: 'Event cancelled',
  duplicate: 'Duplicate purchase',
  fraudulent: 'Fraudulent',
  other: 'Other',
}

const REFUNDABLE_STATUSES = new Set(['valid', 'scanned'])

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

type Tone = 'dark' | 'light'

const TONES: Record<Tone, {
  surface: string
  border: string
  heading: string
  muted: string
  row: string
  input: string
  primary: string
  secondary: string
}> = {
  dark: {
    surface: 'bg-[#131A2A] text-white',
    border: 'border-white/[0.08]',
    heading: 'text-white',
    muted: 'text-white/60',
    row: 'border-white/[0.08] hover:bg-white/[0.04]',
    input: 'border-white/10 bg-white/[0.04] text-white focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]',
    primary: 'bg-[var(--brand-accent)] text-[var(--text-primary)]',
    secondary: 'border-white/10 text-white/70 hover:bg-white/[0.06] hover:text-white',
  },
  light: {
    surface: 'bg-white text-ink-900',
    border: 'border-black/10',
    heading: 'text-ink-900',
    muted: 'text-ink-400',
    row: 'border-black/10 hover:bg-black/[0.03]',
    input: 'border-black/15 bg-white text-ink-900 focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]',
    primary: 'bg-[var(--brand-accent)] text-white',
    secondary: 'border-black/15 text-ink-400 hover:bg-black/[0.04] hover:text-ink-900',
  },
}

export function RefundDialog({
  currency,
  totalCents,
  allFaceCents,
  tickets,
  onSubmit,
  onClose,
  tone = 'dark',
}: {
  currency: string
  totalCents: number
  allFaceCents: number
  tickets: RefundDialogTicket[]
  onSubmit: (ticketIds: string[], reason: RefundDialogReason, buyerMessage: string | null) => Promise<void>
  onClose?: () => void
  tone?: Tone
}) {
  const t = TONES[tone]
  const refundable = useMemo(() => tickets.filter(tk => REFUNDABLE_STATUSES.has(tk.status)), [tickets])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState<RefundDialogReason>('requested_by_buyer')
  const [buyerMessage, setBuyerMessage] = useState('')
  const [step, setStep] = useState<'select' | 'confirm'>('select')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const selectedFaceCents = useMemo(
    () => refundable.filter(tk => selected.has(tk.id)).reduce((sum, tk) => sum + tk.faceCents, 0),
    [refundable, selected],
  )
  const previewAmount = useMemo(() => {
    if (selected.size === 0 || allFaceCents <= 0) return 0
    return allocateRefundAmountCents({ totalCents, selectedFaceCents, allFaceCents })
  }, [selected.size, selectedFaceCents, totalCents, allFaceCents])

  const allSelected = refundable.length > 0 && selected.size === refundable.length

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(refundable.map(tk => tk.id)))
  }

  async function confirmRefund() {
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(Array.from(selected), reason, buyerMessage.trim() || null)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund could not be processed. Please try again.')
      setStep('select')
    } finally {
      setSubmitting(false)
    }
  }

  // Empty state: nothing left to refund.
  if (refundable.length === 0) {
    return (
      <div className={`rounded-xl border ${t.border} ${t.surface} p-6`}>
        <h2 className={`font-display text-lg font-semibold ${t.heading}`}>Refund</h2>
        <p className={`mt-2 text-sm ${t.muted}`}>
          There are no refundable tickets on this order. Tickets that are already refunded,
          void, or transferred cannot be refunded again.
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={`mt-4 min-h-[44px] rounded-md border px-4 text-xs font-semibold uppercase tracking-[0.18em] ${t.secondary}`}
          >
            Close
          </button>
        ) : null}
      </div>
    )
  }

  if (done) {
    return (
      <div className={`rounded-xl border ${t.border} ${t.surface} p-6`}>
        <h2 className={`font-display text-lg font-semibold ${t.heading}`}>Refund started</h2>
        <p className={`mt-2 text-sm ${t.muted}`}>
          The refund has been sent to Stripe. The ledger, tickets, and inventory update
          automatically once Stripe confirms, and the buyer receives a confirmation email.
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={`mt-4 min-h-[44px] rounded-md px-5 text-xs font-semibold uppercase tracking-[0.18em] ${t.primary}`}
          >
            Done
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`rounded-xl border ${t.border} ${t.surface} p-6`}>
      <h2 className={`font-display text-lg font-semibold ${t.heading}`}>
        {step === 'select' ? 'Refund tickets' : 'Confirm refund'}
      </h2>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      {step === 'select' ? (
        <div className="mt-4 space-y-4">
          <label className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border ${t.border} px-3`}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-5 w-5 accent-[var(--brand-accent)]" />
            <span className={`text-sm font-medium ${t.heading}`}>Refund all remaining tickets ({refundable.length})</span>
          </label>

          <ul className="space-y-1">
            {tickets.map(tk => {
              const canRefund = REFUNDABLE_STATUSES.has(tk.status)
              return (
                <li key={tk.id}>
                  <label
                    className={`flex min-h-[44px] items-center gap-3 rounded-md border px-3 ${t.row} ${
                      canRefund ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!canRefund}
                      checked={selected.has(tk.id)}
                      onChange={() => toggle(tk.id)}
                      className="h-5 w-5 accent-[var(--brand-accent)]"
                    />
                    <span className="flex-1 text-sm">
                      <span className={t.heading}>{tk.code}</span>
                      {tk.holderName ? <span className={`ml-2 ${t.muted}`}>{tk.holderName}</span> : null}
                    </span>
                    <span className={`text-sm ${t.muted}`}>
                      {canRefund ? formatMoney(tk.faceCents, currency) : tk.status}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <label className="block">
            <span className={`mb-1.5 block text-[11px] uppercase tracking-[0.18em] ${t.muted}`}>Reason</span>
            <select
              value={reason}
              onChange={e => setReason(e.target.value as RefundDialogReason)}
              className={`min-h-[44px] w-full rounded-md border px-3 text-sm outline-none ${t.input}`}
            >
              {(Object.keys(REASON_LABELS) as RefundDialogReason[]).map(r => (
                <option key={r} value={r}>{REASON_LABELS[r]}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={`mb-1.5 block text-[11px] uppercase tracking-[0.18em] ${t.muted}`}>
              Message to buyer (optional)
            </span>
            <textarea
              value={buyerMessage}
              onChange={e => setBuyerMessage(e.target.value)}
              rows={2}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none ${t.input}`}
            />
          </label>

          <div className={`flex items-center justify-between rounded-md border ${t.border} px-3 py-3`}>
            <span className={`text-sm ${t.muted}`}>Refund amount</span>
            <span className={`font-display text-lg font-semibold ${t.heading}`}>
              {formatMoney(previewAmount, currency)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => setStep('confirm')}
              className={`min-h-[44px] rounded-md px-5 text-xs font-semibold uppercase tracking-[0.18em] ${t.primary} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Review refund
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className={`min-h-[44px] rounded-md border px-4 text-xs uppercase tracking-[0.18em] ${t.secondary}`}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p className={`text-sm ${t.muted}`}>
            Refund {selected.size} {selected.size === 1 ? 'ticket' : 'tickets'} for{' '}
            <span className={`font-semibold ${t.heading}`}>{formatMoney(previewAmount, currency)}</span>.
            The selected tickets stop admitting at the door and the amount returns to the buyer.
            This cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={confirmRefund}
              className={`min-h-[44px] rounded-md px-5 text-xs font-semibold uppercase tracking-[0.18em] ${t.primary} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {submitting ? 'Processing refund' : 'Confirm refund'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep('select')}
              className={`min-h-[44px] rounded-md border px-4 text-xs uppercase tracking-[0.18em] ${t.secondary}`}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
