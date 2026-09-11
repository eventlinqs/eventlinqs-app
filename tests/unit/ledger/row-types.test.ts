/**
 * THE FIVE ROW TYPES, AND THE CLOSING ROW. Close-out D1.
 *
 * "Tests on all five row types, the adapter mapping and the backfill."
 *
 * Every assertion here reads the row that LANDED, not the call that was made.
 * The defects this table can carry are all defects about what is in a row: a
 * refund stored positive, so a sum over the ledger reads as double the money
 * that was ever taken; a demand row with no address, so the recovery engine has
 * nobody to write to; a sale written twice because a redelivered webhook minted
 * a second occurrence key. None of those is visible to a test that only checks
 * that a function was called.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { makeAdmin, makeWorld, onlyEntry, type FakeWorld } from './fake-admin'

const h = vi.hoisted(() => ({ world: null as unknown as FakeWorld }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin(h.world) }))

import {
  forgetCategoryNames,
  recordClose,
  recordDemand,
  recordInventory,
  recordPriceChange,
  recordRefund,
  recordSale,
  type EventForLedger,
} from '@/lib/ledger/adapter'

/** A real event's shape, as the ledger columns read it. */
const EVENT: EventForLedger = {
  id: 'ffffffff-0000-4000-8000-000000000001',
  organisation_id: 'ffffffff-0000-4000-8000-0000000000aa',
  category_id: 'cat-music',
  genre_slug: 'afrobeats',
  subgenre_slug: null,
  community_primary: 'west-african',
  sub_community: null,
  max_capacity: 200,
  published_at: '2026-06-01T00:00:00.000Z',
  created_at: '2026-05-20T00:00:00.000Z',
  start_date: '2026-07-12T09:00:00.000Z',
  venue_postal_code: '3220',
}

beforeEach(() => {
  h.world = makeWorld({ event_categories: [{ id: 'cat-music', slug: 'music' }] })
  forgetCategoryNames()
  vi.stubEnv('ORDER_ACCESS_SECRET', 'a-secret-that-exists-in-this-test')
})

describe('the slot every row hangs off', () => {
  test('carries the general vocabulary, a required category and subcategory, and none of the source system column names', async () => {
    await recordDemand({ event: EVENT, action: 'page_view', occurrenceKey: 'v1', visitorId: 'visitor-1' })

    const { slot } = h.world.ledger[0]
    expect(slot.source_system).toBe('eventlinqs')
    expect(slot.source_ref).toBe(EVENT.id)
    expect(slot.organisation_id).toBe(EVENT.organisation_id)
    // Resolved from the taxonomy table, so the ledger keeps a name a person can
    // still read when the row the uuid pointed at is gone.
    expect(slot.category).toBe('music')
    expect(slot.subcategory).toBe('afrobeats')
    expect(slot.slot_at).toBe(EVENT.start_date)
    expect(slot.postcode).toBe('3220')
    // On sale is when it was PUBLISHED, not when the draft was made.
    expect(slot.on_sale_at).toBe(EVENT.published_at)
    expect(Object.keys(slot)).not.toContain('event_id')
  })

  test('a category the taxonomy cannot name is recorded as general rather than left absent', async () => {
    h.world = makeWorld({ event_categories: [] })
    forgetCategoryNames()
    await recordDemand({ event: EVENT, action: 'page_view', occurrenceKey: 'v1', visitorId: 'visitor-1' })
    expect(h.world.ledger[0].slot.category).toBe('general')
  })
})

