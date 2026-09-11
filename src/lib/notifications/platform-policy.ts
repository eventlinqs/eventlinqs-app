/**
 * WHAT THE OWNER IS TOLD, AND WHEN. Close-out UX3, the pure half.
 *
 * Everything in this file is a pure function of a row, so the wording, the
 * routing and the volume control can be tested exhaustively without a database,
 * a mail server or a clock. The impure half - reading rows, sending, recording
 * the outcome, retrying, escalating - is src/lib/notifications/platform-send.ts.
 *
 * BOUNDARY WITH src/lib/notifications/policy.ts, stated because the two names
 * look interchangeable and are not. That file decides what an ATTENDEE is told
 * about an event they follow. This one decides what the PLATFORM OWNER is told
 * about the business. Different audience, different channels, different volume
 * problem: an attendee gets at most one alert per event per type for ever, while
 * the owner can receive one per ticket sold and needs a ceiling.
 */
import { formatMoneyDisplay } from '@/lib/money/format'
import { escapeHtml } from '@/lib/email/escape'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

export const PLATFORM_NOTIFICATION_KINDS = [
  'organiser_created',
  'connect_onboarding_started',
  'connect_charges_enabled',
  'event_published',
  'order_paid',
] as const

export type PlatformNotificationKind = (typeof PLATFORM_NOTIFICATION_KINDS)[number]

export const PLATFORM_NOTIFICATION_STATES = [
  'pending',
  'sent',
  'held_for_digest',
  'escalated',
  'failed',
] as const

export type PlatformNotificationState = (typeof PLATFORM_NOTIFICATION_STATES)[number]

/**
 * THE VOLUME CONTROL, close-out UX3.3, as ONE named constant.
 *
 * "Order notifications are individual until a configurable daily count, then a
 * digest." Twenty is the count. It is a number the owner will want to move once
 * real volume arrives, so it lives here alone and every decision derives from
 * it; nothing else in the codebase may carry a second copy.
 *
 * WHY ONLY ORDERS ARE CAPPED. The other four kinds are bounded by how many
 * organisers exist and how often they publish, which is exactly the traffic the
 * owner asked to see. Orders are the only kind whose volume is set by the
 * public, and therefore the only one that can bury the other four.
 *
 * The count is per platform day in PLATFORM_TIME_ZONE, not per rolling 24 hours,
 * so the ceiling resets at a boundary a person can predict.
 */
export const PLATFORM_ORDER_ALERTS_PER_DAY = 20

/**
 * How many times the first channel is tried before the second one is used.
 *
 * Three, matching the shape scripts/ops/alert-dispatch.mjs already proved out
 * for the smoke alert: enough attempts to outlast a Resend 429 bucket, few
 * enough that a genuinely dead channel is escalated within minutes rather than
 * hours.
 */
export const PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS = 3

/** The row as the sender and the admin feed read it. */
export type PlatformNotificationRow = {
  id: string
  kind: PlatformNotificationKind
  occurred_at: string
  actor_user_id: string | null
  organisation_id: string | null
  event_id: string | null
  order_id: string | null
  actor_label: string | null
  organisation_name: string | null
  event_title: string | null
  summary: string
  detail: Record<string, unknown>
  admin_path: string
  delivery_state: PlatformNotificationState
  attempts: number
  last_attempt_at: string | null
  last_error: string | null
  sent_at: string | null
  channel: string | null
}

/** Plain-language label per kind, used in the subject, the feed and the digest. */
export const KIND_LABEL: Record<PlatformNotificationKind, string> = {
  organiser_created: 'New organiser',
  connect_onboarding_started: 'Stripe onboarding started',
  connect_charges_enabled: 'Stripe onboarding complete',
  event_published: 'Event published',
  order_paid: 'Paid order',
}

/**
 * Which kinds are capped by PLATFORM_ORDER_ALERTS_PER_DAY.
 *
 * A set rather than an `=== 'order_paid'` test, so that adding a second
 * public-volume kind later is a one-line change here instead of a hunt.
 */
const CAPPED_KINDS: ReadonlySet<PlatformNotificationKind> = new Set(['order_paid'])

export type Routing = 'individual' | 'digest'

/**
 * Individual or digest, for one notification.
 *
 * `individualSentToday` is the number of notifications of that same kind already
 * sent individually on the current platform day. The boundary is deliberate and
 * is what the drill exercises: with a ceiling of N, the Nth is individual and
 * the (N+1)th is held for the digest.
 */
