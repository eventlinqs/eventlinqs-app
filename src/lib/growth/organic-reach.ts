import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import {
  summariseTraffic,
  type SaleRow,
  type TrafficSummary,
  type TrafficWindow,
  type VisitRow,
} from './organic-reach-math'
import { channelForVisit, type TrafficChannel } from './traffic-channel'

/**
 * READING THE LEDGER FOR WHERE THE TRAFFIC AND THE ORDERS CAME FROM.
 *
 * Close-out AQ3, lane B's half. Everything here is a READ. Nothing writes, and
 * nothing computes a figure: the arithmetic is ./organic-reach-math.ts, which is
 * pure, so every number on the surface can be tested without a database.
 *
 * WHY THE LEDGER AND NOT AN ANALYTICS TOOL. The platform already records, on
 * every event page, one row per visitor per event per day carrying the visitor's
 * FIRST-TOUCH referrer and campaign labels, and it copies the same fields onto
 * the sale row when the order confirms. So the answer to "did free search
 * traffic produce orders" is already in `ledger_entries` and belongs to the
 * platform, which is exactly what AQ3 means by traffic that belongs to us.
 * Nothing here depends on consent, a third-party script, or a cookie banner:
 * the referring host is not identifying and is recorded whatever the visitor
 * told the consent banner.
 *
 * ORDERS ARE COUNTED ONCE. The ledger writes one sale row per order ITEM, keyed
 * `sale:<order item id>`, and carries no order id of its own. Counting rows
 * would inflate every channel by however many tiers people happen to buy, so the
 * item ids are resolved to their orders through `order_items`. An item whose
 * order cannot be resolved is counted as its own order AND reported, rather than
 * dropped, because a silently missing order is the failure this platform has
 * already been bitten by twice.
 */

export type ReferringHost = {
  host: string
  visits: number
  channel: TrafficChannel
}

export type TrafficReadResult = {
  summary: TrafficSummary
  /** Where the window starts, or null for the whole ledger. */
  since: string | null
  /** The busiest referring hosts in the window, with the channel each fell into. */
  topHosts: ReferringHost[]
  /**
   * Sale rows whose order could not be resolved through order_items. Always
   * zero in a healthy ledger; shown on the surface when it is not, because a
   * number that quietly drifts is worse than one that says it is unsure.
   */
  unresolvedSaleRows: number
}

type LedgerVisitRow = {
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

type LedgerSaleRow = LedgerVisitRow & {
  occurrence_key: string
  quantity: number | null
}

function toChannelInput(row: LedgerVisitRow): VisitRow {
  return {
    referrer: row.referrer,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
  }
}

/** `sale:<order item id>` is the only shape the adapter writes. */
function orderItemIdOf(occurrenceKey: string): string | null {
  return occurrenceKey.startsWith('sale:') ? occurrenceKey.slice('sale:'.length) : null
}

/** PostgREST `in` lists are a URL, so they are asked for in bounded chunks. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function resolveOrderIds(itemIds: readonly string[]): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const byItem = new Map<string, string>()
  for (const group of chunk(itemIds, 200)) {
    const rows = await readEveryRow<{ id: string; order_id: string | null }>(
      'the orders behind the ledger sale rows',
      (from, to) =>
        admin
          .from('order_items')
          .select('id, order_id')
          .in('id', group)
          // A stable total order, because a ranged read without one may return a
          // row twice and skip another. scripts/guards/no-silent-row-ceiling.mjs
          // fails the build when this is missing.
          .order('id', { ascending: true })
          .range(from, to),
    )
    for (const row of rows) if (row.order_id) byItem.set(row.id, row.order_id)
  }
  return byItem
}

/**
 * The start of an all-time window.
 *
 * A BOUND RATHER THAN A MISSING CLAUSE, and the reason is a guard rather than
 * taste. Writing the window as `let query = ...; if (since) query = query.gte()`
 * splits the chain across two statements, and `no-silent-row-ceiling` reads
 * chains: it saw a read of `ledger_entries` with no `.range()` anywhere near it
 * and refused the build, correctly, because from where it stands that is
 * exactly what an unbounded read looks like. One expression is both easier to
 * judge and one branch shorter.
 */
const BEFORE_ANY_LEDGER_ROW = '1970-01-01T00:00:00.000Z'

export async function readTrafficSummary(days: TrafficWindow): Promise<TrafficReadResult> {
  const admin = createAdminClient()
  const windowed = days > 0
  const since = windowed ? new Date(Date.now() - days * 86400_000).toISOString() : BEFORE_ANY_LEDGER_ROW

  const [visitRows, saleRows] = await Promise.all([
    readEveryRow<LedgerVisitRow>('the event page visits in the ledger', (from, to) =>
      admin
        .from('ledger_entries')
        .select('referrer, utm_source, utm_medium, utm_campaign')
        .eq('kind', 'demand')
        .in('demand_action', ['page_view', 'sold_out_view'])
        .gte('occurred_at', since)
        // A stable total order: a ranged read without one may return a row twice
        // and skip another. scripts/guards/no-silent-row-ceiling.mjs blocks it.
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readEveryRow<LedgerSaleRow>('the sales in the ledger', (from, to) =>
      admin
        .from('ledger_entries')
        .select('occurrence_key, quantity, referrer, utm_source, utm_medium, utm_campaign')
        .eq('kind', 'sale')
        .gte('occurred_at', since)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const itemIds = saleRows
    .map(row => orderItemIdOf(row.occurrence_key))
    .filter((id): id is string => Boolean(id))
  const orderByItem = itemIds.length > 0 ? await resolveOrderIds(itemIds) : new Map<string, string>()

  let unresolvedSaleRows = 0
  const sales: SaleRow[] = saleRows.map(row => {
    const itemId = orderItemIdOf(row.occurrence_key)
    const orderId = itemId ? orderByItem.get(itemId) : undefined
    if (!orderId) unresolvedSaleRows += 1
    return {
      ...toChannelInput(row),
      quantity: row.quantity ?? 0,
      orderKey: orderId ?? row.occurrence_key,
    }
  })

  const visits = visitRows.map(toChannelInput)

  // The busiest referring hosts, counted off the rows already in memory so this
  // costs no second query. Hosts only: a campaign label with no referring site
  // has no host to name and is already counted in its channel.
  const hostCounts = new Map<string, number>()
  for (const row of visitRows) {
    const host = (row.referrer ?? '').trim().toLowerCase()
    if (!host) continue
    hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1)
  }
  const topHosts: ReferringHost[] = [...hostCounts.entries()]
    .map(([host, count]) => ({
      host,
      visits: count,
      channel: channelForVisit({ referrer: host, utmSource: null, utmMedium: null, utmCampaign: null }),
    }))
    // Count first, then host, so the order is total rather than "whatever the
    // map iterated" when two hosts tie.
    .sort((a, b) => b.visits - a.visits || a.host.localeCompare(b.host))
    .slice(0, 8)

  return {
    summary: summariseTraffic(visits, sales),
    // NULL FOR ALL TIME, so the surface says "the whole ledger" rather than
    // printing 1 Jan 1970 as though somebody had chosen it.
    since: windowed ? since : null,
    topHosts,
    unresolvedSaleRows,
  }
}
