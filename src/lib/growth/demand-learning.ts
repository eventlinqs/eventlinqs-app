import type { DashboardFigure } from '@/lib/admin/founder-dashboard-math'
import { nightFiguresFrom } from './four-levels'

/**
 * THE DEMAND LEARNING LOOP (D10 of Lawal's DemandOS directive of 30 October 2026, section 10: "Compare performance by
 * city, category, lead time, channel and creative. Recommend future campaigns based on observed results. Start with
 * explainable rules. Do not present unsupported AI predictions as facts."). What is new beside bestOfWeek, which only
 * counts page views: outcomes per night in the honest levels, a recommendation that shows its numbers, and the holdout
 * (the PROJECT MANAGER's 17:25: matched recurring nights, alternating weeks). Channel and creative are compared by the
 * social report from each piece's own result; this reads the nights.
 *
 * THE THRESHOLDS ARE OUR OWN WORKING RULES, not measured or sourced, and say so: small enough to act early, large enough
 * that one busy night cannot steer a plan. The 1.5 gap is the social report's (social-report-math.ts). Pure.
 */

/** Our own working rule: fewer nights than this on either side says nothing. */
export const MIN_NIGHTS_TO_COMPARE = 5
/** Our own working rule: fewer matched pairs than this reads nothing. */
export const MIN_PAIRS_TO_READ = 6
/** A side must lead by this much before it is recommended, the social report's own gap. */
const GAP = 1.5

export interface NightOutcome {
  readonly city: string | null
  readonly category: string | null
  /** Days between the night being published and the night. */
  readonly leadDays: number
  /** Distinct people who opened the listing. */
  readonly people: number
  /** People sent on to book: never a sale. */
  readonly presses: number
  /** Standing orders; null where EventLinqs does not ticket the night, never read as zero. */
  readonly orders: number | null
}

/** The blueprint's windows (section 4), an initial design it says DemandOS should learn from, not proven booking patterns. */
const LEAD_BANDS = ['0 to 1 days', '2 to 7 days', '8 to 20 days', '21 days or more']

export function leadTimeBand(days: number): string {
  if (days <= 1) return '0 to 1 days'
  if (days <= 7) return '2 to 7 days'
  if (days <= 20) return '8 to 20 days'
  return '21 days or more'
}

export interface NightGroup {
  readonly key: string
  readonly nights: number
  readonly peoplePerNight: number
  readonly pressesPerNight: number
  readonly nightsWeTicket: number
  readonly ordersPerTicketedNight: number | null
}

const keyOf: Record<'city' | 'category' | 'lead', (n: NightOutcome) => string | null> = {
  city: (n) => n.city,
  category: (n) => n.category,
  lead: (n) => leadTimeBand(n.leadDays),
}

export function compareNights(nights: readonly NightOutcome[], by: 'city' | 'category' | 'lead'): NightGroup[] {
  const groups = new Map<string, NightOutcome[]>()
  for (const n of nights) {
    const k = keyOf[by](n)
    if (k === null || k === '') continue
    groups.set(k, [...(groups.get(k) ?? []), n])
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const ticketed = list.filter((n) => n.orders !== null)
      return {
        key,
        nights: list.length,
        peoplePerNight: list.reduce((s, n) => s + n.people, 0) / list.length,
        pressesPerNight: list.reduce((s, n) => s + n.presses, 0) / list.length,
        nightsWeTicket: ticketed.length,
        ordersPerTicketedNight: ticketed.length ? ticketed.reduce((s, n) => s + (n.orders ?? 0), 0) / ticketed.length : null,
      }
    })
    .sort((a, b) => b.peoplePerNight - a.peoplePerNight || a.key.localeCompare(b.key))
}

const round = (v: number) => Math.round(v * 10) / 10

