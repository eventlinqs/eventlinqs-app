import { dayStart } from './cadence'
import { dayIn, LIFECYCLE_ZONE, sessionOfDay, type MomentKind } from './lifecycle'

/**
 * THE MARKETING TIMING AND RELEVANCE ENGINE, ITS ONE FUNCTION (Lawal, 19:13 of 22 November 2026, verbatim at
 * MARKETING-TIMING-22NOV.md: "A post must remain timely, relevant, accurate and commercially useful at the moment it is
 * published."; the PM's 19:13). AMCF's final day story was due at 18:00 for a festival closing at 20:00 and was still
 * being recovered at 19:00: the scheduler's window for a day-of piece closed only when the day closed
 * (cadence.ts scheduleWindowOf), and nothing asked whether the post was still useful.
 *
 * timingOf decides, from the event's own facts and the moment the lifecycle plan drew (lifecycle.ts momentsDue):
 *  - its OBJECTIVE (advance sales, discovery, weekend planning, booking reminder, free community, multi day, recurring,
 *    live coverage, post event highlight);
 *  - its PREFERRED time (the band the planner or scheduler gave it), its LATEST ACCEPTABLE publication time, its content
 *    EXPIRY, and its RECOVERY policy (a delayed or failed job is recovered only inside its window);
 *  - or that it is EXPIRED (cancelled, postponed, finished, sold out, registration closed) or HELD for a fact we do not
 *    have (no start; a day-of post with no end), never a guess.
 * The same answer is read at planning, scheduling, claiming, just before submission and by the watchdog.
 *
 * THE HYPOTHESES are initial and conservative, never called proven: each says its basis, and the posting row records the
 * objective, the window and the minutes from publication to the start, so they are tuned on our own data (section 9).
 */

export type Objective = 'advance_sales' | 'discovery' | 'weekend_planning' | 'booking_reminder' | 'free_community' | 'multi_day' | 'recurring' | 'live_coverage' | 'post_event_highlight'

export type TimingNight = {
  readonly title: string
  readonly startDate: string | null
  readonly endDate: string | null
  readonly timezone: string | null
  /** events.status: anything but published (cancelled, postponed, paused, completed, archived) ends its promotion. */
  readonly status?: string | null
  readonly isFree?: boolean | null
  /** No places left to buy (store.ts soldOut), or a free night's registration closed. */
  readonly soldOut?: boolean
  /**
   * Its promotion stage on the day the piece goes is a reminder (car T, T2; car O's event_promotions: its newest stage
   * due by that day a follow-up or a final one, or a flagged same day exception), so its own day may carry it.
   */
  readonly reminder?: boolean
}

export type TimingInput = {
  /** The lifecycle moment it was drawn for; null for a campaign piece of several nights. */
  readonly moment: MomentKind | null
  /** The moment's own day (moment_key), in the night's zone; else the preferred time's day. */
  readonly day?: string | null
  readonly nights: readonly TimingNight[]
  /** The band it was given (or would be). */
  readonly preferredAt: Date | null
  /** Its run spans several days (a festival), and it is a repeat in a season of single nights (lifecycle.ts isRepeat). */
  readonly multiDay?: boolean
  readonly recurring?: boolean
  /** Live coverage and post event highlights: set only with approved content and its own media permission. */
  readonly objective?: 'live_coverage' | 'post_event_highlight'
  readonly approvedContent?: boolean
}

export type TimingWindow = {
  readonly kind: 'window'
  readonly objective: Objective
  readonly preferredAt: string | null
  readonly latestAt: string
  readonly expiresAt: string
  readonly recovery: 'within_window'
  readonly basis: string
}
export type Timing = TimingWindow | { readonly kind: 'expired'; readonly reason: string } | { readonly kind: 'held'; readonly reason: string }