export function routeFor(kind: PlatformNotificationKind, individualSentToday: number): Routing {
  if (!CAPPED_KINDS.has(kind)) return 'individual'
  return individualSentToday < PLATFORM_ORDER_ALERTS_PER_DAY ? 'individual' : 'digest'
}

/**
 * The start of the current platform day, as an ISO instant.
 *
 * Australia/Sydney, PLATFORM_TIME_ZONE, so the ceiling resets at a boundary the
 * owner experiences rather than at UTC midnight, which in Sydney is the middle
 * of the morning or the middle of the day depending on daylight saving.
 */
export function platformDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const secondsIntoDay = get('hour') * 3600 + get('minute') * 60 + get('second')
  return new Date(now.getTime() - secondsIntoDay * 1000 - now.getMilliseconds())
}

/**
 * `9 Sep 2026, 11:42 pm AEST` - the way the owner reads a time.
 *
 * Written as explicit components rather than dateStyle plus timeStyle, because
 * ECMA-402 forbids combining those with an individual field: adding
 * `timeZoneName` beside `dateStyle` throws `TypeError: Invalid option : option`
 * at format time, which is a runtime fault in an email nobody sees until it does
 * not arrive. The zone is not optional here: the owner reads these beside their
 * own clock and a bare time with no zone is a time you have to guess at.
 */
export function formatMoment(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: PLATFORM_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d)
}

/** The one-line "what happened", already carried on the row by the trigger. */
export function subjectFor(row: PlatformNotificationRow): string {
  return `EventLinqs: ${row.summary}`
}

function detailString(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key]
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

/**
 * The facts under the headline, per kind: what happened, who, which event.
 *
 * Returned as label/value pairs rather than prose so the same list renders into
 * the email, the digest and the admin feed without three copies of the wording.
 */
export function factsFor(row: PlatformNotificationRow): Array<[string, string]> {
  const facts: Array<[string, string]> = []
  if (row.organisation_name) facts.push(['Organiser', row.organisation_name])
  if (row.actor_label) facts.push(['Contact', row.actor_label])
  if (row.event_title) facts.push(['Event', row.event_title])

  switch (row.kind) {
    case 'order_paid': {
      const total = Number(row.detail.total_cents ?? 0)
      const currency = detailString(row.detail, 'currency') ?? 'AUD'
      facts.push(['Order', detailString(row.detail, 'order_number') ?? 'unknown'])
      facts.push(['Total', formatMoneyDisplay(total, currency)])
      const fee = row.detail.platform_fee_cents
      if (typeof fee === 'number') facts.push(['Platform fee', formatMoneyDisplay(fee, currency)])
      break
    }
    case 'event_published': {
      const city = detailString(row.detail, 'city')
      if (city) facts.push(['City', city])
      const start = detailString(row.detail, 'start_date')
      if (start) facts.push(['Starts', formatMoment(start)])
      break
    }
    case 'connect_onboarding_started':
    case 'connect_charges_enabled': {
      const account = detailString(row.detail, 'stripe_account_id')
      if (account) facts.push(['Stripe account', account])
      break
    }
    case 'organiser_created': {
      const slug = detailString(row.detail, 'slug')
      if (slug) facts.push(['Handle', slug])
      break
    }
  }

  facts.push(['When', formatMoment(row.occurred_at)])
  return facts
}

function factsHtml(facts: Array<[string, string]>): string {
  return facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${escapeHtml(label)}</td><td style="padding:2px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join('')
}

function factsText(facts: Array<[string, string]>): string {
  return facts.map(([label, value]) => `${label}: ${value}`).join('\n')
}

/**
 * One notification, as an email body.
 *
 * `siteUrl` is passed in rather than read here, so this stays pure and so the
 * host can never be pinned into a database row (the row carries a path).
 */
