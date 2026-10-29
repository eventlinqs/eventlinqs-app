/**
 * THE ORGANISER'S REPORT AFTER EACH NIGHT, KEPT (the EventLinqs engine plan of 28 October 2026, part H, and its
 * organiser journey: "... nights publish automatically, featured (guide and kit), report sent, next event with no
 * re-ask").
 *
 * WHAT EXISTED AND IS KEPT. The after-event report of item 20 (src/lib/walk-in/after-event-report.ts, the page
 * /dashboard/events/[id]/report): page visits, Remind me, calendar adds, shares, follows and arrivals through tracked
 * links by channel, every one counted, read live. It is reused as it is, not recounted here.
 *
 * WHAT THIS ADDS, every figure counted by EventLinqs unless it says otherwise, none estimated:
 *   the distinct people who opened the listing (item 20 counts views, one per person per day);
 *   the people who came through the organiser's own partner kit link (null when none was made for the night);
 *   Instagram's reach for a post that named the night, ONLY when a person entered it from Instagram (J16), kept
 *     apart and labelled as entered, never added to a counted figure (K14);
 *   people sent on to the organiser's booking page, per site (share_link_events 'outbound'): said as a person heading
 *     to their tickets, NEVER a ticket sold (K14); what they bought there is invisible to us and the words say so;
 *   orders and tickets on EventLinqs, only where EventLinqs sells the night, while each order stands;
 *   the posts that named the night, and the taps on each post's /go link (for the post as a whole when it named
 *     several nights, and the words say that too).
 * And it KEEPS the whole as read once, after the night (organiser_night_reports, 20261028203001), so the organiser
 * and Lawal read the same numbers as of the same moment. Message 8 of the organiser messages (AFTER YOUR NIGHT, 2 days
 * after) is filled from the kept row by window 6's sender, which records the send on its own touch; nothing here sends.
 *
 * WHEN. The first sweep at least REPORT_AFTER_HOURS after a public night ends, once, and only for nights that ended in
 * the last REPORT_LOOKBACK_DAYS, so the first run does not write reports about nights months gone.
 *
 * Pure: src/lib/growth/organiser-report.ts reads the rows and keeps the report.
 */

import type { ReportNumbers, ReportReach } from '@/lib/walk-in/after-event-report'

/** Message 8 of the organiser messages (28 October 2026): "AFTER YOUR NIGHT (2 days after; counted figures only ...)". */
export const REPORT_AFTER_HOURS = 48
export const REPORT_LOOKBACK_DAYS = 14
export const FIGURES_VERSION = 1

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export interface EndedNight {
  readonly id: string
  readonly organisationId: string
  readonly endDate: string
  readonly isPublic: boolean
  readonly isSeed: boolean
}

/** The nights owed a report now: public, real, ended at least REPORT_AFTER_HOURS ago and within the lookback, not yet reported. */
export function nightsDue(nights: readonly EndedNight[], reported: ReadonlySet<string>, now: Date): EndedNight[] {
  const t = now.getTime()
  return nights.filter((n) => {
    const ended = Date.parse(n.endDate)
    return (
      n.isPublic &&
      !n.isSeed &&
      !reported.has(n.id) &&
      Number.isFinite(ended) &&
      t - ended >= REPORT_AFTER_HOURS * HOUR_MS &&
      t - ended <= REPORT_LOOKBACK_DAYS * DAY_MS
    )
  })
}

export interface Press {
  readonly visitor: string | null
  readonly rowId: string
  readonly provider: string | null
}

export interface NightOrder {
  readonly status: string
  readonly tickets: number
}

export interface NightPost {
  readonly pieceId: string
  readonly platform: 'instagram' | 'facebook'
  readonly postUrl: string
  readonly postedAt: string
  readonly nightsNamed: number
  /** Taps on the post's /go link, one per person per day. */
  readonly goPresses: number
}

export interface EnteredReach {
  readonly value: number
  readonly readAt: string
}

export interface NightRows {
  /** The after-event report's own figures (item 20), as it reads them. */
  readonly numbers: ReportNumbers
  /** Distinct people who opened the listing. */
  readonly viewers: number
  /** Distinct people through the organiser's own partner kit link; null when none was made for the night. */
  readonly ownLinkArrivals: number | null
  /** The newest Instagram reach a person entered for a post that named the night; null when none was entered. */
  readonly instagramReach: EnteredReach | null
  readonly reach: ReportReach
  readonly presses: readonly Press[]
  /** Null when EventLinqs does not sell this night (no ticket types of ours): orders are then not ours to count. */
  readonly orders: readonly NightOrder[] | null
  readonly posts: readonly NightPost[]
}

