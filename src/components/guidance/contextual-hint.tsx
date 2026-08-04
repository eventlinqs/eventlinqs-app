'use client'

import { X } from 'lucide-react'

/**
 * A contextual hint: one sentence, at the moment of confusion, in the voice of
 * the surface it sits on.
 *
 * This is the "pull revelation" pattern rather than a pushed tooltip: it is
 * armed by something the person just did, not by their arrival, so it reads as
 * the interface answering rather than the product lecturing. It is never a
 * step in a sequence, it never blocks anything, and it is spent after one
 * showing per device.
 *
 * role="status" so a screen reader hears it when it appears without losing the
 * user's place, and the dismiss control is a real button with a real label.
 */
export function ContextualHint({
  text,
  onDismiss,
  className = '',
}: {
  text: string
  onDismiss: () => void
  className?: string
}) {
  return (
    <div
      role="status"
      className={`guidance-rise pointer-events-auto flex items-start gap-2 rounded-xl border border-gold-500/40 bg-white px-3 py-2 shadow-lg ${className}`}
    >
      <p className="text-xs leading-relaxed text-ink-900">{text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this hint"
        className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
