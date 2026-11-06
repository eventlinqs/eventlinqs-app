'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { CalendarPlus, ChevronDown } from 'lucide-react'
import type { CalendarEvent } from '@/lib/events/calendar-links'

/** The menu and its calendar code, loaded on the first open (./add-to-calendar-menu.tsx says why). */
const AddToCalendarMenu = dynamic(() => import('./add-to-calendar-menu').then((m) => m.AddToCalendarMenu), { ssr: false })

/**
 * ADD TO CALENDAR, on the event page (close-out SEO5 step 2).
 *
 * A buyer who has decided to go and has not bought yet is the person who most
 * needs this, and until now it existed only AFTER payment, on the order
 * confirmation. An event nobody has put in their calendar is an event a
 * proportion of the room forgets.
 *
 * ============================================================================
 * WHY THE ICS IS BUILT IN THE BROWSER AND NOT FETCHED FROM A ROUTE
 * ============================================================================
 *
 * A `/events/[slug]/calendar.ics` route would be the obvious shape and it buys
 * nothing here: the whole document is four hundred bytes composed from fields
 * the page has already rendered, so a round trip would add a request, a cache
 * decision and a second place the event could be read differently. The
 * COMPOSITION is shared with the server (`src/lib/events/calendar-links.ts`),
 * which is the part that must not fork.
 *
 * A BLOB, NOT A `data:` URL, AND THAT IS THE ONE REAL DIFFERENCE FROM THE ORDER
 * CONFIRMATION. `data:text/calendar;...` is what the confirmation uses and it is
 * refused by Chrome when it is the target of a top-level navigation, which a
 * download from an anchor is. It works there because the file is small and
 * Chrome's block applies to navigations rather than to `download` anchors in
 * every case; relying on that distinction is the sort of thing that changes in a
 * browser release. `URL.createObjectURL` is the documented way to hand a
 * generated file to a download, so it is used, and the object URL is revoked
 * after the click rather than leaked for the life of the page.
 */
export function AddToCalendar({
  event,
  appearance = 'default',
  onChosen,
}: {
  event: CalendarEvent
  /** WI1. 'pill' is the walk-in panel's button, drawn to locked design A. */
  appearance?: 'default' | 'pill'
  /** WI1. Told which calendar was chosen, so the add counts on the event. */
  onChosen?: (kind: 'google' | 'ics') => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocumentClick(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const buttonClass =
    appearance === 'pill'
      ? 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-ink-900 bg-white px-4 text-sm font-bold text-ink-900 transition-colors hover:bg-[var(--color-ink-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]'
      : 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]'

  return (
    <div ref={wrap} className={appearance === 'pill' ? 'relative block' : 'relative inline-block'}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={buttonClass}
      >
        {appearance === 'pill' ? null : (
          <CalendarPlus className="h-4 w-4 text-[var(--brand-accent-strong)]" aria-hidden />
        )}
        Add to calendar
        {appearance === 'pill' ? null : (
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        )}
      </button>

      {open && <AddToCalendarMenu event={event} onClose={() => setOpen(false)} onChosen={onChosen} />}
    </div>
  )
}
