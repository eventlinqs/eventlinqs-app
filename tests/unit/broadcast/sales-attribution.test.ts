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
 * THAT SECOND HALF WAS UNTRUE FROM THE DAY IT WAS WRITTEN UNTIL 20 SEPTEMBER
 * 2026, and this header said it anyway. The check compared one number against
 * itself, so no input could make it false and no test below asserted that it
 * ever was. The four cases under "the reconciliation compares against a total it
 * did not count itself" are the ones that could not be written before; two of
 * them go red against the old wiring.
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
 * TWO DIFFERENT THINGS THAT BOTH LOOK LIKE "FEWER ROWS CAME BACK", KEPT APART
 * ON PURPOSE, because conflating them is how the defect survived.
 *
 * `perResponseCeiling` is the REAL server. Supabase caps each RESPONSE at 1,000
 * rows with HTTP 200, `error` null and a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * It applies to the window that was asked for, so a caller that PAGES walks
 * straight past it and collects everything. Setting this proves `readEveryRow`
 * does that, and it is the thing the old unpaged code could not survive.
 *
 * `shortRead` is a read that lost rows and said nothing: it serves the first N
 * rows in total and then reports empty, whatever window is asked for. That is
 * what the old code did on every event past a thousand orders, and it is what
 * the reconciliation exists to CATCH. It is kept separate because a per-response
 * cap is survivable and a short read is not, and a stub with only one knob
 * cannot tell the two apart.
 *
 * Neither applies to a COUNT, exactly as neither applies to `count(*)` in
 * Postgres. That asymmetry is the whole mechanism by which the panel can notice.
 */
const perResponseCeiling: Partial<Record<keyof typeof data, number>> = {}
const shortRead: Partial<Record<keyof typeof data, number>> = {}

/** A read that FAILS, per table, so "error discarded" can be tested. */
const failOn: Partial<Record<keyof typeof data, string>> = {}

/**
 * A chainable stub shaped like the PostgREST builder.
 *
 * IT HONOURS THREE THINGS IT USED TO IGNORE, and each was load-bearing:
 *
 *   `.range(from, to)`  the reads are paged now, so a stub that returns the
 *                       whole array for every window pages for ever.
 *   `{ count, head }`   the reconciliation asks the SERVER to count, so the
 *                       stub has to be able to answer a question about rows it
 *                       is not returning. That is the entire mechanism.
 *   `.eq` / `.in`       ONLY on a column the fixture row actually carries. The
 *                       old contract was "the test supplies exactly the rows
 *                       the query would return", and keeping a filter on an
 *                       ABSENT column as a no-op preserves it: the conversion
 *                       fixtures carry no `kind`, so `.eq('kind','conversion')`
 *                       stays pre-applied. Where the column IS present, such as
 *                       an order's `status`, the filter is applied, because
 *                       otherwise the head-count would count refunded and
 *                       pending orders and invent a discrepancy.
 */
