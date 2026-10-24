import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { escapeOrValue } from '@/lib/supabase/or-filter'
import { isPlatformChannel } from '@/lib/broadcast/sales-attribution'
import {
  isListing,
  type ConversionRow,
  type ListingEventRow,
  type OrderRow,
  type OrganisationRow,
  type ReadRows,
  type ShareLinkRow,
} from './assemble'
import type { OrganiserReadRequest } from './request'

/**
 * THE ROWS BEHIND BOOKEDPROOF'S ORGANISER READ (E51), read with the service
 * role. The endpoint has already verified the signature before anything here
 * runs; nothing here decides what leaves, `assemble.ts` does, from an
 * allow-list.
 *
 * Every read is paged past the 1,000-row ceiling (readEveryRow) and every id
 * list is chunked under the URL bound (chunkInFilterValues), the platform's two
 * standing rules for a read that must be whole.
 *
 * WHO "AN ADDRESS" IS (the contract's section 4): an organisation whose contact
 * email is that address, or whose owner signs in with it, compared exactly once
 * lower-cased. The database is asked case-insensitively with LIKE's own
 * wildcards escaped, and every candidate is then compared exactly here, so a
 * stray pattern can only ever over-ask, never over-answer.
 *
 * WHAT THE BUYER'S ADDRESS IS USED FOR, and the only thing: deciding, inside
 * EventLinqs, whether an order is that buyer's first paid order. The address
 * and the user id are read into this module and go no further; the response
 * carries one true or false.
 */

const LISTING_COLUMNS = 'id, organisation_id, slug, title, status, start_date, published_at, visibility'
const ORDER_COLUMNS =
  'id, event_id, status, confirmed_at, cancelled_at, updated_at, platform_fee_retained_cents, currency, user_id, guest_email'

type BuyerOrderRow = OrderRow & { user_id: string | null; guest_email: string | null }

/** A LIKE pattern that matches the text exactly, ignoring case only. */
export function likeExact(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const exactly = (stored: string | null | undefined, asked: string) => (stored ?? '').trim().toLowerCase() === asked

async function inChunks<T>(values: readonly string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (const chunk of chunkInFilterValues([...new Set(values)])) out.push(...(await read(chunk)))
  return out
}

/** Runs the tasks a few at a time, in order of the list, and keeps every answer. */
async function inTurn<T, R>(items: readonly T[], width: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const lanes = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await run(items[i])
    }
  })
  await Promise.all(lanes)
  return out
}

