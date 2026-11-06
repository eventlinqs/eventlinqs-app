'use client'

import { buildIcs, buildGoogleCalendarUrl, icsFileName, type CalendarEvent } from '@/lib/events/calendar-links'

/**
 * THE ADD TO CALENDAR MENU, the two choices and the calendar code they need (./add-to-calendar.tsx draws the button and
 * loads this on the first open). The ICS and Google links are composed only when a visitor asks for them, so the calendar
 * and date code leave the event page's first load: car 50's gate of 6 November 2026 measured /events/[slug] at 198.4 KB gzip
 * against its 198.0 KB ceiling, after the Next.js 16.4.5 security upgrade grew every route.
 */
export function AddToCalendarMenu({
  event,
  onClose,
  onChosen,
}: {
  event: CalendarEvent
  onClose: () => void
  onChosen?: (kind: 'google' | 'ics') => void
}) {
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
    onClose()
    onChosen?.('ics')
  }

  return (
    <div
      role="menu"
      className="absolute left-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-card-hover)]"
    >
      <a
        role="menuitem"
        href={buildGoogleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          onClose()
          onChosen?.('google')
        }}
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
  )
}
