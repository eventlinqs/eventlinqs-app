import { feeGivenBack, figuresFor, type Rows, type Week } from './weekly-math'

/**
 * THE SIX NUMBERS, WEEK ON WEEK (the PM's order 3 of 11 November 2026, addition 13, on Lawal's locked direction of
 * 00:56: "Report qualified traffic, activated organisers, repeat organisers, paid tickets, actual fee revenue, net
 * contribution and acquisition costs. Distinguish real data from estimates."). Shown inside /admin/today, internal
 * only, each with the week before beside it, each labelled real or estimated and traced to the rows it is counted from.
 * Pure over the growth page's own rows (./weekly.ts), so both pages count the same orders and visits the same way.
 *
 * REVENUE TRUTH (Lawal's standing directive 2): gross ticket sales are not EventLinqs revenue, a press out to another
 * seller is not a sale, and contribution is reported as kept, never as sold. A paid order is a sold order (confirmed,
 * partly refunded or refunded, as the GMV screen counts it) with a total above zero; a free registration is not one.
 */

const SOLD = new Set(['confirmed', 'partially_refunded', 'refunded'])

export type Basis = 'real' | 'estimated'

export interface SixFigure {
  readonly key: 'activated' | 'repeat' | 'tickets' | 'contribution' | 'organic' | 'returning'
  readonly label: string
  readonly value: number | null
  /** How the value reads (money, two parts); the number when absent. */
  readonly display?: string
  readonly basis: Basis
  readonly source: string
}

const inWeek = (at: string, w: Week): boolean => at >= w.from && at < w.to
const money = (cents: number): string => `${cents < 0 ? '-' : ''}A$${(Math.abs(cents) / 100).toFixed(2)}`

/** The six numbers for one week, counted from the growth page's rows. Pure. */
export function sixNumbersFor(rows: Rows, w: Week): readonly SixFigure[] {
  const paid = rows.orders.filter((o) => SOLD.has(o.status) && o.totalCents > 0)
  const paidInWeek = paid.filter((o) => inWeek(o.createdAt, w))
  const paidBefore = paid.filter((o) => o.createdAt < w.from)

  const sellers = new Set(paidInWeek.map((o) => o.organisationId))
  const soldBefore = new Set(paidBefore.map((o) => o.organisationId))
  const activated = [...sellers].filter((org) => !soldBefore.has(org)).length

  // A repeat paid organiser sold paid tickets this week for an event, having sold paid tickets for a different event before.
  const eventsBefore = new Map<string, Set<string>>()
  for (const o of paidBefore) {
    if (o.eventId === null) continue
    const s = eventsBefore.get(o.organisationId) ?? new Set<string>()
    s.add(o.eventId)
    eventsBefore.set(o.organisationId, s)
  }
  const repeat = [...sellers].filter((org) =>
    paidInWeek.some((o) => o.organisationId === org && o.eventId !== null && [...(eventsBefore.get(org) ?? [])].some((e) => e !== o.eventId)),
  ).length

  const ticketKnown = paidInWeek.filter((o) => typeof o.ticketCount === 'number')
  const tickets = ticketKnown.reduce((n, o) => n + (o.ticketCount ?? 0), 0)
  const ticketsUnknown = paidInWeek.length - ticketKnown.length

  const recorded = paidInWeek.filter((o) => o.retainedCents !== null && o.processingCents !== null)
  const contribution = recorded.reduce((n, o) => n + (o.retainedCents ?? 0) - (o.processingCents ?? 0) - feeGivenBack(o), 0)
  const unrecorded = paidInWeek.length - recorded.length

  const organic = rows.visits.filter((v) => inWeek(v.at, w) && v.channel === 'organic-search').length
  const f = figuresFor(rows, w)

  return [
    { key: 'activated', label: 'New activated paid organisers', value: activated, basis: 'real',
      source: 'orders: organisations whose first paid order ever falls in the week' },
    { key: 'repeat', label: 'Repeat paid organisers', value: repeat, basis: 'real',
      source: 'orders: organisations selling paid tickets in the week for an event, having sold for a different event before' },
    { key: 'tickets', label: 'Paid tickets', value: tickets, basis: 'real',
      source: `tickets on the week's paid orders${ticketsUnknown ? `; ${ticketsUnknown} order(s) with no ticket count read, left out` : ''}` },
    { key: 'contribution', label: 'Net contribution', value: contribution, display: money(contribution), basis: 'estimated',
      source: `the fee kept on the week's paid orders, less Stripe's processing estimate and any fee given back on refunds (Stripe's figure is an estimate until its statement); no marketing spend is recorded, so none is taken off${unrecorded ? `; ${unrecorded} order(s) not recording both, left out` : ''}` },
    { key: 'organic', label: 'Organic search visits', value: organic, basis: 'real',
      source: 'event page views first reached from a search engine, one per visitor per event per day, crawlers refused (ledger page_view rows); Google\'s own counts wait on Search Console access' },
    { key: 'returning', label: 'Returning visitors and new subscribers', value: f.attention.returning + f.engagement.subscribers,
      display: `${f.attention.returning} returning, ${f.engagement.subscribers} subscribed`, basis: 'real',
      source: 'returning: event page visitors seen in the 90 days before the week; subscribed: email_subscribers confirmed in the week' },
  ]
}
