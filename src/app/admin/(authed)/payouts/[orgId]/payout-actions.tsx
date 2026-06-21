'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitDisburse, submitVoidPayout } from '../actions'

function money(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

/**
 * Disbursement control for one organisation (funds-holding model). Triggers the
 * post-event transfer of every matured event's held funds for this org (the same
 * path the automatic cron runs), net of fee, reserve, and any open chargeback
 * hold. Two-step confirm. Disabled (with reason) when payouts are not active, no
 * connected account, or nothing is held.
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
  const [step, setStep] = useState<'idle' | 'confirm'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const blockedReason =
    !stripeConnected ? 'This organiser has no connected Stripe account.'
    : payoutStatus !== 'active' ? `Payouts are not active for this organiser (status: ${payoutStatus}).`
    : availableCents <= 0 ? 'There are no held funds to disburse.'
    : null

  async function confirm() {
    setSubmitting(true)
    setError(null)
    const res = await submitDisburse({ organisationId })
    setSubmitting(false)
    if (!res.ok) {
      setError(humaniseError(res.error))
      setStep('idle')
      return
    }
    setDone(
      res.transferred > 0
        ? `Disbursed ${money(res.totalCents, currency)} across ${res.transferred} event${res.transferred === 1 ? '' : 's'}.`
        : `No matured event funds to disburse yet (checked ${res.considered} event${res.considered === 1 ? '' : 's'}).`
    )
    setStep('idle')
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
      <p className="mt-1 text-sm text-white/60">Held balance {money(availableCents, currency)}</p>
      <p className="mt-1 text-xs text-white/40">
        Funds are held by the platform and disburse automatically after each event. This forces
        a disbursement now for every matured event past its buffer.
      </p>

      {done ? (
        <p role="status" className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{done}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      {step === 'idle' ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => { setError(null); setDone(null); setStep('confirm') }}
            className="min-h-[44px] rounded-md bg-[var(--brand-accent)] px-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]"
          >
            Review disbursement
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-white/70">
            Transfer this organiser&apos;s matured event funds (net of fee and reserve) from the
            platform balance to their connected account. This moves money and cannot be undone.
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
