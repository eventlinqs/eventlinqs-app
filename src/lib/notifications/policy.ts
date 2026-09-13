/**
 * Alert-engine policy (pure, testable core of demand engine 3).
 *
 * The alert engine fires lifecycle alerts off the follow graph. Push is the
 * primary channel (about 5x email per DICE), email is the backbone. This module
 * holds the channel choice, the quiet-hours window, and the per-type copy. It is
 * pure so it is fully unit-tested without a database, push service, or network.
 */

export const NOTIFICATION_TYPES = [
  'just_announced',
  'on_sale',
  'going_fast',
  'last_chance',
  'tonight',
  'waitlist_available',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type NotificationChannel = 'push' | 'email'

export type NotificationPrefs = {
  push_enabled: boolean
  email_enabled: boolean
  quiet_hours_start: number | null
  quiet_hours_end: number | null
  timezone: string
}

/** Sensible defaults when a user has no prefs row yet: both channels on, no
 * quiet hours, Australian eastern time (the launch market). */
export const DEFAULT_PREFS: NotificationPrefs = {
  push_enabled: true,
  email_enabled: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: 'Australia/Sydney',
}

/**
 * Choose the delivery channel. Push is preferred whenever the user has it on
 * AND at least one push subscription is available; otherwise we fall back to
 * email if that is on. Returns null when the user has opted out of everything.
 */
export function chooseChannel(
  prefs: NotificationPrefs,
  hasPushSubscription: boolean,
): NotificationChannel | null {
  if (prefs.push_enabled && hasPushSubscription) return 'push'
  if (prefs.email_enabled) return 'email'
  return null
}

/**
 * Is the given local hour (0-23) inside the user's quiet-hours window? Handles
 * a window that wraps past midnight (e.g. 22 to 7). A null window is never quiet.
 */
export function isWithinQuietHours(
  prefs: Pick<NotificationPrefs, 'quiet_hours_start' | 'quiet_hours_end'>,
  localHour: number,
): boolean {
  const { quiet_hours_start: start, quiet_hours_end: end } = prefs
  if (start === null || end === null) return false
  if (start === end) return false
  if (start < end) return localHour >= start && localHour < end
  // Wrap-around window (e.g. 22..7): quiet if at/after start OR before end.
  return localHour >= start || localHour < end
}

/**
 * The hour of the day, 0 to 23, as the USER experiences it.
 *
 * WHY THIS IS SEPARATE AND WHY IT NEVER THROWS. The preferences API accepts any
 * string up to 64 characters for `timezone`, so a value Intl cannot resolve can
 * reach a cron loop, and `new Intl.DateTimeFormat(..., { timeZone })` throws a
 * RangeError on one. Inside dispatchAlert that would abort the whole run at the
 * first bad row, taking every other follower's alert with it. A zone that cannot
 * be resolved therefore falls back to the platform zone, which is the assumption
 * the rest of the product already makes about an unknown user, rather than to
 * UTC, which is ten or eleven hours away from the launch market and would put
 * "quiet from 10pm" in the middle of the afternoon.
 *
 * hourCycle h23 rather than hour12 false, because the latter is specified to
 * produce "24" for midnight in several locales and this function's whole output
 * is an hour compared against a window.
 */
export function localHourFor(timezone: string, now: Date): number {
  for (const zone of [timezone, DEFAULT_PREFS.timezone]) {
    try {
      const value = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now)
      const hour = Number(value)
      if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour
    } catch {
      // The next zone in the list, and then the UTC floor below.
    }
  }
  return now.getUTCHours()
}

/**
 * Is it inside this user's quiet hours right now? The whole decision, in one
 * call, so no caller has to remember to resolve the zone first.
 *
 * THE DEFECT THIS CLOSES, 13 September 2026. /account/notifications tells the
 * user "nothing is sent inside your quiet hours". The window was collected by
 * that screen, validated by the API, stored on notification_prefs and READ by
 * the dispatcher on every send - and nothing ever consulted it. The pure
 * predicate above existed and was exhaustively unit tested, and the only thing
 * that ever called it was its own test file. A user who asked for silence
 * between 10pm and 7am was pushed at 3am regardless, which is a control that
 * does nothing and a promise on a shipped surface that was not true.
 */
export function isQuietNow(
  prefs: Pick<NotificationPrefs, 'quiet_hours_start' | 'quiet_hours_end' | 'timezone'>,
  now: Date,
): boolean {
  if (prefs.quiet_hours_start === null || prefs.quiet_hours_end === null) return false
  return isWithinQuietHours(prefs, localHourFor(prefs.timezone, now))
}

type AlertContext = {
  eventTitle: string
  eventCity?: string | null
  organiserName?: string | null
  url: string
}

export type AlertPayload = {
  type: NotificationType
  title: string
  body: string
  url: string
  /** Coalescing tag so repeated alerts about one event replace, never stack. */
  tag: string
}

/**
 * Build the notification copy for a lifecycle type. No em or en dashes, no
 * exclamation marks, Australian English, never a placeholder.
 */
export function buildAlertPayload(
  type: NotificationType,
  ctx: AlertContext,
  eventId: string,
): AlertPayload {
  const where = ctx.eventCity ? ` in ${ctx.eventCity}` : ''
  const who = ctx.organiserName ? `${ctx.organiserName} ` : ''
  const map: Record<NotificationType, { title: string; body: string }> = {
    just_announced: {
      title: 'Just announced',
      body: `${who}just added ${ctx.eventTitle}${where}. Have a look before it fills.`,
    },
    on_sale: {
      title: 'On sale now',
      body: `Tickets for ${ctx.eventTitle}${where} are on sale now.`,
    },
    going_fast: {
      title: 'Going fast',
      body: `${ctx.eventTitle}${where} is selling quickly. Grab your spot.`,
    },
    last_chance: {
      title: 'Last chance',
      body: `Final tickets for ${ctx.eventTitle}${where}.`,
    },
    tonight: {
      title: 'On tonight',
      body: `${ctx.eventTitle}${where} is on tonight. See you there.`,
    },
    waitlist_available: {
      title: 'A ticket opened up',
      body: `A face-value ticket for ${ctx.eventTitle}${where} is available from the waitlist.`,
    },
  }
  const copy = map[type]
  return { type, title: copy.title, body: copy.body, url: ctx.url, tag: `event:${eventId}:${type}` }
}
