'use client'

import { useState, useTransition } from 'react'
import { getSelfSeatOptions, changeMySeat, type SelfSeatOption } from '@/app/actions/self-seat'

/**
 * Buyer self-service seat change: on a ticket for an event that allows it, the
 * holder can move to any available seat. The move runs through the same
 * organiser reassign path, so the ticket, its QR, email and the door scan all
 * reflect the new seat. Only rendered when the organiser enabled the option.
 */
export function ChangeSeatControl({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<SelfSeatOption[] | null>(null)
  const [choice, setChoice] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const openPicker = () => {
    setOpen(true)
    setError(null)
    startTransition(async () => {
      const result = await getSelfSeatOptions(ticketId)
      if (result.error) setError(result.error)
      setOptions(result.options)
    })
  }

  const submit = () => {
    if (!choice) return
    setError(null)
    startTransition(async () => {
      const result = await changeMySeat(ticketId, choice)
      if (result.error) { setError(result.error); return }
      setDone(result.newLabel ?? 'your new seat')
      setOpen(false)
    })
  }

  if (done) {
    return <p className="mt-2 text-xs font-medium text-emerald-700">Moved to {done}. Your ticket is updated.</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPicker}
        className="mt-2 text-xs font-semibold text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-ink-900"
      >
        Change my seat
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50/50 p-3">
      <label className="block text-xs font-medium text-ink-700">Pick an available seat</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <select
          value={choice}
          onChange={e => setChoice(e.target.value)}
          disabled={isPending || !options}
          className="min-w-48 flex-1 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs text-ink-900 focus:border-gold-400 focus:outline-none"
        >
          <option value="">{options ? 'Choose a seat...' : 'Loading seats...'}</option>
          {(options ?? []).map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !choice}
          className="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-gold-600 disabled:opacity-50"
        >
          {isPending ? 'Moving...' : 'Move'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setChoice('') }}
          className="text-xs text-ink-500 hover:text-ink-900"
        >
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
