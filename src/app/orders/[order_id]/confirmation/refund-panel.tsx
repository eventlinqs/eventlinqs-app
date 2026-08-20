'use client'

import { useState, useTransition } from 'react'
import { submitBuyerRefundRequest } from './refund-actions'

/**
 * THE BUYER'S REFUND SURFACE.
 *
 * SHOWS THE STATE HONESTLY AT EVERY POINT, which is the requirement that most of
 * this component exists to serve. A buyer who cannot see where their request is
 * assumes it has been ignored, and an ignored refund request becomes a chargeback.
 * So each of submitted, approved, declined, refunded and failed has its own
 * rendering, with the organiser's own words carried through on a decline.
 *
 * WHEN A REFUND CANNOT BE REQUESTED, THE PANEL STILL RENDERS AND SAYS WHY. The
 * alternative, hiding the panel, is the thing that generates support email: a
 * buyer who sees nothing cannot tell "the organiser does not offer refunds" from
 * "this site is broken". Every sentence comes from the one policy module, so the
 * reason shown here is the reason the server would give.
 */

type RequestState = {
  id: string
  status: string
  created_at: string
  decided_at: string | null
  decision_note: string | null
  decline_reason: string | null
  auto_approved: boolean
  auto_decision_reason: string | null
} | null

interface Props {
  orderId: string
  canRequest: boolean
  reason: string
  policyMessage: string
  policyDescription: string
  liveTicketIds: string[]
  latestRequest: RequestState
}

const STATE_COPY: Record<string, { title: string; tone: string; body: (r: NonNullable<RequestState>) => string }> = {
  submitted: {
    title: 'Refund requested',
    tone: 'border-gold-500/40 bg-gold-100/50',
    body: () => 'The organiser has been sent your request and a note in their dashboard. You will get an email as soon as they respond.',
  },
  approved: {
    title: 'Refund approved',
    tone: 'border-emerald-600/30 bg-white',
    body: r => (r.auto_approved
      ? 'Approved automatically under this event refund policy. The money is on its way back to the card you paid with, usually within 5 to 10 business days.'
      : 'The organiser approved your refund. The money is on its way back to the card you paid with, usually within 5 to 10 business days.'),
  },
  refunded: {
    title: 'Refunded',
    tone: 'border-emerald-600/30 bg-white',
    body: () => 'This order has been refunded. The money is back with your bank, and the tickets on it no longer scan at the door.',
  },
  declined: {
    title: 'Refund declined',
    tone: 'border-ink-300 bg-white',
    body: r => (r.decision_note
      ? `The organiser declined this request. Their reason: "${r.decision_note}"`
      : 'The organiser declined this request without giving a reason. Contact them if you need more detail.'),
  },
  failed: {
    title: 'Refund could not be completed',
    tone: 'border-ink-300 bg-white',
    body: () => 'Something went wrong completing this refund. You have not been charged anything extra and your ticket has not changed. The organiser has been notified.',
  },
  cancelled: {
    title: 'Refund request cancelled',
    tone: 'border-ink-200 bg-white',
    body: () => 'This request was cancelled.',
  },
}

export function BuyerRefundPanel({
  orderId, canRequest, reason, policyMessage, policyDescription, liveTicketIds, latestRequest,
}: Props) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  // An existing request outranks the form: the buyer's question is "where is my
  // request", not "how do I make another one".
  const showState = latestRequest && latestRequest.status !== 'cancelled'

  return (
    <section className="mb-6 rounded-xl border border-ink-200 bg-white p-6">
      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
        Refunds
      </p>

      <p className="mt-2 text-sm text-ink-600">{policyDescription}</p>

      {showState && (
        <div className={`mt-4 rounded-lg border p-4 ${STATE_COPY[latestRequest.status]?.tone ?? 'border-ink-200 bg-white'}`}>
          <p className="text-sm font-semibold text-ink-900">
            {STATE_COPY[latestRequest.status]?.title ?? 'Refund request'}
          </p>
          <p className="mt-1 text-sm text-ink-600">
            {STATE_COPY[latestRequest.status]?.body(latestRequest) ?? 'We are updating this request.'}
          </p>
          {latestRequest.status === 'submitted' && latestRequest.auto_decision_reason && (
            <p className="mt-2 text-xs text-ink-400">{latestRequest.auto_decision_reason}</p>
          )}
        </div>
      )}

      {!showState && !canRequest && (
        /*
         * THE REFUSAL IS SHOWN, NOT HIDDEN, AND IT NAMES ITS REAL CAUSE. A blank
         * space is what makes a buyer email support.
         */
        <div className="mt-4 rounded-lg border border-ink-200 bg-canvas p-4">
          <p className="text-sm text-ink-600">{policyMessage}</p>
          <p className="mt-2 text-xs text-ink-400">
            Still stuck? Contact the organiser and they can help.
          </p>
        </div>
      )}

      {!showState && canRequest && !result && (
        <div className="mt-4">
          {!open ? (
            <>
              <p className="text-sm text-ink-600">{policyMessage}</p>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
              >
                Request a refund
              </button>
            </>
          ) : (
            <form
              onSubmit={e => {
                e.preventDefault()
                startTransition(async () => {
                  const r = await submitBuyerRefundRequest({
                    orderId,
                    ticketIds: liveTicketIds,
                    message: message.trim() || null,
                  })
                  setResult({ ok: r.ok, message: r.message })
                })
              }}
            >
              <label htmlFor="refund-message" className="block text-sm font-medium text-ink-900">
                Anything the organiser should know? (optional)
              </label>
              <textarea
                id="refund-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="For example, why you can no longer make it."
                className="mt-2 w-full rounded-lg border border-ink-200 p-3 text-sm text-ink-900 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
              />
              <p className="mt-2 text-xs text-ink-400">
                This asks for a refund on {liveTicketIds.length} ticket
                {liveTicketIds.length === 1 ? '' : 's'} on this order.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
                >
                  {pending ? 'Sending your request' : 'Send refund request'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {result && (
        /*
         * NO SILENT FAILURES. A failed submission says so in plain words and says
         * what did not change, so the buyer knows whether to try again.
         */
        <div
          className={`mt-4 rounded-lg border p-4 ${result.ok ? 'border-emerald-600/30 bg-white' : 'border-ink-300 bg-canvas'}`}
          role="status"
        >
          <p className="text-sm text-ink-900">{result.message}</p>
          {!result.ok && (
            <button
              type="button"
              onClick={() => { setResult(null); setOpen(true) }}
              className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-900 hover:border-ink-300"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  )
}
