/**
 * ADD TO CALENDAR, BUILT FROM THE EVENT RECORD, IN ONE PLACE.
 *
 * ============================================================================
 * WHY IT IS A MODULE AND NOT TWO MORE FUNCTIONS IN A COMPONENT
 * ============================================================================
 *
 * Close-out SEO5 step 2: "Add to calendar on every event page: an ICS download
 * and a Google Calendar link, both generated from the event record, both
 * carrying the correct timezone."
 *
 * There was already a set of these functions, private to
 * `src/components/orders/confirmation-actions.tsx`, reachable only by a buyer
 * who had already paid. Copying them onto the event page would have made two
 * copies of a format with a specification, and it would have copied a defect
 * (see below). They live here now and the confirmation reads them too.
 *
 * ============================================================================
 * THE DEFECT THE MOVE FOUND: A VEVENT WITH NO UID AND NO DTSTAMP
 * ============================================================================
 *
 * RFC 5545 section 3.6.1 lists, under "The following are REQUIRED, but MUST NOT
 * occur more than once": `dtstamp`, `uid`, and `dtstart` (the last "REQUIRED if
 * the component appears in an iCalendar object that doesn't specify the METHOD
 * property; otherwise, it is OPTIONAL").
 *
 * SOURCE, AND ITS LIMIT, STATED RATHER THAN HIDDEN:
 * https://icalendar.org/iCalendar-RFC-5545/3-6-1-event-component.html, fetched
 * 14 September 2026. The RFC ITSELF was tried first and could not be read to
 * that section: `rfc-editor.org/rfc/rfc5545.txt`, the `.html` rendering and
 * `datatracker.ietf.org/doc/html/rfc5545` all truncate before 3.6.1 through the
 * fetch tool available here. The reproduction above is the best source reached,
 * and it is a reproduction.
 *
 * The existing builder emitted neither. **A VEVENT with no UID is the one a
 * calendar client cannot recognise as the same event twice**, so a buyer who
 * imports it again after the organiser moves the date gets a second entry beside
 * the first rather than an update to it.
 *
 * ============================================================================
 * WHY THE TIMES ARE UTC AND WHY THAT IS "THE CORRECT TIMEZONE"
 * ============================================================================
 *
 * RFC 5545 offers three forms for a DATE-TIME. This uses the UTC form, the one
 * "identified by a LATIN CAPITAL LETTER Z suffix character, the UTC designator,
 * appended to the time value" (RFC 5545 section 3.3.5, read 14 September 2026 at
 * rfc-editor.org, which does reach that section).
 *
 * A UTC instant is UNAMBIGUOUS. Every calendar client renders it in the reader's
 * own zone, which is what a person travelling to the event actually wants.
 *
 * THE ALTERNATIVE WAS CONSIDERED AND REJECTED FOR A REASON, not for effort. The
 * local form with a `TZID` parameter is only resolvable if the same file carries
 * a matching `VTIMEZONE` component defining that zone's offsets and its daylight
 * saving transitions. Emitting `TZID=Australia/Melbourne` WITHOUT that component
 * is a common and real bug: a client that does not already know the zone has no
 * way to place the event, and Australia changes offset twice a year. Writing a
 * correct VTIMEZONE by hand, with `RRULE`s for the transitions, is a large piece
 * of error-prone work that the UTC form makes unnecessary.
 *
 * So the event's zone is used where it BELONGS: the description carries the
 * local time in words, so a reader sees "7:00 pm AEDT" whatever their device
 * decides to show them, and `tests/unit/events/calendar-links.test.ts` converts
 * the UTC instants back through `events.timezone` and asserts they land on the
 * organiser's local time.
 */
import { formatEventDateTimeCompact } from '@/lib/dates/event-time'

export interface CalendarEvent {
  /** Stable and unique. The event's database id, never its title. */
  id: string
  title: string
  /** ISO 8601. The UTC instant the event starts. */
  startDate: string
  /** ISO 8601. The UTC instant it ends. */
  endDate: string | null
  /** The event's IANA zone, for the human-readable line in the description. */
  timezone: string | null
  /** One line: the venue and the city, as a person would write it. */
  location: string | null
  /** The canonical URL of the event page. */
  url: string
}