describe('1. SALE', () => {
  test('records the quantity, the money, the price of one unit and where the buyer came from', async () => {
    const outcome = await recordSale({
      event: EVENT,
      orderId: 'order-1',
      orderItemId: 'item-1',
      tierId: 'tier-early',
      tierName: 'Early bird',
      quantity: 2,
      unitPriceCents: 4500,
      totalCents: 9000,
      buyerEmail: 'Buyer@Example.com',
      returningBuyer: false,
      occurredAt: '2026-06-12T09:00:00.000Z',
      attribution: {
        referrer: 'instagram.com',
        utmSource: 'ig',
        utmMedium: 'social',
        utmCampaign: 'launch',
        device: 'mobile',
      },
    })
    expect(outcome.ok).toBe(true)

    const row = onlyEntry(h.world, 'sale')
    expect(row.occurrence_key).toBe('sale:item-1')
    expect(row.inventory_class).toBe('Early bird')
    expect(row.inventory_class_ref).toBe('tier-early')
    expect(row.quantity).toBe(2)
    expect(row.amount_cents).toBe(9000)
    expect(row.unit_amount_cents).toBe(4500)
    expect(row.returning_buyer).toBe(false)
    expect(row.referrer).toBe('instagram.com')
    expect(row.utm_source).toBe('ig')
    expect(row.utm_medium).toBe('social')
    expect(row.utm_campaign).toBe('launch')
    expect(row.device).toBe('mobile')
    // 30 days between the sale and the slot, derived from the slot's own
    // timestamp by the writer and never taken from the caller.
    expect(row.days_out).toBe(30)
  })

  test('keeps the buyer as a hash, never as an address', async () => {
    await recordSale({
      event: EVENT,
      orderId: 'order-1',
      orderItemId: 'item-1',
      tierId: null,
      tierName: 'General',
      quantity: 1,
      unitPriceCents: 1000,
      totalCents: 1000,
      buyerEmail: 'buyer@example.com',
    })
    const row = onlyEntry(h.world, 'sale')
    expect(String(row.buyer_hash)).toHaveLength(32)
    expect(JSON.stringify(row)).not.toContain('buyer@example.com')
    expect(row.contact_email).toBeUndefined()
  })

  test('the same order item twice is one sale, because a redelivered webhook is not a second purchase', async () => {
    const args = {
      event: EVENT,
      orderId: 'order-1',
      orderItemId: 'item-1',
      tierId: 'tier-early',
      tierName: 'Early bird',
      quantity: 2,
      unitPriceCents: 4500,
      totalCents: 9000,
      buyerEmail: 'buyer@example.com',
    }
    const first = await recordSale(args)
    const second = await recordSale(args)
    expect(first).toEqual({ ok: true, id: 1, duplicate: false })
    expect(second).toEqual({ ok: true, id: null, duplicate: true })
    expect(h.world.ledger.filter(r => r.entry.kind === 'sale')).toHaveLength(1)
  })
})

describe('2. PRICE CHANGE', () => {
  test('records what the price was and what it became', async () => {
    await recordPriceChange({
      event: EVENT,
      tierId: 'tier-early',
      tierName: 'Early bird',
      oldPriceCents: 4500,
      newPriceCents: 5500,
      occurrenceKey: 'tier-early:2026-06-20T00:00:00.000Z',
      occurredAt: '2026-06-20T00:00:00.000Z',
    })
    const row = onlyEntry(h.world, 'price_change')
    expect(row.occurrence_key).toBe('price:tier-early:2026-06-20T00:00:00.000Z')
    expect(row.old_price_cents).toBe(4500)
    expect(row.new_price_cents).toBe(5500)
    expect(row.inventory_class).toBe('Early bird')
  })

  test('a first price has no old price, and that reads as an absence rather than as zero', async () => {
    await recordPriceChange({
      event: EVENT,
      tierId: 'tier-early',
      tierName: 'Early bird',
      oldPriceCents: null,
      newPriceCents: 4500,
      occurrenceKey: 'tier-early:first',
    })
    const row = onlyEntry(h.world, 'price_change')
    expect(row.old_price_cents).toBeUndefined()
    expect(row.new_price_cents).toBe(4500)
  })
})

describe('3. INVENTORY', () => {
  test.each(['open', 'close', 'hold', 'release', 'capacity_change'] as const)(
    'records the %s action against the priced bucket it happened to',
    async action => {
      await recordInventory({
        event: EVENT,
        tierId: 'tier-early',
        tierName: 'Early bird',
        action,
        quantity: 120,
        occurrenceKey: `tier-early:${action}`,
      })
      const row = onlyEntry(h.world, 'inventory')
      expect(row.inventory_action).toBe(action)
      expect(row.quantity).toBe(120)
      expect(row.inventory_class).toBe('Early bird')
      expect(row.occurrence_key).toBe(`inventory:tier-early:${action}`)
    },
  )
})

