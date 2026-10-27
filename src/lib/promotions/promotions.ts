import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { isStillListed, listingWindowOrPredicate } from '@/lib/events/listing-window'
import { isFeatureEnabled } from '@/lib/flags/broadcast'

/**
 * PAID PROMOTION: FEATURED PLACEMENT AND THE ORGANISER SERVICES MENU (Train C, rows 12 and 13).
 *
 * The plan: "Paid featured placement: set slots on city pages and the homepage, labelled "Featured", bought by an
 * organiser" (done when "an organiser buys a slot in Stripe test mode and it shows labelled; Lawal sets the price in
 * admin"), and "Organiser services menu: promotion packages (a social feature, a roundup feature, a poster pack), each
 * priced in admin, paid through Stripe" (done when "an organiser orders one and the order reaches the admin queue").
 * The project manager's 13:14: "prices empty in admin = not on sale".
 *
 * HOW A PURCHASE HOLDS. An offer with no price cannot be ordered: the page shows it as not on sale, this module
 * refuses it, and the database refuses the row (promotion_orders_priced_offer). An order is written first, awaiting
 * payment, at the offer's own price; Stripe Checkout takes the payment (https://docs.stripe.com/api/checkout/sessions/create,
 * read 27 October 2026: mode "payment", "Accept one-time payments"; client_reference_id, "A unique string to reference
 * the Checkout Session ... used to reconcile the session with your internal systems"); and the order is marked paid
 * only when the session is read back from Stripe and says payment_status "paid" for that very order. A featured slot
 * runs seven days from its payment, and shows only while it runs, labelled Featured.
 *
 * THE RETURN PAGE IS NOT THE ONLY PATH. Stripe's own guide (https://docs.stripe.com/payments/checkout/custom-success-page,
 * read 27 October 2026): add the "{CHECKOUT_SESSION_ID} template variable to the success_url", and "You can't rely on
 * triggering fulfilment only from your checkout landing page, because your customers aren't guaranteed to visit that
 * page." So every order still awaiting payment is read back from Stripe whenever the organiser's Promote page or the
 * admin queue opens (reconcileAwaiting), and a paid one is marked then. Fulfilment from Stripe's webhook is the next
 * stage: the payment webhook is the platform's money path and is not changed by this train.
 */

type Admin = ReturnType<typeof createAdminClient>

export type OfferKind = 'featured_slot' | 'service'
export type Placement = 'homepage' | 'city'

export interface Offer {
  readonly id: string
  readonly key: string
  readonly kind: OfferKind
  readonly name: string
  readonly description: string
  readonly placement: Placement | null
  readonly priceCents: number | null
  readonly slots: number | null
}

const FEATURED_DAYS = 7
const DAY_MS = 86_400_000
/** Stripe's own default life of a Checkout Session: "By default, this value is 24 hours from creation" (expires_at, read 27 October 2026). */
const CHECKOUT_LIFE_MS = DAY_MS

/**
 * The slots of a featured offer already taken: those paid and still running, and those awaiting a payment Stripe could
 * still take, so a slot is never sold twice and a paid listing is never left out of a full row. Null when unreadable.
 */
export async function slotsTaken(admin: Admin, offerId: string, now: Date): Promise<number | null> {
  const [running, waiting] = await Promise.all([
    admin.from('promotion_orders').select('id').eq('offer_id', offerId).in('status', ['paid', 'done']).gt('ends_at', now.toISOString()).limit(500),
    admin
      .from('promotion_orders')
      .select('id')
      .eq('offer_id', offerId)
      .eq('status', 'awaiting_payment')
      .gt('created_at', new Date(now.getTime() - CHECKOUT_LIFE_MS).toISOString())
      .limit(500),
  ])
  if (running.error || waiting.error) return null
  return (running.data ?? []).length + (waiting.data ?? []).length
}

export async function offersOf(admin: Admin): Promise<Offer[]> {
  const { data, error } = await admin
    .from('promotion_offers')
    .select('id, key, kind, name, description, placement, price_cents, slots')
    .order('sort_order', { ascending: true })
    .limit(50)
  if (error) throw new Error(`the promotion offers could not be read: ${error.message}`)
  return (data ?? []).map((r) => ({ id: r.id, key: r.key, kind: r.kind, name: r.name, description: r.description, placement: r.placement, priceCents: r.price_cents, slots: r.slots }))
}

/** Lawal's price for an offer, in whole dollars as typed, or empty for not on sale. */
export function priceFromDollars(typed: string): number | null | 'invalid' {
  const t = typed.trim().replace(/,/g, '')
  if (t === '') return null
  if (!/^[0-9]{1,6}(\.[0-9]{1,2})?$/.test(t)) return 'invalid'
  const [whole, part = ''] = t.split('.')
  const cents = Number(whole) * 100 + Number(part.padEnd(2, '0'))
  return cents > 0 ? cents : 'invalid'
}

export async function setOfferPrice(admin: Admin, offerId: string, priceCents: number | null, by: string): Promise<boolean> {
  const { error } = await admin.from('promotion_offers').update({ price_cents: priceCents, updated_at: new Date().toISOString(), updated_by: by }).eq('id', offerId)
  return error === null
}

