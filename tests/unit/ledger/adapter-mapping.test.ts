/**
 * THE ADAPTER MAPPING. Close-out D1.
 *
 * event -> slot, tier -> inventory class, ticket -> unit. This file drives the
 * mapping through the order-level recorders that every money path in the
 * product actually reaches, rather than through the single-row recorders, so
 * what is asserted is what a confirmed order and a processed refund really put
 * in the table.
 *
 * The rules that cost real money if they are wrong, each with a test:
 *   - an add-on is not a unit of the slot's capacity, so a parking pass must
 *     never be counted as a sold place;
 *   - a refund is one negative row PER UNIT that came back, at that unit's own
 *     price, never one apportioned amount spread across classes it never
 *     touched;
 *   - the attribution is captured at checkout and read back when the sale
 *     lands, because the webhook that records the sale has no browser to ask;
 *   - an abandoned checkout is only an abandonment when somebody actually
 *     entered an address and did not then buy.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { entriesOfKind, makeAdmin, makeWorld, onlyEntry, type FakeWorld } from './fake-admin'

const h = vi.hoisted(() => ({ world: null as unknown as FakeWorld }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin(h.world) }))

import {
  bucketFromTier,
  forgetCategoryNames,
  identityHash,
  recordAbandonedCheckouts,
  recordClosedSlots,
  recordConfirmedOrder,
  recordDemand,
  recordRefundedOrder,
  recordTierChanges,
  slotFromEvent,
  subcategoryOf,
  type EventForLedger,
} from '@/lib/ledger/adapter'

const EVENT_ID = 'ffffffff-0000-4000-8000-000000000001'
const ORG_ID = 'ffffffff-0000-4000-8000-0000000000aa'

const eventRow = (over: Partial<EventForLedger> = {}) => ({
  id: EVENT_ID,
  organisation_id: ORG_ID,
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
  status: 'published',
  end_date: null,
  ...over,
})

beforeEach(() => {
  h.world = makeWorld({ event_categories: [{ id: 'cat-music', slug: 'music' }] })
  forgetCategoryNames()
  vi.stubEnv('ORDER_ACCESS_SECRET', 'a-secret-that-exists-in-this-test')
})

describe('event -> slot', () => {
  test('the finer classification is taken in a fixed order of preference and is never left absent', () => {
    expect(subcategoryOf(eventRow({ subgenre_slug: 'amapiano' }) as EventForLedger)).toBe('amapiano')
    expect(subcategoryOf(eventRow({ subgenre_slug: null }) as EventForLedger)).toBe('afrobeats')
    expect(subcategoryOf(eventRow({ subgenre_slug: null, genre_slug: null }) as EventForLedger)).toBe('west-african')
    expect(
      subcategoryOf(eventRow({ subgenre_slug: null, genre_slug: null, community_primary: null }) as EventForLedger),
    ).toBe('general')
  })

  test('an event with no capacity recorded maps to no capacity, never to zero', async () => {
    const slot = await slotFromEvent(eventRow({ max_capacity: null }) as EventForLedger)
    expect(slot.capacity).toBeNull()
    expect(slot.sourceRef).toBe(EVENT_ID)
    expect(slot.organisationId).toBe(ORG_ID)
  })

  test('an unpublished event falls back to when it was created, so the on-sale date is never invented', async () => {
    const slot = await slotFromEvent(eventRow({ published_at: null }) as EventForLedger)
    expect(slot.onSaleAt).toBe('2026-05-20T00:00:00.000Z')
  })
})

describe('the identity hash', () => {
  test('tells one person from another, is stable for the same person, and is not the address', () => {
    const a = identityHash('Person@Example.com')
    const b = identityHash('  person@example.com  ')
    const other = identityHash('someone-else@example.com')
    expect(a).toBe(b)
    expect(a).not.toBe(other)
    expect(a).not.toContain('example.com')
    expect(a).toHaveLength(32)
  })

  test('nobody hashes to nothing', () => {
    expect(identityHash(null)).toBeNull()
    expect(identityHash('   ')).toBeNull()
  })

  test('changing the secret changes the hash, so a stolen table is not a lookup of the platform addresses', () => {
    const withOne = identityHash('person@example.com')
    vi.stubEnv('ORDER_ACCESS_SECRET', 'a-completely-different-secret')
    expect(identityHash('person@example.com')).not.toBe(withOne)
  })
})

describe('a confirmed order', () => {
  const seedOrder = (items: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) => {
    h.world = makeWorld({
      event_categories: [{ id: 'cat-music', slug: 'music' }],
      events: [eventRow()],
      orders: [
        {
          id: 'order-1',
          event_id: EVENT_ID,
          guest_email: 'buyer@example.com',
          confirmed_at: '2026-06-12T09:00:00.000Z',
          reservation_id: 'res-1',
          status: 'confirmed',
          ...over,
        },
      ],
      order_items: items,
    })
    forgetCategoryNames()
  }

  test('writes one sale row per ticket line, at the price recorded on it', async () => {
    seedOrder([
      {
        id: 'item-1',
        order_id: 'order-1',
        item_type: 'ticket',
        item_name: 'Early bird',
        quantity: 2,
        unit_price_cents: 4500,
        total_cents: 9000,
        ticket_tier_id: 'tier-early',
      },
      {
        id: 'item-2',
        order_id: 'order-1',
        item_type: 'ticket',
        item_name: 'General',
        quantity: 1,
        unit_price_cents: 6000,
        total_cents: 6000,
        ticket_tier_id: 'tier-general',
      },
    ])

    const result = await recordConfirmedOrder('order-1')
    expect(result).toEqual({ written: 2, alreadyThere: 0, failed: 0 })

    const sales = entriesOfKind(h.world, 'sale')
    expect(sales.map(s => s.inventory_class)).toEqual(['Early bird', 'General'])
    expect(sales.map(s => s.quantity)).toEqual([2, 1])
    expect(sales.map(s => s.amount_cents)).toEqual([9000, 6000])
    expect(sales.every(s => s.occurred_at === '2026-06-12T09:00:00.000Z')).toBe(true)
  })

  test('an ADD-ON is not a sold place, because counting a parking pass would put the fill above what was sellable', async () => {
    seedOrder([
      {
        id: 'item-1',
        order_id: 'order-1',
        item_type: 'ticket',
        item_name: 'General',
        quantity: 1,
        unit_price_cents: 6000,
        total_cents: 6000,
        ticket_tier_id: 'tier-general',
      },
      {
        id: 'item-2',
        order_id: 'order-1',
        item_type: 'addon',
        item_name: 'Parking',
        quantity: 1,
        unit_price_cents: 1500,
        total_cents: 1500,
        ticket_tier_id: null,
      },
    ])

    await recordConfirmedOrder('order-1')
    const sales = entriesOfKind(h.world, 'sale')
    expect(sales).toHaveLength(1)
    expect(sales[0].inventory_class).toBe('General')
  })

  test('an order with nothing but add-ons writes nothing at all', async () => {
    seedOrder([
      {
        id: 'item-1',
        order_id: 'order-1',
        item_type: 'addon',
        item_name: 'Parking',
        quantity: 1,
        unit_price_cents: 1500,
        total_cents: 1500,
        ticket_tier_id: null,
      },
    ])
    await expect(recordConfirmedOrder('order-1')).resolves.toEqual({ written: 0, alreadyThere: 0, failed: 0 })
    expect(h.world.ledger).toHaveLength(0)
  })

  test('reads the attribution back off the checkout row, because the webhook that records the sale has no browser to ask', async () => {
    seedOrder([
      {
        id: 'item-1',
        order_id: 'order-1',
        item_type: 'ticket',
        item_name: 'General',
        quantity: 1,
        unit_price_cents: 6000,
        total_cents: 6000,
        ticket_tier_id: 'tier-general',
      },
    ])

    // The checkout, minutes earlier, on a machine that DID have a request.
    await recordDemand({
      event: eventRow() as EventForLedger,
      action: 'checkout_started',
      occurrenceKey: 'res-1',
      email: 'buyer@example.com',
      visitorId: 'buyer@example.com',
      attribution: {
        referrer: 'instagram.com',
        utmSource: 'ig',
        utmMedium: 'social',
        utmCampaign: 'launch',
        device: 'mobile',
      },
    })

    await recordConfirmedOrder('order-1')
    const sale = onlyEntry(h.world, 'sale')
    expect(sale.referrer).toBe('instagram.com')
    expect(sale.utm_source).toBe('ig')
    expect(sale.device).toBe('mobile')
  })

  test('a first-time buyer and a returning one are told apart from the orders that already exist', async () => {
    seedOrder([
      {
        id: 'item-1',
        order_id: 'order-1',
        item_type: 'ticket',
        item_name: 'General',
        quantity: 1,
        unit_price_cents: 6000,
        total_cents: 6000,
        ticket_tier_id: 'tier-general',
      },
    ])
    await recordConfirmedOrder('order-1')
    expect(onlyEntry(h.world, 'sale').returning_buyer).toBe(false)

    // The same address, having bought once before on another order.
    h.world.tables.get('orders')?.push({
      id: 'order-0',
      event_id: EVENT_ID,
      guest_email: 'buyer@example.com',
      confirmed_at: '2026-05-01T00:00:00.000Z',
      reservation_id: null,
      status: 'confirmed',
    })
    h.world.tables.get('orders')?.push({
      id: 'order-2',
      event_id: EVENT_ID,
      guest_email: 'buyer@example.com',
      confirmed_at: '2026-06-14T09:00:00.000Z',
      reservation_id: null,
      status: 'confirmed',
    })
    h.world.tables.get('order_items')?.push({
      id: 'item-9',
      order_id: 'order-2',
      item_type: 'ticket',
      item_name: 'General',
      quantity: 1,
      unit_price_cents: 6000,
      total_cents: 6000,
      ticket_tier_id: 'tier-general',
    })

    await recordConfirmedOrder('order-2')
    const second = entriesOfKind(h.world, 'sale').find(s => s.occurrence_key === 'sale:item-9')
    expect(second?.returning_buyer).toBe(true)
  })

  test('an order the ledger has never heard of writes nothing rather than falling over', async () => {
    seedOrder([])
    await expect(recordConfirmedOrder('order-does-not-exist')).resolves.toEqual({ written: 0, alreadyThere: 0, failed: 0 })
  })
})

describe('a processed refund', () => {
  beforeEach(() => {
    h.world = makeWorld({
      event_categories: [{ id: 'cat-music', slug: 'music' }],
      events: [eventRow()],
      orders: [
        {
          id: 'order-1',
          event_id: EVENT_ID,
          guest_email: 'buyer@example.com',
          confirmed_at: '2026-06-12T09:00:00.000Z',
          reservation_id: null,
          status: 'confirmed',
        },
      ],
      order_items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          item_type: 'ticket',
          item_name: 'Early bird',
          quantity: 2,
          unit_price_cents: 4500,
          total_cents: 9000,
          ticket_tier_id: 'tier-early',
        },
        {
          id: 'item-2',
          order_id: 'order-1',
          item_type: 'ticket',
          item_name: 'General',
          quantity: 1,
          unit_price_cents: 6000,
          total_cents: 6000,
          ticket_tier_id: 'tier-general',
        },
      ],
      refunds: [{ id: 'refund-1', order_id: 'order-1', processed_at: '2026-06-20T09:00:00.000Z' }],
      tickets: [
        { id: 'ticket-1', order_id: 'order-1', order_item_id: 'item-1', ticket_tier_id: 'tier-early', refunded_at: '2026-06-20T09:00:00.000Z' },
        { id: 'ticket-2', order_id: 'order-1', order_item_id: 'item-1', ticket_tier_id: 'tier-early', refunded_at: null },
        { id: 'ticket-3', order_id: 'order-1', order_item_id: 'item-2', ticket_tier_id: 'tier-general', refunded_at: '2026-06-20T09:00:00.000Z' },
      ],
    })
    forgetCategoryNames()
  })

  test('writes one negative row per unit that came back, each at its own price and in its own class', async () => {
    const result = await recordRefundedOrder('refund-1')
    expect(result).toEqual({ written: 2, alreadyThere: 0, failed: 0 })

    const refunds = entriesOfKind(h.world, 'refund')
    expect(refunds).toHaveLength(2)
    expect(refunds.map(r => r.inventory_class).sort()).toEqual(['Early bird', 'General'])
    expect(refunds.every(r => Number(r.quantity) === -1)).toBe(true)
    expect(refunds.map(r => Number(r.amount_cents)).sort((a, b) => a - b)).toEqual([-6000, -4500])
  })

  test('the unit that did NOT come back is not refunded, which is what makes a partial refund honest', async () => {
    await recordRefundedOrder('refund-1')
    const early = entriesOfKind(h.world, 'refund').filter(r => r.inventory_class === 'Early bird')
    expect(early).toHaveLength(1)
  })

  test('a Stripe redelivery cannot credit the same seat twice', async () => {
    await recordRefundedOrder('refund-1')
    await recordRefundedOrder('refund-1')
    expect(entriesOfKind(h.world, 'refund')).toHaveLength(2)
  })

  test('a refund where nothing was actually voided writes nothing', async () => {
    for (const ticket of h.world.tables.get('tickets') ?? []) ticket.refunded_at = null
    await expect(recordRefundedOrder('refund-1')).resolves.toEqual({ written: 0, alreadyThere: 0, failed: 0 })
  })
})

describe('what an organiser save did to the ticket types', () => {
  const tier = (over: Record<string, unknown> = {}) => ({
    id: 'tier-early',
    name: 'Early bird',
    price: 4500,
    total_capacity: 100,
    updated_at: '2026-06-01T00:00:00.000Z',
    ...over,
  })

  beforeEach(() => {
    h.world = makeWorld({ event_categories: [{ id: 'cat-music', slug: 'music' }] })
    forgetCategoryNames()
  })

  test('a save that changed nothing writes nothing, so the history is of real moves and not of button presses', async () => {
    await expect(
      recordTierChanges({ event: eventRow() as EventForLedger, before: [tier()], after: [tier()] }),
    ).resolves.toEqual({ written: 0, alreadyThere: 0, failed: 0 })
    expect(h.world.ledger).toHaveLength(0)
  })

  test('a price move and a capacity move on one save are two rows, because they answer two different questions', async () => {
    await recordTierChanges({
      event: eventRow() as EventForLedger,
      before: [tier()],
      after: [tier({ price: 5500, total_capacity: 150, updated_at: '2026-06-20T00:00:00.000Z' })],
    })
    expect(onlyEntry(h.world, 'price_change')).toMatchObject({ old_price_cents: 4500, new_price_cents: 5500 })
    expect(onlyEntry(h.world, 'inventory')).toMatchObject({ inventory_action: 'capacity_change', quantity: 150 })
  })

  test('a type that appeared opens and a type that went closes', async () => {
    await recordTierChanges({
      event: eventRow() as EventForLedger,
      before: [tier()],
      after: [tier({ id: 'tier-door', name: 'On the door', price: 7000, updated_at: '2026-07-01T00:00:00.000Z' })],
    })
    const inventory = entriesOfKind(h.world, 'inventory')
    expect(inventory.map(r => r.inventory_action).sort()).toEqual(['close', 'open'])
    expect(inventory.find(r => r.inventory_action === 'open')?.inventory_class).toBe('On the door')
    expect(inventory.find(r => r.inventory_action === 'close')?.inventory_class).toBe('Early bird')
  })

  test('the same save replayed writes nothing twice, because the key carries the timestamp the database set', async () => {
    const input = {
      event: eventRow() as EventForLedger,
      before: [tier()],
      after: [tier({ price: 5500, updated_at: '2026-06-20T00:00:00.000Z' })],
    }
    await recordTierChanges(input)
    await recordTierChanges(input)
    expect(entriesOfKind(h.world, 'price_change')).toHaveLength(1)
  })

  test('tier -> priced bucket keeps the identity, the name, the price and the capacity', () => {
    expect(bucketFromTier(tier())).toEqual({
      ref: 'tier-early',
      name: 'Early bird',
      priceCents: 4500,
      capacity: 100,
      updatedAt: '2026-06-01T00:00:00.000Z',
    })
  })
})

describe('the abandoned-checkout sweep', () => {
  const startCheckout = async (reservationId: string, email: string | null) =>
    recordDemand({
      event: eventRow() as EventForLedger,
      action: 'checkout_started',
      occurrenceKey: reservationId,
      email,
      visitorId: email ?? reservationId,
    })

  beforeEach(() => {
    h.world = makeWorld({
      event_categories: [{ id: 'cat-music', slug: 'music' }],
      events: [eventRow()],
      reservations: [],
      orders: [],
    })
    forgetCategoryNames()
  })

  const lapse = (id: string, status = 'expired') => {
    h.world.tables.get('reservations')?.push({
      id,
      event_id: EVENT_ID,
      status,
      converted_at: null,
      updated_at: new Date().toISOString(),
    })
  }

  test('records the person who entered an address and did not come back', async () => {
    await startCheckout('res-1', 'gave-up@example.com')
    lapse('res-1')

    await expect(recordAbandonedCheckouts()).resolves.toEqual({ written: 1, considered: 1 })
    const abandoned = entriesOfKind(h.world, 'demand').filter(r => r.demand_action === 'checkout_abandoned')
    expect(abandoned).toHaveLength(1)
    expect(abandoned[0].contact_email).toBe('gave-up@example.com')
  })

  test('a hold that lapsed with NO address entered is not an abandonment, because nobody ever reached checkout', async () => {
    lapse('res-2')
    await expect(recordAbandonedCheckouts()).resolves.toEqual({ written: 0, considered: 0 })
  })

  test('a reservation whose order confirmed is never an abandonment, whatever the reservation row says', async () => {
    await startCheckout('res-3', 'bought@example.com')
    lapse('res-3')
    h.world.tables.get('orders')?.push({ id: 'order-9', reservation_id: 'res-3', status: 'confirmed' })

    await expect(recordAbandonedCheckouts()).resolves.toEqual({ written: 0, considered: 0 })
  })

  test('a cancelled hold counts as well, because leaving the page is the same act as letting it lapse', async () => {
    await startCheckout('res-4', 'left@example.com')
    lapse('res-4', 'cancelled')
    await expect(recordAbandonedCheckouts()).resolves.toEqual({ written: 1, considered: 1 })
  })

  test('running the sweep twice writes one row, so a cron that overlaps itself is free', async () => {
    await startCheckout('res-5', 'gave-up@example.com')
    lapse('res-5')
    await recordAbandonedCheckouts()
    await recordAbandonedCheckouts()
    expect(entriesOfKind(h.world, 'demand').filter(r => r.demand_action === 'checkout_abandoned')).toHaveLength(1)
  })
})

describe('the closing sweep', () => {
  beforeEach(() => {
    h.world = makeWorld({
      event_categories: [{ id: 'cat-music', slug: 'music' }],
      events: [eventRow({ start_date: '2026-01-10T09:00:00.000Z' })],
      orders: [
        {
          id: 'order-1',
          event_id: EVENT_ID,
          guest_email: 'buyer@example.com',
          confirmed_at: '2026-01-01T09:00:00.000Z',
          reservation_id: null,
          status: 'confirmed',
        },
      ],
      order_items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          item_type: 'ticket',
          item_name: 'General',
          quantity: 4,
          unit_price_cents: 5000,
          total_cents: 20_000,
          ticket_tier_id: 'tier-general',
        },
      ],
      tickets: [],
    })
    forgetCategoryNames()
  })

  test('writes the final figures once, from the ledger own rows', async () => {
    await recordConfirmedOrder('order-1')
    await expect(recordClosedSlots()).resolves.toEqual({ closed: 1, considered: 1 })

    const close = onlyEntry(h.world, 'close')
    expect(close.final_sold).toBe(4)
    expect(close.final_revenue_cents).toBe(20_000)
    // 4 of 200 places.
    expect(close.fill_percent).toBe(2)
  })

  test('a slot nobody scanned records attendance as ABSENT, never as nobody came', async () => {
    await recordConfirmedOrder('order-1')
    await recordClosedSlots()
    const close = onlyEntry(h.world, 'close')
    expect(close.attended).toBeUndefined()
    expect(close.no_shows).toBeUndefined()
  })

  test('a slot that WAS scanned records who came and who did not', async () => {
    h.world.tables.set('tickets', [
      { id: 't1', event_id: EVENT_ID, status: 'valid', first_scanned_at: '2026-01-10T10:00:00.000Z' },
      { id: 't2', event_id: EVENT_ID, status: 'valid', first_scanned_at: '2026-01-10T10:05:00.000Z' },
      { id: 't3', event_id: EVENT_ID, status: 'valid', first_scanned_at: null },
      { id: 't4', event_id: EVENT_ID, status: 'void', first_scanned_at: null },
    ])
    await recordConfirmedOrder('order-1')
    await recordClosedSlots()
    const close = onlyEntry(h.world, 'close')
    expect(close.attended).toBe(2)
    // Three issued units that were not voided, two of whom arrived.
    expect(close.no_shows).toBe(1)
  })

  test('an hourly cron re-running over the same slot writes one closing row', async () => {
    await recordConfirmedOrder('order-1')
    await recordClosedSlots()
    await expect(recordClosedSlots()).resolves.toEqual({ closed: 0, considered: 0 })
    expect(entriesOfKind(h.world, 'close')).toHaveLength(1)
  })

  test('a multi-day slot whose end has not passed is still running and is not closed', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString()
    h.world.tables.set('events', [eventRow({ start_date: '2026-01-10T09:00:00.000Z', end_date: future })])
    await recordConfirmedOrder('order-1')
    await expect(recordClosedSlots()).resolves.toEqual({ closed: 0, considered: 0 })
  })
})

/**
 * THE BUYER THE LEDGER COULD NOT SEE. Close-out D1, found on 10 September 2026
 * by reading the database rather than the code.
 *
 * The first version of the order recorders read `orders.guest_email` and
 * nothing else. On TEST that column is null for 138 of 294 orders, because a
 * signed-in buyer carries `user_id` and leaves it empty. So for roughly half of
 * every purchase the sale row carried NO buyer hash and NO first-time-or-
 * returning flag, and the close-out asks for both on that row by name.
 *
 * It matters beyond tidiness: D2's suppression rule is "never contact anyone who
 * already bought", and a buyer the ledger cannot identify is a buyer it cannot
 * suppress. That is a recovery email sent to somebody holding a ticket.
 *
 * These four hold the fix, including the one that is the whole reason the hash
 * is keyed on the ADDRESS rather than on whichever id the row happened to carry.
 */
