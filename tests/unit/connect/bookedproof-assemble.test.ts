import { describe, expect, test } from 'vitest'
import {
  assembleResponse,
  type ListingEventRow,
  type OrderRow,
  type ReadRows,
  type ShareLinkRow,
} from '@/lib/connect/bookedproof/assemble'
import { orderKey } from '@/lib/connect/bookedproof/signature'

/**
 * E51, THE ANSWER (the contract's sections 4, 9 and 10). The fixture is the
 * contract's section 6 case: one organisation, one published listing, two of
 * the organiser's share links, three paid orders through one of them, one of
 * which is refunded. Around it sit the rows that must NOT leak or count: a
 * draft, a private event, the weekly digest's link, an order never paid, and
 * buyer data planted on the order rows to prove the composition never reads it.
 */

const SECRET = 'test-secret-for-the-assembly-only-0000000000000000000000000000'
const ORIGIN = 'https://www.eventlinqs.com.au'
const NOW = new Date('2026-10-23T09:00:00Z')
const ORG = { id: 'org-1', name: 'Geelong Jazz Collective' }

const event = (over: Partial<ListingEventRow>): ListingEventRow => ({
  id: 'ev-1',
  organisation_id: ORG.id,
  slug: 'geelong-jazz-night',
  title: 'Geelong Jazz Night',
  status: 'published',
  start_date: '2026-11-07T09:00:00Z',
  published_at: '2026-10-01T00:00:00Z',
  visibility: 'unlisted',
  ...over,
})

const LISTING = event({})
const OLDER = event({ id: 'ev-0', slug: 'geelong-jazz-september', title: 'September session', status: 'completed', start_date: '2026-09-12T09:00:00Z' })
const DRAFT = event({ id: 'ev-draft', slug: 'draft-night', status: 'draft', published_at: null })
const PRIVATE = event({ id: 'ev-private', slug: 'members-night', visibility: 'private' })

const link = (id: string, code: string, channel: string, created_at = '2026-10-02T00:00:00Z'): ShareLinkRow => ({
  id,
  event_id: LISTING.id,
  code,
  channel,
  created_at,
})
const IG = link('link-ig', 'igcode1', 'instagram')
const WA = link('link-wa', 'wacode1', 'whatsapp', '2026-10-03T00:00:00Z')

/** Buyer data planted on purpose: the walk below fails if any of it leaves. */
const BUYER_EMAIL = 'buyer.person@example.com'
const order = (id: string, over: Partial<OrderRow> = {}): OrderRow =>
  ({
    id,
    event_id: LISTING.id,
    status: 'confirmed',
    confirmed_at: '2026-10-10T10:00:00Z',
    cancelled_at: null,
    updated_at: '2026-10-10T10:00:00Z',
    platform_fee_retained_cents: 180,
    currency: 'aud',
    user_id: 'buyer-user-uuid',
    guest_email: BUYER_EMAIL,
    guest_name: 'Buyer Person',
    order_number: 'EL-0001',
    ...over,
  }) as OrderRow

const O1 = order('order-0001', { confirmed_at: '2026-10-10T10:00:00Z' })
const O2 = order('order-0002', { confirmed_at: '2026-10-12T10:00:00Z', platform_fee_retained_cents: 360 })
const O3 = order('order-0003', { confirmed_at: '2026-10-14T10:00:00Z', status: 'refunded', updated_at: '2026-10-21T00:00:00Z' })
const NEVER_PAID = order('order-pending', { status: 'pending', confirmed_at: null })

function rows(over: Partial<ReadRows> = {}): ReadRows {
  return {
    organisationsByEmail: new Map([['organiser@example.com', [ORG]]]),
    listingBySlug: new Map([[LISTING.slug, LISTING], [OLDER.slug, OLDER]]),
    organisations: new Map([[ORG.id, ORG]]),
    events: [OLDER, LISTING, DRAFT, PRIVATE],
    links: [IG, WA],
    conversions: [
      { link_id: IG.id, order_id: O1.id, occurred_at: O1.confirmed_at as string },
      { link_id: IG.id, order_id: O2.id, occurred_at: O2.confirmed_at as string },
      { link_id: IG.id, order_id: O3.id, occurred_at: O3.confirmed_at as string },
      // a later second touch on the other link: first touch keeps the Instagram one
      { link_id: WA.id, order_id: O2.id, occurred_at: '2026-10-12T11:00:00Z' },
      { link_id: IG.id, order_id: NEVER_PAID.id, occurred_at: '2026-10-15T00:00:00Z' },
    ],
    orders: new Map([O1, O2, O3, NEVER_PAID].map((o) => [o.id, o])),
    facts: {
      tickets: new Map([[O1.id, 1], [O2.id, 2], [O3.id, 4], [NEVER_PAID.id, 9]]),
      refundedAt: new Map([[O3.id, '2026-10-20T00:00:00Z']]),
      buyersFirst: new Set([O1.id]),
    },
    tierCurrency: new Map([[OLDER.id, 'AUD']]),
    ...over,
  }
}

