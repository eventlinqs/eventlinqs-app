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

/* ===========================================================================
 * THE WRITE PATH. Reading a time correctly is only half of it.
 * ===========================================================================
 *
 * THE DEFECT THIS CLOSES, 18 August 2026. An organiser typed 12:00 pm on
 * 1 September and the page showed 2:00 am. Exactly one Australian eastern offset,
 * in the wrong direction.
 *
 * `<input type="datetime-local">` has no zone. It yields "2026-09-01T12:00", and
 * `new Date("2026-09-01T12:00")` is specified to read a zoneless date-time as the
 * RUNTIME's local time. So the organiser form did two things wrong at once, and
 * they compounded:
 *
 *   READ  the stored UTC instant was sliced straight into the input
 *         (`new Date(iso).toISOString().slice(0,16)`), so the organiser was shown
 *         the UTC wall clock and told it was their local time.
 *   WRITE that same string was passed back through `new Date(...).toISOString()`,
 *         which subtracted the BROWSER's offset from a value that had already had
 *         an offset applied.
 *
 * So a CREATE was accidentally right whenever the browser's zone happened to
 * equal the event's, and every EDIT shifted the event one offset earlier, every
 * time it was saved. That is precisely the reported shape: the 15 October event,
 * created and never edited, read 7:00 pm correctly; the 1 September event, which
 * was edited, had slid to 2:00 am.
 *
 * The dropdown the organiser chooses their zone in was never consulted by either
 * conversion. It is now the only thing that decides.
 *
 * WHY NOT A FIXED OFFSET. The two reported events straddle 4 October 2026, when
 * Australian eastern time moves from UTC+10 to UTC+11. Any implementation
 * carrying a constant offset is right on one side of that date and wrong on the
 * other. The offset is therefore asked of the zone AT THE INSTANT IN QUESTION,
 * which is the only way that stays correct through a transition, and both sides
 * of the boundary are tested.
 */

/**
 * How far `zone` is ahead of UTC at a given instant, in milliseconds.
 *
 * Derived by formatting the instant in the zone and reading the wall clock back,
 * which is the only mechanism the platform ships with that knows the transition
 * dates. `en-CA` is not used for cleverness: `formatToParts` is read by part
 * name, so the locale only has to be one that produces numeric parts.
 */
function zoneOffsetMs(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const at: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') at[p.type] = Number(p.value)

  // hour comes back as 24 at midnight under hour12:false in some engines.
  const wallClockAsUtc = Date.UTC(
    at.year,
    at.month - 1,
    at.day,
    at.hour % 24,
    at.minute,
    at.second,
  )
  return wallClockAsUtc - instant.getTime()
}

/**
 * The stored instant, as the "YYYY-MM-DDTHH:mm" an organiser should SEE in a
 * datetime-local input, expressed in the EVENT's zone.
 */
export function toZonedInputValue(iso: string, timezone: EventTimeZone): string {
  const zone = resolveZone(timezone)
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return ''
  const shifted = new Date(instant.getTime() + zoneOffsetMs(instant, zone))
  // The shifted value's UTC fields now read as the zone's wall clock.
  return shifted.toISOString().slice(0, 16)
}

/**
 * The "YYYY-MM-DDTHH:mm" an organiser TYPED, read as a wall clock in the EVENT's
 * zone, converted to the UTC instant to store.
 *
 * TWO PASSES, and the second one is not belt and braces. The offset depends on
 * the instant, and the instant is what is being solved for, so the first pass
 * uses the offset at the guessed instant and the second corrects it if that
 * guess landed on the other side of a transition. Without it, a time entered in
 * the hours around a DST change is stored one hour out.
 */
export function fromZonedInputValue(local: string, timezone: EventTimeZone): string {
  const zone = resolveZone(timezone)
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return ''
  const [, y, mo, d, h, mi] = m
  const asIfUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))

  let instant = asIfUtc - zoneOffsetMs(new Date(asIfUtc), zone)
  instant = asIfUtc - zoneOffsetMs(new Date(instant), zone)
  return new Date(instant).toISOString()
}

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

/**
 * "Aug 2026" for an artist credit, in the event's own zone. The credit-list
 * form: a past show is placed by month, not by weekday, so the day itself
 * carries no meaning and showing it would be noise. Still zone-pinned, because
 * a show on the first or last night of a month lands in the WRONG MONTH when
 * formatted in the reader's zone.
 */
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
