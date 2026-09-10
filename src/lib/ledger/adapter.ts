/**
 * THE ADAPTER. Close-out D1. The ONLY file that speaks both languages.
 *
 * Everything else under src/lib/ledger speaks the general vocabulary and only
 * the general vocabulary, because the ledger is the foundation of something that
 * will later run for gyms, clinics, tour operators, studios and venues. This one
 * file is where EventLinqs meets it:
 *
 *     event  ->  slot
 *     tier   ->  inventory class
 *     ticket ->  unit
 *
 * NOTHING ELSE IN THE CODEBASE WRITES TO THE LEDGER. That is not a convention,
 * it is `scripts/guards/ledger-writes-through-the-adapter.mjs`, and it exists
 * because the adapter boundary is the entire portability of the business and it
 * would erode within a month if nothing defended it. Pointing the engine at a
 * gym's rows tomorrow must be a new adapter and nothing else.
 *
 * WHY A HASH AND NOT AN ADDRESS, on the buyer and the visitor. A ledger is kept
 * for years and is read by analytics code that has no business knowing who
 * anybody is. What it needs is to tell one person from another and a returning
 * buyer from a first-time one, and a keyed hash does that exactly. The key is
 * DERIVED from a secret this platform already holds rather than being a new one
 * the founder has to mint, and it is domain-separated so it cannot be confused
 * with the secret's own use.
 *
 * The one field that is NOT hashed is `contact_email` on a demand row, and that
 * is deliberate and is the close-out's own instruction: "The email field on the
 * DEMAND row is required, not optional. Without it D2 cannot contact anyone and
 * the whole recovery engine is dead on arrival." You cannot email a hash.
 */
