'use client'

import { useState, useTransition } from 'react'
import { sendBookingRequestAction, sendMentoringRequestAction } from '@/app/actions/gigs'

const inputClass =
  'h-10 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20'

/**
 * Structured contact from a performer profile: a booking request (organiser)
 * or a mentoring request (performer to performer). Subject plus note, accept
 * or decline on the other side. Deliberately NOT a message thread.
 */
export function StructuredRequestButton({
  artistId,
  artistName,
  kind,
}: {
  artistId: string
  artistName: string
  kind: 'booking' | 'mentoring'
}) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const label = kind === 'booking' ? 'Request to book' : 'Request mentoring'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const res =
        kind === 'booking'
          ? await sendBookingRequestAction({ artistId, subject, note })
          : await sendMentoringRequestAction({ artistId, subject, note })
      if (res.ok) {
        setMessage({
          kind: 'ok',
          text: `Sent. ${artistName} accepts or declines from their dashboard, and you are told either way.`,
        })
        setOpen(false)
        setSubject('')
        setNote('')
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Could not send the request.' })
      }
    })
  }

  return (
    <div className="w-full max-w-md">
      {!open && !message && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            kind === 'booking'
              ? 'inline-flex h-11 items-center rounded-full bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500'
              : 'inline-flex h-11 items-center rounded-full border border-ink-200 bg-white px-5 text-sm font-semibold text-ink-900 transition-colors hover:border-gold-800'
          }
        >
          {label}
        </button>
      )}

      {message && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${message.kind === 'ok' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}
        >
          {message.text}
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-2 space-y-2 rounded-xl border border-ink-200 bg-white p-4 text-left">
          <p className="text-sm font-semibold text-ink-900">
            {kind === 'booking' ? `Book ${artistName}` : `Ask ${artistName} for mentoring`}
          </p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={kind === 'booking' ? 'The gig, the date, the room' : 'What you want help with'}
            maxLength={140}
            required
            aria-label="Subject"
            className={inputClass}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="The details that help them say yes."
            aria-label="Note"
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? 'Sending' : 'Send request'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center rounded-lg px-3 text-xs font-semibold text-ink-600 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