describe('4. REFUND', () => {
  test('is a NEW NEGATIVE ROW, so a sum over the ledger is the net with no special case', async () => {
    await recordSale({
      event: EVENT,
      orderId: 'order-1',
      orderItemId: 'item-1',
      tierId: 'tier-early',
      tierName: 'Early bird',
      quantity: 2,
      unitPriceCents: 4500,
      totalCents: 9000,
      buyerEmail: 'buyer@example.com',
      occurredAt: '2026-06-12T09:00:00.000Z',
    })
    // Handed POSITIVE numbers on purpose: the sign is the ledger's rule, and a
    // caller must not be able to get it wrong.
    await recordRefund({
      event: EVENT,
      refundKey: 'refund-1:ticket-1',
      tierId: 'tier-early',
      tierName: 'Early bird',
      quantity: 1,
      amountCents: 4500,
      buyerEmail: 'buyer@example.com',
      occurredAt: '2026-06-20T09:00:00.000Z',
    })

    const refund = onlyEntry(h.world, 'refund')
    expect(refund.quantity).toBe(-1)
    expect(refund.amount_cents).toBe(-4500)
    expect(refund.occurrence_key).toBe('refund:refund-1:ticket-1')

    const net = h.world.ledger
      .filter(r => r.entry.kind === 'sale' || r.entry.kind === 'refund')
      .reduce((sum, r) => sum + Number(r.entry.amount_cents ?? 0), 0)
    expect(net).toBe(4500)
  })

  test('the sale it reverses is never edited, because history is append only', async () => {
    await recordSale({
      event: EVENT,
      orderId: 'order-1',
      orderItemId: 'item-1',
      tierId: 'tier-early',
      tierName: 'Early bird',
      quantity: 1,
      unitPriceCents: 4500,
      totalCents: 4500,
      buyerEmail: 'buyer@example.com',
    })
    const saleBefore = { ...onlyEntry(h.world, 'sale') }
    await recordRefund({
      event: EVENT,
      refundKey: 'refund-1:ticket-1',
      tierId: 'tier-early',
      tierName: 'Early bird',
      quantity: 1,
      amountCents: 4500,
      buyerEmail: 'buyer@example.com',
    })
    expect(onlyEntry(h.world, 'sale')).toEqual(saleBefore)
    expect(h.world.ledger).toHaveLength(2)
  })
})

describe('5. DEMAND', () => {
  test.each(['checkout_started', 'checkout_abandoned', 'waitlist_join'] as const)(
    'a %s row carries the address, because without it the recovery engine has nobody to write to',
    async action => {
      await recordDemand({
        event: EVENT,
        action,
        occurrenceKey: 'reservation-1',
        email: '  Person@Example.COM ',
        visitorId: 'visitor-9',
        tierId: 'tier-early',
        tierName: 'Early bird',
      })
      const row = onlyEntry(h.world, 'demand')
      expect(row.demand_action).toBe(action)
      // Normalised, so the same person entered twice is the same person.
      expect(row.contact_email).toBe('person@example.com')
      expect(String(row.visitor_hash)).toHaveLength(32)
      expect(row.inventory_class).toBe('Early bird')
      expect(row.occurrence_key).toBe(`demand:${action}:reservation-1`)
    },
  )

  test.each(['page_view', 'sold_out_view'] as const)(
    'a %s row carries no person at all, because there genuinely is not one',
    async action => {
      await recordDemand({ event: EVENT, action, occurrenceKey: 'slot:visitor:2026-06-12', visitorId: 'visitor-9' })
      const row = onlyEntry(h.world, 'demand')
      expect(row.demand_action).toBe(action)
      expect(row.contact_email).toBeUndefined()
      expect(String(row.visitor_hash)).toHaveLength(32)
    },
  )

  test('the same visitor looking at the same slot on the same day is one row', async () => {
    await recordDemand({ event: EVENT, action: 'page_view', occurrenceKey: 'slot:v:2026-06-12', visitorId: 'v' })
    await recordDemand({ event: EVENT, action: 'page_view', occurrenceKey: 'slot:v:2026-06-12', visitorId: 'v' })
    expect(h.world.ledger.filter(r => r.entry.kind === 'demand')).toHaveLength(1)
  })

  test('two different visitors are two rows, so the count is a count of people and not of requests', async () => {
    await recordDemand({ event: EVENT, action: 'page_view', occurrenceKey: 'slot:a:2026-06-12', visitorId: 'a' })
    await recordDemand({ event: EVENT, action: 'page_view', occurrenceKey: 'slot:b:2026-06-12', visitorId: 'b' })
    const rows = h.world.ledger.filter(r => r.entry.kind === 'demand')
    expect(rows).toHaveLength(2)
    expect(rows[0].entry.visitor_hash).not.toBe(rows[1].entry.visitor_hash)
  })
})

