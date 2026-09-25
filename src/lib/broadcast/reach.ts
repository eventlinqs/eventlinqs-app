import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import type { ShareChannel } from '@/lib/broadcast/share-codes'
// ONE definition of a sale, shared with the attribution panel. See its header
// for the three that were live at once before this.
import { SOLD_STATUSES } from '@/lib/broadcast/sales-attribution'

/**
 * Reach panel v1 aggregates (SPEC section 2.5). Honest by construction:
 * every number is a measured share_link_events row. Views are event-page
 * views reached through tracked links (deduped per visitor per day), clicks
 * are short-link hits, conversions are confirmed orders attributed by the
 * last-touch share cookie, and tickets counts the tickets on those orders
 * (a READ-ONLY join to tickets; nothing here writes near money).
 *
 * Callers must pass the ownership gate (getOrganiserEvent) BEFORE calling:
 * this module reads with the service role.
 */

export interface ChannelReach {
  channel: ShareChannel
  views: number
  clicks: number
  conversions: number
  tickets: number
}

export interface ReachSummary {
  totals: { views: number; clicks: number; conversions: number; tickets: number }
  byChannel: ChannelReach[]
  linkCount: number
}

/**
 * EVERY ROW, AND A FAILURE THAT SAYS SO.
 *
 * WHAT WAS WRONG, and it was four reads in this function and four more in the
 * attribution beside it. Each was a bare `.select()` whose `error` was dropped
 * on the floor:
 *
 *     const { data: events } = await admin.from('share_link_events').select(...)
 *     const rows = (events ?? []) as ...
 *
 * `share_link_events` takes ONE ROW PER VIEW AND ONE PER CLICK, so it is the
 * fastest growing table behind this panel by a wide margin, and `share_links`
 * grows one row per ATTENDEE SHARE (AQ2, "the attendee is the channel"). Both
 * are read here with no bound. Supabase caps one response at 1,000 rows and the
 * cap is invisible: HTTP 200, `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19;
 * measured on this project as `Content-Range: 0-999/14364`).
 *
 * THE DIRECTION OF THE ERROR IS THE PART THAT MATTERS. This panel is the only
 * place the platform proves its own wedge to an organiser: that we brought them
 * demand. Truncation makes every number on it SMALLER than the truth, and the
 * `conversion` rows it drops are attributed SALES. The page then tells an
 * organiser their shares sold fewer tickets than they did, which is an argument
 * for leaving. And because `error` was discarded, a read that FAILED rendered a
 * reach of zero, which on this screen is indistinguishable from an event nobody
 * has shared.
 *
 * WHY THE `.in()` IS CHUNKED AND NOT JUST PAGED. The link ids are spelled into
 * the URL, and Supabase bounds the URL and headers together at 16 KB, naming
 * lengthy `in` clauses as the usual cause
 * (https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2,
 * fetched 2026-09-19). A UUID costs about 40 bytes once encoded, so roughly 400
 * share links is the break, and 400 attendee shares on one event is a good
 * night rather than an exotic case. `chunkInFilterValues` carries the
 * measurement.
 */