const answer = (input: { emails?: string[]; pages?: Array<{ page: string; slug: string }>; since?: Date | null; rows?: ReadRows }) =>
  assembleResponse({
    emails: input.emails ?? ['organiser@example.com'],
    pages: input.pages ?? [],
    since: input.since ?? null,
    rows: input.rows ?? rows(),
    secret: SECRET,
    origin: ORIGIN,
    now: NOW,
  })

const listingOf = (body: ReturnType<typeof answer>, i = 0) => {
  const entry = body.organisers[i]
  if (!entry.found) throw new Error('expected a found entry')
  return entry.listings
}

describe('the section 6 case', () => {
  test('two paid orders count; the refunded one is listed reversed and counts for nothing', () => {
    const [listing] = listingOf(answer({}))
    expect(listing.event_id).toBe(LISTING.id)
    expect(listing.tickets_through_share_links).toBe(3)
    expect(listing.fee_through_share_links_cents).toBe(540)
    expect(listing.currency).toBe('AUD')
    expect(listing.orders.map((o) => [o.order_key, o.share_code, o.tickets, o.reversed])).toEqual([
      [orderKey(SECRET, 'order-0001'), 'igcode1', 1, false],
      [orderKey(SECRET, 'order-0002'), 'igcode1', 2, false],
      [orderKey(SECRET, 'order-0003'), 'igcode1', 4, true],
    ])
  })

  test('the other link reads zero: no order is credited to it, first touch holds', () => {
    const [listing] = listingOf(answer({}))
    expect(listing.orders.filter((o) => o.share_code === 'wacode1')).toEqual([])
    expect(listing.share_links).toEqual([
      { code: 'igcode1', url: `${ORIGIN}/e/igcode1`, channel: 'instagram', created_at: '2026-10-02T00:00:00.000Z' },
      { code: 'wacode1', url: `${ORIGIN}/e/wacode1`, channel: 'whatsapp', created_at: '2026-10-03T00:00:00.000Z' },
    ])
  })

  test('first touch compares moments, not text: another offset or a fraction of a second cannot reorder them', () => {
    for (const [igAt, waAt] of [
      ['2026-10-16T19:00:00+10:00', '2026-10-16T09:30:00Z'], // 09:00Z written at a ten hour offset
      ['2026-10-16T09:00:00Z', '2026-10-16T09:00:00.5+00:00'], // the database's fractional form
    ]) {
      const r = rows({
        conversions: [
          { link_id: WA.id, order_id: O2.id, occurred_at: waAt },
          { link_id: IG.id, order_id: O2.id, occurred_at: igAt },
        ],
      })
      const [listing] = listingOf(answer({ rows: r }))
      expect(listing.orders.map((o) => o.share_code)).toEqual(['igcode1'])
    }
  })

  test('an order never paid is never returned', () => {
    const [listing] = listingOf(answer({}))
    expect(listing.orders).toHaveLength(3)
  })

  test('the buyer flag is only the true or false decided inside EventLinqs', () => {
    const [listing] = listingOf(answer({}))
    expect(listing.orders.map((o) => o.buyer_first_paid_order)).toEqual([true, false, false])
  })

  test('paid_at is the confirmed moment', () => {
    const [listing] = listingOf(answer({}))
    expect(listing.orders[0].paid_at).toBe('2026-10-10T10:00:00.000Z')
  })
})

describe('which events are listings', () => {
  test('published and not private, newest first; a draft and a private event never appear', () => {
    const listings = listingOf(answer({}))
    expect(listings.map((l) => l.event_id)).toEqual([LISTING.id, OLDER.id])
    expect(listings[1]).toMatchObject({ status: 'completed', tickets_through_share_links: 0, orders: [], currency: 'AUD' })
  })

  test('an organisation with no listing is found and not listed', () => {
    const body = answer({ rows: rows({ events: [DRAFT, PRIVATE] }) })
    expect(body.organisers[0]).toEqual({ email: 'organiser@example.com', found: true, listed: false, listings: [] })
  })

  test('an address that is no organiser carries nothing but itself', () => {
    const body = answer({ emails: ['nobody@example.com'] })
    expect(body.organisers).toEqual([{ email: 'nobody@example.com', found: false }])
  })
})

describe('since', () => {
  test('limits the orders to those paid or reversed at or after it, and leaves the sums whole', () => {
    const [listing] = listingOf(answer({ since: new Date('2026-10-12T10:00:00Z') }))
    expect(listing.orders.map((o) => o.order_key)).toEqual([orderKey(SECRET, 'order-0002'), orderKey(SECRET, 'order-0003')])
    expect(listing.tickets_through_share_links).toBe(3)
    expect(listing.fee_through_share_links_cents).toBe(540)
  })

  test('a reversal after since brings a paid-before order back, reversed', () => {
    const [listing] = listingOf(answer({ since: new Date('2026-10-19T00:00:00Z') }))
    expect(listing.orders).toHaveLength(1)
    expect(listing.orders[0]).toMatchObject({ order_key: orderKey(SECRET, 'order-0003'), reversed: true })
  })

  test('a reversal whose moment the ledger does not hold is returned in every since read', () => {
    const r = rows()
    const noMoment = { ...r, facts: { ...r.facts, refundedAt: new Map<string, string>() } }
    const [listing] = listingOf(answer({ since: new Date('2026-10-22T00:00:00Z'), rows: noMoment }))
    expect(listing.orders.map((o) => o.order_key)).toEqual([orderKey(SECRET, 'order-0003')])
  })
})