/**
 * THE INITIAL HYPOTHESES (conservative; UNSOURCED until our own measure or a cited source supports them, and never
 * called proven; the research for each is recorded beside it when found):
 *  AHEAD_LEAD: a post about a night still to come is useful until two hours before it begins (time to decide, book and
 *    travel). Never later than the end of the day its words name ('tomorrow' is untrue the next day).
 *  DAY_LEFT: a post on a long day (a festival day, a market, an exhibition: a session of four hours or more) is useful
 *    while two hours of that day remain. Floor: Lawal's ruling of 19:04 on 22 November 2026, that 7pm for an 8pm close
 *    is too late.
 *  A SHORT SESSION (a show) is promoted before its doors only: nothing posts once it has started (the publish gate's own
 *    rule, piece-quality.ts class 1), so its latest is its start less AHEAD_LEAD.
 *  HIGHLIGHT_DAYS: a post event highlight, with approved content only, within seven days of the end.
 * WHAT THE RESEARCH FOUND (read 22 November 2026; company data and guidance, none peer reviewed, no method published):
 *  - Paid festivals sell little at the last minute: "less than 3% of festival tickets typically sold in the week
 *    leading up" (Ticketmaster, https://business.ticketmaster.com/maximize-festival-ticket-sales-with-fan-purchasing-insights/).
 *  - Free events are decided on the day far more than paid ones: 45% of free event guests "will get their tickets on the
 *    day of the event", against 18 percent for paid (a UK survey reported by IAVM, https://blog.iavm.org/ticket-purchasing-habits-explored/).
 *    So a free day keeps its same-day posts; only the closing hours are refused.
 *  - Reminders: Instagram's own event reminders default to the day before, fifteen minutes before and the start
 *    (https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/upcoming-events.md);
 *    Humanitix's example schedule sends "1 day before the event" (https://help.humanitix.com/en/articles/8906262).
 *  - How late on the day a post stops being useful: no credible source found. DAY_LEFT is UNSOURCED, set conservatively
 *    from Lawal's ruling, and measured (the posting row's minutes_before_start against its reach and visits).
 */
export const AHEAD_LEAD_MINUTES = 120
export const DAY_LEFT_MINUTES = 120
export const LONG_SESSION_MINUTES = 240
export const HIGHLIGHT_DAYS = 7
/** An end not on record, derived for the window only and labelled so (UNSOURCED; the discovery record replaces it). */
export const DERIVED_SESSION_MINUTES = 180

const MIN = 60_000
const iso = (ms: number) => new Date(ms).toISOString()
const zoneOf = (n: TimingNight) => n.timezone?.trim() || LIFECYCLE_ZONE
const ENDED_STATUSES = new Set(['cancelled', 'postponed', 'paused', 'completed', 'archived', 'draft'])

function weekendStart(startIso: string, zone: string): boolean {
  const wd = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short' }).format(new Date(startIso))
  return wd === 'Fri' || wd === 'Sat' || wd === 'Sun'
}

/** The objective a moment serves, from its kind and the night's own facts. Pure. */
export function objectiveOf(input: Pick<TimingInput, 'moment' | 'multiDay' | 'recurring' | 'objective'> & { readonly free: boolean; readonly weekend: boolean }): Objective {
  if (input.objective) return input.objective
  switch (input.moment) {
    case 'announce':
      return 'discovery'
    case 'build':
      return input.free ? 'discovery' : 'advance_sales'
    case 'final_push':
      return input.weekend ? 'weekend_planning' : input.free ? 'discovery' : 'booking_reminder'
    case 'tomorrow':
      return input.free ? 'free_community' : 'booking_reminder'
    case 'first_day':
    case 'running':
    case 'final_day':
      return input.recurring ? 'recurring' : input.multiDay ? 'multi_day' : input.free ? 'free_community' : 'booking_reminder'
    default:
      return input.weekend ? 'weekend_planning' : 'discovery'
  }
}

const DAY_OF: ReadonlySet<MomentKind> = new Set(['first_day', 'running', 'final_day'])

