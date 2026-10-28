import { fromZonedInputValue, toZonedInputValue, PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import type { TrafficChannel } from './traffic-channel'

/**
 * THE GROWTH PAGE'S ARITHMETIC: LAST WEEK IN FIVE DIMENSIONS.
 *
 * The plan ("EventLinqs, the discovery-to-booking foundation", 27 October 2026,
 * Intelligence and the founder's dashboard): "Five dimensions: relevance,
 * attention, engagement, conversion, business health ... one growth page with
 * the five, weekly", and "Each Monday the page names the best city, category and
 * channel of last week". Done when "Lawal reads last week's numbers on one
 * screen".
 *
 * PURE. Nothing here reads a database; ./weekly.ts reads the rows and hands them
 * in, so every figure on the page is tested without one. Nothing is invented:
 * each figure is a count of rows the platform already keeps, and a figure the
 * platform does not yet keep is reported as not counted, never as zero.
 *
 * THE WEEK is Monday 00:00 to the next Monday 00:00 on the platform's clock
 * (PLATFORM_TIME_ZONE), the last whole one before now, beside the week before it.
 *
 * WHAT EACH DIMENSION COUNTS, each from its own rows:
 *   relevance  listings people can find: events live and still to come at the
 *              week's end, and those published during the week (seed data never);
 *   attention  distinct visitors to event pages and their page views, from the
 *              ledger's demand rows (one row per visitor per event per day), the
 *              visitors seen before the week counted as returning;
 *   engagement calendar adds, shares and follows (the ledger), saves
 *              (saved_events), and new confirmed subscribers (email_subscribers);
 *   conversion paid orders and their value, and orders per 100 visitors;
 *   health     the platform's fee revenue less nothing it cannot see, refunds
 *              completed, and organisers who sold, with how many had sold before.
 * A VISITOR is the ledger's own key: a hash of the address and the browser
 * (src/lib/broadcast/share-links.ts visitorHash), so one person on two devices is
 * two visitors and a household behind one address may be one. Said on the page.
 */


export interface Week {
  /** Monday 00:00 on the platform's clock, as an instant. */
  readonly from: string
  /** The next Monday 00:00, exclusive. */
  readonly to: string
  /** The Monday as YYYY-MM-DD, for the page's heading. */
  readonly monday: string
}

/** The last whole week before `now`, and the week before it. */
export function lastWeeks(now: Date, zone: string = PLATFORM_TIME_ZONE): { readonly last: Week; readonly before: Week } {
  const local = toZonedInputValue(now.toISOString(), zone)
  const today = dayNumber(Number(local.slice(0, 4)), Number(local.slice(5, 7)), Number(local.slice(8, 10)))
  // Day 0 is Thursday 1 January 1970, so a Monday is the day number less ((n + 3) mod 7).
  const thisMonday = today - (((today + 3) % 7) + 7) % 7
  const week = (monday: number): Week => {
    const from = calendarDay(monday)
    const to = calendarDay(monday + 7)
    return { from: fromZonedInputValue(`${from}T00:00`, zone), to: fromZonedInputValue(`${to}T00:00`, zone), monday: from }
  }
  return { last: week(thisMonday - 7), before: week(thisMonday - 14) }
}

/** The week that starts on the Monday `monday` (YYYY-MM-DD) on the platform's clock, as lastWeeks gives its weeks. */
export function weekOf(monday: string, zone: string = PLATFORM_TIME_ZONE): Week {
  const n = dayNumber(Number(monday.slice(0, 4)), Number(monday.slice(5, 7)), Number(monday.slice(8, 10)))
  const from = calendarDay(n)
  return { from: fromZonedInputValue(`${from}T00:00`, zone), to: fromZonedInputValue(`${calendarDay(n + 7)}T00:00`, zone), monday: from }
}

/**
 * Whole days on the proleptic Gregorian calendar, day 0 being 1 January 1970, and back again. lastWeeks reads the zoned
 * date's own digits and counts on these numbers, so no instant is ever read in UTC and called a day on the platform's
 * clock (scripts/guards/consent-dates-are-zoned.mjs). The arithmetic is the civil calendar's days_from_civil and
 * civil_from_days.
 */
function dayNumber(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function calendarDay(n: number): string {
  const z = n + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const inWeek = (at: string | null, w: Week): boolean => at !== null && at >= w.from && at < w.to

export interface ListingRow {
  readonly id: string
  readonly city: string | null
  readonly category: string | null
  readonly status: string
  readonly publishedAt: string | null
  readonly startDate: string
  readonly isSeed: boolean
  /** A listing that repeats: is_recurring, or one of a listing series. */
  readonly recurring: boolean
  readonly organisationId: string | null
}

export interface VisitRow {
  readonly visitor: string
  readonly eventId: string
  readonly at: string
  readonly channel: TrafficChannel
}

export interface DemandRow {
  readonly action: 'calendar_add' | 'share' | 'follow'
  readonly at: string
}

export interface OrderRow {
  readonly totalCents: number
  readonly platformFeeCents: number
  readonly status: string
  readonly createdAt: string
  readonly organisationId: string
  /** The listing the order was for, so a state's orders can be told apart. */
  readonly eventId: string | null
  /** What the platform kept out of the order, and what Stripe is estimated to take; null where the order does not record it. */
  readonly retainedCents: number | null
  readonly processingCents: number | null
}

export interface RefundRow {
  readonly amountCents: number
  readonly status: string
  readonly at: string
}

export interface Rows {
  readonly listings: readonly ListingRow[]
  readonly visits: readonly VisitRow[]
  readonly demand: readonly DemandRow[]
  readonly saves: readonly { readonly at: string }[]
  readonly subscribers: readonly { readonly confirmedAt: string | null }[]
  readonly orders: readonly OrderRow[]
  readonly refunds: readonly RefundRow[]
}

export interface WeekFigures {
  readonly relevance: { readonly live: number; readonly published: number }
  readonly attention: { readonly visitors: number; readonly returning: number; readonly views: number }
  readonly engagement: { readonly calendarAdds: number; readonly shares: number; readonly follows: number; readonly saves: number; readonly subscribers: number }
  readonly conversion: { readonly orders: number; readonly orderValueCents: number; readonly ordersPer100Visitors: number | null }
  readonly health: {
    readonly feeRevenueCents: number
    readonly refundedCents: number
    readonly organisersSold: number
    readonly organisersSoldBefore: number
    /** The fee kept less Stripe's processing estimate, over the orders that record both. */
    readonly marginCents: number
    /** Sold orders in the week that do not record both, left out of the margin and shown. */
    readonly marginUnrecorded: number
  }
}

/** Orders that count as sold, as the GMV screen counts them (src/lib/admin/analytics.ts). */
const SOLD = new Set(['confirmed', 'partially_refunded', 'refunded'])

export function figuresFor(rows: Rows, w: Week): WeekFigures {
  const real = rows.listings.filter((l) => !l.isSeed)
  const live = real.filter((l) => l.status === 'published' && l.publishedAt !== null && l.publishedAt < w.to && l.startDate >= w.to).length
  const published = real.filter((l) => inWeek(l.publishedAt, w)).length

  const weekVisits = rows.visits.filter((v) => inWeek(v.at, w))
  const visitors = new Set(weekVisits.map((v) => v.visitor))
  const seenBefore = new Set(rows.visits.filter((v) => v.at < w.from).map((v) => v.visitor))
  const returning = [...visitors].filter((v) => seenBefore.has(v)).length

  const demand = rows.demand.filter((d) => inWeek(d.at, w))
  const count = (a: DemandRow['action']) => demand.filter((d) => d.action === a).length

  const sold = rows.orders.filter((o) => SOLD.has(o.status))
  const weekOrders = sold.filter((o) => inWeek(o.createdAt, w))
  const orderValueCents = weekOrders.reduce((n, o) => n + o.totalCents, 0)
  const feeRevenueCents = weekOrders.reduce((n, o) => n + o.platformFeeCents, 0)
  const organisers = new Set(weekOrders.map((o) => o.organisationId))
  const before = new Set(sold.filter((o) => o.createdAt < w.from).map((o) => o.organisationId))
  const recorded = weekOrders.filter((o) => o.retainedCents !== null && o.processingCents !== null)
  const marginCents = recorded.reduce((n, o) => n + (o.retainedCents ?? 0) - (o.processingCents ?? 0), 0)

  return {
    relevance: { live, published },
    attention: { visitors: visitors.size, returning, views: weekVisits.length },
    engagement: {
      calendarAdds: count('calendar_add'),
      shares: count('share'),
      follows: count('follow'),
      saves: rows.saves.filter((s) => inWeek(s.at, w)).length,
      subscribers: rows.subscribers.filter((s) => inWeek(s.confirmedAt, w)).length,
    },
    conversion: {
      orders: weekOrders.length,
      orderValueCents,
      ordersPer100Visitors: visitors.size === 0 ? null : Math.round((weekOrders.length / visitors.size) * 1000) / 10,
    },
    health: {
      feeRevenueCents,
      refundedCents: rows.refunds.filter((r) => r.status === 'completed' && inWeek(r.at, w)).reduce((n, r) => n + r.amountCents, 0),
      organisersSold: organisers.size,
      organisersSoldBefore: [...organisers].filter((o) => before.has(o)).length,
      marginCents,
      marginUnrecorded: weekOrders.length - recorded.length,
    },
  }
}

export interface Best {
  readonly key: string
  readonly views: number
}

/** Each Monday's learning loop: the city, category and channel with the most page views last week, or null where none had any. */
export function bestOfWeek(rows: Rows, w: Week): { readonly city: Best | null; readonly category: Best | null; readonly channel: Best | null } {
  const byId = new Map(rows.listings.filter((l) => !l.isSeed).map((l) => [l.id, l]))
  const tally = (key: (v: VisitRow) => string | null): Best | null => {
    const n = new Map<string, number>()
    for (const v of rows.visits) {
      if (!inWeek(v.at, w)) continue
      const k = key(v)
      if (k === null || k === '') continue
      n.set(k, (n.get(k) ?? 0) + 1)
    }
    const top = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    return top === undefined ? null : { key: top[0], views: top[1] }
  }
  return {
    city: tally((v) => byId.get(v.eventId)?.city ?? null),
    category: tally((v) => byId.get(v.eventId)?.category ?? null),
    channel: tally((v) => v.channel),
  }
}

/** Lawal's line for the next state (the plan, Expansion): 50 recurring events. The plan sets no number for the others. */
export const RECURRING_EVENTS_FOR_THE_NEXT_STATE = 50

export interface StateScorecard {
  readonly recurringLive: number
  readonly recurringTarget: number
  /** Organisers with two or more real listings published in the state. */
  readonly repeatOrganisers: number
  readonly returningUp: boolean
  readonly marginPositive: boolean
}

/**
 * The state scorecard (the plan, Expansion: "50 recurring events, repeat organisers, returning visitors up, positive
 * margin"), for the cities of one state, read at last week's end.
 */
export function stateScorecard(rows: Rows, last: Week, before: Week, cities: ReadonlySet<string>): StateScorecard {
  const inState = rows.listings.filter((l) => !l.isSeed && l.city !== null && cities.has(l.city))
  const live = inState.filter((l) => l.status === 'published' && l.publishedAt !== null && l.publishedAt < last.to && l.startDate >= last.to)
  const perOrganiser = new Map<string, number>()
  for (const l of inState) {
    if (l.organisationId === null || l.status !== 'published' || l.publishedAt === null || l.publishedAt >= last.to) continue
    perOrganiser.set(l.organisationId, (perOrganiser.get(l.organisationId) ?? 0) + 1)
  }
  /* The state's own visitors and orders: those on its listings, seed or not, as the platform recorded them. */
  const ids = new Set(rows.listings.filter((l) => l.city !== null && cities.has(l.city)).map((l) => l.id))
  const own: Rows = { ...rows, visits: rows.visits.filter((v) => ids.has(v.eventId)), orders: rows.orders.filter((o) => o.eventId !== null && ids.has(o.eventId)) }
  const f = figuresFor(own, last)
  const b = figuresFor(own, before)
  return {
    recurringLive: live.filter((l) => l.recurring).length,
    recurringTarget: RECURRING_EVENTS_FOR_THE_NEXT_STATE,
    repeatOrganisers: [...perOrganiser.values()].filter((n) => n >= 2).length,
    returningUp: f.attention.returning > b.attention.returning,
    marginPositive: f.health.marginCents > 0,
  }
}
