import { orderKey } from './signature'

/**
 * THE ANSWER TO BOOKEDPROOF'S ORGANISER READ, COMPOSED FROM ROWS ALREADY READ
 * (E51, "the won organiser"). Pure, so every definition below is pinned by a
 * unit test without a database.
 *
 * The contract is C:\dev\EVIDENCE\WI1\EL-BOOKEDPROOF-ORGANISER-READ-CONTRACT.md,
 * sections 4, 9 and 10, as the project manager reconciled it at 10:05 on
 * 23 October 2026. Every key this module writes is on the allow-list its test
 * walks, and NOTHING ABOUT ANY BUYER leaves: no name, email, phone, order id,
 * ticket id or visitor hash. An order is named only by `order_key`, the HMAC of
 * its id under the shared secret, and the buyer only by one true or false.
 *
 * THE DEFINITIONS, each one the test pins:
 *
 *   a listing        an event of the organisation that has been published
 *                    (`published_at` set) and is PUBLIC. A draft, an event put
 *                    back to draft (which clears `published_at`), an unlisted
 *                    and a private event are never returned. Newest first by
 *                    start, then by id.
 *   its share links  the ORGANISER'S OWN links on that event: `share_links` with
 *                    no artist (an artist's link is the artist's sharing) on a
 *                    channel the organiser shares through. The weekly digest is
 *                    EventLinqs's own channel (PLATFORM_OWNED_CHANNELS in
 *                    sales-attribution.ts) and is not the organiser's link.
 *   an order         one entry per order whose conversion is recorded against
 *                    one of those links (`share_link_events`, kind conversion),
 *                    first touch when an order carries two, that was paid
 *                    (`confirmed_at` set). Oldest paid first.
 *   reversed         its status is refunded, partially refunded or cancelled:
 *                    any reversal and the whole order is off.
 *   the sums         tickets and retained fee over the listing's orders NOT
 *                    reversed, whole, never limited by `since`. A retained fee
 *                    the ledger never recorded (an order from before
 *                    20 September 2026, when MONEY FIX A4 began writing it) is
 *                    returned as null and adds nothing to the sum.
 *   since            limits each listing's `orders` to orders paid, or
 *                    reversed, at or after it. A reversal whose moment the
 *                    ledger does not hold is returned in every `since` read, the
 *                    cautious direction: Bookedproof hears of every reversal.
 */

export const REVERSED_STATUSES = ['refunded', 'partially_refunded', 'cancelled'] as const

export type OrganisationRow = { id: string; name: string }

export type ListingEventRow = {
  id: string
  organisation_id: string
  slug: string
  title: string
  status: string
  start_date: string
  published_at: string | null
  visibility: string
}

export type ShareLinkRow = {
  id: string
  event_id: string
  code: string
  channel: string
  created_at: string
}

export type ConversionRow = { link_id: string; order_id: string | null; occurred_at: string }

export type OrderRow = {
  id: string
  event_id: string
  status: string
  confirmed_at: string | null
  cancelled_at: string | null
  updated_at: string
  platform_fee_retained_cents: number | null
  currency: string
}

/** Facts about orders that come from other tables, keyed by order id. */
export type OrderFacts = {
  tickets: ReadonlyMap<string, number>
  /** The earliest refund recorded against the order. */
  refundedAt: ReadonlyMap<string, string>
  /** Orders that are their buyer's first paid order anywhere on EventLinqs. */
  buyersFirst: ReadonlySet<string>
}

export type ShareLinkEntry = { code: string; url: string; channel: string; created_at: string }

export type OrderEntry = {
  order_key: string
  share_code: string
  tickets: number
  fee_retained_cents: number | null
  paid_at: string
  reversed: boolean
  buyer_first_paid_order: boolean
}

export type ListingEntry = {
  event_id: string
  url: string
  title: string
  status: string
  starts_at: string
  first_published_at: string | null
  share_links: ShareLinkEntry[]
  orders: OrderEntry[]
  tickets_through_share_links: number
  fee_through_share_links_cents: number
  currency: string | null
}