/** A piece's objective and window, or why it is expired or held. Pure. */
export function timingOf(input: TimingInput, now: Date): Timing {
  // A piece of no event (the organiser offer, a brand piece) promotes no night: its window is its own slot's day, as law 42
  // rules for every slot (a missed day is never posted late); its own rules (piece-quality.ts) still stand.
  if (input.nights.length === 0) {
    const zone = LIFECYCLE_ZONE
    const day = input.day ?? dayIn(input.preferredAt ?? now, zone)
    const end = dayStart(new Date(dayStart(new Date(`${day}T02:00:00Z`), zone).getTime() + 36 * 3_600_000), zone).getTime()
    return { kind: 'window', objective: 'discovery', preferredAt: input.preferredAt ? input.preferredAt.toISOString() : null, latestAt: iso(end), expiresAt: iso(end), recovery: 'within_window', basis: 'a piece of no event: valid through its own day (law 42)' }
  }
  for (const n of input.nights) {
    if (!n.startDate || !Number.isFinite(Date.parse(n.startDate))) return { kind: 'held', reason: `${n.title}: its start is not on record; add its start date and time before it is promoted.` }
    if (n.status && ENDED_STATUSES.has(n.status)) return { kind: 'expired', reason: `${n.title} is ${n.status}; its promotion ends with it.` }
  }
  const live = input.objective === 'live_coverage' || input.objective === 'post_event_highlight'
  if (live && !input.approvedContent) return { kind: 'held', reason: `${input.objective === 'live_coverage' ? 'Live coverage' : 'A post event highlight'} needs its own approved content and media permission; it is not planned until that exists.` }
  for (const n of input.nights) {
    if (n.soldOut && !live) return { kind: 'expired', reason: `${n.title} has sold out or closed its registration; there is nothing left to promote.` }
  }
  const first = input.nights.reduce((a, b) => (Date.parse(b.startDate as string) < Date.parse(a.startDate as string) ? b : a))
  const zone = zoneOf(first)
  const start = Date.parse(first.startDate as string)
  const free = input.nights.every((n) => n.isFree === true)
  const objective = objectiveOf({ ...input, free, weekend: weekendStart(first.startDate as string, zone) })
  const day = input.day ?? (input.preferredAt ? dayIn(input.preferredAt, zone) : dayIn(now, zone))
  const dayEnd = dayStart(new Date(dayStart(new Date(`${day}T02:00:00Z`), zone).getTime() + 36 * 3_600_000), zone).getTime()
  const lastEnd = Math.max(...input.nights.map((n) => (n.endDate ? Date.parse(n.endDate) : NaN)).filter(Number.isFinite), -Infinity)

  let latest: number
  let expires: number
  let basis: string
  if (input.objective === 'post_event_highlight') {
    if (!Number.isFinite(lastEnd)) return { kind: 'held', reason: `${first.title}: its end is not on record; a highlight's window is set from it. Add its end time.` }
    latest = lastEnd + HIGHLIGHT_DAYS * 24 * 60 * MIN
    expires = latest
    basis = `post event highlight with approved content: within ${HIGHLIGHT_DAYS} days of its end (initial hypothesis, UNSOURCED)`
  } else if ((input.moment && DAY_OF.has(input.moment)) || input.objective === 'live_coverage') {
    // A missing end is never a hold (the PM's 19:33 of 22 November 2026, amending 19:13 item 1: the record holds it from
    // discovery): until the discovery record completes it, a short DERIVED_SESSION is assumed and said in the basis, the
    // conservative side (a shorter day closes the window sooner, never later).
    const derived = !first.endDate
    const endIso = first.endDate ?? iso(start + DERIVED_SESSION_MINUTES * MIN)
    const s = sessionOfDay({ startDate: first.startDate as string, endDate: endIso }, zone, day)
    const sStart = Date.parse(s.start)
    const sEnd = Date.parse(s.end)
    if (input.objective === 'live_coverage') {
      latest = sEnd
      basis = 'live coverage with approved content: while the session is open'
    } else if (sEnd - sStart >= LONG_SESSION_MINUTES * MIN) {
      latest = sEnd - DAY_LEFT_MINUTES * MIN
      basis = `a long day (${Math.round((sEnd - sStart) / 3_600_000)} hours): useful while ${DAY_LEFT_MINUTES / 60} hours remain (initial hypothesis, UNSOURCED; floor: Lawal's 19:04 of 22 November 2026, 7pm for an 8pm close is too late)`
    } else {
      latest = sStart - AHEAD_LEAD_MINUTES * MIN
      basis = `a short session: promoted until ${AHEAD_LEAD_MINUTES / 60} hours before its doors (initial hypothesis, UNSOURCED)`
    }
    if (derived) basis = `${basis}; its end DERIVED as ${DERIVED_SESSION_MINUTES / 60} hours after its start, none on record`
    expires = sEnd
  } else {
    // THE STAGE (car T, T2, the PM's 02:05 of 28 November 2026: "A reminder may go out on or near the day; a first exposure
    // may not. Never take a night out of a piece to pass a rule."): each night is judged by its own stage on the day the
    // piece goes. A reminder on its own day (event_promotions, read by the caller: reminder) by the day-of rules, a long
    // day while two hours of it remain, a short session until two hours before its doors; every other night ahead of
    // itself, as before. The piece's window is the narrowest of its nights'.
    latest = Infinity
    expires = Infinity
    const reminded: string[] = []
    for (const n of input.nights) {
      const w = n.reminder === true ? reminderWindow(n, zone, day) : null
      if (w) {
        latest = Math.min(latest, w.latest)
        expires = Math.min(expires, w.expires)
        reminded.push(`${n.title}, ${w.basis}`)
        continue
      }
      const s = Date.parse(n.startDate as string)
      latest = Math.min(latest, dayEnd, s - AHEAD_LEAD_MINUTES * MIN)
      expires = Math.min(expires, dayEnd, s)
    }
    basis = `ahead of the night: until ${AHEAD_LEAD_MINUTES / 60} hours before it begins and within the day its words name (initial hypothesis, UNSOURCED)`
    if (reminded.length > 0) basis = `${basis}; a reminder on its own day (its promotion stage): ${reminded.join('; ')}`
  }
  if (expires < latest) expires = latest
  return { kind: 'window', objective, preferredAt: input.preferredAt ? input.preferredAt.toISOString() : null, latestAt: iso(latest), expiresAt: iso(expires), recovery: 'within_window', basis }
}

