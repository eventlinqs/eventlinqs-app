import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { fetchSalesAttribution } from '@/lib/broadcast/sales-attribution'
import {
  buildReferralCoefficient,
  type ReferralCoefficientReport,
} from './referral-coefficient-math'

/**
 * THE REFERRAL COEFFICIENT FOR ONE EVENT, READ FROM THE ORDER LEDGER.
 *
 * Close-out AQ2: "the referral coefficient computed and reported per event".
 *
 * THE DENOMINATOR IS NOT COUNTED HERE, and that is deliberate.
 * fetchSalesAttribution already counts sold orders from `orders` and `tickets`,
 * the same rows the money settles from, and its own header says why: summing
 * the share events and calling that the sales figure is how an attribution
 * number drifts away from the books with nobody noticing. A second counter in
 * this file would be exactly that mistake with a different name, so the total
 * comes from there and this module only adds the numerator.
 *
 * WHAT "FROM A BUYER" CAN AND CANNOT BE PROVED TO MEAN.
 *
 *   PROVABLE      the share link carries a `created_by`, and that person holds
 *                 a ticket to this event. Somebody who came bought a ticket and
 *                 brought somebody else. This is the coefficient.
 *   NOT PROVABLE  the link carries no `created_by`. A guest buyer sharing from
 *                 their confirmation page looks identical to the organiser
 *                 sharing their own link, because neither was signed in when
 *                 the link was minted.
 *
 * So the unknown sharers are counted, reported, and kept OUT of the
 * coefficient, with an upper bound offered separately and named for what it is.
 * Folding them in would inflate the one number a decision to invest in referral
 * would be made from.
 */

export interface EventReferralCoefficient extends ReferralCoefficientReport {
  eventId: string
  /** False when the sold totals could not be reconciled, so nothing is claimed. */
  reconciles: boolean
  /** True when the event sells elsewhere, so there is no ledger to read. */
  externallyTicketed: boolean
}

export async function fetchReferralCoefficient(eventId: string): Promise<EventReferralCoefficient> {
  const admin = createAdminClient()
  const sales = await fetchSalesAttribution(eventId)

  const empty = {
    ...buildReferralCoefficient({ soldOrders: 0, attributedToAShareLink: 0, fromAKnownBuyer: 0 }),
    eventId,
    reconciles: sales.reconciles,
    externallyTicketed: sales.externallyTicketed,
  }
  if (sales.externallyTicketed || sales.totals.orders === 0) return empty

  /*
   * Every tracked link for this event, with who made it. Paged, because a busy
   * event mints one link per channel per sharer and the thousand-row ceiling is
   * silent: it would quietly drop the newest links, which are exactly the ones
   * a coefficient measured today is about.
   */
  const links = await readEveryRow('share_links', (from, to) =>
    admin
      .from('share_links')
      .select('id, created_by')
      .eq('event_id', eventId)
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (links.length === 0) return { ...empty, ...recount(sales.totals.orders, 0, 0) }

  const creatorByLink = new Map(links.map(l => [l.id, l.created_by]))

  const conversions = await readEveryRow('share_link_events', (from, to) =>
    admin
      .from('share_link_events')
      .select('link_id, order_id, occurred_at')
      .eq('kind', 'conversion')
      .in('link_id', links.map(l => l.id))
      .order('id', { ascending: true })
      .range(from, to),
  )

  /*
   * ONE ATTRIBUTION PER ORDER, EARLIEST WINS. The same first-touch rule
   * fetchSalesAttribution applies, spelled the same way, because two modules
   * reporting different numbers about the same event is worse than either
   * number being wrong.
   */
  const creatorByOrder = new Map<string, string | null>()
  const seenAt = new Map<string, string>()
  for (const row of conversions) {
    if (!row.order_id) continue
    const prior = seenAt.get(row.order_id)
    if (prior === undefined || row.occurred_at < prior) {
      seenAt.set(row.order_id, row.occurred_at)
      creatorByOrder.set(row.order_id, creatorByLink.get(row.link_id) ?? null)
    }
  }
  if (creatorByOrder.size === 0) {
    return { ...empty, ...recount(sales.totals.orders, 0, 0) }
  }

  /*
   * WHICH OF THOSE SHARERS ACTUALLY BOUGHT THIS EVENT.
   *
   * Asked of `orders.user_id` rather than of `tickets`, and the reason is that
   * they answer different questions. A ticket names its ATTENDEE, who may never
   * have signed in and may not be the person who paid; an order names the
   * signed-in BUYER, which is the same identity a share link records in
   * `created_by` when it is minted. Matching a link's creator against ticket
   * rows would therefore miss the buyer who bought four tickets for friends,
   * which is precisely the person AQ2 is about.
   *
   * PAGED, not limited to the chunk size. One buyer can hold several orders for
   * one event, so a limit of chunk.length would stop reading part way through
   * and drop buyers whose rows happened to sort last. That is the silent
   * thousand-row ceiling in miniature, and it would understate the coefficient
   * without anything anywhere saying so.
   */
  const creators = [...new Set([...creatorByOrder.values()].filter((v): v is string => Boolean(v)))]
  const holders = new Set<string>()
  for (let i = 0; i < creators.length; i += 100) {
    const chunk = creators.slice(i, i + 100)
    const rows = await readEveryRow('orders (share link creators)', (from, to) =>
      admin
        .from('orders')
        .select('id, user_id')
        .eq('event_id', eventId)
        .in('user_id', chunk)
        .order('id', { ascending: true })
        .range(from, to),
    )
    for (const row of rows) {
      if (row.user_id) holders.add(row.user_id)
    }
  }

  let fromAKnownBuyer = 0
  for (const creator of creatorByOrder.values()) {
    if (creator && holders.has(creator)) fromAKnownBuyer += 1
  }

  return {
    ...buildReferralCoefficient({
      soldOrders: sales.totals.orders,
      attributedToAShareLink: creatorByOrder.size,
      fromAKnownBuyer,
    }),
    eventId,
    reconciles: sales.reconciles,
    externallyTicketed: sales.externallyTicketed,
  }
}

function recount(soldOrders: number, attributed: number, fromAKnownBuyer: number) {
  return buildReferralCoefficient({ soldOrders, attributedToAShareLink: attributed, fromAKnownBuyer })
}