function stubAdmin() {
  return {
    from(table: keyof typeof data) {
      const preds: ((r: Record<string, unknown>) => boolean)[] = []
      let head = false
      let lo = 0
      let hi = Number.MAX_SAFE_INTEGER

      const matching = () =>
        (data[table] as unknown as Record<string, unknown>[]).filter(r =>
          preds.every(p => p(r)),
        )

      const builder: Record<string, unknown> = {}
      builder.select = (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) head = true
        return builder
      }
      builder.eq = (col: string, val: unknown) => {
        preds.push(r => !(col in r) || r[col] === val)
        return builder
      }
      builder.in = (col: string, vals: unknown[]) => {
        preds.push(r => !(col in r) || vals.includes(r[col]))
        return builder
      }
      for (const m of ['not', 'order', 'limit']) builder[m] = () => builder
      builder.range = (from: number, to: number) => {
        lo = from
        hi = to
        return builder
      }
      // A single-row terminal, for the events lookup. Resolves the FIRST row or
      // null, which is what PostgREST does, so a test that empties `events` gets
      // the same null the real client would return.
      builder.maybeSingle = () =>
        Promise.resolve({ data: matching()[0] ?? null, error: null })
      builder.then = (resolve: (v: Record<string, unknown>) => unknown) => {
        const failure = failOn[table]
        if (failure) {
          return Promise.resolve({ data: null, count: null, error: { message: failure } }).then(
            resolve,
          )
        }
        const all = matching()
        if (head) {
          // The server counts the whole table. Neither knob applies to a count,
          // which is the only reason a count can catch a short row read.
          return Promise.resolve({ data: null, count: all.length, error: null }).then(resolve)
        }
        // A short read loses rows outright, whatever window is asked for.
        const visible = typeof shortRead[table] === 'number' ? all.slice(0, shortRead[table]) : all
        // The per-response cap applies to the window, so paging survives it.
        const window = visible.slice(lo, hi + 1)
        const cap = perResponseCeiling[table]
        const served = typeof cap === 'number' ? window.slice(0, cap) : window
        return Promise.resolve({ data: served, error: null }).then(resolve)
      }
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
  for (const knob of [perResponseCeiling, shortRead, failOn]) {
    for (const k of Object.keys(knob)) delete knob[k as keyof typeof data]
  }
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

/**
 * THE RECONCILIATION USED TO BE INCAPABLE OF FAILING, AND THIS IS THE PROOF
 * THAT IT NO LONGER IS.
 *
 * WHAT IT USED TO COMPARE. `totals.orders` was incremented once per iteration
 * of the bucket loop, and every iteration also called `add()` exactly once,
 * which incremented exactly one bucket's `orders`. `discrepancy.orders` was
 * therefore `n - n` for every possible input, and the same held for tickets,
 * which added the same local value on both sides of the same iteration. The
 * check was one number compared against itself.
 *
 * WHY THAT MATTERED RATHER THAN BEING MERELY UGLY. The panel shows a
 * share-of-sales percentage ONLY when this passes, and its own comment says
 * "REFUSE RATHER THAN GUESS ... Showing one anyway is how a wrong number ends
 * up in a pitch deck". So the one safeguard over the only number on this
 * platform that gets quoted to an organiser was wired to a constant.
 *
 * THE EVIDENCE THAT NOBODY NOTICED: this file's own header has claimed since it
 * was written that "`reconciles` goes FALSE the moment it does not", and the
 * seven assertions above it are all `toBe(true)`. Not one asserts false, because
 * with the old wiring not one could be written. These four can.
 */
describe('the reconciliation compares against a total it did not count itself', () => {
  it('goes FALSE when the ledger read comes back short, and names what is missing', async () => {
    seed([{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }, { id: 'o5' }])
    // The rows path loses three orders; the server still counts five.
    shortRead.orders = 2

    const a = await fetchSalesAttribution(EVENT)

    expect(a.reconciles, 'a short ledger read must not render a percentage').toBe(false)
    expect(a.discrepancy.orders).toBe(3)
  })

  it('goes FALSE when the ticket read comes back short', async () => {
    seed([{ id: 'o1', tickets: 3 }, { id: 'o2', tickets: 3 }])
    shortRead.tickets = 2

    const a = await fetchSalesAttribution(EVENT)

    expect(a.reconciles).toBe(false)
    expect(a.discrepancy.tickets, 'six sold, two seen').toBe(4)
  })

  it('STAYS TRUE when nothing is lost, so the check is not simply always false', async () => {
    seed([{ id: 'o1', tickets: 2 }, { id: 'o2', tickets: 1 }])

    const a = await fetchSalesAttribution(EVENT)

    expect(a.reconciles).toBe(true)
    expect(a.discrepancy).toEqual({ orders: 0, tickets: 0 })
  })

  it('SURVIVES the real 1,000-row cap, because that applies per response and this pages', async () => {
    /*
     * The distinction the two knobs exist for. A per-response cap is what
     * Supabase actually does, and a paged reader walks past it: 7 orders read
     * 2 at a time is still 7 orders, and the panel reconciles.
     */
    seed(Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, tickets: 1 })))
    perResponseCeiling.orders = 2
    perResponseCeiling.tickets = 3

    const a = await fetchSalesAttribution(EVENT)

    expect(a.totals.orders, 'every order, collected across pages').toBe(7)
    expect(a.totals.tickets).toBe(7)
    expect(a.reconciles).toBe(true)
  })
})

/**
 * A READ THAT FAILED IS NOT AN EVENT THAT SOLD NOTHING.
 *
 * Every read in this module used to be `const { data } = await ...` followed by
 * `?? []`, so an unreachable database rendered a reach panel reporting zero
 * sales, zero tickets and zero attribution for an event that had sold out. On
 * this screen that is indistinguishable from an organiser whose sharing did
 * nothing, which is the opposite of the fact, and it is the number they would
 * act on.
 */
describe('a failed read throws rather than rendering an event that sold nothing', () => {
  it('throws when the order ledger cannot be read', async () => {
    seed([{ id: 'o1' }])
    failOn.orders = 'connection terminated'

    await expect(fetchSalesAttribution(EVENT)).rejects.toThrow(/order ledger/i)
  })

  it('throws when the tickets cannot be read', async () => {
    seed([{ id: 'o1' }])
    failOn.tickets = 'connection terminated'

    await expect(fetchSalesAttribution(EVENT)).rejects.toThrow(/tickets/i)
  })

  it('throws when the tracked links cannot be read', async () => {
    seed([{ id: 'o1' }])
    failOn.share_links = 'connection terminated'

    await expect(fetchSalesAttribution(EVENT)).rejects.toThrow(/tracked links/i)
  })
})