/**
 * A REMINDER'S WINDOW ON ITS OWN DAY (car T, T2): the night's session that day, by the day-of rules (a long day useful
 * while DAY_LEFT_MINUTES remain, a short session until AHEAD_LEAD_MINUTES before its doors, its end DERIVED when none is
 * on record, the conservative side); null when the day is not one of its own, so it is judged ahead of itself. Pure.
 */
function reminderWindow(n: TimingNight, zone: string, day: string): { readonly latest: number; readonly expires: number; readonly basis: string } | null {
  const start = Date.parse(n.startDate as string)
  const endIso = n.endDate ?? iso(start + DERIVED_SESSION_MINUTES * MIN)
  if (day < dayIn(new Date(start), zone) || day > dayIn(new Date(Math.max(start, Date.parse(endIso) - 1)), zone)) return null
  const s = sessionOfDay({ startDate: n.startDate as string, endDate: endIso }, zone, day)
  const sStart = Date.parse(s.start)
  const sEnd = Date.parse(s.end)
  const derived = n.endDate ? '' : `, its end DERIVED as ${DERIVED_SESSION_MINUTES / 60} hours after its start`
  return sEnd - sStart >= LONG_SESSION_MINUTES * MIN
    ? { latest: sEnd - DAY_LEFT_MINUTES * MIN, expires: sEnd, basis: `a long day, useful while ${DAY_LEFT_MINUTES / 60} hours remain${derived}` }
    : { latest: sStart - AHEAD_LEAD_MINUTES * MIN, expires: sEnd, basis: `a short session, until ${AHEAD_LEAD_MINUTES / 60} hours before its doors${derived}` }
}

/** Why a piece may not go at `at` under its window: past its latest acceptable time. Null while it may. Pure. */
export function pastLatest(latestAt: string, at: Date): string | null {
  const over = Math.ceil((at.getTime() - Date.parse(latestAt)) / MIN)
  return over > 0 ? `EXPIRED: its latest acceptable time, ${latestAt}, passed ${over} minute${over === 1 ? '' : 's'} ago; expired promotional content is never published (Lawal, 19:13 of 22 November 2026).` : null
}
