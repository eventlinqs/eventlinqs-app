'use client'

import { useState, useRef, useEffect } from 'react'

interface ConfirmationActionsProps {
  eventTitle: string
  startDate: string   // ISO string, UTC
  endDate: string     // ISO string, UTC
  location: string
  orderNumber: string
  eventSlug: string
}

function toCalendarDate(iso: string): string {
  // Returns YYYYMMDDTHHMMSSZ format for Google Calendar / .ics
  return iso.replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function buildGoogleCalendarUrl(props: ConfirmationActionsProps): string {
  const start = toCalendarDate(props.startDate)
  const end = toCalendarDate(props.endDate)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: props.eventTitle,
    dates: `${start}/${end}`,
    details: `Order ${props.orderNumber}`,
    ...(props.location ? { location: props.location } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
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

function buildIcsDataUrl(props: ConfirmationActionsProps): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EventLinqs//EN',
    'BEGIN:VEVENT',
    `DTSTART:${toCalendarDate(props.startDate)}`,
    `DTEND:${toCalendarDate(props.endDate)}`,
    `SUMMARY:${props.eventTitle}`,
    props.location ? `LOCATION:${props.location}` : '',
    `DESCRIPTION:Order ${props.orderNumber}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`
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
    const url = `${window.location.origin}/events/${props.eventSlug}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: props.eventTitle,
          text: `Check out ${props.eventTitle}`,
          url,
        })
      } catch {
        // User cancelled share — do nothing
      }
      return
    }
    // Desktop fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard API blocked — silently ignore
    }
  }

  const icsFileName = `${props.eventTitle.replace(/[^a-z0-9]/gi, '-')}.ics`

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      {/* Add to Calendar dropdown */}
      <div className="relative flex-1" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setCalendarOpen(v => !v)}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
        >
          Add to Calendar
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {calendarOpen && (
          <div className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
            <a
              href={buildGoogleCalendarUrl(props)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setCalendarOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M6 2v2M18 2v2M3 8h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
              Google Calendar
            </a>
            <a
              href={buildIcsDataUrl(props)}
              download={icsFileName}
              onClick={() => setCalendarOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
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
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
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
        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors relative"
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
