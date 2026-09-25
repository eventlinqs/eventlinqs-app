import {
  TRAFFIC_CHANNELS,
  channelForVisit,
  type ChannelInput,
  type TrafficChannel,
} from './traffic-channel'

/**
 * THE ARITHMETIC BEHIND "IS THE FREE TRAFFIC WORTH ANYTHING", KEPT PURE SO IT
 * CAN BE TESTED WITHOUT A DATABASE.
 *
 * Close-out AQ3 asks for organic traffic to event pages and the orders
 * attributed to it, reported SEPARATELY FROM DIRECT. This file does the
 * counting; ./organic-reach.ts does the reading; ./traffic-channel.ts decides
 * which channel a row belongs to, against Google's published rules.
 *
 * WHAT A SESSION IS HERE, stated because the word is used loosely everywhere
 * else. One row is one visitor, one event page, one day: that is the shape the
 * demand beacon writes (`src/app/api/ledger/demand/route.ts`, deduped by
 * occurrence key), so a person who refreshes an event page nine times is one.
 * It is therefore a DAILY REACH count rather than a session count in the
 * analytics sense, and the surface says so in those words rather than borrowing
 * a word that means something else in another tool.
 *
 * WHY THERE IS NO MONEY COLUMN, decided against writing one rather than
 * omitted. Two facts about the ledger, both checked rather than assumed:
 *
 *   `ledger_entries` HAS NO CURRENCY. It carries `amount_cents` and nothing
 *   that says of what, so rendering it with a dollar sign would be this file
 *   asserting AUD on rows that never said so.
 *
 *   A REFUND CANNOT BE ASSIGNED TO A CHANNEL. `recordRefundImpl` writes no
 *   referrer and no campaign label, so a money column here could only ever be
 *   gross, sitting on a page whose whole subject is attribution, looking netted.
 *
 * Tickets is the volume this can prove, and it is what AQ3 asks for: the orders
 * attributed to the traffic, not the revenue.
 */

/** One event-page visit, as the ledger stored it. */
export type VisitRow = ChannelInput

/** One sale row: an order item, its quantity and what it took. */
export type SaleRow = ChannelInput & {
  quantity: number
  /** The order the row belongs to, so orders are counted once, not per item. */
  orderKey: string
}

export type ChannelTotals = {
  channel: TrafficChannel
  /** Visitor-days on event pages. */
  visits: number
  /** Distinct orders. */
  orders: number
  /** Tickets across those orders. */
  tickets: number
  /**
   * Orders per hundred event-page visits, or null when there were no visits.
   *
   * NULL RATHER THAN ZERO, always. "Nobody arrived" and "people arrived and
   * nobody bought" are different facts and the second one is the only one worth
   * acting on, so they never collapse into the same 0.
   */
  ordersPerHundredVisits: number | null
}

export type TrafficSummary = {
  /** Every channel, in reading order, including the ones with nothing in them. */
  byChannel: ChannelTotals[]
  /** The ones with any activity at all, same order. */
  active: ChannelTotals[]
  /** The ones with none, so the surface can name them in one line. */
  silent: TrafficChannel[]
  totals: Omit<ChannelTotals, 'channel'>
  /** The two AQ3 names in the same breath, so neither can be read for the other. */
  organicSearch: ChannelTotals
  direct: ChannelTotals
}

function empty(channel: TrafficChannel): ChannelTotals {
  return { channel, visits: 0, orders: 0, tickets: 0, ordersPerHundredVisits: null }
}

function rate(orders: number, visits: number): number | null {
  if (visits <= 0) return null
  return Math.round((orders / visits) * 1000) / 10
}

/**
 * One pass over the visits and one over the sales.
 *
 * Orders are counted by DISTINCT ORDER KEY, because the ledger writes one sale
 * row per order ITEM: an order for a general admission and an early bird is two
 * rows and one order. Counting rows would have inflated every channel by the
 * number of tiers people happen to buy, which is a number that has nothing to
 * do with where they came from.
 */
export function summariseTraffic(visits: readonly VisitRow[], sales: readonly SaleRow[]): TrafficSummary {
  const totals = new Map<TrafficChannel, ChannelTotals>()
  for (const channel of TRAFFIC_CHANNELS) totals.set(channel, empty(channel))

  for (const visit of visits) {
    const row = totals.get(channelForVisit(visit))
    if (row) row.visits += 1
  }

  const ordersSeen = new Map<TrafficChannel, Set<string>>()
  for (const sale of sales) {
    const channel = channelForVisit(sale)
    const row = totals.get(channel)
    if (!row) continue
    row.tickets += sale.quantity
    const seen = ordersSeen.get(channel) ?? new Set<string>()
    seen.add(sale.orderKey)
    ordersSeen.set(channel, seen)
  }
  for (const [channel, seen] of ordersSeen) {
    const row = totals.get(channel)
    if (row) row.orders = seen.size
  }

  const byChannel = TRAFFIC_CHANNELS.map(channel => {
    const row = totals.get(channel) as ChannelTotals
    return { ...row, ordersPerHundredVisits: rate(row.orders, row.visits) }
  })

  const sum = byChannel.reduce(
    (acc, row) => ({
      visits: acc.visits + row.visits,
      orders: acc.orders + row.orders,
      tickets: acc.tickets + row.tickets,
    }),
    { visits: 0, orders: 0, tickets: 0 },
  )

  const has = (row: ChannelTotals) => row.visits > 0 || row.orders > 0 || row.tickets > 0

  return {
    byChannel,
    active: byChannel.filter(has),
    silent: byChannel.filter(row => !has(row)).map(row => row.channel),
    totals: { ...sum, ordersPerHundredVisits: rate(sum.orders, sum.visits) },
    organicSearch: byChannel.find(row => row.channel === 'organic-search') as ChannelTotals,
    direct: byChannel.find(row => row.channel === 'direct') as ChannelTotals,
  }
}

/** The windows the surface offers. Days, or the whole ledger. */
export const TRAFFIC_WINDOWS = [7, 30, 90, 0] as const
export type TrafficWindow = (typeof TRAFFIC_WINDOWS)[number]

export function windowLabel(days: TrafficWindow): string {
  return days === 0 ? 'All time' : `Last ${days} days`
}

/** A window from the query string, falling back to the default rather than throwing. */
export function parseWindow(raw: string | null | undefined): TrafficWindow {
  const value = Number.parseInt((raw ?? '').trim(), 10)
  return (TRAFFIC_WINDOWS as readonly number[]).includes(value) ? (value as TrafficWindow) : 30
}