export function bodyFor(row: PlatformNotificationRow, siteUrl: string): { html: string; text: string } {
  const facts = factsFor(row)
  const link = `${siteUrl}${row.admin_path}`
  const feed = `${siteUrl}/admin/notifications`
  const html =
    `<p style="font-size:16px;margin:0 0 12px"><strong>${escapeHtml(row.summary)}</strong></p>` +
    `<table cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">${factsHtml(facts)}</table>` +
    `<p style="margin:16px 0 0"><a href="${escapeHtml(link)}">Open it in the admin console</a></p>` +
    // NEVER A BARE URL FOLLOWED BY A FULL STOP. The first version of this line
    // read "... is also on https://.../admin/notifications." and the driven
    // proof read the link back with the stop attached, because that is what an
    // autolinker does with the character after a URL. An anchor carries the
    // href and the sentence carries the punctuation, and the two stop colliding.
    `<p style="margin:16px 0 0;color:#6b7280;font-size:12px">You are receiving this because you own this platform. Every one of these is also in <a href="${escapeHtml(feed)}">the notifications feed</a>.</p>`
  const text = `${row.summary}\n\n${factsText(facts)}\n\nOpen it in the admin console: ${link}\nEvery notification: ${feed}\n`
  return { html, text }
}

/** The subject for a digest covering `count` held order notifications. */
export function digestSubjectFor(count: number): string {
  return count === 1
    ? 'EventLinqs: 1 more paid order today'
    : `EventLinqs: ${count} more paid orders today`
}

/**
 * The digest body.
 *
 * It says what the ceiling is and what it did, because a digest that does not
 * explain itself reads as the platform having gone quiet, which is the exact
 * failure UX4 is about.
 */
export function digestBodyFor(
  rows: PlatformNotificationRow[],
  siteUrl: string,
): { html: string; text: string } {
  const currency =
    (rows.map((r) => detailString(r.detail, 'currency')).find(Boolean) as string | undefined) ?? 'AUD'
  const total = rows.reduce((sum, r) => sum + Number(r.detail.total_cents ?? 0), 0)
  const lines = rows.map((r) => {
    const amount = formatMoneyDisplay(Number(r.detail.total_cents ?? 0), currency)
    const order = detailString(r.detail, 'order_number') ?? 'order'
    return {
      order,
      amount,
      event: r.event_title ?? 'an event',
      when: formatMoment(r.occurred_at),
      link: `${siteUrl}${r.admin_path}`,
    }
  })

  const html =
    `<p style="font-size:16px;margin:0 0 12px"><strong>${escapeHtml(digestSubjectFor(rows.length).replace('EventLinqs: ', ''))}</strong></p>` +
    `<p style="margin:0 0 12px;font-size:14px">The first ${PLATFORM_ORDER_ALERTS_PER_DAY} paid orders today were sent individually. These are the rest.</p>` +
    `<table cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">` +
    lines
      .map(
        (l) =>
          `<tr><td style="padding:2px 12px 2px 0"><a href="${escapeHtml(l.link)}">${escapeHtml(l.order)}</a></td>` +
          `<td style="padding:2px 12px 2px 0">${escapeHtml(l.amount)}</td>` +
          `<td style="padding:2px 12px 2px 0">${escapeHtml(l.event)}</td>` +
          `<td style="padding:2px 0;color:#6b7280">${escapeHtml(l.when)}</td></tr>`,
      )
      .join('') +
    `</table>` +
    `<p style="margin:16px 0 0;font-size:14px">Total in this digest: <strong>${escapeHtml(formatMoneyDisplay(total, currency))}</strong></p>` +
    `<p style="margin:16px 0 0"><a href="${escapeHtml(`${siteUrl}/admin/notifications`)}">Every notification, in one feed</a></p>`

  const text =
    `${digestSubjectFor(rows.length).replace('EventLinqs: ', '')}\n\n` +
    `The first ${PLATFORM_ORDER_ALERTS_PER_DAY} paid orders today were sent individually. These are the rest.\n\n` +
    lines.map((l) => `${l.order}  ${l.amount}  ${l.event}  ${l.when}\n  ${l.link}`).join('\n') +
    `\n\nTotal in this digest: ${formatMoneyDisplay(total, currency)}\n`

  return { html, text }
}

/**
 * The push payload used by the SECOND channel.
 *
 * Short on purpose: a push notification is a headline and a link, and the full
 * facts are one tap away in the admin console.
 */
export function pushPayloadFor(row: PlatformNotificationRow): {
  title: string
  body: string
  url: string
  tag: string
} {
  return {
    title: KIND_LABEL[row.kind],
    body: row.summary,
    url: row.admin_path,
    tag: `platform-${row.id}`,
  }
}