export type EmailEntry =
  | { email: string; found: false }
  | { email: string; found: true; listed: boolean; listings: ListingEntry[] }

export type PageEntry =
  | { page: string; found: false }
  | { page: string; found: true; organisation_name: string; listed: boolean; listings: ListingEntry[] }

export type OrganiserReadResponse = {
  version: 1
  generated_at: string
  organisers: Array<EmailEntry | PageEntry>
}

/**
 * The visibilities a listing may have, as an ALLOW-LIST (src/lib/events/visibility.ts:
 * "Written as an allow-list so a new enum member can never silently become
 * public"): PUBLIC ONLY (project manager, 24 October 2026, 07:05; the
 * contract's section 11 as amended). The founder's ruling of 9 August holds
 * unlisted as not publicly discoverable, and a read that told another system
 * about an organiser's unlisted events would be wider than its purpose needs.
 * Unlisted and private are never listings, and neither is any value a future
 * migration adds until it is named here. Widening this is the founder's word.
 */
export const LISTING_VISIBILITIES: readonly string[] = ['public']

/** The one rule for which events are listings. */
export function isListing(event: Pick<ListingEventRow, 'published_at' | 'visibility' | 'status'>): boolean {
  return event.published_at !== null && LISTING_VISIBILITIES.includes(event.visibility) && event.status !== 'draft'
}

export const isReversed = (status: string) => (REVERSED_STATUSES as readonly string[]).includes(status)

/**
 * When a reversed order was reversed, as far as the ledger says: its first
 * refund, else its cancellation, else null (unknown).
 */
export function reversedAt(order: OrderRow, refundedAt: ReadonlyMap<string, string>): string | null {
  if (!isReversed(order.status)) return null
  return refundedAt.get(order.id) ?? order.cancelled_at ?? null
}

export function inSince(order: OrderRow, refundedAt: ReadonlyMap<string, string>, since: Date | null): boolean {
  if (since === null) return true
  const t = since.getTime()
  if (order.confirmed_at !== null && Date.parse(order.confirmed_at) >= t) return true
  if (!isReversed(order.status)) return false
  const at = reversedAt(order, refundedAt)
  return at === null || Date.parse(at) >= t
}

/** First touch: the earliest conversion row per order, among the given links. */
export function firstTouch(
  conversions: readonly ConversionRow[],
  linkIds: ReadonlySet<string>,
): Map<string, ConversionRow> {
  const byOrder = new Map<string, ConversionRow>()
  for (const row of conversions) {
    if (!row.order_id || !linkIds.has(row.link_id)) continue
    const prior = byOrder.get(row.order_id)
    const order = prior ? byTime(row.occurred_at, prior.occurred_at) || byId(row.link_id, prior.link_id) : -1
    if (order < 0) byOrder.set(row.order_id, row)
  }
  return byOrder
}

/*
 * Moments are compared as moments, never as text: the database writes
 * "09:00:00+00:00" and "09:00:00.5+00:00" for times half a second apart, and a
 * fixture writes "09:00:00Z", so a string comparison is right only by luck.
 */
const byTime = (a: string, b: string) => Math.sign(Date.parse(a) - Date.parse(b))
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const newestFirst = (a: ListingEventRow, b: ListingEventRow) => byTime(b.start_date, a.start_date) || byId(a.id, b.id)

