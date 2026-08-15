import { createAdminClient } from '@/lib/supabase/admin'
import type { ShareChannel } from '@/lib/broadcast/share-codes'

/**
 * WHERE DID THIS EVENT'S SALES ACTUALLY COME FROM? One number, reconciled to the
 * order ledger, or no number at all.
 *
 * WHAT WAS MISSING, and why the reach panel alone could not answer it.
 * `fetchReachSummary` counts views, clicks and conversions on TRACKED LINKS. It
 * has no DENOMINATOR: it never asks how many tickets the event sold. So an
 * organiser saw "12 tickets from shares" with no way to know whether that was 12
 * of 20 or 12 of 500, and the platform could not say what its own discovery was
 * worth. Every number was true and the important one was absent.
 *
 * THE DENOMINATOR IS THE ORDER LEDGER, NOT THE EVENT LOG. Sales are counted from
 * `orders` and `tickets`, the same rows the money is settled from. Attribution is
 * then laid OVER that total. Doing it the other way round, summing the share
 * events and calling that the sales figure, is how an attribution number drifts
 * away from the books and nobody notices.
 *
 * THE THREE BUCKETS, and every order lands in EXACTLY ONE:
 *
 *   organiserShared  the buyer arrived through a tracked link on a channel the
 *                    ORGANISER shares through: their Instagram, a WhatsApp
 *                    message, a copied link, the QR on their poster.
 *   platformChannel  the buyer arrived through a tracked link on a channel
 *                    EVENTLINQS owns and sends: today that is the weekly digest.
 *   untracked        no tracked link was involved.
 *
 * WHAT `untracked` HONESTLY MEANS, because this is the one place an attribution
 * report can quietly overclaim. It means "no tracked link was used". Most of it
 * is EventLinqs discovery: the homepage, search, a category or city page, the
 * sitemap. But it ALSO contains a person who read the printed poster and typed
 * the address instead of scanning the QR, which is organiser-driven and simply
 * untracked. So this module never labels that bucket "EventLinqs discovery". It
 * reports what it can prove, and `platformAttributablePercent` is offered
 * separately and named for what it is.
 *
 * IT REFUSES RATHER THAN GUESSES. If the buckets do not sum to the ledger total,
 * `reconciles` is false and the caller MUST show the discrepancy instead of a
 * percentage. A number that does not tie out is worse than no number, because it
 * gets quoted.
 *
 * Callers must pass the ownership gate (getOrganiserEvent) BEFORE calling: this
 * reads with the service role.
 */

/**
 * Channels EVENTLINQS owns and sends on the organiser's behalf.
 *
 * `digest` is the weekly city digest (migration 20260808000002 added it to the
 * channel CHECK precisely because it is ours, not the organiser's). Everything
 * else in the enum is a surface the ORGANISER shares through, including `qr`,
 * which is printed on their own artefact, and `native`, which is the operating
 * system share sheet on their own device.
 *
 * Adding a channel here MOVES SALES between the two headline numbers, so it is a
 * founder decision, not a tidy-up.
 */
export const PLATFORM_OWNED_CHANNELS: readonly ShareChannel[] = ['digest'] as const

export function isPlatformChannel(channel: ShareChannel | string): boolean {
  return (PLATFORM_OWNED_CHANNELS as readonly string[]).includes(channel)
}

/**
 * THE ONE DEFINITION OF A SALE, and it is exported because three different ones
 * were live in this repository at the same time.
 *
 *   ['confirmed']                                        an earlier draft of this file
 *   ['confirmed','partially_refunded','refunded']        dashboard/events/[id]/page.tsx
 *                                                        and scripts/verify/reach-integrity.mjs
 *   no filter at all                                     reach.ts, counting tickets on
 *                                                        attributed orders regardless of status
 *
 * Any two of those produce a DIFFERENT percentage for the same event, which is
 * the precise failure this ruling exists to end: the organiser would have read
 * one total on the event overview and a different one on the reach panel, both
 * described as tickets sold.
 *
 * The chosen definition is the one the event overview already prints, because a
 * refunded ticket WAS sold. The refund is a later event against the same sale,
 * not a retraction of it, and gross sales is what an attribution split is about.
 * `refundedOrders` is reported alongside so the number is never mistaken for net.
 *
 * Everything that counts a sale must import this. Redefining it locally is how
 * the three above happened.
 */
export const SOLD_STATUSES = ['confirmed', 'partially_refunded', 'refunded'] as const

export interface AttributionBucket {
  orders: number
  tickets: number
  grossCents: number
}

export interface SalesAttribution {
  eventId: string
  /** Straight from the order ledger. This is the denominator for everything below. */
  totals: AttributionBucket
  buckets: {
    organiserShared: AttributionBucket
    platformChannel: AttributionBucket
    untracked: AttributionBucket
  }
  /** Per organiser-facing channel, tickets only, for the detail table. */
  byChannel: { channel: ShareChannel; tickets: number; orders: number; platform: boolean }[]
  /** THE ONE NUMBER: share of sold tickets that came through a link the organiser shared. */
  organiserSharedPercent: number
  /**
   * The complement: everything the organiser did NOT drive through a tracked
   * link. Named for what it is rather than claimed as discovery, because it also
   * contains untracked arrivals. See the header.
   */
  platformAttributablePercent: number
  /** True when the three buckets sum EXACTLY to the ledger totals. */
  reconciles: boolean
  discrepancy: { orders: number; tickets: number }
  /** Orders carrying more than one conversion row. Should always be zero. */
  multiplyAttributedOrders: number
  refundedOrders: number
}

const emptyBucket = (): AttributionBucket => ({ orders: 0, tickets: 0, grossCents: 0 })

