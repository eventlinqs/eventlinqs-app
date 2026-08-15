/**
 * THE ATTRIBUTION MUST TIE TO THE ORDER LEDGER, OR REFUSE TO SHOW A NUMBER.
 *
 * WHAT THIS PINS. The reach panel counted activity on tracked links and had no
 * denominator, so "12 tickets from shares" could not be turned into a share of
 * sales. `fetchSalesAttribution` adds the denominator by reading the ORDER
 * LEDGER and laying attribution over it. The whole thing is only worth anything
 * if the buckets sum to the ledger exactly, so that is asserted here, in both
 * directions: it holds when the data is sound, and `reconciles` goes FALSE the
 * moment it does not.
 *
 * IT ALSO PINS THE DEFINITION OF A SALE. Three different ones were live at the
 * same time: ['confirmed'], ['confirmed','partially_refunded','refunded'], and
 * no filter at all. Any two produce a different percentage for the same event,
 * which means the organiser reads one total on the event overview and a
 * different one on the reach panel, both labelled tickets sold. One exported
 * constant now decides it, and the source assertion below fails if a caller
 * redefines it locally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

type OrderRow = { id: string; status: string; total_cents: number }
type TicketRow = { order_id: string }
type LinkRow = { id: string; channel: string }
type ConvRow = { link_id: string; order_id: string | null; occurred_at: string }

type EventRow = { external_ticket_url: string | null }

const data = {
  orders: [] as OrderRow[],
  tickets: [] as TicketRow[],
  share_links: [] as LinkRow[],
  share_link_events: [] as ConvRow[],
  /**
   * The event itself. Added when attribution began EXCLUDING externally
   * ticketed events from the sold-ticket buckets: the module now reads this row
   * first, so the stub has to serve it. Defaults to an internal event, which is
   * what every existing case in this file assumes.
   */
  events: [{ external_ticket_url: null }] as EventRow[],
}

/**
 * A chainable stub shaped like the PostgREST builder. Every terminal method
 * resolves to the rows for that table; the filters are ignored because the test
 * supplies exactly the rows the query would return.
 */
function stubAdmin() {
  return {
    from(table: keyof typeof data) {
      const rows = data[table]
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) {
        builder[m] = () => builder
      }
      // A single-row terminal, for the events lookup. Resolves the FIRST row or
      // null, which is what PostgREST does, so a test that empties `events` gets
      // the same null the real client would return.
      builder.maybeSingle = () =>
        Promise.resolve({ data: (rows as unknown[])[0] ?? null, error: null })
      builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve)
      return builder
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => stubAdmin() }))

const { fetchSalesAttribution, SOLD_STATUSES, PLATFORM_OWNED_CHANNELS, isPlatformChannel } =
  await import('@/lib/broadcast/sales-attribution')

const EVENT = 'event-1'

beforeEach(() => {
  data.orders = []
  data.tickets = []
  data.share_links = []
  data.share_link_events = []
  // Internal by default. The external case sets this explicitly.
  data.events = [{ external_ticket_url: null }]
})

/** One order, one ticket each, so ticket counts are easy to reason about. */
function seed(orders: { id: string; status?: string; tickets?: number }[]) {
  data.orders = orders.map(o => ({ id: o.id, status: o.status ?? 'confirmed', total_cents: 1000 }))
  data.tickets = orders.flatMap(o =>
    Array.from({ length: o.tickets ?? 1 }, () => ({ order_id: o.id })),
  )
}

/**
 * NON-NEGOTIABLE 2 (founder ruling 15 August 2026): never claim a sale we
 * cannot see.
 *
 * An externally ticketed event's conversions happen on somebody else's site.
 * The requirement is that it is EXCLUDED from the sold-ticket buckets rather
 * than counted as `untracked`, and the distinction is the whole point:
 * `untracked` asserts "a sale happened here and no tracked link was involved",
 * which is a real, countable thing. An external event has no sale here at all.
 * Letting it fall into `untracked` would put a zero in a bucket whose name
 * claims we read a ledger, and the panel would then render "0% of sales came
 * from your sharing" about sales it cannot see.
 */
