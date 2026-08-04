'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, X } from 'lucide-react'
import type { GuidanceSurface } from '@/lib/guidance/registry'

/**
 * First-run coaching: a short, dismissable sequence anchored to the surface.
 *
 * Deliberately NOT a modal and NOT a tour. It sits in a corner of the surface,
 * the room stays visible and usable behind it, and it can be closed at any
 * step. Three steps maximum, because the research is unambiguous that
 * completion collapses past that and most people skip linear tours entirely.
 *
 * Accessibility contract:
 * - role="dialog" with aria-modal="false": announced as a dialog, but it never
 *   traps focus, because the person came here to pick a seat, not to read.
 * - Focus moves to the panel when it opens and returns to the launcher when it
 *   closes, so a keyboard user is never dropped at the top of the document.
 * - Escape closes it from anywhere inside.
 * - Every step change is announced through a polite live region.
 * - Each step carries its keyboard route, which is read out as part of the step.
 */
export function FirstRunCoach({
  surface,
  onDismiss,
  returnFocusTo,
}: {
  surface: GuidanceSurface
  onDismiss: () => void
  /** The launcher, so focus goes home when the coach closes. */
  returnFocusTo?: React.RefObject<HTMLButtonElement | null>
}) {
  const [index, setIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const step = surface.steps[index]
  const isLast = index === surface.steps.length - 1

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  function close() {
    onDismiss()
    returnFocusTo?.current?.focus()
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          close()
        }
      }}
      className="guidance-rise pointer-events-auto w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-ink-200 bg-white p-4 shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
          {surface.label}
        </p>
        <button
          type="button"
          onClick={close}
          aria-label="Close this guide and do not show it again"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <h2 id={headingId} className="mt-1.5 font-display text-base font-bold text-ink-900">
        {step.title}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.body}</p>
      {step.keyboard && (
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          <span className="font-semibold text-ink-600">Keyboard: </span>
          {step.keyboard}
        </p>
      )}

      {/* The step change, spoken once, without repeating the whole panel. */}
      <p aria-live="polite" className="sr-only">
        {`Step ${index + 1} of ${surface.steps.length}. ${step.title}. ${step.body}${
          step.keyboard ? ` Keyboard: ${step.keyboard}` : ''
        }`}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {surface.steps.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? 'w-5 bg-gold-500' : 'w-1.5 bg-ink-200'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(i => i - 1)}
              className="inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              Back
            </button>
          )}
          {isLast ? (
            <button
              type="button"
              onClick={close}
              className="inline-flex h-9 items-center rounded-full bg-gold-500 px-4 text-xs font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex(i => i + 1)}
              className="inline-flex h-9 items-center gap-1 rounded-full bg-gold-500 px-4 text-xs font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              Next
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2.5 text-xs text-ink-400">
        Want the long version?{' '}
        <Link
          href={`/guides/${surface.guideSlug}`}
          className="font-semibold text-gold-800 underline decoration-gold-500 decoration-2 underline-offset-2 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          {surface.guideTitle}
        </Link>
      </p>
    </div>
  )
}