import { createHash, createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { SOURCE_SYSTEM, type DemandAction, type InventoryAction, type Slot } from './types'
import { diffBuckets, type PricedBucket } from './inventory-diff'
import { report, write, type WriteOutcome } from './writer'

/**
 * NOTHING IN HERE MAY REACH ITS CALLER. Every one of these functions is called
 * from a path that is on somebody's money: a confirmed order, a refund, a
 * checkout, an organiser pressing Save. The ledger is HISTORY about those
 * things and is worth nothing measured against them.
 *
 * `writer.write` already swallows and reports the INSERT itself, and that alone
 * turned out not to be the guarantee it reads like: every recorder below reads
 * a row or two before it gets to the write, and a read that throws reaches the
 * caller exactly as an unguarded write would. The suite proved it rather than
 * anybody arguing it: with the guard absent, three checkout tests died on
 * `headers` was called outside a request scope and two organiser-save tests died
 * on `input.before.map is not a function`, which in production is a checkout
 * that fails and an event that will not save, because an analytics row could
 * not be written.
 *
 * So the guarantee lives HERE, once, rather than as a try/catch repeated at
 * every call site where somebody will one day forget it. A fault is reported on
 * both channels and the caller is handed the fallback, which always reads as
 * "nothing was recorded" rather than as a success.
 */
async function guarded<T>(what: string, fallback: T, body: () => Promise<T>): Promise<T> {
  try {
    return await body()
  } catch (cause) {
    report(what, cause instanceof Error ? cause.message : String(cause))
    return fallback
  }
}

/**
 * WHAT A MULTI-ROW RECORDER HANDS BACK.
 *
 * `alreadyThere` is separate from `written` because `write` returns ok for the
 * idempotent path as well as for a real insert, and folding the two together
 * made the backfill report "wrote 264 row(s)" on a run that wrote 34. A no-op
 * reported as work is the same defect as work reported as a no-op.
 */
export type RowTally = { written: number; alreadyThere: number; failed: number }

/** What a recorder that writes several rows hands back when it could not run. */
const NOTHING_WRITTEN = { written: 0, alreadyThere: 0, failed: 0 }

/* -------------------------------------------------------------------------- */
/*  THE GUARDED SURFACE. Everything the rest of the platform may call is here,  */
/*  and every one of these is the same shape: the real work, wrapped once, so a  */
/*  fault is reported down both channels and the caller is handed a fallback     */
/*  that reads as "nothing was recorded" rather than as a success. The           */
/*  implementations carry the Impl suffix and are never exported, so there is no */
/*  unguarded door into any of them.                                            */
/* -------------------------------------------------------------------------- */

/** A refusal, in the shape `write` returns, so a caller reads one type. */
const REFUSED = (why: string): WriteOutcome => ({ ok: false, reason: why })

export const recordSale = (input: Parameters<typeof recordSaleImpl>[0]) =>
  guarded(`sale for order item ${input.orderItemId}`, REFUSED('the recorder could not run'), () => recordSaleImpl(input))

export const recordRefund = (input: Parameters<typeof recordRefundImpl>[0]) =>
  guarded(`refund ${input.refundKey}`, REFUSED('the recorder could not run'), () => recordRefundImpl(input))

export const recordPriceChange = (input: Parameters<typeof recordPriceChangeImpl>[0]) =>
  guarded(`price change ${input.occurrenceKey}`, REFUSED('the recorder could not run'), () =>
    recordPriceChangeImpl(input),
  )

export const recordInventory = (input: Parameters<typeof recordInventoryImpl>[0]) =>
  guarded(`inventory ${input.occurrenceKey}`, REFUSED('the recorder could not run'), () => recordInventoryImpl(input))

export const recordDemand = (input: Parameters<typeof recordDemandImpl>[0]) =>
  guarded(`demand ${input.action} ${input.occurrenceKey}`, REFUSED('the recorder could not run'), () =>
    recordDemandImpl(input),
  )

export const recordClose = (input: Parameters<typeof recordCloseImpl>[0]) =>
  guarded(`close of slot ${input.event.id}`, REFUSED('the recorder could not run'), () => recordCloseImpl(input))

export const recordConfirmedOrder = (orderId: string) =>
  guarded(`the sale rows for order ${orderId}`, NOTHING_WRITTEN, () => recordConfirmedOrderImpl(orderId))

export const recordRefundedOrder = (refundId: string) =>
  guarded(`the refund rows for refund ${refundId}`, NOTHING_WRITTEN, () => recordRefundedOrderImpl(refundId))

export const recordTierChanges = (input: Parameters<typeof recordTierChangesImpl>[0]) =>
  guarded(`the inventory rows for slot ${input.event?.id ?? '(unknown)'}`, NOTHING_WRITTEN, () =>
    recordTierChangesImpl(input),
  )

export const recordAbandonedCheckouts = (sinceHours?: number) =>
  guarded('the abandoned checkouts sweep', { written: 0, considered: 0 }, () =>
    recordAbandonedCheckoutsImpl(sinceHours),
  )

export const recordClosedSlots = (limit?: number) =>
  guarded('the slot closing sweep', { closed: 0, considered: 0 }, () => recordClosedSlotsImpl(limit))

/** An event, as much of it as the mapping needs. */
export type EventForLedger = {
  id: string
  organisation_id: string
  category_id?: string | null
  genre_slug?: string | null
  subgenre_slug?: string | null
  community_primary?: string | null
  sub_community?: string | null
  max_capacity?: number | null
  published_at?: string | null
  created_at?: string | null
  start_date: string
  /**
   * Optional because most reads do not need it: `LEDGER_EVENT_COLUMNS` leaves it
   * out and every recorder except the closing sweep works from the start alone.
   * The sweep needs it, because a multi-day slot whose start has passed and
   * whose end has not is still running, and closing it would record a final
   * figure for something that is still selling. It is declared HERE rather than
   * intersected on at that one call site, so a test can build the row the sweep
   * actually reads.
   */
  end_date?: string | null
  venue_postal_code?: string | null
}

/**
 * WHAT AN EVENT'S CATEGORY IS CALLED, resolved once per process.
 *
 * The events row carries `category_id`, a uuid, and the ledger must carry
 * something a person can still read in 2029 when the row it pointed at may not
 * exist. Categories change about once a year, so a process-lifetime cache is
 * generous rather than risky, and a miss falls back to the general value rather
 * than failing a sale.
 */
const categorySlugs = new Map<string, string>()
let categoriesLoaded = false

async function categorySlug(categoryId: string | null | undefined): Promise<string> {
  if (!categoryId) return 'general'
  if (categorySlugs.has(categoryId)) return categorySlugs.get(categoryId) as string
  if (!categoriesLoaded) {
    try {
      const admin = createAdminClient()
      const { data } = await admin.from('event_categories').select('id, slug')
      for (const row of (data ?? []) as Array<{ id: string; slug: string }>) {
        categorySlugs.set(row.id, row.slug)
      }
      categoriesLoaded = true
    } catch (error) {
      // A category we cannot name is not a reason to lose a sale's history, but
      // it is not nothing either: every slot written while this is failing
      // records the general value, and a silent one would be indistinguishable
      // from a catalogue that really is uncategorised.
      report('the category names', error instanceof Error ? error.message : String(error))
      return 'general'
    }
  }
  return categorySlugs.get(categoryId) ?? 'general'
}

/** For tests and for a long-lived process that has just seen a taxonomy change. */
export function forgetCategoryNames(): void {
  categorySlugs.clear()
  categoriesLoaded = false
}

/**
 * The finer classification, in one place and in a fixed order of preference.
 *
 * 'general' rather than null when the event carries none: the ledger requires a
 * subcategory, and "we did not record one" is a real answer that must be
 * spelled rather than left as an absence somebody later reads as a bug.
 */
export function subcategoryOf(event: EventForLedger): string {
  return (
    event.subgenre_slug ||
    event.genre_slug ||
    event.sub_community ||
    event.community_primary ||
    'general'
  )
}

/** event -> slot. The whole mapping, in one function. */
export async function slotFromEvent(event: EventForLedger): Promise<Slot> {
  return {
    sourceSystem: SOURCE_SYSTEM,
    sourceRef: event.id,
    organisationId: event.organisation_id,
    category: await categorySlug(event.category_id),
    subcategory: subcategoryOf(event),
    capacity: typeof event.max_capacity === 'number' ? event.max_capacity : null,
    onSaleAt: event.published_at ?? event.created_at ?? null,
    slotAt: event.start_date,
    postcode: event.venue_postal_code ?? null,
  }
}

/**
 * THE KEY THE HASHES ARE TAKEN WITH.
 *
 * Derived from ORDER_ACCESS_SECRET rather than being a new environment variable,
 * because a new one is a value the founder has to mint and propagate to four
 * places (Law 10 would call that IMPOSSIBLE-for-a-machine, and it would hold up
 * the whole item). Domain separation by a fixed label means the derived key
 * cannot be used against the secret's own purpose.
 *
 * With no secret at all the hash is still stable within a deployment and still
 * distinguishes one person from another, which is all the ledger asks of it; it
 * is simply not resistant to a dictionary attack by someone who already has the
 * database. That case is reported once rather than passed over.
 */
let warnedAboutKey = false
function hashKey(): Buffer {
  const secret = process.env.ORDER_ACCESS_SECRET ?? ''
  if (!secret && !warnedAboutKey) {
    warnedAboutKey = true
    console.warn('[ledger] ORDER_ACCESS_SECRET is not set, so buyer hashes are unsalted on this deployment.')
  }
  return createHash('sha256').update(`eventlinqs.ledger.identity.v1:${secret}`).digest()
}

/** One person, told apart from another, without the ledger knowing who they are. */
export function identityHash(value: string | null | undefined): string | null {
  const normalised = (value ?? '').trim().toLowerCase()
  if (!normalised) return null
  return createHmac('sha256', hashKey()).update(normalised).digest('hex').slice(0, 32)
}

/** Where a person came from, as much as the request can say. */
export type Attribution = {
  referrer?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  device?: string | null
}

/* -------------------------------------------------------------------------- */
/*  The six recorders. Every one of them is idempotent on its occurrence key.  */
/* -------------------------------------------------------------------------- */

async function recordSaleImpl(input: {
  event: EventForLedger
  orderId: string
  orderItemId: string
  tierId: string | null
  tierName: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  buyerEmail: string | null
  returningBuyer?: boolean | null
  occurredAt?: string
  attribution?: Attribution
}): Promise<WriteOutcome> {
  return write(await slotFromEvent(input.event), {
    kind: 'sale',
    occurrenceKey: `sale:${input.orderItemId}`,
    occurredAt: input.occurredAt,
    inventoryClass: input.tierName,
    inventoryClassRef: input.tierId,
    quantity: input.quantity,
    amountCents: input.totalCents,
    unitAmountCents: input.unitPriceCents,
    buyerHash: identityHash(input.buyerEmail),
    returningBuyer: input.returningBuyer ?? null,
    referrer: input.attribution?.referrer ?? null,
    utmSource: input.attribution?.utmSource ?? null,
    utmMedium: input.attribution?.utmMedium ?? null,
    utmCampaign: input.attribution?.utmCampaign ?? null,
    device: input.attribution?.device ?? null,
  })
}

async function recordRefundImpl(input: {
  event: EventForLedger
  refundKey: string
  tierId: string | null
  tierName: string
  quantity: number
  amountCents: number
  buyerEmail: string | null
  occurredAt?: string
}): Promise<WriteOutcome> {
  // NEGATIVE, always. A refund is a new row, never an edit of the sale, so a sum
  // over the ledger is the net with no special case in any reader.
  return write(await slotFromEvent(input.event), {
    kind: 'refund',
    occurrenceKey: `refund:${input.refundKey}`,
    occurredAt: input.occurredAt,
    inventoryClass: input.tierName,
    inventoryClassRef: input.tierId,
    quantity: -Math.abs(input.quantity),
    amountCents: -Math.abs(input.amountCents),
    buyerHash: identityHash(input.buyerEmail),
  })
}

async function recordPriceChangeImpl(input: {
  event: EventForLedger
  tierId: string | null
  tierName: string
  oldPriceCents: number | null
  newPriceCents: number
  occurrenceKey: string
  occurredAt?: string
}): Promise<WriteOutcome> {
  return write(await slotFromEvent(input.event), {
    kind: 'price_change',
    occurrenceKey: `price:${input.occurrenceKey}`,
    occurredAt: input.occurredAt,
    inventoryClass: input.tierName,
    inventoryClassRef: input.tierId,
    oldPriceCents: input.oldPriceCents,
    newPriceCents: input.newPriceCents,
  })
}

async function recordInventoryImpl(input: {
  event: EventForLedger
  tierId: string | null
  tierName: string
  action: InventoryAction
  quantity: number
  occurrenceKey: string
  occurredAt?: string
}): Promise<WriteOutcome> {
  return write(await slotFromEvent(input.event), {
    kind: 'inventory',
    occurrenceKey: `inventory:${input.occurrenceKey}`,
    occurredAt: input.occurredAt,
    inventoryClass: input.tierName,
    inventoryClassRef: input.tierId,
    inventoryAction: input.action,
    quantity: input.quantity,
  })
}

async function recordDemandImpl(input: {
  event: EventForLedger
  action: DemandAction
  occurrenceKey: string
  email?: string | null
  visitorId?: string | null
  tierId?: string | null
  tierName?: string | null
  occurredAt?: string
  attribution?: Attribution
}): Promise<WriteOutcome> {
  return write(await slotFromEvent(input.event), {
    kind: 'demand',
    occurrenceKey: `demand:${input.action}:${input.occurrenceKey}`,
    occurredAt: input.occurredAt,
    demandAction: input.action,
    contactEmail: (input.email ?? '').trim().toLowerCase() || null,
    visitorHash: identityHash(input.visitorId),
    inventoryClass: input.tierName ?? null,
    inventoryClassRef: input.tierId ?? null,
    referrer: input.attribution?.referrer ?? null,
    utmSource: input.attribution?.utmSource ?? null,
    utmMedium: input.attribution?.utmMedium ?? null,
    utmCampaign: input.attribution?.utmCampaign ?? null,
    device: input.attribution?.device ?? null,
  })
}

/* -------------------------------------------------------------------------- */
/*  The two order-level recorders. Every money path in the product reaches one  */
/*  of these, and nothing reaches the writer any other way.                     */
/* -------------------------------------------------------------------------- */

/** The columns the mapping needs, in one place, so every read matches. */
export const LEDGER_EVENT_COLUMNS =
  'id, organisation_id, category_id, genre_slug, subgenre_slug, community_primary, sub_community, max_capacity, published_at, created_at, start_date, venue_postal_code'

/**
 * What the ledger already knows about where this checkout came from.
 *
 * The attribution is captured when the person ENTERS their address at checkout,
 * as a demand row, because that is the only moment the request carries it. The
 * sale lands minutes later on a Stripe webhook, on a machine with no browser and
 * no headers at all, so it reads it back out of the ledger rather than inventing
 * a second place to keep it.
 */
async function attributionForReservation(reservationId: string | null): Promise<Attribution | undefined> {
  if (!reservationId) return undefined
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('ledger_entries')
      .select('referrer, utm_source, utm_medium, utm_campaign, device')
      .eq('occurrence_key', `demand:checkout_started:${reservationId}`)
      .maybeSingle()
    if (!data) return undefined
    const row = data as Record<string, string | null>
    return {
      referrer: row.referrer,
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: row.utm_campaign,
      device: row.device,
    }
  } catch (error) {
    // No attribution is a real answer and is recorded as one, four nulls rather
    // than a guess. Said out loud so a channel that stops being recorded is
    // visible rather than looking like traffic that stopped arriving.
    report(`the attribution for reservation ${reservationId}`, error instanceof Error ? error.message : String(error))
    return undefined
  }
}