export async function fetchReachSummary(eventId: string): Promise<ReachSummary> {
  const admin = createAdminClient()

  const linkRows = await readEveryRow<{ id: string; channel: ShareChannel }>(
    'the tracked links for this event',
    (from, to) =>
      admin
        .from('share_links')
        .select('id, channel')
        .eq('event_id', eventId)
        .order('id', { ascending: true })
        .range(from, to),
  )

  if (linkRows.length === 0) {
    return {
      totals: { views: 0, clicks: 0, conversions: 0, tickets: 0 },
      byChannel: [],
      linkCount: 0,
    }
  }
  const channelByLink = new Map(linkRows.map((l) => [l.id, l.channel]))

  const rows: { link_id: string; kind: string; order_id: string | null }[] = []
  for (const chunk of chunkInFilterValues(linkRows.map((l) => l.id))) {
    rows.push(
      ...(await readEveryRow<{ link_id: string; kind: string; order_id: string | null }>(
        'the view, click and conversion events on those links',
        (from, to) =>
          admin
            .from('share_link_events')
            .select('link_id, kind, order_id')
            .in('link_id', chunk)
            .order('id', { ascending: true })
            .range(from, to),
      )),
    )
  }

  const byChannel = new Map<ShareChannel, ChannelReach>()
  const ensure = (channel: ShareChannel): ChannelReach => {
    let entry = byChannel.get(channel)
    if (!entry) {
      entry = { channel, views: 0, clicks: 0, conversions: 0, tickets: 0 }
      byChannel.set(channel, entry)
    }
    return entry
  }

  const conversionOrderIdsByChannel = new Map<ShareChannel, string[]>()
  for (const row of rows) {
    const channel = channelByLink.get(row.link_id)
    if (!channel) continue
    const entry = ensure(channel)
    if (row.kind === 'view') entry.views += 1
    else if (row.kind === 'click') entry.clicks += 1
    else if (row.kind === 'conversion') {
      entry.conversions += 1
      if (row.order_id) {
        const list = conversionOrderIdsByChannel.get(channel) ?? []
        list.push(row.order_id)
        conversionOrderIdsByChannel.set(channel, list)
      }
    }
  }

  /*
   * Tickets per channel: a read-only count of tickets on the attributed orders.
   *
   * THE ORDERS ARE FILTERED TO SOLD ONES FIRST, using the SAME definition the
   * attribution panel uses. This counted tickets on every attributed order
   * regardless of status, so a pending or cancelled order contributed tickets
   * here while contributing nothing to the sales total on the panel above it.
   * The two numbers then disagreed on the same screen, and the smaller one
   * looked like under-attribution rather than a different question.
   */
  const attributedOrderIds = [...conversionOrderIdsByChannel.values()].flat()
  let allOrderIds: string[] = []
  if (attributedOrderIds.length > 0) {
    const soldOrders: { id: string; status: string }[] = []
    for (const chunk of chunkInFilterValues(attributedOrderIds)) {
      soldOrders.push(
        ...(await readEveryRow<{ id: string; status: string }>(
          'the orders those conversions point at',
          (from, to) =>
            admin
              .from('orders')
              .select('id, status')
              .in('id', chunk)
              .order('id', { ascending: true })
              .range(from, to),
        )),
      )
    }
    allOrderIds = soldOrders
      .filter(o => (SOLD_STATUSES as readonly string[]).includes(o.status))
      .map(o => o.id)
  }
  if (allOrderIds.length > 0) {
    const tickets: { order_id: string }[] = []
    for (const chunk of chunkInFilterValues(allOrderIds)) {
      tickets.push(
        ...(await readEveryRow<{ order_id: string }>(
          'the tickets on those attributed orders',
          (from, to) =>
            admin
              .from('tickets')
              .select('id, order_id')
              .in('order_id', chunk)
              .order('id', { ascending: true })
              .range(from, to),
        )),
      )
    }
    const ticketCountByOrder = new Map<string, number>()
    for (const t of tickets) {
      ticketCountByOrder.set(t.order_id, (ticketCountByOrder.get(t.order_id) ?? 0) + 1)
    }
    for (const [channel, orderIds] of conversionOrderIdsByChannel) {
      const entry = ensure(channel)
      entry.tickets = orderIds.reduce((sum, id) => sum + (ticketCountByOrder.get(id) ?? 0), 0)
    }
  }

  const channels = [...byChannel.values()].sort((a, b) => b.tickets - a.tickets || b.clicks - a.clicks)
  const totals = channels.reduce(
    (acc, c) => ({
      views: acc.views + c.views,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
      tickets: acc.tickets + c.tickets,
    }),
    { views: 0, clicks: 0, conversions: 0, tickets: 0 },
  )

  return { totals, byChannel: channels, linkCount: linkRows.length }
}
