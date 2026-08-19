'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { settleUnfulfilled } from './actions'

/**
 * One click: refund the buyer who was charged and never got a ticket.
 *
 * Disabled while in flight, because the operator-facing half of "idempotent" is
 * not being able to fire the second click in the first place. The server side is
 * keyed on the order id as well, so a double submit that does get through refunds
 * once.
 */
export function SettleButton({
  orderId,
  amountLabel,
  buyerLabel,
}: {
  orderId: string
  amountLabel: string
  buyerLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null)
  const [confirming, setConfirming] = useState(false)

  function run() {
    setOutcome(null)
    startTransition(async () => {
      const res = await settleUnfulfilled({ orderId })
      if (res.ok) {
        setOutcome({ ok: true, message: res.message })
        setConfirming(false)
      } else {
        setOutcome({ ok: false, message: res.error })
      }
    })
  }

  /*
   * THE LIST IS NOT REFRESHED AUTOMATICALLY, AND THAT IS THE WHOLE POINT.
   *
   * The obvious ending is router.refresh() on success. It was written that way and
   * it was wrong: the refresh re-runs the server list, the settled order is no
   * longer outstanding so its row disappears, this component unmounts with it, and
   * the confirmation the operator needs to read goes with it. What they see is a
   * row vanishing after they pressed a money button, which is the exact ambiguity
   * that makes somebody refund a second time to be sure.
   *
   * So the confirmation stays until the operator dismisses it, and re-querying is
   * their choice. It costs nothing to leave a settled row on screen: the button is
   * gone, and the action is keyed on the order id at Stripe regardless.
   */
  if (outcome?.ok) {
    return (
      <div className="flex flex-col items-start gap-2">
        <span className="inline-block rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {outcome.message}
        </span>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="min-h-[44px] rounded-md border border-white/10 px-3 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          Reload the list
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/70">
            Refund {amountLabel} to {buyerLabel}?
          </span>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="min-h-[44px] rounded-md bg-[var(--brand-accent)] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)] disabled:opacity-60"
          >
            {pending ? 'Refunding' : 'Confirm refund'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="min-h-[44px] rounded-md border border-white/10 px-3 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-[44px] rounded-md border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)] transition hover:bg-[var(--brand-accent)]/20"
        >
          Refund and close
        </button>
      )}

      {outcome && !outcome.ok ? (
        <p role="alert" className="max-w-sm text-xs text-red-200">
          {outcome.message}
        </p>
      ) : null}
    </div>
  )
}
