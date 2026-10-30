import type { DashboardFigure } from '@/lib/admin/founder-dashboard-math'
import { feeGivenBack } from './weekly-math'

/**
 * EVENT-LEVEL PROFITABILITY (D9x of Lawal's DemandOS directive of 30 October 2026, section 9). Contribution is the fee
 * each order recorded less the processing estimate it recorded, less the share of the fee a refund gave back; it is
 * never the ticket value, and it uses the fee as charged, never an example figure. Direct campaign cost comes off the
 * one event it was spent on; a campaign for a whole city guide is platform acquisition, reported apart and never
 * charged to a night. An order that does not record both figures is left out and counted. Pure.
 */

const SOLD = new Set(['confirmed', 'partially_refunded', 'refunded'])

export interface ContributionOrder {
  readonly eventId: string | null
  readonly status: string
  readonly totalCents: number
  readonly retainedCents: number | null
  readonly processingCents: number | null
  readonly refundedCents: number
}

export interface CampaignSpend {
  readonly scope: 'event' | 'city_guide'
  readonly eventId: string | null
  readonly amountCents: number
}

export interface EventContribution {
  readonly eventId: string
  readonly orders: number
  /** Sold orders that do not record both figures, left out of the contribution and shown. */
  readonly unrecorded: number
  readonly contributionCents: number
  readonly directSpendCents: number
  readonly afterCampaignCents: number
}

export function contributionByEvent(input: { orders: readonly ContributionOrder[]; spend: readonly CampaignSpend[] }): EventContribution[] {
  const rows = new Map<string, { orders: number; unrecorded: number; contributionCents: number; directSpendCents: number }>()
  const row = (id: string) => {
    let r = rows.get(id)
    if (!r) {
      r = { orders: 0, unrecorded: 0, contributionCents: 0, directSpendCents: 0 }
      rows.set(id, r)
    }
    return r
  }
  for (const o of input.orders) {
    if (o.eventId === null || !SOLD.has(o.status)) continue
    const r = row(o.eventId)
    if (o.retainedCents === null || o.processingCents === null) {
      r.unrecorded += 1
      continue
    }
    r.orders += 1
    r.contributionCents += o.retainedCents - o.processingCents - feeGivenBack(o)
  }
  for (const s of input.spend) {
    if (s.scope === 'event' && s.eventId !== null) row(s.eventId).directSpendCents += s.amountCents
  }
  return [...rows.entries()]
    .map(([eventId, r]) => ({ eventId, ...r, afterCampaignCents: r.contributionCents - r.directSpendCents }))
    .sort((a, b) => a.afterCampaignCents - b.afterCampaignCents || a.eventId.localeCompare(b.eventId))
}

const aud = (cents: number) => `${cents < 0 ? '-' : ''}A$${(Math.abs(cents) / 100).toFixed(2)}`

/** Two lines: the event campaigns, and platform acquisition kept apart. */
export function profitabilityLines(input: { events: readonly EventContribution[]; pooledSpendCents: number }): [string, string] {
  const sum = (pick: (e: EventContribution) => number) => input.events.reduce((n, e) => n + pick(e), 0)
  return [
    `Event campaigns: ${aud(sum((e) => e.contributionCents))} contribution, ${aud(sum((e) => e.directSpendCents))} direct cost, ${aud(sum((e) => e.afterCampaignCents))} after it`,
    `Platform acquisition, reported apart: ${aud(input.pooledSpendCents)} spent`,
  ]
}

/** The two lines as /admin/today's monthly figures. A night that lost money after its campaign asks for a person. */
export function profitabilityFigures(input: { events: readonly EventContribution[]; pooledSpendCents: number }): DashboardFigure[] {
  const sum = (pick: (e: EventContribution) => number) => input.events.reduce((n, e) => n + pick(e), 0)
  const losing = input.events.filter((e) => e.directSpendCents > 0 && e.afterCampaignCents < 0).length
  const after = sum((e) => e.afterCampaignCents)
  return [
    {
      label: 'Event campaigns, last 28 days',
      value: after,
      asksForAPerson: losing > 0,
      href: null,
      kind: losing > 0 ? 'failed' : 'measure',
      cadence: 'monthly',
      display: `${aud(sum((e) => e.contributionCents))} contribution, ${aud(sum((e) => e.directSpendCents))} direct cost, ${aud(after)} after it${losing > 0 ? `; ${losing} ${losing === 1 ? 'night' : 'nights'} lost money` : ''}`,
    },
    {
      label: 'Platform acquisition, last 28 days',
      value: input.pooledSpendCents,
      asksForAPerson: false,
      href: null,
      kind: 'measure',
      cadence: 'monthly',
      display: `${aud(input.pooledSpendCents)} spent, reported apart from any night`,
    },
  ]
}
