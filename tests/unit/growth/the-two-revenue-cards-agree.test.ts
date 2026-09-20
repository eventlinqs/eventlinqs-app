/**
 * LB-EDITREVENUE. THE ORGANISER'S TWO REVENUE CARDS SHOWED THE SAME EVENT TWO
 * DIFFERENT ANSWERS, AND THE ONE ON THE EDIT SCREEN WAS THE WRONG ONE.
 *
 * `RevenueSummary` is rendered for one event on /dashboard/events/[id]/orders
 * and again on /dashboard/events/[id]/edit. The orders screen paged every
 * order, counted the three PAID statuses and subtracted completed refunds. The
 * edit screen summed `.eq('status','confirmed')` over an unbounded, unordered
 * read whose error it discarded.
 *
 * What is asserted here, and what is asserted elsewhere:
 *
 *   the arithmetic      here, exhaustively, including every status the table
 *                       allows and both refund states.
 *   the agreement       here, by running BOTH screens' data pipelines over one
 *                       set of rows and requiring the five card props to match.
 *                       This is the assertion the defect would have failed.
 *   the paging          here, against a fake server that truncates the way a
 *                       real project does. A unit test cannot prove a row
 *                       ceiling exists; scripts/verify/lb-editrevenue-drive.mjs
 *                       does that against TEST.
 *   the shapes          here, by reading the two screens, so that if the guard
 *                       is ever narrowed the specific defect that was in the
 *                       tree still fails a test.
 */
import { describe, it, expect } from 'vitest'
import { readRepoFile } from '../../helpers/read-repo-file'
import {
  summariseEventRevenue,
  readEventRevenue,
  PAID_ORDER_STATUSES,
  type EventRevenueOrderRow,
  type EventRevenueRefundRow,
} from '@/lib/organisers/event-revenue'

const read = (p: string) => readRepoFile(p)

/**
 * READ THE CODE, NOT THE PROSE ABOUT THE CODE. Both screens now carry comments
 * quoting the exact query they replaced, so a test that greps raw source fails
 * on the EXPLANATION of the bug rather than on the bug.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const EDIT = codeOnly(read('src/app/(dashboard)/dashboard/events/[id]/edit/page.tsx'))
const ORDERS = codeOnly(read('src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx'))
const CREATE = codeOnly(read('src/app/(dashboard)/dashboard/events/create/page.tsx'))

function order(over: Partial<EventRevenueOrderRow> = {}): EventRevenueOrderRow {
  return {
    total_cents: 1000,
    platform_fee_cents: 50,
    processing_fee_cents: 0,
    status: 'confirmed',
    currency: 'AUD',
    ...over,
  }
}

describe('summariseEventRevenue: the arithmetic both screens share', () => {
  it('counts a confirmed order in full', () => {
    const s = summariseEventRevenue([order()], [])
    expect(s.grossCents).toBe(1000)
    expect(s.platformFeeCents).toBe(50)
    expect(s.netCents).toBe(1000)
    expect(s.paidOrders).toBe(1)
  })

  /*
   * THE DEFECT, NAMED. `.eq('status','confirmed')` dropped this order in full,
   * so an organiser who had refunded part of one sale saw the whole sale
   * vanish from their gross rather than seeing the part they gave back.
   */
  it('counts a partially refunded order in gross and deducts only what went back', () => {
    const s = summariseEventRevenue(
      [order({ status: 'partially_refunded', total_cents: 2687 })],
      [{ amount_cents: 687, status: 'completed' }],
    )
    expect(s.grossCents).toBe(2687)
    expect(s.refundedCents).toBe(687)
    expect(s.netCents).toBe(2000)
  })

  it('counts a fully refunded order in gross and nets it to nothing', () => {
    const s = summariseEventRevenue(
      [order({ status: 'refunded', total_cents: 2687 })],
      [{ amount_cents: 2687, status: 'completed' }],
    )
    expect(s.grossCents).toBe(2687)
    expect(s.netCents).toBe(0)
  })

  it('never counts an order in which no sale occurred', () => {
    for (const status of ['pending', 'cancelled', 'expired']) {
      const s = summariseEventRevenue([order({ status })], [])
      expect(s.grossCents, status).toBe(0)
      expect(s.paidOrders, status).toBe(0)
    }
  })

  /*
   * A refund that has been REQUESTED is not money that has gone back. Counting
   * it would understate what the organiser is owed, which is the same class of
   * error in the opposite direction.
   */
  it('deducts only refunds that completed', () => {
    const s = summariseEventRevenue(
      [order({ status: 'partially_refunded', total_cents: 5000 })],
      [
        { amount_cents: 1000, status: 'completed' },
        { amount_cents: 2000, status: 'pending' },
        { amount_cents: 3000, status: 'failed' },
      ],
    )
    expect(s.refundedCents).toBe(1000)
    expect(s.netCents).toBe(4000)
  })

  /*
   * The processing fee is summed over the SAME set as gross. Summing it over a
   * different one is how the card stops adding up: the fee line would carry a
   * charge from an order whose sale was not in the total above it.
   */
  it('sums the processing fee over the paid set and no other', () => {
    const s = summariseEventRevenue(
      [
        order({ processing_fee_cents: 30 }),
        order({ status: 'refunded', processing_fee_cents: 40 }),
        order({ status: 'cancelled', processing_fee_cents: 900 }),
      ],
      [],
    )
    expect(s.processingFeeCents).toBe(70)
  })

  it('reports the currency of the money that was actually taken', () => {
    const s = summariseEventRevenue(
      [order({ status: 'cancelled', currency: 'USD' }), order({ currency: 'AUD' })],
      [],
    )
    expect(s.currency).toBe('AUD')
  })

  it('falls back to the caller currency only when nothing was sold', () => {
    expect(summariseEventRevenue([], [], 'NZD').currency).toBe('NZD')
    expect(summariseEventRevenue([], []).currency).toBe('AUD')
  })

  it('names the three paid statuses once, for both screens', () => {
    expect([...PAID_ORDER_STATUSES]).toEqual(['confirmed', 'partially_refunded', 'refunded'])
  })
})

