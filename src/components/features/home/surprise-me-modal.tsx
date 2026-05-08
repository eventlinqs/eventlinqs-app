'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, X, RefreshCw } from 'lucide-react'
import { trackEvent } from '@/lib/analytics/plausible'

interface Suggestion {
  id: string
  slug: string
  title: string
  city: string | null
  startDate: string
  coverImage: string | null
  reason: string
}

interface Props {
  open: boolean
  onClose: () => void
  /** Provided initial suggestions; client refreshes via /api/home/surprise. */
  initial?: Suggestion[]
}

/**
 * SurpriseMeModal - signature discovery affordance (Batch 9).
 *
 * The "right side" of the split-state hero. Click `Surprise me` and
 * the modal opens with 3 dynamic event suggestions selected by:
 *
 *   1. The user's geo-detected city (or Sydney fallback).
 *   2. The current time of day (afternoon vs evening).
 *   3. The day of the week (weekend vs weekday).
 *
 * Algorithm runs server-side; this client only renders the result and
 * gives the user "show me another" to re-roll. No actual AI/ML in v1
 * - the curated logic uses session signals and date math.
 *
 * Plausible events:
 *   - `surprise_me_opened` when the modal opens.
 *   - `surprise_me_refreshed` when the user re-rolls.
 *   - `surprise_me_clicked` when a suggestion is opened.
 */
export function SurpriseMeModal({ open, onClose, initial = [] }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initial)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    trackEvent('surprise_me_opened')
  }, [open])

  // Lock body scroll when open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  async function reroll() {
    setLoading(true)
    trackEvent('surprise_me_refreshed')
    try {
      const res = await fetch('/api/home/surprise', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json() as { suggestions: Suggestion[] }
        setSuggestions(data.suggestions ?? [])
      }
    } catch {
      // ignore - the user can re-tap
    }
    setLoading(false)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Surprise me"
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-navy-950)]/70 backdrop-blur-sm"
      />

      {/* Sheet / dialog */}
      <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--surface-0)] shadow-2xl sm:max-w-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--surface-2)] px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-accent-strong)]" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                Surprise me
              </p>
              <h2 className="font-display text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
                Three picks for tonight
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Selected from your city, the time of day, and what&apos;s on this week.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
            aria-label="Close surprise me"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {suggestions.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-7">
            <p className="text-sm text-[var(--text-secondary)]">
              No suggestions yet. Tap the button below for a fresh round.
            </p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-[var(--surface-2)]">
            {suggestions.map(s => (
              <li key={s.id} className="px-5 py-4 sm:px-7 sm:py-5">
                <Link
                  href={`/events/${s.slug}`}
                  onClick={() => trackEvent('surprise_me_clicked', { event_id: s.id })}
                  className="group flex gap-4"
                >
                  <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[var(--color-navy-950)] sm:h-24 sm:w-32">
                    {s.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element -- modal-only thumbnail outside the public-surface media library contract; rendering via raw img keeps the modal off the main JS payload.
                      <img
                        src={s.coverImage}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-semibold text-[var(--text-primary)] line-clamp-2 sm:text-base">
                      {s.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {new Date(s.startDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {s.city ? ` · ${s.city}` : ''}
                    </p>
                    <p className="mt-2 text-xs text-[var(--brand-accent-strong)]">
                      {s.reason}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--surface-2)] px-5 py-4 sm:px-7 sm:py-5">
          <button
            type="button"
            onClick={reroll}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand-accent-strong)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Show me another
          </button>
          <Link
            href="/events"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)] transition hover:bg-[var(--brand-accent-strong)]"
          >
            Browse all events
          </Link>
        </div>
      </div>
    </div>
  )
}
