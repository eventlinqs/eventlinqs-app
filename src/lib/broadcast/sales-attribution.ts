import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { countOrRaise } from '@/lib/supabase/count-or-raise'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
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
  /**
   * TRUE when this event sells its tickets on another platform, so there is no
   * sold-ticket answer to give and none is attempted.
   *
   * NOT the same as an event with zero sales, and the difference is the whole
   * point. Zero sales means we looked and found none. This means we CANNOT look:
   * the orders are on somebody else's ledger. Every bucket is empty, every
   * percentage is zero, and `reconciles` is true because zero does tie out to
   * zero. A caller that renders a percentage here would be inventing one, so the
   * reach panel checks this flag first and shows clicks only.
   */
  externallyTicketed: boolean
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

  /*
   * 0. IS THIS EVENT OURS TO COUNT? Founder ruling 15 August 2026,
   *    non-negotiable 2.
   *
   * An externally ticketed event is EXCLUDED from the sold-ticket buckets
   * entirely rather than falling into `untracked`. That distinction is the whole
   * requirement and it is not cosmetic: `untracked` means "a sale happened here
   * and no tracked link was involved", which is a real, countable thing. An
   * external event has no sale here at all. Letting it land in `untracked` would
   * put a zero in a bucket whose name asserts we looked at a ledger, and the
   * reach panel would then render "0% of sales came from your sharing" about an
   * event whose sales we cannot see. That is the false claim this ruling exists
   * to prevent.
   *
   * So it returns early with empty buckets and the flag set. `reconciles` is
   * true, honestly: zero ties out to zero.
   */
  /*
   * AND IT THROWS RATHER THAN GUESSING, because of which way the guess falls.
   *
   * This was `const { data: eventRow } = await ...`, error discarded. A read
   * that FAILED left `eventRow` undefined, which is spelled identically to "no
   * external ticket url", so the module carried on and reported an attribution
   * split for an event whose sales are on somebody else's ledger. That is the
   * exact claim non-negotiable 2 exists to forbid, arrived at through an
   * outage rather than through a decision. The safe direction here is to refuse.
   */
  const eventRow = await readOrThrow('sales-attribution:event', () =>
    admin.from('events').select('external_ticket_url').eq('id', eventId).maybeSingle(),
  )

  const externalUrl = eventRow?.external_ticket_url
  if (typeof externalUrl === 'string' && externalUrl.trim().length > 0) {
    return {
      eventId,
      totals: emptyBucket(),
      buckets: { organiserShared: emptyBucket(), platformChannel: emptyBucket(), untracked: emptyBucket() },
      byChannel: [],
      organiserSharedPercent: 0,
      platformAttributablePercent: 0,
      reconciles: true,
      discrepancy: { orders: 0, tickets: 0 },
      multiplyAttributedOrders: 0,
      refundedOrders: 0,
      externallyTicketed: true,
    }
  }

  /*
   * 1. THE LEDGER. Every sold order for this event. This is the denominator.
   *
   * EVERY, NOT THE FIRST THOUSAND. This was `.select().eq('event_id', ...)` with
   * no bound and no `error` check, and it is the denominator of every percentage
   * on the panel. Supabase stops at 1,000 rows in silence
   * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
   * so a thousand-order event reported a share-of-sales computed against the
   * wrong total, and a read that FAILED reported an event that had sold nothing.
   * A sold-out show and an outage rendered the same screen.
   */
  const allOrders = await readEveryRow<{ id: string; status: string; total_cents: number | string }>(
    'the order ledger for this event',
    (from, to) =>
      admin
        .from('orders')
        .select('id, status, total_cents')
        .eq('event_id', eventId)
        .order('id', { ascending: true })
        .range(from, to),
  )
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
      externallyTicketed: false,
    }
  }

  const soldIds = sold.map(o => o.id)

  /*
   * 2. Tickets per order, counted from the ticket rows themselves.
   *
   * CHUNKED AS WELL AS PAGED. `soldIds` is spelled into the URL, and Supabase
   * bounds the URL and headers together at 16 KB, naming lengthy `in` clauses as
   * the usual cause
   * (https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2,
   * fetched 2026-09-19). About 400 order ids is the break, which a single busy
   * event passes, and the failure arrives as a discarded error and a ticket
   * count of zero for every order at once.
   */
  const ticketRows: { order_id: string }[] = []
  for (const chunk of chunkInFilterValues(soldIds)) {
    ticketRows.push(
      ...(await readEveryRow<{ order_id: string }>('the tickets on this event’s sold orders', (from, to) =>
        admin
          .from('tickets')
          .select('id, order_id')
          .in('order_id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
      )),
    )
  }
  const ticketsByOrder = new Map<string, number>()
  for (const t of ticketRows) {
    ticketsByOrder.set(t.order_id, (ticketsByOrder.get(t.order_id) ?? 0) + 1)
  }

  // 3. Attribution: which sold order came through which tracked link.
  const links = await readEveryRow<{ id: string; channel: ShareChannel }>(
    'the tracked links for this event',
    (from, to) =>
      admin
        .from('share_links')
        .select('id, channel')
        .eq('event_id', eventId)
        .order('id', { ascending: true })
        .range(from, to),
  )
  const channelByLink = new Map(links.map(l => [l.id, l.channel]))

  const channelByOrder = new Map<string, ShareChannel>()
  let multiplyAttributedOrders = 0

  if (links.length > 0) {
    /*
     * THE CONVERSION ROWS, ALL OF THEM. This read fed the first-touch reducer
     * below, which keeps the EARLIEST row per order, and the 1,000-row ceiling
     * applied to it does not under-count: it DELETES attributions. An order
     * whose conversion row fell past the ceiling stops being
     * `organiserShared` and silently becomes `untracked`, so the organiser is
     * told their own sharing sold fewer tickets than it did. That is the one
     * error on this panel that argues for leaving the platform.
     */
    const convRows: { link_id: string; order_id: string | null; occurred_at: string }[] = []
    for (const chunk of chunkInFilterValues(links.map(l => l.id))) {
      convRows.push(
        ...(await readEveryRow<{ link_id: string; order_id: string | null; occurred_at: string }>(
          'the conversion events on this event’s tracked links',
          (from, to) =>
            admin
              .from('share_link_events')
              .select('link_id, order_id, occurred_at')
              .eq('kind', 'conversion')
              .in('link_id', chunk)
              .order('id', { ascending: true })
              .range(from, to),
        )),
      )
    }

    /*
     * ONE ATTRIBUTION PER ORDER, chosen DETERMINISTICALLY. Measured on TEST this
     * is zero today, and the invariant is asserted rather than assumed: if an
     * order ever carries two conversion rows, taking both would count the sale
     * twice and the reconciliation below would fail loudly. The EARLIEST row
     * wins, which is first-touch, and the count of affected orders is reported
     * so it can never be silent.
     */
    const seenAt = new Map<string, string>()
    for (const row of convRows) {
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

  /*
   * 5. THE RECONCILIATION, AGAINST A TOTAL THIS FUNCTION DID NOT COUNT ITSELF.
   *
   * WHAT THIS CHECK USED TO BE, and it is the reason this item exists. It read:
   *
   *     const bucketOrders = organiserShared.orders + platformChannel.orders
   *                        + untracked.orders
   *     discrepancy = { orders: totals.orders - bucketOrders, ... }
   *
   * `totals.orders` is incremented once per iteration of the loop above, and
   * every iteration also calls `add()` exactly once, which increments exactly
   * one bucket's `orders`. The two sides were therefore the SAME NUMBER counted
   * twice, by construction, for every possible input. `discrepancy` was always
   * {0, 0} and `reconciles` was always `true`. The same held for tickets: both
   * sides add the same local `tickets` value in the same iteration.
   *
   * It could not fail, and the page renders a percentage only when it passes,
   * with a comment promising "REFUSE RATHER THAN GUESS ... Showing one anyway is
   * how a wrong number ends up in a pitch deck". The test file's own header
   * claimed "`reconciles` goes FALSE the moment it does not" and carried seven
   * assertions that it is true and none that it is ever false, because none
   * could be written.
   *
   * SO IT NOW COMPARES AGAINST THE SERVER'S OWN COUNT. `count: 'exact',
   * head: true` is computed by Postgres over the whole table and is not subject
   * to the row ceiling that truncates the paged reads, so it is a genuinely
   * INDEPENDENT measurement of the same quantity. If a read came back short, or
   * an order arrived between the two queries, the two disagree and the panel
   * refuses the percentage, which is exactly what it already promises to do.
   *
   * IT IS COUNTED WITH THE SAME FILTER, spelled from the same `SOLD_STATUSES`
   * constant, so the only thing that can differ between the two is completeness.
   */
  const ledgerSoldOrders = countOrRaise(
    'the sold orders on this event, counted by the server',
    await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .in('status', SOLD_STATUSES as unknown as string[]),
  )

  /*
   * THE TICKETS SIDE MATTERS MORE THAN THE ORDERS SIDE, because the headline
   * percentage is computed from tickets and not from orders. Counted the same
   * way and chunked for the same 16 KB reason as the row read above; each
   * chunk's count is computed by Postgres over the table rather than by
   * counting rows that arrived, which is what makes it an independent answer to
   * the same question rather than a restatement of the first one.
   */
  let ledgerSoldTickets = 0
  for (const chunk of chunkInFilterValues(soldIds)) {
    ledgerSoldTickets += countOrRaise(
      'the tickets on this event’s sold orders, counted by the server',
      await admin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('order_id', chunk),
    )
  }

  const bucketOrders =
    buckets.organiserShared.orders + buckets.platformChannel.orders + buckets.untracked.orders
  const bucketTickets =
    buckets.organiserShared.tickets + buckets.platformChannel.tickets + buckets.untracked.tickets
  const discrepancy = {
    orders: ledgerSoldOrders - bucketOrders,
    tickets: ledgerSoldTickets - bucketTickets,
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
    // Reached only when the event sells here: the external case returned above.
    externallyTicketed: false,
  }
}
