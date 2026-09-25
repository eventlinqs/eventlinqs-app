import { describe, expect, test, vi, beforeEach } from 'vitest'

/**
 * THE DATA-OWNERSHIP PROMISE, HELD AGAINST A DATABASE THAT CAPS LIKE THE REAL
 * ONE.
 *
 * The growth plan's second blade is that an organiser owns every attendee
 * relationship and nothing is withheld. The attendee list, the door list, the
 * orders report and all four exports ARE that promise, and every read behind
 * them was unbounded.
 *
 * Supabase caps a response at 1,000 rows and says nothing about it: HTTP 200,
 * `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * The fake database below behaves exactly that way: it answers the window it is
 * given, clipped to its own ceiling, and never volunteers that there is more.
 *
 * Each test states the direction the truncation pointed, because the direction
 * is the harm:
 *
 *   tickets   read OLDEST-first, so the ceiling dropped the LATEST buyers. They
 *             are missing from the door list holding a valid ticket.
 *   consents  one row per attendee per organiser, so truncation DROPS people
 *             and a dropped person reads as NOT consented: the organiser is
 *             shown their own lawful audience as smaller than it is.
 *   orders    read NEWEST-first, so the OLDEST sales fell off the financial
 *             report and every fee column totalled short.
 *   scans     no order at all, so the admission that "won" a double-scan was
 *             whichever row arrived first, which is undefined.
 */

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://eventlinqs.test' }))

const { fetchEventAttendees, fetchEventOrdersReport } = await import('@/lib/reporting/attendees')
const { fetchDoorReview } = await import('@/lib/reporting/door-review')

type Row = Record<string, unknown>

/**
 * A PostgREST that answers a window and never says there is more.
 *
 * `pageCeiling` is the SERVER's cap, which the caller cannot see. It is
 * separately settable so the "ceiling lower than the page size" case can be
 * driven: a project whose cap has been lowered in a dashboard makes every page
 * look short, and a pager that stops on a short page reports a fraction of the
 * table as all of it.
 */
function database({
  tables = {} as Record<string, Row[]>,
  pageCeiling = 1000,
  failOn = null as null | string,
}) {
  const seen = { ranges: [] as { table: string; from: number; to: number }[], orderedBy: new Map<string, string[]>(), inSizes: [] as number[] }

  from.mockImplementation((table: string) => {
    const rows = tables[table] ?? []
    const filters: ((r: Row) => boolean)[] = []
    const chain: Record<string, unknown> = {}

    chain.select = () => chain
    chain.eq = (col: string, value: unknown) => {
      filters.push(r => r[col] === value)
      return chain
    }
    chain.in = (col: string, values: unknown[]) => {
      seen.inSizes.push(values.length)
      const set = new Set(values)
      filters.push(r => set.has(r[col]))
      return chain
    }
    chain.order = (col: string) => {
      const held = seen.orderedBy.get(table) ?? []
      held.push(col)
      seen.orderedBy.set(table, held)
      return chain
    }
    chain.range = async (start: number, end: number) => {
      if (failOn === table) return { data: null, error: { message: `${table} went away` } }
      seen.ranges.push({ table, from: start, to: end })
      const matching = rows.filter(r => filters.every(f => f(r)))
      // The server applies its own ceiling AFTER the window, invisibly.
      const window = matching.slice(start, end + 1).slice(0, pageCeiling)
      return { data: window, error: null }
    }
    chain.maybeSingle = async () => {
      if (failOn === table) return { data: null, error: { message: `${table} went away` } }
      const matching = rows.filter(r => filters.every(f => f(r)))
      return { data: matching[0] ?? null, error: null }
    }
    return chain
  })

  return seen
}

function tickets(count: number, over: (index: number) => Row = () => ({})): Row[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `ticket-${String(index).padStart(5, '0')}`,
    event_id: 'ev-1',
    // Oldest first: index 0 bought first, the last index bought most recently.
    created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
    ticket_code: `EL-${String(index).padStart(5, '0')}`,
    holder_name: `Attendee ${index}`,
    holder_email: `attendee-${index}@example.test`,
    status: 'valid',
    first_scanned_at: null,
    ticket_tier: { name: 'General Admission' },
    order: { order_number: `EL-ORD-${index}`, created_at: '2026-09-01T00:00:00.000Z' },
    ...over(index),
  }))
}

