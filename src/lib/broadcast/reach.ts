import { createAdminClient } from '@/lib/supabase/admin'
import type { ShareChannel } from '@/lib/broadcast/share-codes'

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

export async function fetchReachSummary(eventId: string): Promise<ReachSummary> {
  const admin = createAdminClient()

  const { data: links } = await admin
    .from('share_links')
    .select('id, channel')
    .eq('event_id', eventId)

  const linkRows = (links ?? []) as { id: string; channel: ShareChannel }[]
  if (linkRows.length === 0) {
    return {
      totals: { views: 0, clicks: 0, conversions: 0, tickets: 0 },
      byChannel: [],
      linkCount: 0,
    }
  }
  const channelByLink = new Map(linkRows.map((l) => [l.id, l.channel]))

  const { data: events } = await admin
    .from('share_link_events')
    .select('link_id, kind, order_id')
    .in('link_id', linkRows.map((l) => l.id))

  const rows = (events ?? []) as { link_id: string; kind: string; order_id: string | null }[]

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

  // Tickets per channel: a read-only count of tickets on the attributed
  // orders. One query for all channels, grouped in memory.
  const allOrderIds = [...conversionOrderIdsByChannel.values()].flat()
  if (allOrderIds.length > 0) {
    const { data: tickets } = await admin
      .from('tickets')
      .select('order_id')
      .in('order_id', allOrderIds)
    const ticketCountByOrder = new Map<string, number>()
    for (const t of (tickets ?? []) as { order_id: string }[]) {
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