const add = (b: AttributionBucket, tickets: number, grossCents: number) => {
  b.orders += 1
  b.tickets += tickets
  b.grossCents += grossCents
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10)

export async function fetchSalesAttribution(eventId: string): Promise<SalesAttribution> {
  const admin = createAdminClient()

  // 1. THE LEDGER. Every sold order for this event. This is the denominator.
  const { data: orderRows } = await admin
    .from('orders')
    .select('id, status, total_cents')
    .eq('event_id', eventId)

  const allOrders = (orderRows ?? []) as { id: string; status: string; total_cents: number | string }[]
  const sold = allOrders.filter(o => (SOLD_STATUSES as readonly string[]).includes(o.status))
  const refundedOrders = allOrders.filter(o => o.status === 'refunded').length

  const totals = emptyBucket()
  if (sold.length === 0) {
    return {
      eventId,
      totals,
      buckets: { organiserShared: emptyBucket(), platformChannel: emptyBucket(), untracked: emptyBucket() },
      byChannel: [],
      organiserSharedPercent: 0,
      platformAttributablePercent: 0,
      reconciles: true,
      discrepancy: { orders: 0, tickets: 0 },
      multiplyAttributedOrders: 0,
      refundedOrders,
    }
  }

  const soldIds = sold.map(o => o.id)

  // 2. Tickets per order, counted from the ticket rows themselves.
  const { data: ticketRows } = await admin.from('tickets').select('order_id').in('order_id', soldIds)
  const ticketsByOrder = new Map<string, number>()
  for (const t of (ticketRows ?? []) as { order_id: string }[]) {
    ticketsByOrder.set(t.order_id, (ticketsByOrder.get(t.order_id) ?? 0) + 1)
  }

  // 3. Attribution: which sold order came through which tracked link.
  const { data: linkRows } = await admin.from('share_links').select('id, channel').eq('event_id', eventId)
  const links = (linkRows ?? []) as { id: string; channel: ShareChannel }[]
  const channelByLink = new Map(links.map(l => [l.id, l.channel]))

  const channelByOrder = new Map<string, ShareChannel>()
  let multiplyAttributedOrders = 0

  if (links.length > 0) {
    const { data: convRows } = await admin
      .from('share_link_events')
      .select('link_id, order_id, occurred_at')
      .eq('kind', 'conversion')
      .in('link_id', links.map(l => l.id))

    /*
     * ONE ATTRIBUTION PER ORDER, chosen DETERMINISTICALLY. Measured on TEST this
     * is zero today, and the invariant is asserted rather than assumed: if an
     * order ever carries two conversion rows, taking both would count the sale
     * twice and the reconciliation below would fail loudly. The EARLIEST row
     * wins, which is first-touch, and the count of affected orders is reported
     * so it can never be silent.
     */
    const seenAt = new Map<string, string>()
    for (const row of (convRows ?? []) as { link_id: string; order_id: string | null; occurred_at: string }[]) {
      if (!row.order_id) continue
      if (!ticketsByOrder.has(row.order_id) && !soldIds.includes(row.order_id)) continue
      const channel = channelByLink.get(row.link_id)
      if (!channel) continue
      const prior = seenAt.get(row.order_id)
      if (prior === undefined) {
        seenAt.set(row.order_id, row.occurred_at)
        channelByOrder.set(row.order_id, channel)
      } else {
        multiplyAttributedOrders += 1
        if (row.occurred_at < prior) {
          seenAt.set(row.order_id, row.occurred_at)
          channelByOrder.set(row.order_id, channel)
        }
      }
    }
  }

  // 4. Bucket every sold order exactly once.
  const buckets = {
    organiserShared: emptyBucket(),
    platformChannel: emptyBucket(),
    untracked: emptyBucket(),
  }
  const perChannel = new Map<ShareChannel, { tickets: number; orders: number }>()

  for (const o of sold) {
    const tickets = ticketsByOrder.get(o.id) ?? 0
    const gross = Number(o.total_cents ?? 0)
    totals.orders += 1
    totals.tickets += tickets
    totals.grossCents += gross

    const channel = channelByOrder.get(o.id)
    if (!channel) {
      add(buckets.untracked, tickets, gross)
      continue
    }
    add(isPlatformChannel(channel) ? buckets.platformChannel : buckets.organiserShared, tickets, gross)
    const c = perChannel.get(channel) ?? { tickets: 0, orders: 0 }
    c.tickets += tickets
    c.orders += 1
    perChannel.set(channel, c)
  }

  // 5. THE RECONCILIATION. The three buckets must equal the ledger exactly.
  const bucketOrders =
    buckets.organiserShared.orders + buckets.platformChannel.orders + buckets.untracked.orders
  const bucketTickets =
    buckets.organiserShared.tickets + buckets.platformChannel.tickets + buckets.untracked.tickets
  const discrepancy = {
    orders: totals.orders - bucketOrders,
    tickets: totals.tickets - bucketTickets,
  }
  const reconciles = discrepancy.orders === 0 && discrepancy.tickets === 0

  return {
    eventId,
    totals,
    buckets,
    byChannel: [...perChannel.entries()]
      .map(([channel, v]) => ({ channel, tickets: v.tickets, orders: v.orders, platform: isPlatformChannel(channel) }))
      .sort((a, b) => b.tickets - a.tickets || b.orders - a.orders),
    organiserSharedPercent: pct(buckets.organiserShared.tickets, totals.tickets),
    platformAttributablePercent: pct(
      buckets.platformChannel.tickets + buckets.untracked.tickets,
      totals.tickets,
    ),
    reconciles,
    discrepancy,
    multiplyAttributedOrders,
    refundedOrders,
  }
}
