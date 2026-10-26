import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { filterPermittedRecipients } from '@/lib/consent/resolver'
import { PAID_ORDER_STATUSES } from '@/lib/organisers/event-revenue'
import type { PlatformPageRequest, PlatformScope } from './platform-request'

/**
 * THE ROWS BEHIND BOOKEDPROOF'S PLATFORM READ (trial gate T3), read with the
 * service role after the route has verified the scope's own signature.
 *
 * READ ONLY BY CONSTRUCTION: every statement here is a select. Nothing in this
 * module or its route inserts, updates, deletes or calls a function that does;
 * the one write the read causes, its own log line, lives in platform-log.ts.
 *
 * WHAT LEAVES IS AN ALLOW-LIST, column by column, and nothing outside it is
 * ever selected, so a column added to a table later cannot leak by default:
 *
 *   organisations  who sells on EventLinqs and how much: no contact address,
 *                  no ABN, no bank or Stripe field (an organiser's address is
 *                  the E51 privacy ruling's question, the contract's section 7)
 *   events         what is on sale, when, where, and each tier's capacity,
 *                  sold count and price
 *   buyers         ONLY a person whose standing consent for
 *                  facilitated_event_marketing was given under wording that
 *                  names Bookedproof, and whom the consent resolver still
 *                  permits by email (no suppression, no later decline)
 *   ledger         every paid order's money: subtotal, discount, total, the
 *                  platform fee and what EventLinqs kept, and refunds; no
 *                  buyer field and no card field at all
 *
 * Seed and fixture events (is_seed_data) and their orders are never read: the
 * trial is on EventLinqs' real business.
 */

type Admin = ReturnType<typeof createAdminClient>

export const CONSENT_PURPOSE = 'facilitated_event_marketing'
/** The consent must have been given under wording that says this name. */
export const NAMED_PARTY = 'Bookedproof'

export type PlatformPage<T> = { rows: T[]; next: string | null }

export type OrganisationOut = {
  id: string
  name: string
  slug: string
  status: string | null
  city: string | null
  created_at: string
  event_count: number | null
  volume_cents: number | null
}

export type TierOut = { id: string; name: string; price_cents: number; capacity: number; sold: number }

export type EventOut = {
  id: string
  organisation_id: string
  slug: string
  title: string
  status: string | null
  visibility: string | null
  entry_mode: string | null
  is_free: boolean | null
  start_date: string
  end_date: string | null
  timezone: string | null
  city: string | null
  category: string | null
  published_at: string | null
  created_at: string
  tiers: TierOut[]
}

export type BuyerOut = {
  email: string
  first_name: string | null
  consent_given_at: string
  consent_wording_version: string
  orders: number
  event_ids: string[]
  first_order_at: string
  last_order_at: string
}

export type LedgerOut = {
  order_id: string
  event_id: string
  organisation_id: string | null
  status: string
  currency: string
  created_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  platform_fee_cents: number
  platform_fee_retained_cents: number | null
  refunded_cents: number
}

const pageOf = <T>(rows: T[], limit: number, keyOf: (row: T) => string): PlatformPage<T> => ({
  rows,
  next: rows.length === limit ? keyOf(rows[rows.length - 1]) : null,
})

const fail = (what: string, message: string): never => {
  throw new Error(`${what} could not be read: ${message}`)
}

/** The ids of every seed event, so no read hands one over. */
async function seedEventIds(admin: Admin): Promise<Set<string>> {
  const rows = await readEveryRow<{ id: string }>('seed events', (from, to) =>
    admin.from('events').select('id').eq('is_seed_data', true).order('id', { ascending: true }).range(from, to),
  )
  return new Set(rows.map((r) => r.id))
}

export async function readOrganisationsPage(admin: Admin, req: PlatformPageRequest): Promise<PlatformPage<OrganisationOut>> {
  let q = admin
    .from('organisations')
    .select('id, name, slug, status, founding_city, created_at, total_event_count, total_volume_cents')
    .order('id', { ascending: true })
    .limit(req.limit)
  if (req.after) q = q.gt('id', req.after)
  const { data, error } = await q
  if (error) fail('organisations', error.message)
  const rows: OrganisationOut[] = (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    status: o.status ?? null,
    city: o.founding_city ?? null,
    created_at: o.created_at,
    event_count: o.total_event_count ?? null,
    volume_cents: o.total_volume_cents ?? null,
  }))
  return pageOf(rows, req.limit, (r) => r.id)
}