/**
 * WHO BOUGHT THIS ORDER, whether or not they were signed in.
 *
 * WHY THIS EXISTS, measured rather than reasoned about. The first version read
 * `orders.guest_email` and nothing else. On the TEST database that is null for
 * 138 of 294 orders, because a signed-in buyer carries `user_id` and leaves
 * `guest_email` empty. So for roughly half of every purchase the ledger recorded
 * NO buyer hash and NO first-time-or-returning flag, and the close-out asks for
 * both by name on the sale row. Worse, D2's suppression rule is "never contact
 * anyone who already bought", and a person the ledger cannot identify is a
 * person it cannot suppress.
 *
 * The address is resolved through the profile when the order names a user, so a
 * person who buys once as a guest and once signed in hashes to the SAME value
 * and is correctly recognised as returning. That is the whole reason the hash is
 * keyed on the address rather than on whichever id the row happened to carry.
 */
export type OrderBuyer = { email: string | null; userId: string | null }

async function buyerOfOrder(order: { guest_email?: string | null; user_id?: string | null }): Promise<OrderBuyer> {
  const guest = (order.guest_email ?? '').trim().toLowerCase()
  const userId = (order.user_id as string | null) ?? null
  if (guest) return { email: guest, userId }
  if (!userId) return { email: null, userId: null }
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle()
    const email = ((data as { email?: string | null } | null)?.email ?? '').trim().toLowerCase()
    return { email: email || null, userId }
  } catch (error) {
    // An address we could not read is a gap, and a gap is visible. Inventing one
    // would be a fact the ledger never learned. Reported, because this is the
    // field D2 contacts a person on, and a silent failure here is a recovery
    // engine that quietly has nobody to write to.
    report(`the buyer of an order placed by ${userId}`, error instanceof Error ? error.message : String(error))
    return { email: null, userId }
  }
}

