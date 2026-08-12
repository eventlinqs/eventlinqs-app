/**
 * One place that formats a date, and it is never allowed to guess the zone.
 *
 * THE DEFECT THIS REPLACES. Across 36 files and 39 call sites the platform
 * formatted dates with `toLocaleString('en-AU', {...})` or
 * `new Intl.DateTimeFormat('en-AU', {...})` and NO timeZone. Without one the
 * formatter uses the RUNTIME's zone: UTC on the Vercel server, the reader's
 * own zone in the browser. That is two separate defects at once.
 *
 *   1. The rendered text differs between server and client, so React reports a
 *      hydration mismatch and may re-render the subtree.
 *   2. Far worse, the time shown is simply WRONG. An event at 9pm in Perth is
 *      midnight in Sydney, so a buyer reading their ticket in Sydney sees the
 *      NEXT DAY. They turn up on the wrong night and blame the organiser.
 *
 * `formatAuDateTime` already existed, correctly, in four separate copies (the
 * ticket page, the confirmation email, the launch kit and the dashboard event
 * page). Four copies is why the other thirty-five files never got it.
 *
 * THE RULE. An EVENT time is formatted in the EVENT's own zone, never the
 * reader's and never the server's. `events.timezone` is populated on every
 * published event (verified on TEST: 363 of 363, across seven Australian
 * zones), so the correct answer is always available.
 *
 * A date that is not an event's (a guide's reviewed date, an admin audit
 * timestamp) has no event zone to use, so it takes the platform zone, which is
 * at least the same on both sides.
 */

/**
 * The zone for dates that do not belong to an event. Matches DEFAULT_PREFS in
 * lib/notifications/policy.ts, so the platform tells one time everywhere.
 */
export const PLATFORM_TIME_ZONE = 'Australia/Sydney'

export type EventTimeZone = string | null | undefined

/**
 * Resolve the zone to format in. An event without a stored zone falls back to
 * the platform zone rather than the runtime's, because the runtime's is the
 * bug: it differs between the server and every reader.
 */
export function resolveZone(timezone: EventTimeZone): string {
  return timezone && timezone.trim() ? timezone : PLATFORM_TIME_ZONE
}

function format(iso: string, timezone: EventTimeZone, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      ...options,
      timeZone: resolveZone(timezone),
    }).format(new Date(iso))
  } catch {
    // A malformed date must not take a page down; the caller renders the raw
    // value rather than a crash.
    return iso
  }
}

/** "Fri 14 Aug 2026" in the event's own zone. */
export function formatEventDate(iso: string, timezone: EventTimeZone): string {
  return format(iso, timezone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "Fri 14 Aug 2026 at 7:30 pm AEST" in the event's own zone. */
export function formatEventDateTime(iso: string, timezone: EventTimeZone): string {
  return format(iso, timezone, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
}

/**
 * "14 Aug 2026, 7:30 pm" in the event's own zone.
 *
 * The compact pairing the ticket picker's "Sale opens" line already used, kept
 * to the character so fixing the zone changes no layout. Its previous form was
 * `toLocaleString('en-AU', { dateStyle:'medium', timeStyle:'short' })` with no
 * timeZone, which is the exact defect this module exists to remove: a sale
 * opening at 6pm Perth read as 8pm to a buyer in Sydney, so they came back
 * after it had already started.
 */
export function formatEventDateTimeCompact(iso: string, timezone: EventTimeZone): string {
  return format(iso, timezone, { dateStyle: 'medium', timeStyle: 'short' })
}

/** "Fri 14 Aug" for a compact card, in the event's own zone. */
export function formatEventDateShort(iso: string, timezone: EventTimeZone): string {
  return format(iso, timezone, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Aug 2026" for an artist credit, in the event's own zone. */
export function formatEventMonthYear(iso: string, timezone: EventTimeZone): string {
  return format(iso, timezone, { month: 'short', year: 'numeric' })
}

/** A date with no event behind it: a guide's reviewed date, an audit row. */
export function formatPlatformDate(iso: string): string {
  return format(iso, PLATFORM_TIME_ZONE, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** A timestamp with no event behind it, to the minute. */
export function formatPlatformDateTime(iso: string): string {
  return format(iso, PLATFORM_TIME_ZONE, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Numbers. A bare `.toLocaleString()` uses the runtime LOCALE, so 1234 renders
 * "1,234" on one side and "1.234" on the other. Same class, different axis.
 */
export function formatCount(n: number): string {
  return n.toLocaleString('en-AU')
}
