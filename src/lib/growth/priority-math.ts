/**
 * THE PRIORITISATION ENGINE, V3 ITEM 4 (Lawal's Growth Engine V3 build checklist, decided 1 November 2026 05:12):
 * "Score inputs: how often the organiser runs events, yearly ticket opportunity, current ticketing ties, next event
 * date, city fit, engagement, contact eligibility"; "One open, adjustable formula; every score shows its inputs and
 * reasons".
 *
 * THE FORMULA is PRIORITY_FORMULA below and nothing else: change a number there and every score follows, with its
 * reasons. It scores out of 100. Two of its orders come from the plan, not from taste: current ticketing ties put
 * organisers selling through small independent sellers first and venue-contracted Ticketmaster, Ticketek, Moshtix and
 * Oztix shows last (growth/plan.json close_the_ticketing_gap.who_first), and city fit puts the focus market first
 * (plan version 4, focus_market: Geelong and Melbourne). Contact eligibility is a gate as well as points: an organiser
 * with no permitted contact is never on today's list to approach; they are research or a social first touch (the
 * checklist's item 5). Nothing here sends anything.
 *
 * Pure.
 */
import { MAJOR_SELLERS, type BookingProvider } from '@/lib/events/booking-links'


export type TicketingTies = 'none' | 'independent' | 'major' | 'eventlinqs'

export interface PriorityFacts {
  /** Public nights of theirs in the last and next 90 days. */
  readonly nightsLastAndNext90: number
  /** Of those, the nights with a price above A$0. */
  readonly paidNightsLastAndNext90: number
  readonly ties: TicketingTies
  /** Whole days to their next public night, or null when none is listed. */
  readonly daysToNextNight: number | null
  readonly cityFit: 'focus' | 'open' | 'other'
  /** Replies logged and listing claims made. */
  readonly engagement: number
  /** A contact with a whole consent basis that the database does not refuse. */
  readonly eligible: boolean
}

/** The one open, adjustable formula. Points out of 100. */
export const PRIORITY_FORMULA = {
  frequency: { pointsPerNight: 2, max: 20 },
  ticketOpportunity: { pointsPerPaidNightAYear: 0.5, max: 20 },
  ties: { independent: 15, none: 10, major: 0, eventlinqs: 0 },
  nextEvent: [
    { withinDays: 14, points: 15 },
    { withinDays: 45, points: 10 },
    { withinDays: 90, points: 5 },
  ],
  cityFit: { focus: 15, open: 5, other: 0 },
  engagement: { pointsEach: 5, max: 10 },
  eligibility: { eligible: 5, not: 0 },
} as const

const TIES_WORDS: Readonly<Record<TicketingTies, string>> = {
  independent: 'sells through a small independent seller',
  none: 'no ticketing found',
  major: 'sells through a venue-contracted major seller',
  eventlinqs: 'already sells through EventLinqs',
}

export interface PriorityInput {
  readonly input: string
  readonly value: string
  readonly points: number
}

export interface Priority {
  readonly score: number
  readonly inputs: PriorityInput[]
  /** The inputs that scored, in words, largest first. */
  readonly reasons: string[]
  /** On today's list to approach: eligible, not already selling through EventLinqs, and with a night to talk about. */
  readonly approachToday: boolean
}

const capped = (n: number, max: number) => Math.min(max, Math.max(0, n))

export function priorityOf(f: PriorityFacts): Priority {
  const F = PRIORITY_FORMULA
  const paidAYear = Math.round(f.paidNightsLastAndNext90 * (365 / 180))
  const next = f.daysToNextNight === null ? undefined : F.nextEvent.find((n) => f.daysToNextNight! <= n.withinDays)
  const inputs: PriorityInput[] = [
    { input: 'How often they run events', value: `${f.nightsLastAndNext90} nights in the last and next 90 days`,
      points: capped(f.nightsLastAndNext90 * F.frequency.pointsPerNight, F.frequency.max) },
    { input: 'Yearly ticket opportunity', value: `about ${paidAYear} paid nights a year`,
      points: capped(paidAYear * F.ticketOpportunity.pointsPerPaidNightAYear, F.ticketOpportunity.max) },
    { input: 'Current ticketing ties', value: TIES_WORDS[f.ties], points: F.ties[f.ties] },
    { input: 'Next event', value: f.daysToNextNight === null ? 'none listed' : `in ${f.daysToNextNight} days`, points: next?.points ?? 0 },
    { input: 'City fit', value: f.cityFit === 'focus' ? 'the focus market' : f.cityFit === 'open' ? 'an open city' : 'outside the open cities',
      points: F.cityFit[f.cityFit] },
    { input: 'Engagement', value: `${f.engagement} replies and claims`, points: capped(f.engagement * F.engagement.pointsEach, F.engagement.max) },
    { input: 'Contact eligibility', value: f.eligible ? 'a permitted contact' : 'no permitted contact', points: f.eligible ? F.eligibility.eligible : F.eligibility.not },
  ]
  const score = Math.round(inputs.reduce((sum, i) => sum + i.points, 0))
  const reasons = inputs.filter((i) => i.points > 0).sort((a, b) => b.points - a.points).map((i) => `${i.input}: ${i.value} (${i.points})`)
  return { score, inputs, reasons, approachToday: f.eligible && f.ties !== 'eventlinqs' && f.nightsLastAndNext90 > 0 }
}

// The major sellers come from the one table of platform names (booking-links), never named here.

/** An organiser's ticketing ties from the platforms their nights sell on (booking-links providerOf) and their own tiers. */
export function tiesOf(providers: readonly string[], sellsOnEventLinqs: boolean): TicketingTies {
  if (sellsOnEventLinqs) return 'eventlinqs'
  if (providers.length === 0) return 'none'
  return providers.some((p) => !MAJOR_SELLERS.has(p as BookingProvider)) ? 'independent' : 'major'
}