/**
 * `YYYYMMDDTHHMMSSZ`, the RFC 5545 UTC date-time form.
 *
 * IT REFUSES RATHER THAN GUESSES. The previous implementation was
 * `iso.replace(/[-:]/g, '').split('.')[0] + 'Z'`, which appends the UTC
 * designator to WHATEVER it was given. Handed `2026-10-10T12:00:00+11:00` it
 * produces `20261010T120000+1100Z`, which is not a date at all, and nothing
 * would have noticed because the string still looks roughly right. Parsing and
 * re-formatting means an input that is not a real instant throws here instead of
 * reaching a buyer's calendar.
 */
export function toIcsUtc(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${iso}`)
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

/**
 * When the event ends, for a calendar.
 *
 * `end_date` is NOT NULL on `public.events`, so the fallback is defensive rather
 * than expected. Two hours is used when it is somehow absent because a
 * zero-length calendar entry renders as a point a reader cannot see, and an
 * all-day entry would be a claim about the event that nobody made.
 */
function resolveEnd(event: CalendarEvent): string {
  if (event.endDate) return event.endDate
  const start = new Date(event.startDate)
  return new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString()
}

/**
 * The line that carries the LOCAL time, in words.
 *
 * This is where `events.timezone` earns its place. The DTSTART is a UTC instant
 * and a client shows it in the reader's zone, which is right for attending but
 * loses the organiser's own framing. One sentence restores it.
 */
function describe(event: CalendarEvent): string {
  const local = event.timezone
    ? formatEventDateTimeCompact(event.startDate, event.timezone)
    : null
  return [local ? `Starts ${local}.` : null, event.url].filter(Boolean).join(' ')
}

/**
 * ESCAPING, WHICH IS NOT OPTIONAL AND IS NOT COSMETIC.
 *
 * RFC 5545 section 3.3.11 (TEXT) requires a backslash, a semicolon, a comma and
 * a newline to be escaped inside a text value, because a bare comma or semicolon
 * is how the format separates values and a bare newline ends the property.
 * (rfc-editor.org/rfc/rfc5545.html, section 3.3.11, read 14 September 2026.)
 *
 * An event called "Drinks, dancing; and a DJ" would otherwise truncate at the
 * first comma in every calendar that reads it, and a venue address containing a
 * newline would end the LOCATION property and leave the rest as a malformed
 * line. The previous implementation escaped nothing.
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** The ICS document for one event, RFC 5545 conformant. */
export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EventLinqs//Event//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    // REQUIRED by RFC 5545 3.6.1, and both were missing before. The UID is
    // derived from the event's database id and the platform host, which is what
    // makes a re-import an UPDATE rather than a duplicate.
    `UID:${event.id}@eventlinqs.com.au`,
    `DTSTAMP:${toIcsUtc(now.toISOString())}`,
    `DTSTART:${toIcsUtc(event.startDate)}`,
    `DTEND:${toIcsUtc(resolveEnd(event))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    `DESCRIPTION:${escapeIcsText(describe(event))}`,
    `URL:${event.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  // CRLF between every line, per RFC 5545 section 3.1: the content lines of an
  // iCalendar object are delimited by CRLF.
  return `${lines.join('\r\n')}\r\n`
}

/**
 * The Google Calendar pre-filled event URL.
 *
 * **THE SHAPE OF THIS URL IS UNSOURCED.** Google publishes no specification for
 * `calendar.google.com/calendar/render`; it is a widely used, long-standing
 * undocumented endpoint. The parameters here (`action=TEMPLATE`, `text`,
 * `dates`, `details`, `location`) are the ones this repository was already using
 * on the order confirmation and are unchanged, so nothing new is being asserted.
 * Searched for an official reference on 14 September 2026 and found none, which
 * is recorded here rather than dressed up with a link to a blog post.
 *
 * The `dates` pair is in the UTC form, so no timezone parameter is needed and
 * none is sent: a UTC instant is unambiguous and Google renders it in the
 * reader's own zone.
 */
export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsUtc(event.startDate)}/${toIcsUtc(resolveEnd(event))}`,
    details: describe(event),
    ...(event.location ? { location: event.location } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** A filename a person can recognise in their downloads folder. */
export function icsFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'event'}.ics`
}