/**
 * Has this person bought on this platform before today's order?
 *
 * Either identity counts, because either identity is the same person: an order
 * placed as a guest with this address, or an order placed by this account.
 * Null when we know neither, which reads in the ledger as "we did not know"
 * rather than as "first time", and those are different claims.
 */
async function hasBoughtBefore(buyer: OrderBuyer, beforeOrderId: string): Promise<boolean | null> {
  if (!buyer.email && !buyer.userId) return null
  try {
    const admin = createAdminClient()
    // QUOTED, because an unquoted PostgREST `or` term splits on a comma and an
    // address is data we did not write. A quoted value is taken whole.
    const terms = []
    if (buyer.email) terms.push(`guest_email.eq."${buyer.email.replace(/"/g, '')}"`)
    if (buyer.userId) terms.push(`user_id.eq."${buyer.userId}"`)
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .or(terms.join(','))
      .neq('id', beforeOrderId)
    return (count ?? 0) > 0
  } catch (error) {
    report('whether this buyer has bought before', error instanceof Error ? error.message : String(error))
    return null
  }
}

/**
 * ONE SALE ROW PER ORDER ITEM, written after the order is confirmed.
 *
 * Called at every `confirm_order` site, and
 * `scripts/guards/ledger-writes-through-the-adapter.mjs` fails the build if a site
 * appears that does not call it. That guard exists because this repository
 * already carries two receipts for what "remember to call it" is worth: discount
 * usage was recorded in the free branch of checkout and not the paid one, and
 * payout_status was written by one webhook handler and not the other.
 *
 * Add-on items are deliberately NOT recorded as sales. An add-on is not a unit
 * of the slot's capacity, and counting a parking pass as a sold place would put
 * the fill percentage above what was ever sellable.
 */