function orders(count: number): Row[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `order-${String(index).padStart(5, '0')}`,
    event_id: 'ev-1',
    order_number: `EL-ORD-${String(index).padStart(5, '0')}`,
    created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
    status: 'confirmed',
    currency: 'AUD',
    subtotal_cents: 2500,
    discount_cents: 0,
    platform_fee_cents: 100,
    processing_fee_cents: 0,
    total_cents: 2500,
    user_id: null,
    guest_name: `Buyer ${index}`,
    guest_email: `buyer-${index}@example.test`,
    order_items: [{ item_type: 'ticket', quantity: 1 }],
  }))
}

beforeEach(() => {
  from.mockReset()
})

describe('fetchEventAttendees: every attendee, or an honest failure', () => {
  test('a list inside one page reads exactly as it always did', async () => {
    database({ tables: { tickets: tickets(3), events: [{ id: 'ev-1', organisation_id: null }] } })
    const rows = await fetchEventAttendees('ev-1')
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.ticketCode)).toEqual(['EL-00000', 'EL-00001', 'EL-00002'])
  })

  /**
   * THE DEFECT, AND THE DIRECTION IS THE HARM. 1,150 tickets against a
   * 1,000-row ceiling used to export 1,000 rows. The read was OLDEST-first, so
   * the 150 dropped are the people who bought LAST: they hold a valid ticket
   * and they are not on the door list.
   */
  test('THE DEFECT: the 150 latest buyers are on the list, not dropped by the ceiling', async () => {
    database({ tables: { tickets: tickets(1_150), events: [{ id: 'ev-1', organisation_id: null }] } })
    const rows = await fetchEventAttendees('ev-1')
    expect(rows).toHaveLength(1_150)
    // The last buyer, the one a capped oldest-first read could never return.
    expect(rows.at(-1)?.ticketCode).toBe('EL-01149')
    expect(rows.map(r => r.ticketCode)).toContain('EL-01000')
  })

  test('the reading order survives paging on the primary key', async () => {
    database({ tables: { tickets: tickets(1_150), events: [{ id: 'ev-1', organisation_id: null }] } })
    const rows = await fetchEventAttendees('ev-1')
    const codes = rows.map(r => r.ticketCode)
    expect(codes).toEqual([...codes].sort())
  })

  test('it pages on a UNIQUE column, because created_at is not one', async () => {
    const seen = database({
      tables: { tickets: tickets(1_150), events: [{ id: 'ev-1', organisation_id: null }] },
    })
    await fetchEventAttendees('ev-1')
    // Every window, however many there are, is ordered by the primary key and
    // by nothing else. Asserted as a SET rather than as a list, because the
    // number of windows is the pager's business: 1,150 rows is two full pages
    // plus the empty page the pager stops on.
    const columns = seen.orderedBy.get('tickets') ?? []
    expect(columns.length).toBeGreaterThan(0)
    expect([...new Set(columns)]).toEqual(['id'])
  })

  test('a server ceiling LOWER than the page size does not end the read early', async () => {
    database({
      tables: { tickets: tickets(1_200), events: [{ id: 'ev-1', organisation_id: null }] },
      pageCeiling: 250,
    })
    expect(await fetchEventAttendees('ev-1')).toHaveLength(1_200)
  })

  test('refunded and void tickets are still excluded, as they always were', async () => {
    database({
      tables: {
        tickets: tickets(4, index => ({ status: index % 2 === 0 ? 'valid' : 'refunded' })),
        events: [{ id: 'ev-1', organisation_id: null }],
      },
    })
    expect(await fetchEventAttendees('ev-1')).toHaveLength(2)
  })

  /**
   * A FAILED READ IS NOT AN EVENT NOBODY BOUGHT A TICKET TO. The old code
   * discarded `error` and rendered `?? []`, so an outage produced an empty door
   * list and an export of nobody, presented as the complete answer.
   */
  test('a failed ticket read throws rather than exporting nobody', async () => {
    database({
      tables: { tickets: tickets(5), events: [{ id: 'ev-1', organisation_id: null }] },
      failOn: 'tickets',
    })
    await expect(fetchEventAttendees('ev-1')).rejects.toThrow(/could not be read in full/i)
  })

  test('a failed event read throws rather than marking everybody not consented', async () => {
    database({
      tables: { tickets: tickets(5), events: [{ id: 'ev-1', organisation_id: 'org-1' }] },
      failOn: 'events',
    })
    await expect(fetchEventAttendees('ev-1')).rejects.toThrow()
  })
})