/** At most one line per dimension, each with its numbers: the best side against the weakest, on enough nights each. */
export function recommendations(nights: readonly NightOutcome[]): string[] {
  const out: string[] = []
  for (const by of ['city', 'category', 'lead'] as const) {
    const enough = compareNights(nights, by).filter((g) => g.nights >= MIN_NIGHTS_TO_COMPARE)
    if (enough.length < 2) continue
    const best = enough[0]
    const worst = enough[enough.length - 1]
    if (worst.peoplePerNight <= 0 || best.peoplePerNight / worst.peoplePerNight < GAP) continue
    const seen = `${round(best.peoplePerNight)} people a night against ${round(worst.peoplePerNight)} for ${worst.key}, over ${Math.min(best.nights, worst.nights)} nights each. Observed, not a prediction.`
    if (by === 'lead') {
      const earlier = LEAD_BANDS.indexOf(best.key) > LEAD_BANDS.indexOf(worst.key)
      out.push(`${earlier ? 'Publish earlier where you can' : 'Late listings are drawing well'}: nights up ${best.key} ahead drew ${seen}`)
    } else out.push(`Give ${best.key} more of the next plan: ${seen}`)
  }
  return out
}

/** A stable small number from a series id. */
function parityOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 2
}

/**
 * Which arm a recurring series' night falls in, for the week beginning `monday` (YYYY-MM-DD): each series alternates week
 * by week, and series start on different feet, so the plan never holds every night out at once. Deterministic, so a
 * report can be read again. A held out night stays listed: only our extra distribution is withheld, never the listing.
 */
export function holdoutArm(seriesId: string, monday: string): 'distribute' | 'hold_out' {
  const week = Math.floor(Date.parse(`${monday}T00:00:00Z`) / (7 * 86_400_000))
  return (week + parityOf(seriesId)) % 2 === 0 ? 'distribute' : 'hold_out'
}

export type HoldoutReading =
  | { readonly state: 'too_few'; readonly pairs: number }
  | { readonly state: 'read'; readonly pairs: number; readonly ordersPerNightDistributed: number; readonly ordersPerNightHeldOut: number; readonly words: string }

/** Completed bookings only, on matched pairs of one series' nights. Never called incremental sales: the sample is small. */
export function holdoutReading(pairs: readonly { readonly distributedOrders: number; readonly heldOutOrders: number }[]): HoldoutReading {
  if (pairs.length < MIN_PAIRS_TO_READ) return { state: 'too_few', pairs: pairs.length }
  const on = round(pairs.reduce((s, p) => s + p.distributedOrders, 0) / pairs.length)
  const off = round(pairs.reduce((s, p) => s + p.heldOutOrders, 0) / pairs.length)
  return { state: 'read', pairs: pairs.length, ordersPerNightDistributed: on, ordersPerNightHeldOut: off, words: `${on} bookings a night with our distribution against ${off} without, over ${pairs.length} matched pairs. Directional, not conclusive.` }
}

/** A kept night report (organiser_night_reports.figures) and its event as an outcome, or null where either cannot be read. */
export function nightOutcomeFrom(row: { figures: unknown; city: string | null; category: string | null; publishedAt: string | null; startDate: string }): NightOutcome | null {
  const f = nightFiguresFrom(row.figures)
  if (f === null || row.publishedAt === null) return null
  const leadDays = Math.max(0, Math.round((Date.parse(row.startDate) - Date.parse(row.publishedAt)) / 86_400_000))
  if (!Number.isFinite(leadDays)) return null
  return { city: row.city, category: row.category, leadDays, people: f.viewers, presses: f.pressesOut.people, orders: f.onEventLinqs?.orders ?? null }
}

/** D11's recommended next actions: the observed lines, or how few nights there are, never an invented action. */
export function recommendationFigure(lines: readonly string[], nights: number): DashboardFigure {
  return {
    label: 'Recommended next',
    value: lines.length,
    asksForAPerson: false,
    href: null,
    kind: 'measure',
    cadence: 'weekly',
    display: lines.length > 0 ? lines.join(' ') : `Too few nights to compare yet (${nights} reported)`,
  }
}