/**
 * A SERVER THAT TRUNCATES, because that is what the defect is a property of.
 * It answers 200 with no error having silently left rows out, exactly as a
 * Supabase project does at its row ceiling.
 */
function fakeClient(
  tables: { orders: (EventRevenueOrderRow & { id: string })[]; refunds: EventRevenueRefundRow[] },
  { ceiling = 1000, failOn = null as string | null } = {},
) {
  const seen: { table: string; methods: string[]; from: number; to: number }[] = []

  function builder(table: string) {
    const methods: string[] = []
    let statuses: string[] | null = null
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) {
      chain[m] = (...args: unknown[]) => {
        methods.push(`${m}:${String(args[0])}`)
        return chain
      }
    }
    chain.in = (column: string, values: string[]) => {
      methods.push(`in:${column}`)
      if (column === 'status') statuses = values
      return chain
    }
    chain.range = (from: number, to: number) => {
      seen.push({ table, methods: [...methods], from, to })
      if (failOn === table) {
        return Promise.resolve({ data: null, error: { message: `${table} is unavailable` } })
      }
      const all =
        table === 'orders'
          ? tables.orders.filter(o => !statuses || statuses.includes(o.status))
          : tables.refunds
      const width = Math.min(to - from + 1, ceiling)
      return Promise.resolve({ data: all.slice(from, from + width), error: null })
    }
    return chain
  }

  return { client: { from: (table: string) => builder(table) } as never, seen }
}

describe('readEventRevenue: the whole answer or an exception', () => {
  it('reads past the row ceiling instead of summing an arbitrary thousand', async () => {
    const orders = Array.from({ length: 2500 }, (_, i) => ({
      ...order({ total_cents: 100 }),
      id: `o${String(i).padStart(5, '0')}`,
    }))
    const { client } = fakeClient({ orders, refunds: [] }, { ceiling: 1000 })
    const s = await readEventRevenue(client, 'event-1')
    expect(s.paidOrders).toBe(2500)
    expect(s.grossCents).toBe(250_000)
  })

  /*
   * THE ONE A NAIVE PAGER FAILS: a project whose ceiling has been LOWERED
   * answers every request with a short page. Stopping on a short page would
   * report a fraction of the takings as the whole of them.
   */
  it('reads the whole set when the project ceiling is lower than the page size', async () => {
    const orders = Array.from({ length: 1200 }, (_, i) => ({
      ...order({ total_cents: 100 }),
      id: `o${String(i).padStart(5, '0')}`,
    }))
    const { client } = fakeClient({ orders, refunds: [] }, { ceiling: 300 })
    const s = await readEventRevenue(client, 'event-1')
    expect(s.grossCents).toBe(120_000)
  })

  it('asks the server for the paid statuses rather than filtering after the ceiling', async () => {
    const { client, seen } = fakeClient({ orders: [{ ...order(), id: 'o1' }], refunds: [] })
    await readEventRevenue(client, 'event-1')
    const ordersRead = seen.find(s => s.table === 'orders')
    expect(ordersRead?.methods).toContain('in:status')
  })

  /*
   * Ranged paging over a non-deterministic order can hand one row back in two
   * windows and no window at all to another, so the order is part of the fix
   * rather than a tidy-up beside it.
   */
  it('pages on a unique order', async () => {
    const { client, seen } = fakeClient({ orders: [{ ...order(), id: 'o1' }], refunds: [] })
    await readEventRevenue(client, 'event-1')
    for (const call of seen) expect(call.methods, call.table).toContain('order:id')
  })

  it('throws rather than reporting a sold-out event as having earned nothing', async () => {
    const { client } = fakeClient({ orders: [], refunds: [] }, { failOn: 'orders' })
    await expect(readEventRevenue(client, 'event-1')).rejects.toThrow(/could not be read in full/)
  })

  it('throws when the refunds cannot be read, because a lost refund leaves net too high', async () => {
    const { client } = fakeClient(
      { orders: [{ ...order({ status: 'refunded' }), id: 'o1' }], refunds: [] },
      { failOn: 'refunds' },
    )
    await expect(readEventRevenue(client, 'event-1')).rejects.toThrow(/could not be read in full/)
  })
})