describe('the marketing consent index: the organiser sees their whole lawful audience', () => {
  function consents(count: number): Row[] {
    return Array.from({ length: count }, (_unused, index) => ({
      id: `consent-${String(index).padStart(5, '0')}`,
      organisation_id: 'org-1',
      email: `attendee-${index}@example.test`,
      status: 'granted',
      unsubscribe_token: `token-${index}`,
    }))
  }

  /**
   * `organiser_marketing_consents` carries `unique (organisation_id, email)`,
   * so truncation DROPS people rather than keeping a stale answer, and
   * `isEmailConsented` defaults a missing person to false. Past a thousand
   * consents an organiser was therefore shown their own consented audience as
   * smaller than it is, in a column nobody second-guesses.
   */
  test('THE DEFECT: consent past the thousandth row is read, not silently dropped', async () => {
    database({
      tables: {
        tickets: tickets(1_150),
        events: [{ id: 'ev-1', organisation_id: 'org-1' }],
        organiser_marketing_consents: consents(1_150),
      },
    })
    const rows = await fetchEventAttendees('ev-1')
    expect(rows.filter(r => r.marketingConsent)).toHaveLength(1_150)
    expect(rows.at(-1)?.marketingConsent).toBe(true)
    expect(rows.at(-1)?.unsubscribeUrl).toBe('https://eventlinqs.test/unsubscribe/token-1149')
  })

  test('a withdrawn consent still reads as not consented', async () => {
    const rows = consents(2)
    rows[1].status = 'withdrawn'
    database({
      tables: {
        tickets: tickets(2),
        events: [{ id: 'ev-1', organisation_id: 'org-1' }],
        organiser_marketing_consents: rows,
      },
    })
    const read = await fetchEventAttendees('ev-1')
    expect(read[0].marketingConsent).toBe(true)
    expect(read[1].marketingConsent).toBe(false)
    expect(read[1].unsubscribeUrl).toBeNull()
  })

  test('a failed consent read throws rather than reporting nobody consented', async () => {
    database({
      tables: {
        tickets: tickets(5),
        events: [{ id: 'ev-1', organisation_id: 'org-1' }],
        organiser_marketing_consents: consents(5),
      },
      failOn: 'organiser_marketing_consents',
    })
    await expect(fetchEventAttendees('ev-1')).rejects.toThrow(/could not be read in full/i)
  })
})

describe('fetchEventOrdersReport: every order, and every buyer named', () => {
  test('THE DEFECT: the oldest sales are on the financial report, not dropped', async () => {
    database({ tables: { orders: orders(1_150) } })
    const report = await fetchEventOrdersReport('ev-1')
    expect(report).toHaveLength(1_150)
    // Newest first for reading, so the oldest sale is last: the one a capped
    // newest-first read could never return.
    expect(report.at(-1)?.orderRef).toBe('EL-ORD-00000')
    expect(report.reduce((sum, r) => sum + r.totalCents, 0)).toBe(1_150 * 2500)
    expect(report.reduce((sum, r) => sum + r.platformFeeCents, 0)).toBe(1_150 * 100)
  })

  test('the report reads newest first, as it always has', async () => {
    database({ tables: { orders: orders(5) } })
    const report = await fetchEventOrdersReport('ev-1')
    expect(report.map(r => r.orderRef)).toEqual([
      'EL-ORD-00004',
      'EL-ORD-00003',
      'EL-ORD-00002',
      'EL-ORD-00001',
      'EL-ORD-00000',
    ])
  })

  /**
   * A single `.in()` of more than a thousand ids is capped like any other read,
   * so every buyer past it resolved to NO profile and fell through to the guest
   * columns, which are null for a signed-in buyer. Real named people rendered
   * as blank rows on their own organiser's financial report.
   */
  test('THE DEFECT: every signed-in buyer is named, however many there are', async () => {
    const withUsers = orders(1_150).map((o, index) => ({
      ...o,
      user_id: `user-${String(index).padStart(5, '0')}`,
      guest_name: null,
      guest_email: null,
    }))
    const profiles = withUsers.map((_unused, index) => ({
      id: `user-${String(index).padStart(5, '0')}`,
      full_name: `Buyer ${index}`,
      email: `buyer-${index}@example.test`,
    }))
    const seen = database({ tables: { orders: withUsers, profiles } })
    const report = await fetchEventOrdersReport('ev-1')
    expect(report).toHaveLength(1_150)
    expect(report.filter(r => r.buyerName === '')).toHaveLength(0)
    expect(report.filter(r => r.buyerEmail === '')).toHaveLength(0)
    // And the `in` list was spelled in chunks, never as one 1,150-value URL.
    expect(seen.inSizes.length).toBeGreaterThan(1)
    expect(Math.max(...seen.inSizes)).toBeLessThanOrEqual(100)
  })

  test('a failed orders read throws rather than reporting an event that sold nothing', async () => {
    database({ tables: { orders: orders(5) }, failOn: 'orders' })
    await expect(fetchEventOrdersReport('ev-1')).rejects.toThrow(/could not be read in full/i)
  })
})

