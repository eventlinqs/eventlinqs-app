'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setPayoutHoldAction } from '../actions'

/**
 * Admin payout hold for one organiser. Toggles payout_status between active and
 * on_hold (status only, no money math). A hold stops disbursements immediately
 * because the disbursement control refuses to pay out unless payouts are
 * active; sales and the reserve are untouched. A Stripe-driven 'restricted'
 * status is explained as not-an-admin-hold and cannot be cleared here.
 */
export function PayoutHoldControl({
  organisationId,
  payoutStatus,
}: {
  organisationId: string
  payoutStatus: string
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const restricted = payoutStatus === 'restricted'
  const onHold = payoutStatus === 'on_hold'

  async function run() {
    const verb = onHold ? 'release' : 'hold'
    if (!window.confirm(`Are you sure you want to ${verb} payouts for this organiser?`)) return
    setPending(true)
    setError(null)
    const res = await setPayoutHoldAction({ organisationId, hold: !onHold, reason: reason.trim() || null })
    setPending(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setReason('')
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
      <h3 className="text-sm font-semibold text-white/80">Payouts</h3>
      <p className="mt-1 text-xs text-white/50">
        Current status:{' '}
        <span className={payoutStatus === 'active' ? 'text-emerald-300' : 'text-amber-300'}>{payoutStatus}</span>
      </p>

      {restricted ? (
        <p className="mt-3 text-sm text-white/60">
          Payouts are restricted by Stripe verification, not an admin hold. Resolve the Stripe requirements above to lift
          it.
        </p>
      ) : (
        <>
          {error ? (
            <p role="alert" className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <label className="mt-3 block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Reason (optional)</span>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className={`mt-3 min-h-[44px] rounded-md px-4 text-xs font-semibold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50 ${
              onHold
                ? 'bg-[var(--brand-accent)] text-[var(--text-primary)]'
                : 'border border-amber-500/40 text-amber-200 hover:bg-amber-500/10'
            }`}
          >
            {pending ? 'Working' : onHold ? 'Release payout hold' : 'Hold payouts'}
          </button>
          <p className="mt-2 text-xs text-white/40">
            {onHold
              ? 'Releasing sets payouts back to active.'
              : 'Holding pauses disbursements without affecting sales or the reserve.'}
          </p>
        </>
      )}
    </div>
  )
}