export async function readEventsPage(admin: Admin, req: PlatformPageRequest): Promise<PlatformPage<EventOut>> {
  let q = admin
    .from('events')
    .select(
      'id, organisation_id, slug, title, status, visibility, entry_mode, is_free, start_date, end_date, timezone, venue_city, published_at, created_at, category:event_categories(slug), ticket_tiers(id, name, price, total_capacity, sold_count)',
    )
    .eq('is_seed_data', false)
    .order('id', { ascending: true })
    .limit(req.limit)
  if (req.after) q = q.gt('id', req.after)
  const { data, error } = await q
  if (error) fail('events', error.message)
  type Row = {
    id: string
    organisation_id: string
    slug: string
    title: string
    status: string | null
    visibility: string | null
    entry_mode: string | null
    is_free: boolean | null
    start_date: string
    end_date: string | null
    timezone: string | null
    venue_city: string | null
    published_at: string | null
    created_at: string
    category: { slug: string } | { slug: string }[] | null
    ticket_tiers: { id: string; name: string; price: number; total_capacity: number; sold_count: number }[] | null
  }
  const rows: EventOut[] = ((data ?? []) as unknown as Row[]).map((e) => {
    const category = Array.isArray(e.category) ? e.category[0] : e.category
    return {
      id: e.id,
      organisation_id: e.organisation_id,
      slug: e.slug,
      title: e.title,
      status: e.status,
      visibility: e.visibility,
      entry_mode: e.entry_mode,
      is_free: e.is_free,
      start_date: e.start_date,
      end_date: e.end_date,
      timezone: e.timezone,
      city: e.venue_city,
      category: category?.slug ?? null,
      published_at: e.published_at,
      created_at: e.created_at,
      tiers: (e.ticket_tiers ?? [])
        .map((t) => ({ id: t.id, name: t.name, price_cents: t.price, capacity: t.total_capacity, sold: t.sold_count }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }
  })
  return pageOf(rows, req.limit, (r) => r.id)
}

export async function readLedgerPage(admin: Admin, req: PlatformPageRequest): Promise<PlatformPage<LedgerOut>> {
  const seeds = await seedEventIds(admin)
  const rows: LedgerOut[] = []
  let after = req.after
  // A page drops any seed event's orders, so it reads on until it is full or the ledger ends.
  for (let pass = 0; pass < 20 && rows.length < req.limit; pass++) {
    let q = admin
      .from('orders')
      .select(
        'id, event_id, organisation_id, status, currency, created_at, confirmed_at, cancelled_at, subtotal_cents, discount_cents, total_cents, platform_fee_cents, platform_fee_retained_cents',
      )
      .in('status', PAID_ORDER_STATUSES as unknown as string[])
      .order('id', { ascending: true })
      .limit(req.limit)
    if (after) q = q.gt('id', after)
    const { data, error } = await q
    if (error) fail('the ledger', error.message)
    const batch = data ?? []
    if (batch.length === 0) break
    after = batch[batch.length - 1].id
    for (const o of batch) {
      if (seeds.has(o.event_id) || rows.length >= req.limit) continue
      rows.push({
        order_id: o.id,
        event_id: o.event_id,
        organisation_id: o.organisation_id ?? null,
        status: o.status,
        currency: o.currency,
        created_at: o.created_at,
        confirmed_at: o.confirmed_at ?? null,
        cancelled_at: o.cancelled_at ?? null,
        subtotal_cents: o.subtotal_cents,
        discount_cents: o.discount_cents ?? 0,
        total_cents: o.total_cents,
        platform_fee_cents: o.platform_fee_cents ?? 0,
        platform_fee_retained_cents: o.platform_fee_retained_cents ?? null,
        refunded_cents: 0,
      })
    }
    if (batch.length < req.limit) break
  }

  // Refunds completed (refund_status 'completed'), summed per order, so the ledger is net of them.
  const ids = rows.map((r) => r.order_id)
  const refunded = new Map<string, number>()
  for (const chunk of chunkInFilterValues(ids)) {
    const part = await readEveryRow<{ order_id: string; amount_cents: number }>('refunds', (from, to) =>
      admin
        .from('refunds')
        .select('order_id, amount_cents')
        .in('order_id', chunk)
        .eq('status', 'completed')
        .order('id', { ascending: true })
        .range(from, to),
    )
    for (const r of part) refunded.set(r.order_id, (refunded.get(r.order_id) ?? 0) + r.amount_cents)
  }
  for (const r of rows) r.refunded_cents = refunded.get(r.order_id) ?? 0
  return { rows, next: rows.length === req.limit ? rows[rows.length - 1].order_id : null }
}

type BuyerOrder = { id: string; event_id: string; created_at: string; user_id: string | null; guest_email: string | null; guest_name: string | null }

/** The first word of a name, or null; never the rest of it. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first ? first : null
}

/**
 * Of a subject's consent events for the purpose, the one in force: the newest
 * by occurred_at. It counts only when it is a grant whose own wording names
 * Bookedproof. A later decline or a grant under other wording ends it.
 */
export function standingBookedproofConsent(
  events: { decision: string; wording: string | null; wording_version: string; occurred_at: string }[],
): { occurred_at: string; wording_version: string } | null {
  const newest = [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
  if (!newest || newest.decision !== 'granted') return null
  if (!(newest.wording ?? '').includes(NAMED_PARTY)) return null
  return { occurred_at: newest.occurred_at, wording_version: newest.wording_version }
}

export async function readBuyersPage(admin: Admin, req: PlatformPageRequest, now: Date = new Date()): Promise<PlatformPage<BuyerOut>> {
  const seeds = await seedEventIds(admin)
  const orders = (
    await readEveryRow<BuyerOrder>('paid orders', (from, to) =>
      admin
        .from('orders')
        .select('id, event_id, created_at, user_id, guest_email, guest_name')
        .in('status', PAID_ORDER_STATUSES as unknown as string[])
        .order('id', { ascending: true })
        .range(from, to),
    )
  ).filter((o) => !seeds.has(o.event_id))

  const userIds = [...new Set(orders.map((o) => o.user_id).filter((v): v is string => !!v))]
  const profiles = new Map<string, { email: string | null; full_name: string | null; display_name: string | null }>()
  for (const chunk of chunkInFilterValues(userIds)) {
    const { data, error } = await admin.from('profiles').select('id, email, full_name, display_name').in('id', chunk)
    if (error) fail('buyer profiles', error.message)
    for (const p of data ?? []) profiles.set(p.id, { email: p.email, full_name: p.full_name, display_name: p.display_name })
  }

  type Acc = { email: string; name: string | null; orders: number; events: Set<string>; first: string; last: string }
  const byEmail = new Map<string, Acc>()
  for (const o of orders) {
    const profile = o.user_id ? profiles.get(o.user_id) : undefined
    const email = (profile?.email ?? o.guest_email ?? '').trim().toLowerCase()
    if (!email) continue
    const name = profile?.full_name ?? profile?.display_name ?? o.guest_name ?? null
    const acc = byEmail.get(email) ?? { email, name, orders: 0, events: new Set<string>(), first: o.created_at, last: o.created_at }
    acc.orders += 1
    acc.events.add(o.event_id)
    if (o.created_at < acc.first) acc.first = o.created_at
    if (o.created_at > acc.last) acc.last = o.created_at
    if (!acc.name && name) acc.name = name
    byEmail.set(email, acc)
  }

  const candidates = [...byEmail.keys()].sort().filter((e) => !req.after || e > req.after)
  const rows: BuyerOut[] = []
  for (let i = 0; i < candidates.length && rows.length < req.limit; i += req.limit) {
    const slice = candidates.slice(i, i + req.limit)
    const events: { subject_email: string; decision: string; wording: string | null; wording_version: string; occurred_at: string }[] = []
    for (const chunk of chunkInFilterValues(slice)) {
      const part = await readEveryRow<(typeof events)[number]>('consent events', (from, to) =>
        admin
          .from('consent_events')
          .select('subject_email, decision, wording, wording_version, occurred_at')
          .eq('purpose', CONSENT_PURPOSE)
          .in('subject_email', chunk)
          .order('id', { ascending: true })
          .range(from, to),
      )
      events.push(...part)
    }
    const named = slice
      .map((email) => ({ email, consent: standingBookedproofConsent(events.filter((ev) => ev.subject_email === email)) }))
      .filter((c): c is { email: string; consent: { occurred_at: string; wording_version: string } } => c.consent !== null)
    if (named.length === 0) continue
    // The resolver has the last word: a suppression or anything it refuses keeps the person out.
    const { permitted } = await filterPermittedRecipients(admin, named.map((c) => c.email), {
      purpose: CONSENT_PURPOSE,
      channel: 'email',
      now,
    })
    const allowed = new Set(permitted)
    for (const c of named) {
      if (!allowed.has(c.email) || rows.length >= req.limit) continue
      const acc = byEmail.get(c.email)!
      rows.push({
        email: c.email,
        first_name: firstNameOf(acc.name),
        consent_given_at: c.consent.occurred_at,
        consent_wording_version: c.consent.wording_version,
        orders: acc.orders,
        event_ids: [...acc.events].sort(),
        first_order_at: acc.first,
        last_order_at: acc.last,
      })
    }
  }
  return pageOf(rows, req.limit, (r) => r.email)
}

export async function readPlatformPage(scope: PlatformScope, req: PlatformPageRequest, now: Date = new Date()) {
  const admin = createAdminClient()
  switch (scope) {
    case 'organisations':
      return readOrganisationsPage(admin, req)
    case 'events':
      return readEventsPage(admin, req)
    case 'buyers':
      return readBuyersPage(admin, req, now)
    case 'ledger':
      return readLedgerPage(admin, req)
  }
}
