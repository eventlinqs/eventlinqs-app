'use client'

import { useState, useTransition } from 'react'
import { Flag } from 'lucide-react'
import { reportMarketplaceItemAction } from '@/app/actions/gigs'

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Looks like a scam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'misleading', label: 'Misleading' },
  { value: 'other', label: 'Something else' },
] as const

/** Report a gig or application to the moderation queue. Quiet by design. */
export function ReportControl({
  targetType,
  targetId,
}: {
  targetType: 'gig' | 'application' | 'artist_profile'
  targetId: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('spam')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <p role="status" className="text-xs text-ink-600">
        Thanks. Our team will take a look.
      </p>
    )
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800"
        >
          <Flag className="h-3.5 w-3.5" aria-hidden />
          Report
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            startTransition(async () => {
              const res = await reportMarketplaceItemAction({ targetType, targetId, reason, note })
              if (res.ok) setDone(true)
              else setError(res.error ?? 'Could not send the report.')
            })
          }}
          className="mt-2 space-y-2 rounded-xl border border-ink-200 bg-white p-4"
        >
          <label htmlFor={`report-reason-${targetId}`} className="block text-xs font-semibold text-ink-900">
            What is wrong with this?
          </label>
          <select
            id={`report-reason-${targetId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Anything that helps us act (optional)"
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? 'Sending' : 'Send report'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center rounded-lg px-3 text-xs font-semibold text-ink-600 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-error">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