describe('fetchDoorReview: every flagged scan, beside the admission that really won', () => {
  function scans(count: number, result: string, review: string): Row[] {
    return Array.from({ length: count }, (_unused, index) => ({
      id: `${result}-${String(index).padStart(5, '0')}`,
      event_id: 'ev-1',
      ticket_id: `ticket-${String(index).padStart(5, '0')}`,
      result,
      review_status: review,
      device_id: `device-${index}`,
      device_scanned_at: null,
      scanned_at: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
      scanned_offline: false,
      ticket: { ticket_code: `EL-${index}`, holder_name: `Attendee ${index}` },
    }))
  }

  test('THE DEFECT: a flagged scan past the thousandth is still on the review list', async () => {
    const flagged = scans(1_150, 'duplicate', 'needs_review')
    const admitted = scans(1_150, 'admitted', 'ok')
    const seen = database({ tables: { ticket_scans: [...flagged, ...admitted] } })
    const rows = await fetchDoorReview('ev-1')
    expect(rows).toHaveLength(1_150)
    expect(rows.at(-1)?.scanId).toBe('duplicate-01149')
    // And the ticket-id list went out in chunks, not as one 1,150-value URL.
    expect(Math.max(...seen.inSizes)).toBeLessThanOrEqual(100)
  })

  test('the winner is the EARLIEST admission, whatever order the rows arrive in', async () => {
    const flagged = [
      {
        id: 'flag-1',
        event_id: 'ev-1',
        ticket_id: 't1',
        result: 'duplicate',
        review_status: 'needs_review',
        device_id: 'door-b',
        device_scanned_at: null,
        scanned_at: '2026-09-01T20:10:00.000Z',
        ticket: { ticket_code: 'EL-1', holder_name: 'Ada' },
      },
    ]
    const admitted = [
      {
        id: 'late',
        event_id: 'ev-1',
        ticket_id: 't1',
        result: 'admitted',
        review_status: 'ok',
        device_id: 'door-z',
        device_scanned_at: null,
        scanned_at: '2026-09-01T20:09:00.000Z',
        scanned_offline: false,
      },
      {
        id: 'first',
        event_id: 'ev-1',
        ticket_id: 't1',
        result: 'admitted',
        review_status: 'ok',
        device_id: 'door-a',
        device_scanned_at: null,
        scanned_at: '2026-09-01T20:01:00.000Z',
        scanned_offline: false,
      },
    ]
    database({ tables: { ticket_scans: [...flagged, ...admitted] } })
    const rows = await fetchDoorReview('ev-1')
    expect(rows[0].winner?.deviceId).toBe('door-a')
    expect(rows[0].winner?.at).toBe('2026-09-01T20:01:00.000Z')
  })

  test('nothing flagged means no second read at all', async () => {
    const seen = database({ tables: { ticket_scans: scans(3, 'admitted', 'ok') } })
    expect(await fetchDoorReview('ev-1')).toEqual([])
    expect(seen.inSizes).toEqual([])
  })

  test('a failed scan read throws rather than showing an empty review list', async () => {
    database({ tables: { ticket_scans: scans(3, 'duplicate', 'needs_review') }, failOn: 'ticket_scans' })
    await expect(fetchDoorReview('ev-1')).rejects.toThrow(/could not be read in full/i)
  })
})
