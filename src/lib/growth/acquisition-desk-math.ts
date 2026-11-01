/**
 * THE GROWTH DESK'S ACQUISITION NUMBERS, V3 ITEM 10 (Lawal's Growth Engine V3 build checklist, decided 1 November 2026
 * 05:12). From growth_acquisition_facts() (one row per organiser, each fact from its proving row) to the checklist's
 * eleven numbers: suitable prospects, who to approach today and why, legally eligible contacts, organisers who
 * replied, qualified opportunities, ticketing switched on, first paid sale, came back with another paid event, revenue,
 * which channel works, and every number split by city, organiser group and source.
 *
 * The stages and their rates are ./acquisition-funnel-math.ts; the score and its reasons are ./priority-math.ts. This
 * only maps a facts row onto both and counts. Revenue is the platform fee on paid orders (the scorecard's paid order
 * rule), never a gross ticket sale and never an outside click (law 2, revenue truth).
 *
 * Pure.
 */
import { providerOf } from '@/lib/events/booking-links'
import { acquisitionFunnel, funnelSplit, stagesOf, type AcquisitionStage, type AcquisitionStep, type OrganiserStageFacts, type SplitBy } from './acquisition-funnel-math'
import { priorityOf, tiesOf, type Priority } from './priority-math'

/** One row of growth_acquisition_facts(), as the database writes it. */
export interface AcquisitionFactsRow {
  organiser_id: string
  name: string
  city: string | null
  group: string | null
  source: string | null
  opportunity_open: boolean
  nights_90: number
  paid_nights_90: number
  next_night_at: string | null
  outside_ticket_urls: string[]
  permitted_contacts: number
  eligible_contacts: number
  touches_sent: number
  replies: number
  interested_replies: number
  ownership_verified: boolean
  paid_tiers: number
  paid_events: number
  platform_fee_cents: number
}

/** The open cities the plan's focus market names, read from its own words (version 4: 'Geelong and Melbourne, ...'). */
export function focusCities(openCities: readonly string[], focusName: string | undefined): string[] {
  if (!focusName) return []
  const words = focusName.toLowerCase()
  return openCities.filter((c) => new RegExp(`\\b${c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(words))
}

export function stageFactsOf(r: AcquisitionFactsRow): OrganiserStageFacts {
  return {
    organiserId: r.organiser_id,
    city: r.city,
    group: r.group,
    source: r.source,
    nightsLastAndNext90: r.nights_90,
    permittedContacts: r.permitted_contacts,
    touchesSent: r.touches_sent,
    replies: r.replies,
    interestedReplies: r.interested_replies,
    ownershipVerified: r.ownership_verified,
    paidTiers: r.paid_tiers,
    paidEvents: r.paid_events,
  }
}

/** The ticket sellers an organiser's outside links point at. A venue's or organiser's own site, or an unknown link, is
 *  not a ticket seller, so it never reads as 'a small independent seller'. */
const NOT_A_SELLER: ReadonlySet<string> = new Set(['venue', 'organiser_site', 'other'])
export function sellersOf(urls: readonly string[]): string[] {
  return [...new Set(urls.map((u) => providerOf(u)))].filter((p) => !NOT_A_SELLER.has(p))
}

export function priorityFor(r: AcquisitionFactsRow, now: Date, openCities: readonly string[], focus: readonly string[]): Priority {
  const next = r.next_night_at ? Math.max(0, Math.floor((Date.parse(r.next_night_at) - now.getTime()) / 86_400_000)) : null
  const city = r.city ?? ''
  return priorityOf({
    nightsLastAndNext90: r.nights_90,
    paidNightsLastAndNext90: r.paid_nights_90,
    ties: tiesOf(sellersOf(r.outside_ticket_urls), r.paid_tiers > 0),
    daysToNextNight: Number.isFinite(next as number) ? next : null,
    cityFit: focus.includes(city) ? 'focus' : openCities.includes(city) ? 'open' : 'other',
    engagement: r.replies,
    eligible: r.eligible_contacts > 0,
  })
}

export interface ApproachRow {
  organiserId: string
  name: string
  city: string | null
  priority: Priority
}

export interface AcquisitionDesk {
  organisers: number
  suitableProspects: number
  eligibleContacts: number
  organisersWithEligibleContact: number
  organisersReplied: number
  qualifiedOpportunities: number
  ticketingOn: number
  firstPaidSale: number
  repeatPaid: number
  platformFeeCents: number
  funnel: AcquisitionStep[]
  splits: Record<SplitBy, { key: string; steps: AcquisitionStep[] }[]>
  /** First paid sales per source: the channel that works best is the one with the most, said only when there is one. */
  channels: { key: string; organisers: number; firstPaidSale: number }[]
  approachToday: ApproachRow[]
}

/** How many of today's list the desk shows: the plan's daily twenty. */
export const APPROACH_TODAY_SHOWN = 20

export function acquisitionDesk(rows: readonly AcquisitionFactsRow[], now: Date, openCities: readonly string[], focusName?: string): AcquisitionDesk {
  const focus = focusCities(openCities, focusName)
  const facts = rows.map(stageFactsOf)
  const stages = facts.map((f) => stagesOf(f))
  const count = (stage: AcquisitionStage) => stages.filter((s) => s.has(stage)).length
  const sources = funnelSplit(facts, 'source')
  const approachToday = rows
    .map((r) => ({ organiserId: r.organiser_id, name: r.name, city: r.city, priority: priorityFor(r, now, openCities, focus) }))
    .filter((a) => a.priority.approachToday)
    .sort((a, b) => b.priority.score - a.priority.score || a.name.localeCompare(b.name))
    .slice(0, APPROACH_TODAY_SHOWN)
  return {
    organisers: rows.length,
    suitableProspects: count('qualified'),
    eligibleContacts: rows.reduce((s, r) => s + r.eligible_contacts, 0),
    organisersWithEligibleContact: rows.filter((r) => r.eligible_contacts > 0).length,
    organisersReplied: count('responded'),
    qualifiedOpportunities: rows.filter((r) => r.opportunity_open && r.nights_90 > 0).length,
    ticketingOn: count('ticketing_activated'),
    firstPaidSale: count('first_paid_sale'),
    repeatPaid: count('repeat_paid'),
    platformFeeCents: rows.reduce((s, r) => s + Number(r.platform_fee_cents || 0), 0),
    funnel: acquisitionFunnel(facts),
    splits: { city: funnelSplit(facts, 'city'), group: funnelSplit(facts, 'group'), source: sources },
    channels: sources.map((s) => ({
      key: s.key,
      organisers: s.steps[0].organisers,
      firstPaidSale: s.steps.find((st) => st.stage === 'first_paid_sale')?.organisers ?? 0,
    })),
    approachToday,
  }
}
