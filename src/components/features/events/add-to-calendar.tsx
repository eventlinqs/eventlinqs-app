'use client'

import { useState, useRef, useEffect } from 'react'
import { CalendarPlus, ChevronDown } from 'lucide-react'
import {
  buildIcs,
  buildGoogleCalendarUrl,
  icsFileName,
  type CalendarEvent,
} from '@/lib/events/calendar-links'

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
export function AddToCalendar({ event }: { event: CalendarEvent }) {
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

  function downloadIcs() {
    const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = icsFileName(event.title)
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on the next tick: revoking synchronously can cancel the download
    // in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setOpen(false)
  }

  return (
    <div ref={wrap} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
      >
        <CalendarPlus className="h-4 w-4 text-[var(--brand-accent-strong)]" aria-hidden />
        Add to calendar
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-card-hover)]"
        >
          <a
            role="menuitem"
            href={buildGoogleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center px-4 py-3 text-sm text-ink-900 transition-colors hover:bg-ink-50"
          >
            Google Calendar
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={downloadIcs}
            className="flex w-full min-h-11 items-center px-4 py-3 text-left text-sm text-ink-900 transition-colors hover:bg-ink-50"
          >
            Apple or Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  )
}