async function recordConfirmedOrderImpl(orderId: string): Promise<RowTally> {
  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, event_id, guest_email, user_id, confirmed_at, reservation_id')
    .eq('id', orderId)
    .maybeSingle()
  if (!order?.event_id) return { written: 0, alreadyThere: 0, failed: 0 }

  const { data: event } = await admin.from('events').select(LEDGER_EVENT_COLUMNS).eq('id', order.event_id).maybeSingle()
  if (!event) return { written: 0, alreadyThere: 0, failed: 0 }

  const { data: items } = await admin
    .from('order_items')
    .select('id, item_type, item_name, quantity, unit_price_cents, total_cents, ticket_tier_id')
    .eq('order_id', order.id)

  const ticketItems = (items ?? []).filter(i => (i as { item_type: string }).item_type === 'ticket')
  if (ticketItems.length === 0) return { written: 0, alreadyThere: 0, failed: 0 }

  const buyer = await buyerOfOrder(order as { guest_email: string | null; user_id: string | null })
  const buyerEmail = buyer.email
  const [attribution, returning] = await Promise.all([
    attributionForReservation((order as { reservation_id: string | null }).reservation_id),
    hasBoughtBefore(buyer, order.id as string),
  ])

  let written = 0
  let alreadyThere = 0
  let failed = 0
  for (const raw of ticketItems) {
    const item = raw as {
      id: string
      item_name: string
      quantity: number
      unit_price_cents: number
      total_cents: number
      ticket_tier_id: string | null
    }
    const outcome = await recordSale({
      event: event as unknown as EventForLedger,
      orderId: order.id as string,
      orderItemId: item.id,
      tierId: item.ticket_tier_id,
      tierName: item.item_name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      totalCents: item.total_cents,
      buyerEmail,
      returningBuyer: returning,
      occurredAt: (order as { confirmed_at: string | null }).confirmed_at ?? undefined,
      attribution,
    })
    if (!outcome.ok) failed += 1
    else if (outcome.duplicate) alreadyThere += 1
    else written += 1
  }
  return { written, alreadyThere, failed }
}