/** The organiser's own published listings still to come, which a promotion may be for. */
export async function promotableEvents(admin: Admin, organisationId: string, now: Date): Promise<{ readonly id: string; readonly title: string; readonly city: string | null }[]> {
  const { data, error } = await admin
    .from('events')
    .select('id, title, city_primary')
    .eq('organisation_id', organisationId)
    .eq('status', 'published')
    .or(listingWindowOrPredicate(now))
    .order('start_date', { ascending: true })
    .limit(100)
  if (error) throw new Error(`the organiser's listings could not be read: ${error.message}`)
  return (data ?? []).map((e) => ({ id: e.id, title: e.title, city: e.city_primary }))
}

export type StartResult = { readonly state: 'checkout'; readonly url: string } | { readonly state: 'refused'; readonly reason: string }

export async function startOrder(
  admin: Admin,
  stripe: Pick<Stripe, 'checkout'>,
  input: { readonly offerId: string; readonly eventId: string; readonly organisationId: string; readonly userId: string; readonly origin: string; readonly now: Date },
): Promise<StartResult> {
  if (!(await isFeatureEnabled('paid_promotions'))) return { state: 'refused', reason: 'Promotions are not open yet. Nothing was ordered or charged.' }
  const offers = await offersOf(admin)
  const offer = offers.find((o) => o.id === input.offerId)
  if (offer === undefined) return { state: 'refused', reason: 'That is not something on the menu.' }
  if (offer.priceCents === null) return { state: 'refused', reason: `${offer.name} is not on sale yet.` }
  const events = await promotableEvents(admin, input.organisationId, input.now)
  const event = events.find((e) => e.id === input.eventId)
  if (event === undefined) return { state: 'refused', reason: 'Choose one of your own listings still to come.' }
  if (offer.kind === 'featured_slot' && offer.placement === 'city' && event.city === null) return { state: 'refused', reason: 'That listing has no city, so it cannot be featured on a city page.' }
  if (offer.kind === 'featured_slot' && offer.slots !== null) {
    const taken = await slotsTaken(admin, offer.id, input.now)
    if (taken === null) return { state: 'refused', reason: 'Nothing was ordered, because the records could not be reached. Try again in a minute.' }
    if (taken >= offer.slots) return { state: 'refused', reason: `Every slot for ${offer.name} is taken this week. A slot frees when a featured week ends.` }
  }

  const { data: order, error } = await admin
    .from('promotion_orders')
    .insert({ offer_id: offer.id, organisation_id: input.organisationId, event_id: event.id, amount_cents: offer.priceCents, ordered_by: input.userId })
    .select('id')
    .single()
  if (error || order === null) return { state: 'refused', reason: 'Nothing was ordered, because the records could not be reached. Try again in a minute.' }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.id,
    metadata: { promotion_order_id: order.id },
    line_items: [{ quantity: 1, price_data: { currency: 'aud', unit_amount: offer.priceCents, product_data: { name: `${offer.name}: ${event.title}` } } }],
    success_url: `${input.origin}/dashboard/promote?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/dashboard/promote?cancelled=1`,
  })
  await admin.from('promotion_orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id)
  if (session.url === null) return { state: 'refused', reason: 'Stripe did not give a payment page just now. Try again in a minute.' }
  return { state: 'checkout', url: session.url }
}

/** Marks the order paid only when Stripe says this session, for this organiser's order, is paid. */
export async function confirmPaid(
  admin: Admin,
  stripe: Pick<Stripe, 'checkout'>,
  input: { readonly sessionId: string; readonly organisationId: string; readonly now: Date },
): Promise<{ readonly state: 'paid' | 'already' } | { readonly state: 'refused'; readonly reason: string }> {
  const session = await stripe.checkout.sessions.retrieve(input.sessionId)
  const orderId = session.client_reference_id
  if (orderId === null) return { state: 'refused', reason: 'That payment is not one of your orders.' }
  const { data: order, error } = await admin
    .from('promotion_orders')
    .select('id, organisation_id, status, stripe_checkout_session_id, offer_id')
    .eq('id', orderId)
    .maybeSingle()
  if (error || order === null || order.organisation_id !== input.organisationId || order.stripe_checkout_session_id !== session.id) {
    return { state: 'refused', reason: 'That payment is not one of your orders.' }
  }
  if (order.status !== 'awaiting_payment') return { state: 'already' }
  if (session.payment_status !== 'paid') return { state: 'refused', reason: 'Stripe has not taken that payment, so nothing was ordered.' }
  const { data: offer } = await admin.from('promotion_offers').select('kind').eq('id', order.offer_id).maybeSingle()
  const featured = offer?.kind === 'featured_slot'
  const { error: paidError } = await admin
    .from('promotion_orders')
    .update({
      status: 'paid',
      paid_at: input.now.toISOString(),
      ...(featured ? { starts_at: input.now.toISOString(), ends_at: new Date(input.now.getTime() + FEATURED_DAYS * DAY_MS).toISOString() } : {}),
    })
    .eq('id', order.id)
    .eq('status', 'awaiting_payment')
  if (paidError) return { state: 'refused', reason: 'Your payment was taken, and the order could not be marked just now. It will show once it is.' }
  return { state: 'paid' }
}