export function assembleListing(input: {
  event: ListingEventRow
  links: readonly ShareLinkRow[]
  conversions: readonly ConversionRow[]
  orders: ReadonlyMap<string, OrderRow>
  facts: OrderFacts
  tierCurrency: string | null
  secret: string
  origin: string
  since: Date | null
}): ListingEntry {
  const { event, facts, secret, origin, since } = input
  const links = input.links.filter((l) => l.event_id === event.id)
  const codeByLink = new Map(links.map((l) => [l.id, l.code]))
  const touches = firstTouch(input.conversions, new Set(codeByLink.keys()))

  const paid: Array<{ order: OrderRow; code: string }> = []
  for (const [orderId, touch] of touches) {
    const order = input.orders.get(orderId)
    if (!order || order.event_id !== event.id || order.confirmed_at === null) continue
    paid.push({ order, code: codeByLink.get(touch.link_id) as string })
  }
  paid.sort((a, b) => byTime(a.order.confirmed_at as string, b.order.confirmed_at as string) || byId(a.order.id, b.order.id))

  let tickets = 0
  let fee = 0
  const orders: OrderEntry[] = []
  for (const { order, code } of paid) {
    const reversed = isReversed(order.status)
    const count = facts.tickets.get(order.id) ?? 0
    if (!reversed) {
      tickets += count
      fee += order.platform_fee_retained_cents ?? 0
    }
    if (!inSince(order, facts.refundedAt, since)) continue
    orders.push({
      order_key: orderKey(secret, order.id),
      share_code: code,
      tickets: count,
      fee_retained_cents: order.platform_fee_retained_cents,
      paid_at: new Date(order.confirmed_at as string).toISOString(),
      reversed,
      buyer_first_paid_order: facts.buyersFirst.has(order.id),
    })
  }

  const currency = paid[0]?.order.currency ?? input.tierCurrency
  return {
    event_id: event.id,
    url: `${origin}/events/${event.slug}`,
    title: event.title,
    status: event.status,
    starts_at: new Date(event.start_date).toISOString(),
    first_published_at: event.published_at === null ? null : new Date(event.published_at).toISOString(),
    share_links: links
      .slice()
      .sort((a, b) => byTime(a.created_at, b.created_at) || byId(a.code, b.code))
      .map((l) => ({ code: l.code, url: `${origin}/e/${l.code}`, channel: l.channel, created_at: new Date(l.created_at).toISOString() })),
    orders,
    tickets_through_share_links: tickets,
    fee_through_share_links_cents: fee,
    currency: currency ? currency.toUpperCase() : null,
  }
}

/** Everything read for one request, in the shape the composition needs. */
export type ReadRows = {
  organisationsByEmail: ReadonlyMap<string, readonly OrganisationRow[]>
  /** The listing a page names, by slug, when that slug is a listing. */
  listingBySlug: ReadonlyMap<string, ListingEventRow>
  organisations: ReadonlyMap<string, OrganisationRow>
  events: readonly ListingEventRow[]
  links: readonly ShareLinkRow[]
  conversions: readonly ConversionRow[]
  orders: ReadonlyMap<string, OrderRow>
  facts: OrderFacts
  tierCurrency: ReadonlyMap<string, string>
}

export function assembleResponse(input: {
  emails: readonly string[]
  pages: ReadonlyArray<{ page: string; slug: string }>
  since: Date | null
  rows: ReadRows
  secret: string
  origin: string
  now: Date
}): OrganiserReadResponse {
  const { rows, secret, origin, since } = input
  const listingsOf = (organisationIds: readonly string[]): ListingEntry[] =>
    rows.events
      .filter((e) => organisationIds.includes(e.organisation_id) && isListing(e))
      .slice()
      .sort(newestFirst)
      .map((event) =>
        assembleListing({
          event,
          links: rows.links,
          conversions: rows.conversions,
          orders: rows.orders,
          facts: rows.facts,
          tierCurrency: rows.tierCurrency.get(event.id) ?? null,
          secret,
          origin,
          since,
        }),
      )

  const organisers: Array<EmailEntry | PageEntry> = []
  for (const email of input.emails) {
    const orgs = rows.organisationsByEmail.get(email) ?? []
    if (orgs.length === 0) {
      organisers.push({ email, found: false })
      continue
    }
    const listings = listingsOf(orgs.map((o) => o.id))
    organisers.push({ email, found: true, listed: listings.length > 0, listings })
  }
  for (const { page, slug } of input.pages) {
    const event = rows.listingBySlug.get(slug)
    const org = event ? rows.organisations.get(event.organisation_id) : undefined
    if (!event || !org || !isListing(event)) {
      organisers.push({ page, found: false })
      continue
    }
    const listings = listingsOf([org.id])
    organisers.push({ page, found: true, organisation_name: org.name, listed: listings.length > 0, listings })
  }
  return { version: 1, generated_at: input.now.toISOString(), organisers }
}