/**
 * ONE NEGATIVE ROW PER UNIT THAT CAME BACK, written after a refund reconciles.
 *
 * Per VOIDED UNIT rather than per refund, because a refund can be partial and
 * can span more than one inventory class, and apportioning one amount across
 * several classes would be inventing precision the record does not have. Each
 * row carries the unit's own price from the order item it belongs to, so the
 * ledger stays internally consistent in face-value terms.
 */
async function recordRefundedOrderImpl(refundId: string): Promise<RowTally> {
  const admin = createAdminClient()
  const { data: refund } = await admin
    .from('refunds')
    .select('id, order_id, processed_at')
    .eq('id', refundId)
    .maybeSingle()
  if (!refund?.order_id) return { written: 0, alreadyThere: 0, failed: 0 }

  const { data: order } = await admin
    .from('orders')
    .select('id, event_id, guest_email, user_id')
    .eq('id', refund.order_id)
    .maybeSingle()
  if (!order?.event_id) return { written: 0, alreadyThere: 0, failed: 0 }
  // The same person the sale row named, resolved the same way, so a refund and
  // the sale it reverses carry the same buyer hash.
  const refundBuyer = await buyerOfOrder(order as { guest_email: string | null; user_id: string | null })

  const { data: event } = await admin.from('events').select(LEDGER_EVENT_COLUMNS).eq('id', order.event_id).maybeSingle()
  if (!event) return { written: 0, alreadyThere: 0, failed: 0 }

  const { data: voided } = await admin
    .from('tickets')
    .select('id, ticket_tier_id, order_item_id')
    .eq('order_id', order.id)
    .not('refunded_at', 'is', null)
  if (!voided || voided.length === 0) return { written: 0, alreadyThere: 0, failed: 0 }

  const itemIds = [...new Set((voided as Array<{ order_item_id: string }>).map(t => t.order_item_id))]
  const { data: items } = await admin
    .from('order_items')
    .select('id, item_name, unit_price_cents, ticket_tier_id')
    .in('id', itemIds)
  const byItem = new Map(
    ((items ?? []) as Array<{ id: string; item_name: string; unit_price_cents: number; ticket_tier_id: string | null }>).map(
      i => [i.id, i],
    ),
  )

  let written = 0
  let alreadyThere = 0
  let failed = 0
  for (const raw of voided as Array<{ id: string; ticket_tier_id: string | null; order_item_id: string }>) {
    const item = byItem.get(raw.order_item_id)
    const outcome = await recordRefund({
      event: event as unknown as EventForLedger,
      refundKey: `${refund.id}:${raw.id}`,
      tierId: raw.ticket_tier_id ?? item?.ticket_tier_id ?? null,
      tierName: item?.item_name ?? 'Ticket',
      quantity: 1,
      amountCents: item?.unit_price_cents ?? 0,
      buyerEmail: refundBuyer.email,
      occurredAt: (refund as { processed_at: string | null }).processed_at ?? undefined,
    })
    if (!outcome.ok) failed += 1
    else if (outcome.duplicate) alreadyThere += 1
    else written += 1
  }
  return { written, alreadyThere, failed }
}

/** tier -> priced bucket. The other half of the vocabulary mapping. */
export function bucketFromTier(tier: {
  id: string
  name: string
  price: number
  total_capacity: number
  updated_at: string
}): PricedBucket {
  return {
    ref: tier.id,
    name: tier.name,
    priceCents: tier.price,
    capacity: tier.total_capacity,
    updatedAt: tier.updated_at,
  }
}

