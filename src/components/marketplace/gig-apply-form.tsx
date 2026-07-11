'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { applyToGigAction } from '@/app/actions/gigs'

/**
 * The application form. Deliberately one field: the pitch note. Everything
 * else that travels (profile, draw, credits, showcase) is attached
 * automatically and shown to the performer above, so what they see is
 * exactly what the organiser receives.
 */
export function GigApplyForm({ gigId }: { gigId: string }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const res = await applyToGigAction({ gigId, note })
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Application sent. The organiser sees your profile, draw numbers, and showcase beside it.' })
        setNote('')
        router.refresh()
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Could not send your application.' })
      }
    })
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label htmlFor="gig-apply-note" className="block text-sm font-semibold text-ink-900">
        Your pitch
      </label>
      <textarea
        id="gig-apply-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Why you fit this gig. Keep it short; your numbers do the talking."
        className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Sending' : 'Apply with my profile'}
      </button>
      {message && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${message.kind === 'ok' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