describe('who the ledger thinks bought it', () => {
  const seedSignedIn = (over: Record<string, unknown> = {}) => {
    h.world = makeWorld({
      event_categories: [{ id: 'cat-music', slug: 'music' }],
      events: [eventRow()],
      profiles: [{ id: 'user-1', email: 'Signed.In@Example.com' }],
      orders: [
        {
          id: 'order-1',
          event_id: EVENT_ID,
          guest_email: null,
          user_id: 'user-1',
          confirmed_at: '2026-06-12T09:00:00.000Z',
          reservation_id: null,
          status: 'confirmed',
          ...over,
        },
      ],
      order_items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          item_type: 'ticket',
          item_name: 'General',
          quantity: 1,
          unit_price_cents: 6000,
          total_cents: 6000,
          ticket_tier_id: 'tier-general',
        },
      ],
    })
    forgetCategoryNames()
  }

  test('a signed-in buyer with no guest address is still recorded, through their profile', async () => {
    seedSignedIn()
    await recordConfirmedOrder('order-1')
    const sale = onlyEntry(h.world, 'sale')
    expect(sale.buyer_hash).toBe(identityHash('signed.in@example.com'))
    expect(sale.buyer_hash).not.toBeNull()
  })

  test('the same person buying once as a guest and once signed in hashes to one value', async () => {
    seedSignedIn()
    await recordConfirmedOrder('order-1')
    const signedIn = onlyEntry(h.world, 'sale').buyer_hash

    h.world = makeWorld({
      event_categories: [{ id: 'cat-music', slug: 'music' }],
      events: [eventRow()],
      orders: [
        {
          id: 'order-2',
          event_id: EVENT_ID,
          guest_email: 'signed.in@example.com',
          user_id: null,
          confirmed_at: '2026-06-13T09:00:00.000Z',
          reservation_id: null,
          status: 'confirmed',
        },
      ],
      order_items: [
        {
          id: 'item-2',
          order_id: 'order-2',
          item_type: 'ticket',
          item_name: 'General',
          quantity: 1,
          unit_price_cents: 6000,
          total_cents: 6000,
          ticket_tier_id: 'tier-general',
        },
      ],
    })
    forgetCategoryNames()
    await recordConfirmedOrder('order-2')
    expect(onlyEntry(h.world, 'sale').buyer_hash).toBe(signedIn)
  })

  test('an account that has bought before is returning, even with no address on either order', async () => {
    seedSignedIn()
    h.world.tables.get('orders')?.push({
      id: 'order-0',
      event_id: EVENT_ID,
      guest_email: null,
      user_id: 'user-1',
      confirmed_at: '2026-05-01T00:00:00.000Z',
      reservation_id: null,
      status: 'confirmed',
    })
    await recordConfirmedOrder('order-1')
    expect(onlyEntry(h.world, 'sale').returning_buyer).toBe(true)
  })

  test('an order with neither an address nor an account records no claim at all, rather than "first time"', async () => {
    seedSignedIn({ user_id: null })
    await recordConfirmedOrder('order-1')
    const sale = onlyEntry(h.world, 'sale')
    /*
     * ABSENT, which is how a NULL reaches the table. `entryPayload` omits a
     * field whose value is null rather than sending an explicit null, and an
     * omitted column takes its default, which for both of these is NULL.
     *
     * The claim being tested is the one that matters: NOTHING was recorded.
     * "We did not know" and "this is their first purchase" are different
     * statements, and a ledger that quietly turns the first into the second is
     * inventing a fact about a person.
     */
    expect(Object.prototype.hasOwnProperty.call(sale, 'buyer_hash')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(sale, 'returning_buyer')).toBe(false)
  })
})