/** The columns bucketFromTier needs, in one place so every read matches. */
export const TIER_COLUMNS = 'id, name, price, total_capacity, updated_at'

/**
 * WHAT AN ORGANISER'S SAVE DID TO THEIR TICKET TYPES, as ledger rows.
 *
 * Called with the tiers as they were and as they are, on either side of the
 * reconciliation. A save that changed only the description writes nothing, so
 * the inventory history is a record of real moves rather than of button presses.
 */
async function recordTierChangesImpl(input: {
  event: EventForLedger
  before: Array<{ id: string; name: string; price: number; total_capacity: number; updated_at: string }>
  after: Array<{ id: string; name: string; price: number; total_capacity: number; updated_at: string }>
}): Promise<RowTally> {
  const changes = diffBuckets(input.before.map(bucketFromTier), input.after.map(bucketFromTier))
  if (changes.length === 0) return { written: 0, alreadyThere: 0, failed: 0 }

  const slot = await slotFromEvent(input.event)
  let written = 0
  let alreadyThere = 0
  let failed = 0
  for (const change of changes) {
    const outcome = await write(slot, {
      ...change,
      occurrenceKey: `${change.kind === 'price_change' ? 'price' : 'inventory'}:${change.occurrenceKey}`,
    })
    if (!outcome.ok) failed += 1
    else if (outcome.duplicate) alreadyThere += 1
    else written += 1
  }
  return { written, alreadyThere, failed }
}

/**
 * THE CHECKOUTS THAT ENDED WITHOUT A SALE. Close-out D1, and the input D2 needs.
 *
 * WHY IT IS A SWEEP AND NOT AN ACT. Abandonment is the ABSENCE of something: a
 * person entered their address, and then nothing happened. Nothing happening
 * fires no code, so there is no call site to hook. The reservation expiring is
 * the first moment the platform can say so, and the cron that expires it is
 * therefore the only honest place to record it.
 *
 * It reads the ledger's own `checkout_started` rows rather than the reservation
 * table, because those rows are the only place the address and the attribution
 * were ever kept. Idempotent per reservation, so a re-run writes nothing twice.
 */
async function recordAbandonedCheckoutsImpl(sinceHours = 48): Promise<{ written: number; considered: number }> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString()

  const { data: lapsed } = await admin
    .from('reservations')
    .select('id, event_id, updated_at, converted_at, status')
    .in('status', ['expired', 'cancelled'])
    .is('converted_at', null)
    .gte('updated_at', since)

  const rows = (lapsed ?? []) as Array<{ id: string; event_id: string; updated_at: string }>
  if (rows.length === 0) return { written: 0, considered: 0 }

  // The started rows carry the address and the attribution. No started row means
  // nobody ever typed an address, which is a page view rather than an abandoned
  // checkout, and recording it as one would inflate the number that matters.
  const startedKeys = rows.map(r => `demand:checkout_started:${r.id}`)
  const { data: started } = await admin
    .from('ledger_entries')
    .select('occurrence_key, contact_email, visitor_hash, referrer, utm_source, utm_medium, utm_campaign, device, inventory_class, inventory_class_ref')
    .in('occurrence_key', startedKeys)
  const startedByReservation = new Map(
    ((started ?? []) as Array<Record<string, string | null>>).map(row => [
      String(row.occurrence_key).replace('demand:checkout_started:', ''),
      row,
    ]),
  )

  // A reservation whose order confirmed is not an abandonment, whatever the
  // reservation row's own status says.
  const { data: sold } = await admin
    .from('orders')
    .select('reservation_id')
    .eq('status', 'confirmed')
    .in('reservation_id', rows.map(r => r.id))
  const bought = new Set(((sold ?? []) as Array<{ reservation_id: string | null }>).map(o => o.reservation_id))

  let written = 0
  let considered = 0
  for (const reservation of rows) {
    const start = startedByReservation.get(reservation.id)
    if (!start || !start.contact_email) continue
    if (bought.has(reservation.id)) continue
    considered += 1

    const { data: event } = await admin
      .from('events')
      .select(LEDGER_EVENT_COLUMNS)
      .eq('id', reservation.event_id)
      .maybeSingle()
    if (!event) continue

    const outcome = await write(await slotFromEvent(event as unknown as EventForLedger), {
      kind: 'demand',
      occurrenceKey: `demand:checkout_abandoned:${reservation.id}`,
      occurredAt: reservation.updated_at,
      demandAction: 'checkout_abandoned',
      contactEmail: start.contact_email,
      visitorHash: start.visitor_hash,
      inventoryClass: start.inventory_class,
      inventoryClassRef: start.inventory_class_ref,
      referrer: start.referrer,
      utmSource: start.utm_source,
      utmMedium: start.utm_medium,
      utmCampaign: start.utm_campaign,
      device: start.device,
    })
    if (outcome.ok) written += 1
  }
  return { written, considered }
}