describe('the two screens agree about one event', () => {
  /**
   * The orders screen reads EVERY order of the event and filters in the app;
   * the edit screen asks the server for the paid ones. Both then summarise.
   * Given one event, the five numbers handed to `RevenueSummary` must match.
   */
  it('hands RevenueSummary the same five numbers from both pipelines', async () => {
    const rows = [
      { ...order({ total_cents: 5000, platform_fee_cents: 250 }), id: 'o1' },
      { ...order({ status: 'partially_refunded', total_cents: 2687, platform_fee_cents: 134 }), id: 'o2' },
      { ...order({ status: 'refunded', total_cents: 900, platform_fee_cents: 45 }), id: 'o3' },
      { ...order({ status: 'pending', total_cents: 9999, platform_fee_cents: 999 }), id: 'o4' },
      { ...order({ status: 'cancelled', total_cents: 4444, platform_fee_cents: 444 }), id: 'o5' },
    ]
    const refunds = [
      { amount_cents: 687, status: 'completed' },
      { amount_cents: 900, status: 'completed' },
    ]

    // The edit screen: ask the server for the paid statuses, then summarise.
    const { client } = fakeClient({ orders: rows, refunds })
    const fromEdit = await readEventRevenue(client, 'event-1')

    // The orders screen: every order arrives, is filtered, then summarised.
    const fromOrders = summariseEventRevenue(
      rows.filter(o => (PAID_ORDER_STATUSES as readonly string[]).includes(o.status)),
      refunds,
      rows[0].currency,
    )

    for (const key of [
      'grossCents',
      'platformFeeCents',
      'processingFeeCents',
      'refundedCents',
      'netCents',
    ] as const) {
      expect(fromEdit[key], key).toBe(fromOrders[key])
    }
    expect(fromEdit.grossCents).toBe(8587)
    expect(fromEdit.refundedCents).toBe(1587)
    expect(fromEdit.netCents).toBe(7000)
  })
})

describe('the defect cannot return to either screen', () => {
  /*
   * The edit screen reaches the shared arithmetic through `readEventRevenue`
   * and the orders screen through `summariseEventRevenue`, because one has
   * already read its rows for the table it draws and the other has not. Either
   * is the shared module; neither is a second implementation.
   */
  it('neither screen sums money it read itself', () => {
    for (const [name, source] of [['edit', EDIT], ['orders', ORDERS]] as const) {
      expect(source, name).toMatch(/readEventRevenue|summariseEventRevenue/)
      // The reducers the edit screen used to carry, over rows it fetched itself.
      expect(source, name).not.toMatch(/reduce\([^)]*s \+ o\.total_cents/)
      expect(source, name).not.toMatch(/reduce\([^)]*s \+ o\.platform_fee_cents/)
      expect(source, name).not.toMatch(/reduce\([^)]*s \+ o\.processing_fee_cents/)
    }
  })

  it('the edit screen no longer asks for one status and calls it the takings', () => {
    expect(EDIT).not.toMatch(/\.eq\(\s*['"]status['"]\s*,\s*['"]confirmed['"]\s*\)/)
  })

  it('the edit screen passes the refund deduction it used to omit', () => {
    expect(EDIT).toMatch(/refundedCents=\{revenue\.refundedCents\}/)
  })

  it('neither event form reads its option lists without a bound', () => {
    for (const [name, source] of [['edit', EDIT], ['create', CREATE]] as const) {
      expect(source, name).toContain('readEventCategories')
      expect(source, name).toContain('readOrganisationVenues')
      expect(source, name).not.toMatch(/from\(\s*['"]event_categories['"]\s*\)/)
      expect(source, name).not.toMatch(/from\(\s*['"]venues['"]\s*\)/)
    }
  })
})