/**
 * A ROW THAT WAS ALREADY THERE IS NOT A ROW THIS RUN WROTE.
 *
 * Found by running the backfill twice on TEST, 10 September 2026. The second run
 * printed "wrote 264 row(s)" having written 34: `write` returns ok for the
 * idempotent path as well as for a real insert, and the order-level recorders
 * counted both into one number. On a build whose standing rule is that a save
 * which quietly did nothing is never reported as success, the inverse is the
 * same defect wearing the other coat, and a backfill that overstates what it did
 * is the worst possible place for it.
 */
describe('what a recorder says it did', () => {
  const seed = () => {
    h.world = makeWorld({
      event_categories: [{ id: 'cat-music', slug: 'music' }],
      events: [eventRow()],
      orders: [
        {
          id: 'order-1',
          event_id: EVENT_ID,
          guest_email: 'buyer@example.com',
          user_id: null,
          confirmed_at: '2026-06-12T09:00:00.000Z',
          reservation_id: null,
          status: 'confirmed',
        },
      ],
      order_items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          item_type: 'ticket',
          item_name: 'General',
          quantity: 1,
          unit_price_cents: 6000,
          total_cents: 6000,
          ticket_tier_id: 'tier-general',
        },
      ],
    })
    forgetCategoryNames()
  }

  test('a re-run reports what it left alone, not what it wrote the first time', async () => {
    seed()
    await expect(recordConfirmedOrder('order-1')).resolves.toEqual({ written: 1, alreadyThere: 0, failed: 0 })
    // Same order, same occurrence key. The row is there and this run adds nothing.
    await expect(recordConfirmedOrder('order-1')).resolves.toEqual({ written: 0, alreadyThere: 1, failed: 0 })
    expect(entriesOfKind(h.world, 'sale')).toHaveLength(1)
  })
})