describe('NON-NEGOTIABLE 2: an external event is excluded, not counted as untracked', () => {
  it('returns the externallyTicketed flag and every bucket empty', async () => {
    data.events = [{ external_ticket_url: 'https://tickets.example.org/e/1' }]
    // Orders that WOULD have counted, to prove exclusion beats "no data".
    seed([{ id: 'o1', tickets: 3 }, { id: 'o2', tickets: 2 }])

    const r = await fetchSalesAttribution(EVENT)

    expect(r.externallyTicketed).toBe(true)
    expect(r.totals.tickets).toBe(0)
    expect(r.buckets.untracked.tickets).toBe(0)
    expect(r.buckets.untracked.orders).toBe(0)
    expect(r.buckets.organiserShared.tickets).toBe(0)
    expect(r.organiserSharedPercent).toBe(0)
    expect(r.platformAttributablePercent).toBe(0)
  })

  it('STILL RECONCILES, because zero ties out to zero', async () => {
    data.events = [{ external_ticket_url: 'https://tickets.example.org/e/1' }]
    seed([{ id: 'o1', tickets: 3 }])

    const r = await fetchSalesAttribution(EVENT)

    expect(r.reconciles).toBe(true)
    expect(r.discrepancy).toEqual({ orders: 0, tickets: 0 })
  })

  it('an INTERNAL event is unaffected and still reports its buckets', async () => {
    seed([{ id: 'o1', tickets: 2 }])
    const r = await fetchSalesAttribution(EVENT)
    expect(r.externallyTicketed).toBe(false)
    expect(r.totals.tickets).toBe(2)
    expect(r.reconciles).toBe(true)
  })
})

describe('the sale definition is single-sourced', () => {
  it('counts a refunded ticket as sold, because the sale happened', () => {
    expect([...SOLD_STATUSES].sort()).toEqual(['confirmed', 'partially_refunded', 'refunded'])
  })

  it('reach.ts imports the shared definition rather than declaring its own', () => {
    const reach = readFileSync(
      path.join(path.resolve(__dirname, '../../..'), 'src/lib/broadcast/reach.ts'),
      'utf8',
    )
    expect(
      /import\s*\{[^}]*SOLD_STATUSES[^}]*\}\s*from\s*['"]@\/lib\/broadcast\/sales-attribution['"]/.test(reach),
      'reach.ts must import SOLD_STATUSES, not redefine which orders count as sold',
    ).toBe(true)
  })

  it('treats only the digest as an EventLinqs-owned channel', () => {
    expect([...PLATFORM_OWNED_CHANNELS]).toEqual(['digest'])
    expect(isPlatformChannel('digest')).toBe(true)
    expect(isPlatformChannel('whatsapp')).toBe(false)
    expect(isPlatformChannel('qr')).toBe(false)
  })
})

