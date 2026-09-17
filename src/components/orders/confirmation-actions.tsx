'use client'

import { useState, useRef, useEffect } from 'react'
import { buildAttributedUrl } from '@/lib/growth/referrals'
import {
  buildIcs,
  buildGoogleCalendarUrl,
  icsFileName as buildIcsFileName,
  type CalendarEvent,
} from '@/lib/events/calendar-links'

interface ConfirmationActionsProps {
  eventTitle: string
  startDate: string   // ISO string, UTC
  endDate: string     // ISO string, UTC
  location: string
  orderNumber: string
  eventSlug: string
  /** The event's IANA zone, so the description can carry the local time. */
  timezone?: string | null
  /** The canonical event URL, for the calendar entry's URL property. */
  eventUrl: string
  /** The buyer's referral code, when they have an account. Makes the
   *  post-purchase share an attributed invite that credits this buyer. */
  refCode?: string
}

/**
 * THE CALENDAR FORMATS MOVED OUT (close-out SEO5 step 2).
 *
 * These three builders were private to this file, reachable only by a buyer who
 * had already paid, and the event page had no calendar link at all. Rather than
 * copy them, they moved to `src/lib/events/calendar-links.ts` and both surfaces
 * read that.
 *
 * THE MOVE FIXED THREE DEFECTS THAT SHIPPED HERE. The VEVENT carried no `UID`
 * and no `DTSTAMP`, both of which RFC 5545 section 3.6.1 requires, and a VEVENT
 * with no UID is the one a calendar client cannot recognise as the same event
 * twice, so re-importing after a date change adds a second entry instead of
 * updating the first. And no text value was escaped, so an event called
 * "Drinks, dancing; and a DJ" truncated at the first comma in every client that
 * read it. See that module's header for the citation and for its limits.
 *
 * This component keeps its own shape: it is an ORDER confirmation, so its
 * description names the order, which the shared builder takes as part of the
 * event's `url` and description composition rather than inventing.
 */
function toCalendarEvent(props: ConfirmationActionsProps): CalendarEvent {
  return {
    id: props.orderNumber,
    title: props.eventTitle,
    startDate: props.startDate,
    endDate: props.endDate,
    timezone: props.timezone ?? null,
    location: props.location || null,
    url: props.eventUrl,
  }
}

function buildOutlookUrl(props: ConfirmationActionsProps): string {
  const params = new URLSearchParams({
    subject: props.eventTitle,
    startdt: props.startDate,
    enddt: props.endDate,
    body: `Order ${props.orderNumber}`,
    ...(props.location ? { location: props.location } : {}),
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

export function ConfirmationActions(props: ConfirmationActionsProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!calendarOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [calendarOpen])

  async function handleShare() {
    const url = buildAttributedUrl(`${window.location.origin}/events/${props.eventSlug}`, {
      refCode: props.refCode,
      source: 'share-a-ticket',
    })
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: props.eventTitle,
          text: `Check out ${props.eventTitle}`,
          url,
        })
      } catch {
        // User cancelled share - do nothing
      }
      return
    }
    // Desktop fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard API blocked - silently ignore
    }
  }

  const icsFileName = buildIcsFileName(props.eventTitle)

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      {/* Add to Calendar dropdown */}
      <div className="relative flex-1" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setCalendarOpen(v => !v)}
          className="w-full rounded-lg border border-ink-200 bg-white px-4 py-3 text-center text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors flex items-center justify-center gap-1"
        >
          Add to Calendar
          <svg className="h-4 w-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {calendarOpen && (
          <div className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-ink-200 bg-white shadow-lg overflow-hidden">
            <a
              href={buildGoogleCalendarUrl(toCalendarEvent(props))}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setCalendarOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-ink-600 hover:bg-ink-100 transition-colors"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M6 2v2M18 2v2M3 8h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
              Google Calendar
            </a>
            <a
              href={`data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(toCalendarEvent(props)))}`}
              download={icsFileName}
              onClick={() => setCalendarOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-ink-600 hover:bg-ink-100 transition-colors border-t border-ink-100"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" stroke="currentColor" strokeWidth={1.5} />
                <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
              Apple Calendar
            </a>
            <a
              href={buildOutlookUrl(props)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setCalendarOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-ink-600 hover:bg-ink-100 transition-colors border-t border-ink-100"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={1.5} />
                <path d="M3 9h18" stroke="currentColor" strokeWidth={1.5} />
              </svg>
              Outlook
            </a>
          </div>
        )}
      </div>

      {/* Share Event */}
      <button
        type="button"
        onClick={handleShare}
        className="flex-1 rounded-lg border border-ink-200 bg-white px-4 py-3 text-center text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors relative"
      >
        {copied ? (
          <span className="text-green-600 font-medium">Event link copied</span>
        ) : (
          'Share Event'
        )}
      </button>
    </div>
  )
}