/**
 * THE CLOSING ROW, one per slot, once it is over. Close-out D1.
 *
 * "Plus one row per event at close: final sold, final revenue, fill percentage,
 * scanned, no shows." It is a separate row rather than a column on the slot for
 * the same reason everything else here is a row: a closing figure recomputed
 * later from tables that have moved on is not a record of what happened, it is
 * an opinion formed afterwards.
 *
 * ATTENDED is read from the units that were actually scanned at the door, and
 * NO SHOWS is the rest. An event with no scanner at the door records attended as
 * null rather than as zero, because "nobody came" and "nobody scanned" are
 * different facts and reporting the second as the first would tell an organiser
 * their night was empty.
 */
async function recordClosedSlotsImpl(limit = 50): Promise<{ closed: number; considered: number }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: ended } = await admin
    .from('events')
    .select(`${LEDGER_EVENT_COLUMNS}, end_date, status`)
    .lt('start_date', now)
    .in('status', ['published', 'completed'])
    .order('start_date', { ascending: false })
    .limit(limit)

  const candidates = (ended ?? []) as Array<Record<string, unknown>>
  if (candidates.length === 0) return { closed: 0, considered: 0 }

  // Already closed? The occurrence key answers it in one read for the whole batch.
  const keys = candidates.map(e => `close:${String(e.id)}`)
  const { data: already } = await admin.from('ledger_entries').select('occurrence_key').in('occurrence_key', keys)
  const done = new Set(((already ?? []) as Array<{ occurrence_key: string }>).map(r => r.occurrence_key))

  let closed = 0
  let considered = 0
  for (const raw of candidates) {
    const event = raw as unknown as EventForLedger
    if (done.has(`close:${event.id}`)) continue
    // An event whose end has not passed is still running, whatever its start says.
    if (event.end_date && new Date(event.end_date).toISOString() > now) continue
    considered += 1

    const { data: sold } = await admin
      .from('ledger_entries')
      .select('quantity, amount_cents, kind')
      .eq('slot_id', (await slotIdFor(event.id)) ?? '00000000-0000-0000-0000-000000000000')
      .in('kind', ['sale', 'refund'])

    const rows = (sold ?? []) as Array<{ quantity: number | null; amount_cents: number | null }>
    const finalSold = rows.reduce((n, r) => n + (r.quantity ?? 0), 0)
    const finalRevenueCents = rows.reduce((n, r) => n + (r.amount_cents ?? 0), 0)

    const { count: attended } = await admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .not('first_scanned_at', 'is', null)
    const { count: issued } = await admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .neq('status', 'void')

    const capacity = typeof event.max_capacity === 'number' && event.max_capacity > 0 ? event.max_capacity : null
    const outcome = await recordClose({
      event,
      finalSold,
      finalRevenueCents,
      fillPercent: capacity ? Math.min(100, Math.round((finalSold / capacity) * 10000) / 100) : 0,
      // Null, not zero, when nothing was ever scanned: an event with no scanner
      // at the door did not have nobody turn up.
      attended: (attended ?? 0) > 0 ? (attended as number) : null,
      noShows: (attended ?? 0) > 0 ? Math.max(0, (issued ?? 0) - (attended as number)) : null,
    })
    if (outcome.ok) closed += 1
  }
  return { closed, considered }
}

/** The ledger's own id for a slot, by the source system's identifier. */
async function slotIdFor(sourceRef: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('ledger_slots')
    .select('id')
    .eq('source_system', SOURCE_SYSTEM)
    .eq('source_ref', sourceRef)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function recordCloseImpl(input: {
  event: EventForLedger
  finalSold: number
  finalRevenueCents: number
  fillPercent: number
  attended: number | null
  noShows: number | null
  occurredAt?: string
}): Promise<WriteOutcome> {
  return write(await slotFromEvent(input.event), {
    kind: 'close',
    occurrenceKey: `close:${input.event.id}`,
    occurredAt: input.occurredAt,
    finalSold: input.finalSold,
    finalRevenueCents: input.finalRevenueCents,
    fillPercent: input.fillPercent,
    attended: input.attended,
    noShows: input.noShows,
  })
}