describe('the retained fee', () => {
  test('a fee the ledger never recorded is null and adds nothing to the sum', () => {
    const r = rows()
    const orders = new Map(r.orders)
    orders.set(O2.id, { ...O2, platform_fee_retained_cents: null })
    const [listing] = listingOf(answer({ rows: { ...r, orders } }))
    expect(listing.orders[1].fee_retained_cents).toBeNull()
    expect(listing.fee_through_share_links_cents).toBe(180)
    expect(listing.tickets_through_share_links).toBe(3)
  })

  test('partly refunded and cancelled are reversals too: the whole order is off', () => {
    for (const status of ['partially_refunded', 'cancelled']) {
      const r = rows()
      const orders = new Map(r.orders)
      orders.set(O1.id, { ...O1, status })
      const [listing] = listingOf(answer({ rows: { ...r, orders } }))
      expect(listing.orders[0].reversed).toBe(true)
      expect(listing.tickets_through_share_links).toBe(2)
      expect(listing.fee_through_share_links_cents).toBe(360)
    }
  })
})

describe('pages', () => {
  const page = `${ORIGIN}/events/geelong-jazz-night`

  test('entries come one per address, then one per page, each in the order asked', () => {
    const body = answer({
      emails: ['organiser@example.com', 'nobody@example.com'],
      pages: [
        { page, slug: 'geelong-jazz-night' },
        { page: `${ORIGIN}/events/unknown-night`, slug: 'unknown-night' },
      ],
    })
    expect(body.organisers.map((e) => ('email' in e ? `email ${e.email}` : `page ${e.page}`) + ` ${e.found}`)).toEqual([
      'email organiser@example.com true',
      'email nobody@example.com false',
      `page ${page} true`,
      `page ${ORIGIN}/events/unknown-night false`,
    ])
  })

  test("a page's entry names the organisation by its public name, never by an address", () => {
    const body = answer({ emails: ['nobody@example.com'], pages: [{ page, slug: 'geelong-jazz-night' }] })
    const entry = body.organisers[1]
    expect(entry).toMatchObject({ page, found: true, organisation_name: ORG.name, listed: true })
    expect(Object.keys(entry).sort()).toEqual(['found', 'listed', 'listings', 'organisation_name', 'page'])
  })
})

describe('nothing about any buyer leaves', () => {
  const ALLOWED = new Set([
    'version', 'generated_at', 'organisers',
    'email', 'page', 'found', 'listed', 'organisation_name', 'listings',
    'event_id', 'url', 'title', 'status', 'starts_at', 'first_published_at', 'share_links', 'orders',
    'tickets_through_share_links', 'fee_through_share_links_cents', 'currency',
    'code', 'channel', 'created_at',
    'order_key', 'share_code', 'tickets', 'fee_retained_cents', 'paid_at', 'reversed', 'buyer_first_paid_order',
  ])

  function walk(value: unknown, path: string, out: string[]) {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, out))
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (!ALLOWED.has(k)) out.push(`key ${path}.${k}`)
        walk(v, `${path}.${k}`, out)
      }
    } else if (typeof value === 'string') {
      for (const planted of [BUYER_EMAIL, 'Buyer Person', 'buyer-user-uuid', 'EL-0001', 'order-0001', 'order-0002', 'order-0003']) {
        if (value.includes(planted)) out.push(`value ${path} carries ${planted}`)
      }
    }
  }

  test('every key is on the allow-list and no planted buyer value appears anywhere', () => {
    const body = answer({
      emails: ['organiser@example.com', 'nobody@example.com'],
      pages: [{ page: `${ORIGIN}/events/geelong-jazz-night`, slug: 'geelong-jazz-night' }],
      since: null,
    })
    const found: string[] = []
    walk(body, '$', found)
    expect(found).toEqual([])
  })

  test('the walk itself fires: a leaked buyer key and value are caught', () => {
    const body = answer({}) as unknown as { organisers: Array<{ listings: Array<{ orders: Array<Record<string, unknown>> }> }> }
    body.organisers[0].listings[0].orders[0].guest_email = BUYER_EMAIL
    const found: string[] = []
    walk(body, '$', found)
    expect(found).toEqual([
      'key $.organisers[0].listings[0].orders[0].guest_email',
      `value $.organisers[0].listings[0].orders[0].guest_email carries ${BUYER_EMAIL}`,
    ])
  })
})