export interface FeaturedListing {
  readonly orderId: string
  readonly eventId: string
  readonly slug: string
  readonly title: string
  readonly city: string | null
  readonly coverUrl: string | null
  readonly startDate: string
}

/** The featured listings running now for a placement, newest paid first, never more than its slots. */
export async function featuredNow(admin: Admin, placement: Placement, now: Date, citySlug: string | null = null): Promise<FeaturedListing[]> {
  const { data: offerRow } = await admin.from('promotion_offers').select('id, slots').eq('kind', 'featured_slot').eq('placement', placement).maybeSingle()
  if (!offerRow) return []
  const at = now.toISOString()
  const { data, error } = await admin
    .from('promotion_orders')
    .select('id, event_id, paid_at, events(slug, title, city_primary, cover_image_url, start_date, end_date, timezone, status, visibility)')
    .eq('offer_id', offerRow.id)
    .in('status', ['paid', 'done'])
    .lte('starts_at', at)
    .gt('ends_at', at)
    .order('paid_at', { ascending: false })
    .limit(48)
  if (error) return []
  type Ev = { slug: string; title: string; city_primary: string | null; cover_image_url: string | null; start_date: string; end_date: string | null; timezone: string | null; status: string; visibility: string }
  const one = (e: Ev | Ev[] | null): Ev | null => (Array.isArray(e) ? (e[0] ?? null) : e)
  return (data ?? [])
    .map((r) => ({ r, e: one(r.events as Ev | Ev[] | null) }))
    .filter(({ e }) => e !== null && e.status === PUBLIC_EVENT_MATCH.status && e.visibility === PUBLIC_EVENT_MATCH.visibility && isStillListed(e, now) && (citySlug === null || e.city_primary === citySlug))
    .slice(0, offerRow.slots ?? 4)
    .map(({ r, e }) => ({ orderId: r.id, eventId: r.event_id, slug: e!.slug, title: e!.title, city: e!.city_primary, coverUrl: e!.cover_image_url, startDate: e!.start_date }))
}

export interface QueuedOrder {
  readonly id: string
  readonly offerName: string
  readonly kind: OfferKind
  readonly status: 'awaiting_payment' | 'paid' | 'cancelled' | 'done'
  readonly amountCents: number
  readonly organisationName: string
  readonly eventTitle: string | null
  readonly createdAt: string
  readonly paidAt: string | null
  readonly endsAt: string | null
}

export async function ordersQueue(admin: Admin): Promise<QueuedOrder[]> {
  const { data, error } = await admin
    .from('promotion_orders')
    .select('id, status, amount_cents, created_at, paid_at, ends_at, promotion_offers(name, kind), organisations(name), events(title)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`the promotion orders could not be read: ${error.message}`)
  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x)
  return (data ?? []).map((r) => {
    const offer = one(r.promotion_offers as { name: string; kind: OfferKind } | { name: string; kind: OfferKind }[] | null)
    const org = one(r.organisations as { name: string } | { name: string }[] | null)
    const ev = one(r.events as { title: string } | { title: string }[] | null)
    return {
      id: r.id,
      offerName: offer?.name ?? 'An offer',
      kind: offer?.kind ?? 'service',
      status: r.status,
      amountCents: r.amount_cents,
      organisationName: org?.name ?? 'An organiser',
      eventTitle: ev?.title ?? null,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      endsAt: r.ends_at,
    }
  })
}

export async function markOrderDone(admin: Admin, orderId: string, by: string): Promise<boolean> {
  const { error } = await admin.from('promotion_orders').update({ status: 'done', done_at: new Date().toISOString(), done_by: by }).eq('id', orderId).eq('status', 'paid')
  return error === null
}

/** Reads back from Stripe every order still awaiting payment (one organiser's, or every one for the admin queue). */
export async function reconcileAwaiting(admin: Admin, stripe: Pick<Stripe, 'checkout'>, organisationId: string | null, now: Date): Promise<number> {
  const q = admin
    .from('promotion_orders')
    .select('id, organisation_id, stripe_checkout_session_id')
    .eq('status', 'awaiting_payment')
    .not('stripe_checkout_session_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(50)
  const { data, error } = organisationId === null ? await q : await q.eq('organisation_id', organisationId)
  if (error) return 0
  let paid = 0
  for (const o of data ?? []) {
    const done = await confirmPaid(admin, stripe, { sessionId: o.stripe_checkout_session_id as string, organisationId: o.organisation_id, now }).catch(() => null)
    if (done?.state === 'paid') paid += 1
  }
  return paid
}

/** For a public page: the featured row, or none when the records cannot be reached, so a page never fails on it. */
export async function featuredForPage(placement: Placement, citySlug: string | null = null): Promise<FeaturedListing[]> {
  try {
    if (!(await isFeatureEnabled('paid_promotions'))) return []
    return await featuredNow(createAdminClient(), placement, new Date(), citySlug)
  } catch {
    return []
  }
}
