'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { SurpriseMeModal } from './surprise-me-modal'

interface InitialSuggestion {
  id: string
  slug: string
  title: string
  city: string | null
  startDate: string
  coverImage: string | null
  reason: string
}

interface Props {
  /** Optional server-rendered initial picks so the modal opens with
   *  content immediately instead of an empty state + spinner. */
  initial?: InitialSuggestion[]
  className?: string
}

/**
 * SurpriseMeButton - the right-column CTA in the split-state hero
 * (Batch 9). Wraps SurpriseMeModal so the page can render the
 * affordance once and let click open the modal client-side.
 */
export function SurpriseMeButton({ initial = [], className = '' }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'plausible-event-name=surprise_me_open',
          'inline-flex h-12 items-center gap-2 rounded-full bg-[var(--brand-accent)] px-6 text-sm font-bold text-[var(--color-navy-950)] shadow-md transition hover:-translate-y-0.5 hover:bg-[var(--brand-accent-strong)]',
          className,
        ].join(' ')}
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        Surprise me
      </button>
      <SurpriseMeModal open={open} onClose={() => setOpen(false)} initial={initial} />
    </>
  )
}
