'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitDisburse, submitVoidPayout } from '../actions'

function money(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

/**
 * Disbursement control for one organisation. Full balance by default, or an
 * explicit amount. Two-step confirm. Disabled (with reason) when payouts are
 * not active, no connected account, or nothing is available.
 */
export function DisbursePanel({
  organisationId,
  availableCents,
  currency,
  payoutStatus,
  stripeConnected,
}: {
  organisationId: string
  availableCents: number
  currency: string
  payoutStatus: string
  stripeConnected: boolean
}) {
  const router = useRouter()
  const [amountInput, setAmountInput] = useState('')
  const [step, setStep] = useState<'idle' | 'confirm'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const blockedReason =
    !stripeConnected ? 'This organiser has no connected Stripe account.'
    : payoutStatus !== 'active' ? `Payouts are not active for this organiser (status: ${payoutStatus}).`
    : availableCents <= 0 ? 'There is no available balance to disburse.'
    : null

  const parsedAmount = amountInput.trim() === '' ? null : Math.round(Number(amountInput) * 100)
  const amountInvalid = parsedAmount !== null && (!Number.isInteger(parsedAmount) || parsedAmount <= 0 || parsedAmount > availableCents)

  async function confirm() {
    setSubmitting(true)
    setError(null)
    const res = await submitDisburse({ organisationId, amountCents: parsedAmount })
    setSubmitting(false)
    if (!res.ok) {
      setError(humaniseError(res.error))
      setStep('idle')
      return
    }
    setDone(`Disbursed ${money(res.amountCents, currency)}. Available now ${money(res.availableAfterCents, currency)}.`)
    setStep('idle')
    setAmountInput('')
    router.refresh()
  }

  if (blockedReason) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Disburse</h2>
        <p className="mt-2 text-sm text-white/60">{blockedReason}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
      <h2 className="font-display text-lg font-semibold text-white">Disburse</h2>
      <p className="mt-1 text-sm text-white/60">Available {money(availableCents, currency)}</p>

      {done ? (
        <p role="status" className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{done}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      {step === 'idle' ? (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Amount (optional)</span>
            <input
              inputMode="decimal"
              value={amountInput}
              onChange={e => { setAmountInput(e.target.value); setDone(null) }}
              placeholder={`Full balance (${money(availableCents, currency)})`}
              className="min-h-[44px] w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
            />
          </label>
          {amountInvalid ? (
            <p className="text-xs text-red-300">Enter an amount between {money(1, currency)} and {money(availableCents, currency)}.</p>
          ) : null}
          <button
            type="button"
            disabled={amountInvalid}
            onClick={() => { setError(null); setStep('confirm') }}
            className="min-h-[44px] rounded-md bg-[var(--brand-accent)] px-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Review disbursement
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-white/70">
            Disburse <span className="font-semibold text-white">{money(parsedAmount ?? availableCents, currency)}</span> to this organiser&apos;s connected account. This moves money and cannot be undone once Stripe pays it out.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={confirm}
              className="min-h-[44px] rounded-md bg-[var(--brand-accent)] px-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Disbursing' : 'Confirm disbursement'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep('idle')}
              className="min-h-[44px] rounded-md border border-white/10 px-4 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Void control for a single failed/canceled payout row. */
export function VoidPayoutButton({ payoutId, status }: { payoutId: string; status: 'failed' | 'canceled' }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onVoid() {
    if (!window.confirm('Void this payout and restore the balance to the organiser ledger?')) return
    setSubmitting(true)
    setError(null)
    const res = await submitVoidPayout({ payoutId, status })
    setSubmitting(false)
    if (!res.ok) { setError(humaniseError(res.error)); return }
    router.refresh()
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={submitting}
        onClick={onVoid}
        className="min-h-[36px] rounded-md border border-white/10 px-3 text-[11px] uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
      >
        {submitting ? 'Voiding' : 'Void'}
      </button>
      {error ? <span className="mt-1 text-[11px] text-red-300">{error}</span> : null}
    </span>
  )
}

function humaniseError(code: string): string {
  switch (code) {
    case 'payouts_not_active': return 'Payouts are not active for this organiser.'
    case 'nothing_to_disburse': return 'There is no available balance to disburse.'
    case 'exceeds_available': return 'Requested amount exceeds the available balance.'
    case 'exceeds_stripe_balance': return 'The connected account does not have enough Stripe balance yet.'
    case 'stripe_account_not_set': return 'This organiser has no connected Stripe account.'
    case 'organisation_not_found': return 'Organiser not found.'
    case 'invalid_input': return 'Invalid request.'
    default: return code
  }
}
