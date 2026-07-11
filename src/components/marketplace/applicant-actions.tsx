'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  setApplicationStatusAction,
  sendBookingRequestAction,
  blockPerformerAction,
} from '@/app/actions/gigs'
import { PAY_TYPES, PAY_TYPE_LABELS, type PayType } from '@/lib/marketplace/gigs'

const inputClass =
  'h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20'

/**
 * Per-applicant controls on the organiser review surface: shortlist,
 * decline, block, and the structured booking request (gig, pay terms, note;
 * never an open thread).
 */
export function ApplicantActions({
  applicationId,
  gigId,
  artistId,
  artistName,
  status,
  gigTitle,
  eventId,
}: {
  applicationId: string
  gigId: string
  artistId: string
  artistName: string
  status: string
  gigTitle: string
  eventId: string | null
}) {
  const router = useRouter()
  const [requestOpen, setRequestOpen] = useState(false)
  const [subject, setSubject] = useState(`Booking: ${gigTitle}`.slice(0, 140))
  const [note, setNote] = useState('')
  const [payType, setPayType] = useState<PayType>('negotiable')
  const [payAmount, setPayAmount] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setMessage(null)
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        setMessage({ kind: 'ok', text: okText })
        setRequestOpen(false)
        router.refresh()
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Could not save.' })
      }
    })
  }

  const btn =
    'inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:opacity-60'

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'submitted' && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => setApplicationStatusAction({ applicationId, status: 'shortlisted' }), 'Shortlisted.')
            }
            className={btn}
          >
            Shortlist
          </button>
        )}
        {['submitted', 'shortlisted'].includes(status) && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => setRequestOpen((v) => !v)}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60"
            >
              Send booking request
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => setApplicationStatusAction({ applicationId, status: 'declined' }), 'Declined.')
              }
              className={btn}
            >
              Decline
            </button>
          </>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Block ${artistName}? Neither of you can apply to or request the other again.`)) {
              run(() => blockPerformerAction({ artistId }), `${artistName} blocked.`)
            }
          }}
          className="inline-flex min-h-[44px] items-center rounded-lg px-2 py-2 text-xs font-medium text-ink-500 hover:text-error"
        >
          Block
        </button>
      </div>

      {requestOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const amountCents = payAmount ? Math.round(parseFloat(payAmount) * 100) : null
            run(
              () =>
                sendBookingRequestAction({
                  artistId,
                  applicationId,
                  gigId,
                  subject,
                  note,
                  payType,
                  payAmountCents: Number.isFinite(amountCents as number) ? amountCents : null,
                  eventId,
                }),
              `Booking request sent to ${artistName}.`,
            )
          }}
          className="mt-3 space-y-2 rounded-xl border border-ink-200 bg-ink-100/60 p-4"
        >
          <label htmlFor={`req-subject-${applicationId}`} className="block text-xs font-semibold text-ink-900">
            Request
          </label>
          <input
            id={`req-subject-${applicationId}`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={140}
            required
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Pay terms"
              value={payType}
              onChange={(e) => setPayType(e.target.value as PayType)}
              className={inputClass}
            >
              {PAY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PAY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {payType === 'fixed_fee' && (
              <input
                aria-label="Fee in dollars"
                type="number"
                min="0"
                step="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Fee (AUD)"
                className={inputClass}
              />
            )}
          </div>
          <textarea
            aria-label="Note to the performer"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Set length, arrival time, anything they need to say yes."
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
          />
          {eventId ? (
            <p className="text-xs text-ink-600">
              On acceptance they are added to the linked event lineup automatically.
            </p>
          ) : (
            <p className="text-xs text-ink-600">
              No event linked to this gig; tag them on a lineup after acceptance.
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pending ? 'Sending' : 'Send request'}
          </button>
        </form>
      )}

      {message && (
        <p
          role="status"
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${message.kind === 'ok' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