export async function readOrganiserRows(request: OrganiserReadRequest): Promise<ReadRows> {
  const admin = createAdminClient()
  const { emails, pages } = request

  // 1. The organisations each address names: contact email, or the owner's sign-in.
  const ilikeAny = (column: string, chunk: string[]) =>
    chunk.map((e) => `${column}.ilike.${escapeOrValue(likeExact(e))}`).join(',')

  const byContact = await inChunks(emails, (chunk) =>
    readEveryRow<OrganisationRow & { email: string | null; owner_id: string }>('organisations by contact address', (from, to) =>
      admin
        .from('organisations')
        .select('id, name, email, owner_id')
        .or(ilikeAny('email', chunk))
        .order('id', { ascending: true })
        .range(from, to),
    ),
  )
  const owners = await inChunks(emails, (chunk) =>
    readEveryRow<{ id: string; email: string | null }>('owners by sign-in address', (from, to) =>
      admin
        .from('profiles')
        .select('id, email')
        .or(ilikeAny('email', chunk))
        .order('id', { ascending: true })
        .range(from, to),
    ),
  )
  const owned = await inChunks(
    owners.map((p) => p.id),
    (chunk) =>
      readEveryRow<OrganisationRow & { owner_id: string }>('organisations of those owners', (from, to) =>
        admin
          .from('organisations')
          .select('id, name, owner_id')
          .in('owner_id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
      ),
  )

  const organisations = new Map<string, OrganisationRow>()
  const organisationsByEmail = new Map<string, OrganisationRow[]>()
  for (const email of emails) {
    const ownerIds = new Set(owners.filter((p) => exactly(p.email, email)).map((p) => p.id))
    const found = new Map<string, OrganisationRow>()
    for (const o of byContact) if (exactly(o.email, email)) found.set(o.id, { id: o.id, name: o.name })
    for (const o of owned) if (ownerIds.has(o.owner_id)) found.set(o.id, { id: o.id, name: o.name })
    for (const o of found.values()) organisations.set(o.id, o)
    organisationsByEmail.set(email, [...found.values()])
  }

  // 2. The listing each page names, and the organisation it belongs to.
  const pageEvents = await inChunks(
    pages.map((p) => p.slug),
    (chunk) =>
      readEveryRow<ListingEventRow>('the listings the pages name', (from, to) =>
        admin.from('events').select(LISTING_COLUMNS).in('slug', chunk).order('id', { ascending: true }).range(from, to),
      ),
  )
  const listingBySlug = new Map<string, ListingEventRow>()
  for (const e of pageEvents) if (isListing(e)) listingBySlug.set(e.slug, e)
  const pageOrgIds = [...new Set([...listingBySlug.values()].map((e) => e.organisation_id))].filter((id) => !organisations.has(id))
  const pageOrgs = await inChunks(pageOrgIds, (chunk) =>
    readEveryRow<OrganisationRow>('the organisations behind those pages', (from, to) =>
      admin.from('organisations').select('id, name').in('id', chunk).order('id', { ascending: true }).range(from, to),
    ),
  )
  for (const o of pageOrgs) organisations.set(o.id, { id: o.id, name: o.name })

  // 3. Every listing of every organisation named.
  const events = (
    await inChunks([...organisations.keys()], (chunk) =>
      readEveryRow<ListingEventRow>('the listings of those organisations', (from, to) =>
        admin
          .from('events')
          .select(LISTING_COLUMNS)
          .in('organisation_id', chunk)
          .not('published_at', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      ),
    )
  ).filter(isListing)
  const eventIds = events.map((e) => e.id)

  // 4. The organiser's own share links on those listings, and their conversions.
  const links = (
    await inChunks(eventIds, (chunk) =>
      readEveryRow<ShareLinkRow & { artist_id: string | null }>('the share links on those listings', (from, to) =>
        admin
          .from('share_links')
          .select('id, event_id, code, channel, created_at, artist_id')
          .in('event_id', chunk)
          .is('artist_id', null)
          .order('id', { ascending: true })
          .range(from, to),
      ),
    )
  )
    .filter((l) => l.artist_id === null && !isPlatformChannel(l.channel))
    .map(({ id, event_id, code, channel, created_at }) => ({ id, event_id, code, channel, created_at }))

  const conversions = await inChunks(
    links.map((l) => l.id),
    (chunk) =>
      readEveryRow<ConversionRow>('the conversions on those share links', (from, to) =>
        admin
          .from('share_link_events')
          .select('link_id, order_id, occurred_at')
          .eq('kind', 'conversion')
          .in('link_id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
      ),
  )

  // 5. Those orders, their tickets and their refunds.
  const orderIds = [...new Set(conversions.map((c) => c.order_id).filter((id): id is string => !!id))]
  const orderRows = await inChunks(orderIds, (chunk) =>
    readEveryRow<BuyerOrderRow>('the orders through those links', (from, to) =>
      admin.from('orders').select(ORDER_COLUMNS).in('id', chunk).order('id', { ascending: true }).range(from, to),
    ),
  )
  const paidRows = orderRows.filter((o) => o.confirmed_at !== null)
  const paidIds = paidRows.map((o) => o.id)

  const tickets = new Map<string, number>()
  for (const t of await inChunks(paidIds, (chunk) =>
    readEveryRow<{ order_id: string }>('the tickets on those orders', (from, to) =>
      admin.from('tickets').select('id, order_id').in('order_id', chunk).order('id', { ascending: true }).range(from, to),
    ),
  )) {
    tickets.set(t.order_id, (tickets.get(t.order_id) ?? 0) + 1)
  }

  const refundedAt = new Map<string, string>()
  for (const r of await inChunks(paidIds, (chunk) =>
    readEveryRow<{ order_id: string; status: string; created_at: string; processed_at: string | null }>(
      'the refunds on those orders',
      (from, to) =>
        admin
          .from('refunds')
          .select('id, order_id, status, created_at, processed_at')
          .in('order_id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
    ),
  )) {
    if (r.status === 'failed' || r.status === 'cancelled') continue
    const at = r.processed_at ?? r.created_at
    const prior = refundedAt.get(r.order_id)
    if (!prior || Date.parse(at) < Date.parse(prior)) refundedAt.set(r.order_id, at)
  }

  // 6. Each buyer's first paid order anywhere on EventLinqs, decided here and kept here.
  const buyerOf = (o: BuyerOrderRow) =>
    o.user_id ? `user:${o.user_id}` : o.guest_email ? `guest:${o.guest_email.trim().toLowerCase()}` : null
  const buyers = [...new Set(paidRows.map(buyerOf).filter((b): b is string => b !== null))]
  const firstOrderOf = new Map<string, string | null>()
  await inTurn(buyers, 6, async (buyer) => {
    const query = admin.from('orders').select('id, confirmed_at').not('confirmed_at', 'is', null)
    const scoped = buyer.startsWith('user:')
      ? query.eq('user_id', buyer.slice(5))
      : query.is('user_id', null).or(`guest_email.ilike.${escapeOrValue(likeExact(buyer.slice(6)))}`)
    const { data, error } = await scoped
      .order('confirmed_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
    if (error) throw new Error(`a buyer's first paid order could not be read: ${(error as { message?: string }).message ?? error}`)
    firstOrderOf.set(buyer, data?.[0]?.id ?? null)
  })
  const buyersFirst = new Set<string>()
  for (const o of paidRows) {
    const buyer = buyerOf(o)
    if (buyer && firstOrderOf.get(buyer) === o.id) buyersFirst.add(o.id)
  }

  const orders = new Map<string, OrderRow>()
  for (const o of orderRows) {
    orders.set(o.id, {
      id: o.id,
      event_id: o.event_id,
      status: o.status,
      confirmed_at: o.confirmed_at,
      cancelled_at: o.cancelled_at,
      updated_at: o.updated_at,
      platform_fee_retained_cents: o.platform_fee_retained_cents,
      currency: o.currency,
    })
  }

  // 7. The currency a listing with no orders is priced in.
  const tierCurrency = new Map<string, string>()
  for (const t of await inChunks(eventIds, (chunk) =>
    readEveryRow<{ event_id: string; currency: string }>('the ticket tiers of those listings', (from, to) =>
      admin.from('ticket_tiers').select('id, event_id, currency').in('event_id', chunk).order('id', { ascending: true }).range(from, to),
    ),
  )) {
    if (!tierCurrency.has(t.event_id) && t.currency) tierCurrency.set(t.event_id, t.currency)
  }

  return {
    organisationsByEmail,
    listingBySlug,
    organisations,
    events,
    links,
    conversions,
    orders,
    facts: { tickets, refundedAt, buyersFirst },
    tierCurrency,
  }
}