describe('the closing row', () => {
  test('records what the slot finally did, once, and nothing recomputed afterwards', async () => {
    await recordClose({
      event: EVENT,
      finalSold: 184,
      finalRevenueCents: 828_000,
      fillPercent: 92,
      attended: 171,
      noShows: 13,
    })
    const row = onlyEntry(h.world, 'close')
    expect(row.occurrence_key).toBe(`close:${EVENT.id}`)
    expect(row.final_sold).toBe(184)
    expect(row.final_revenue_cents).toBe(828_000)
    expect(row.fill_percent).toBe(92)
    expect(row.attended).toBe(171)
    expect(row.no_shows).toBe(13)
  })

  test('a slot nobody scanned records attendance as ABSENT, never as nobody came', async () => {
    await recordClose({
      event: EVENT,
      finalSold: 184,
      finalRevenueCents: 828_000,
      fillPercent: 92,
      attended: null,
      noShows: null,
    })
    const row = onlyEntry(h.world, 'close')
    expect(row.final_sold).toBe(184)
    expect(row.attended).toBeUndefined()
    expect(row.no_shows).toBeUndefined()
  })
})

describe('a ledger fault never reaches the caller, because every call site is on somebody money', () => {
  test('a database that refuses the write is reported, returns not-ok, and does not throw', async () => {
    h.world.rpcError = 'connection reset'
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const outcome = await recordSale({
      event: EVENT,
      orderId: 'order-1',
      orderItemId: 'item-1',
      tierId: null,
      tierName: 'General',
      quantity: 1,
      unitPriceCents: 1000,
      totalCents: 1000,
      buyerEmail: 'buyer@example.com',
    })
    expect(outcome).toEqual({ ok: false, reason: 'connection reset' })
    expect(reported).toHaveBeenCalled()
    reported.mockRestore()
  })

  test('a taxonomy read that falls over costs the classification and never the row', async () => {
    h.world.throwOnRead = 'event_categories'
    await expect(
      recordDemand({ event: EVENT, action: 'page_view', occurrenceKey: 'v1', visitorId: 'v' }),
    ).resolves.toEqual({ ok: true, id: 1, duplicate: false })
    // Losing a slot's classification must never lose the row that says
    // something happened, so the fallback is a real value rather than a failure.
    expect(h.world.ledger[0].slot.category).toBe('general')
  })

  test('a READ that falls over before the write is reached is caught too, which is the hole a try round the insert alone would leave', async () => {
    h.world = makeWorld({
      event_categories: [{ id: 'cat-music', slug: 'music' }],
      orders: [{ id: 'order-1', event_id: EVENT.id, guest_email: 'b@example.com', confirmed_at: null, reservation_id: null }],
    })
    forgetCategoryNames()
    h.world.throwOnRead = 'orders'
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { recordConfirmedOrder } = await import('@/lib/ledger/adapter')
    await expect(recordConfirmedOrder('order-1')).resolves.toEqual({ written: 0, alreadyThere: 0, failed: 0 })

    expect(reported).toHaveBeenCalled()
    expect(String(reported.mock.calls[0][0])).toContain('refused to record')
    reported.mockRestore()
  })
})
