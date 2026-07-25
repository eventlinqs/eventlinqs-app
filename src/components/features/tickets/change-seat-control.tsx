'use client'

import { useMemo, useState, useTransition } from 'react'
import { getSelfSeatOptions, changeMySeat, type SelfSeatOption } from '@/app/actions/self-seat'

/**
 * Buyer self-service seat change, from the ticket. Only rendered when the
 * organiser enabled it. The list the holder sees is already orphan-guarded
 * and price-matched server-side: every seat offered is one they can take
 * without stranding anyone, stated plainly on the control, and the same
 * guard re-runs at move time.
 */
export function ChangeSeatControl({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<SelfSeatOption[] | null>(null)
  const [guardedCount, setGuardedCount] = useState(0)
  const [currentLabel, setCurrentLabel] = useState<string | null>(null)
  const [choice, setChoice] = useState<SelfSeatOption | null>(null)
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
      setGuardedCount(result.guardedCount ?? 0)
      setCurrentLabel(result.currentLabel ?? null)
    })
  }

  const submit = () => {
    if (!choice) return
    setError(null)
    startTransition(async () => {
      const result = await changeMySeat(ticketId, choice.id)
      if (result.error) { setError(result.error); return }
      setDone(result.newLabel ?? 'your new seat')
      setOpen(false)
    })
  }

  const bySection = useMemo(() => {
    const groups = new Map<string, SelfSeatOption[]>()
    for (const option of options ?? []) {
      const key = option.section ?? 'Seats'
      const list = groups.get(key) ?? []
      list.push(option)
      groups.set(key, list)
    }
    return [...groups.entries()]
  }, [options])

  if (done) {
    return (
      <p className="mt-2 text-xs font-medium text-ink-900">
        Moved to <span className="font-semibold">{done}</span>. Your ticket and its QR are updated.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPicker}
        className="mt-2 rounded text-xs font-semibold text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        Change my seat
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-xl border border-ink-200 bg-white p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
          Move my seat
        </p>
        {currentLabel && (
          <p className="text-[11px] text-ink-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
            Now: {currentLabel}
          </p>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
        Same price, updated ticket, no one stranded: only seats that leave no lone single are offered
        {guardedCount > 0 && (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {' '}({guardedCount} {guardedCount === 1 ? 'seat is' : 'seats are'} held back by that rule right now)
          </span>
        )}
        .
      </p>

      {!options && !error && <p className="mt-2 text-xs text-ink-400">Reading the room…</p>}
      {options && options.length === 0 && !error && (
        <p className="mt-2 text-xs text-ink-600">
          No safe seat to move to right now: the room is either full or every open seat would strand a single.
        </p>
      )}

      {bySection.length > 0 && (
        <div className="mt-2 max-h-44 space-y-2.5 overflow-y-auto pr-1">
          {bySection.map(([section, seats]) => (
            <div key={section}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">{section}</p>
              <div className="mt-1 flex flex-wrap gap-1.5" role="listbox" aria-label={`Open seats in ${section}`}>
                {seats.map(option => {
                  const active = choice?.id === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={`Move to ${option.label}`}
                      onClick={() => setChoice(active ? null : option)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 ${
                        active
                          ? 'border-ink-900 bg-gold-500 text-ink-900'
                          : 'border-ink-200 bg-white text-ink-600 hover:border-gold-500 hover:text-ink-900'
                      }`}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {/^table/i.test(option.row) ? option.row : option.row}-{option.number}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !choice}
          className="rounded-full bg-gold-500 px-3.5 py-1.5 text-xs font-semibold text-ink-900 shadow-sm transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1"
        >
          {isPending ? 'Moving…' : choice ? `Move to ${choice.row}-${choice.number}` : 'Pick a seat'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setChoice(null) }}
          className="rounded text-xs text-ink-400 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-error">{error}</p>}
    </div>
  )
}