export interface NightFigures {
  readonly version: number
  readonly numbers: ReportNumbers
  readonly reach: ReportReach
  readonly viewers: number
  readonly ownLink: { readonly arrivals: number } | null
  /** ENTERED, never counted: kept apart and said as Instagram's own figure. */
  readonly instagramReach: EnteredReach | null
  readonly pressesOut: { readonly people: number; readonly bySite: readonly { readonly provider: string; readonly people: number }[] }
  readonly onEventLinqs: { readonly orders: number; readonly tickets: number } | null
  readonly posts: readonly NightPost[]
}

const STANDING = new Set(['confirmed', 'partially_refunded'])

/** The night's figures as kept: item 20's own, then the presses out by person per site, our orders, and the posts. */
export function nightFigures(rows: NightRows): NightFigures {
  const pressed = new Set<string>()
  const bySite = new Map<string, Set<string>>()
  for (const p of rows.presses) {
    const who = p.visitor ?? `row:${p.rowId}`
    const site = p.provider ?? 'other'
    pressed.add(who)
    if (!bySite.has(site)) bySite.set(site, new Set())
    bySite.get(site)?.add(who)
  }
  const standing = rows.orders?.filter((o) => STANDING.has(o.status)) ?? null
  return {
    version: FIGURES_VERSION,
    numbers: rows.numbers,
    viewers: rows.viewers,
    ownLink: rows.ownLinkArrivals === null ? null : { arrivals: rows.ownLinkArrivals },
    instagramReach: rows.instagramReach,
    reach: { totals: { views: rows.reach.totals.views, clicks: rows.reach.totals.clicks }, byChannel: rows.reach.byChannel.map((c) => ({ channel: c.channel, views: c.views, clicks: c.clicks })) },
    pressesOut: {
      people: pressed.size,
      bySite: [...bySite.entries()]
        .map(([provider, set]) => ({ provider, people: set.size }))
        .sort((a, b) => b.people - a.people || a.provider.localeCompare(b.provider)),
    },
    onEventLinqs: standing === null ? null : { orders: standing.length, tickets: standing.reduce((n, o) => n + o.tickets, 0) },
    posts: [...rows.posts].sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt)),
  }
}

/** A count in Australian digit grouping. A number, not a date, so it carries no time zone. */
const count = new Intl.NumberFormat('en-AU')
const n = (c: number, one: string, many: string) => `${count.format(c)} ${c === 1 ? one : many}`

/**
 * The lines this adds to the after-event report, in plain words, as the organiser and Lawal read them. `siteName`
 * names a booking site (the listing's provider names); `dateOf` a post's date.
 */
export function addedLines(f: NightFigures, words: { siteName: (provider: string) => string; dateOf: (iso: string) => string }): string[] {
  const lines: string[] = []
  lines.push(`${n(f.viewers, 'person', 'people')} viewed your listing.`)
  if (f.pressesOut.people > 0) {
    const sites = f.pressesOut.bySite.map((s) => `${count.format(s.people)} to ${words.siteName(s.provider)}`).join(', ')
    lines.push(
      `EventLinqs sent ${n(f.pressesOut.people, 'person', 'people')} on to your booking page: ${sites}. That is a person heading to your tickets, not a ticket sold; what they bought there is not visible to us.`,
    )
  } else {
    lines.push('Nobody pressed on from your listing to your booking page.')
  }
  if (f.onEventLinqs !== null) {
    lines.push(`On EventLinqs: ${n(f.onEventLinqs.orders, 'order', 'orders')}, ${n(f.onEventLinqs.tickets, 'ticket', 'tickets')}.`)
  }
  if (f.ownLink !== null) lines.push(`${n(f.ownLink.arrivals, 'person', 'people')} came through your own share link.`)
  for (const p of f.posts) {
    const where = p.platform === 'facebook' ? 'Facebook' : 'Instagram'
    const shared = p.nightsNamed > 1 ? ` (the post named ${p.nightsNamed} nights, so this is for the post as a whole)` : ''
    lines.push(`Our ${where} post of ${words.dateOf(p.postedAt)} named your night: ${n(p.goPresses, 'person', 'people')} tapped it from our profile link${shared}.`)
  }
  if (f.instagramReach !== null) {
    lines.push(
      `Instagram reported our post reached ${n(f.instagramReach.value, 'account', 'accounts')} (Instagram's own figure, read on ${words.dateOf(f.instagramReach.readAt)}; not counted by EventLinqs).`,
    )
  }
  return lines
}
