'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitDisputeEvidence, closeDispute } from '../actions'

/**
 * Client host for the dispute response. Submits evidence (save draft or finalise
 * to Stripe) via the server action, and offers the accept-and-forfeit close path
 * behind an explicit in-form confirmation. Results render inline; no browser
 * alert is used for success.
 */
export function DisputeRespondForm({
  disputeId,
  initial,
}: {
  disputeId: string
  initial: {
    productDescription: string | null
    customerCommunication: string | null
    uncategorizedText: string | null
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [productDescription, setProductDescription] = useState(initial.productDescription ?? '')
  const [customerCommunication, setCustomerCommunication] = useState(initial.customerCommunication ?? '')
  const [uncategorizedText, setUncategorizedText] = useState(initial.uncategorizedText ?? '')

  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)

  function run(submit: boolean) {
    setMessage(null)
    startTransition(async () => {
      const res = await submitDisputeEvidence({
        id: disputeId,
        productDescription,
        customerCommunication,
        uncategorizedText,
        submit,
      })
      if (res.ok) {
        setMessage({
          tone: 'ok',
          text: res.submitted
            ? 'Evidence submitted to Stripe for review.'
            : 'Draft saved. You can keep editing until the due date.',
        })
        router.refresh()
      } else {
        setMessage({ tone: 'error', text: res.error })
      }
    })
  }

  function runClose() {
    setMessage(null)
    startTransition(async () => {
      const res = await closeDispute(disputeId)
      if (res.ok) {
        setConfirmingClose(false)
        setMessage({ tone: 'ok', text: 'Dispute accepted and closed. The disputed amount is forfeited.' })
        router.refresh()
      } else {
        setMessage({ tone: 'error', text: res.error })
      }
    })
  }

  const fieldClass =
    'mt-1.5 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]'
  const labelClass = 'block text-[11px] uppercase tracking-[0.18em] text-white/50'

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
      <h2 className="font-display text-lg font-semibold">Respond to this dispute</h2>
      <p className="mt-2 text-sm text-white/60">
        Provide evidence the cardholder authorised this charge and received the tickets. Save a draft to keep
        editing, or submit to send it to Stripe for review.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className={labelClass}>Product description</span>
          <textarea
            value={productDescription}
            onChange={e => setProductDescription(e.target.value)}
            rows={3}
            placeholder="What the buyer purchased: event name, ticket type, date, venue."
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Customer communication</span>
          <textarea
            value={customerCommunication}
            onChange={e => setCustomerCommunication(e.target.value)}
            rows={3}
            placeholder="Relevant correspondence with the buyer: confirmation email, support replies."
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Additional notes</span>
          <textarea
            value={uncategorizedText}
            onChange={e => setUncategorizedText(e.target.value)}
            rows={4}
            placeholder="Any other context that supports the charge."
            className={fieldClass}
          />
        </label>
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${
            message.tone === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          className="min-h-[44px] rounded-md border border-white/10 px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending}
          className="min-h-[44px] rounded-md bg-[var(--brand-accent)] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)] transition disabled:opacity-50"
        >
          Submit to Stripe now
        </button>
      </div>

      <div className="mt-6 border-t border-white/[0.08] pt-5">
        <h3 className="text-sm font-semibold text-white/80">Accept the dispute</h3>
        <p className="mt-1.5 text-sm text-white/60">
          Accepting forfeits the disputed amount and closes the dispute. This cannot be undone.
        </p>
        {confirmingClose ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-amber-200">Confirm: forfeit this dispute.</span>
            <button
              type="button"
              onClick={runClose}
              disabled={pending}
              className="min-h-[44px] rounded-md border border-red-500/40 bg-red-500/10 px-4 text-xs font-semibold uppercase tracking-[0.18em] text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              Accept and forfeit
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClose(false)}
              disabled={pending}
              className="min-h-[44px] rounded-md border border-white/10 px-4 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClose(true)}
            disabled={pending}
            className="mt-3 min-h-[44px] rounded-md border border-red-500/30 px-4 text-xs font-semibold uppercase tracking-[0.18em] text-red-200/90 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            Accept dispute
          </button>
        )}
      </div>
    </div>
  )
}
