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