describe('the buckets reconcile to the order ledger', () => {
  it('sums to the ledger exactly with a mix of every bucket', async () => {
    seed([{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4', tickets: 2 }])
    data.share_links = [
      { id: 'l-wa', channel: 'whatsapp' },
      { id: 'l-dg', channel: 'digest' },
    ]
    data.share_link_events = [
      { link_id: 'l-wa', order_id: 'o1', occurred_at: '2026-08-01T00:00:00Z' },
      { link_id: 'l-dg', order_id: 'o2', occurred_at: '2026-08-01T00:00:00Z' },
    ]

    const a = await fetchSalesAttribution(EVENT)

    expect(a.totals.orders).toBe(4)
    expect(a.totals.tickets).toBe(5)
    expect(a.buckets.organiserShared.tickets).toBe(1)
    expect(a.buckets.platformChannel.tickets).toBe(1)
    expect(a.buckets.untracked.tickets).toBe(3)

    const summed =
      a.buckets.organiserShared.tickets + a.buckets.platformChannel.tickets + a.buckets.untracked.tickets
    expect(summed, 'the three buckets must equal the ledger total').toBe(a.totals.tickets)
    expect(a.reconciles).toBe(true)
    expect(a.discrepancy).toEqual({ orders: 0, tickets: 0 })
  })

  it('counts an order ONCE even if it carries two conversion rows', async () => {
    // The double-count risk. Measured at zero on TEST, asserted here so it can
    // never become non-zero silently.
    seed([{ id: 'o1' }])
    data.share_links = [
      { id: 'l-wa', channel: 'whatsapp' },
      { id: 'l-ig', channel: 'instagram' },
    ]
    data.share_link_events = [
      { link_id: 'l-ig', order_id: 'o1', occurred_at: '2026-08-02T00:00:00Z' },
      { link_id: 'l-wa', order_id: 'o1', occurred_at: '2026-08-01T00:00:00Z' },
    ]

    const a = await fetchSalesAttribution(EVENT)

    expect(a.totals.tickets).toBe(1)
    expect(a.buckets.organiserShared.tickets).toBe(1)
    expect(a.reconciles).toBe(true)
    expect(a.multiplyAttributedOrders, 'the anomaly must be reported, not hidden').toBe(1)
    // First touch wins: the earlier row is whatsapp.
    expect(a.byChannel[0]?.channel).toBe('whatsapp')
  })

  it('excludes orders that are not a sale from the denominator', async () => {
    seed([
      { id: 'o1', status: 'confirmed' },
      { id: 'o2', status: 'pending' },
      { id: 'o3', status: 'cancelled' },
      { id: 'o4', status: 'refunded' },
    ])
    const a = await fetchSalesAttribution(EVENT)
    // confirmed + refunded count; pending and cancelled do not.
    expect(a.totals.orders).toBe(2)
    expect(a.refundedOrders).toBe(1)
    expect(a.reconciles).toBe(true)
  })

  it('gives the percentages against the LEDGER, not against tracked links', async () => {
    seed([{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }])
    data.share_links = [{ id: 'l-wa', channel: 'whatsapp' }]
    data.share_link_events = [{ link_id: 'l-wa', order_id: 'o1', occurred_at: '2026-08-01T00:00:00Z' }]

    const a = await fetchSalesAttribution(EVENT)

    // 1 of 4, not 1 of 1. Denominator is the whole event.
    expect(a.organiserSharedPercent).toBe(25)
    expect(a.platformAttributablePercent).toBe(75)
    expect(a.organiserSharedPercent + a.platformAttributablePercent).toBe(100)
  })

  it('reports zero cleanly for an event with no sales', async () => {
    const a = await fetchSalesAttribution(EVENT)
    expect(a.totals.tickets).toBe(0)
    expect(a.organiserSharedPercent).toBe(0)
    expect(a.reconciles).toBe(true)
  })

  /**
   * THE FAILURE DIRECTION. A guard that only ever passes proves nothing, so the
   * disagreement is manufactured: a conversion points at an order that is not in
   * the ledger for this event. It must be ignored rather than counted, and the
   * totals must still tie. Counting it would make the buckets exceed the ledger.
   */
  it('ignores a conversion pointing at an order outside the ledger', async () => {
    seed([{ id: 'o1' }])
    data.share_links = [{ id: 'l-wa', channel: 'whatsapp' }]
    data.share_link_events = [
      { link_id: 'l-wa', order_id: 'o1', occurred_at: '2026-08-01T00:00:00Z' },
      { link_id: 'l-wa', order_id: 'ghost-order', occurred_at: '2026-08-01T00:00:00Z' },
    ]

    const a = await fetchSalesAttribution(EVENT)

    expect(a.totals.orders).toBe(1)
    const summed =
      a.buckets.organiserShared.orders + a.buckets.platformChannel.orders + a.buckets.untracked.orders
    expect(summed, 'a stray conversion must not inflate the buckets past the ledger').toBe(1)
    expect(a.reconciles).toBe(true)
  })
})
