import { describe, expect, test, vi, beforeEach } from 'vitest'

/**
 * THE ADMIN ORGANISER SCREENS COUNT EVERY ROW, OR THEY SAY THEY COULD NOT.
 *
 * ---------------------------------------------------------------------------
 * `countEventsAndVolume` exists BECAUSE a stored counter drifted. Its own
 * header records the census: 9 of 9 organisations carrying a non-zero
 * `total_event_count` disagreed with their own rows, one of them reading 5
 * against 76 real events. The fix was to stop keeping a second copy and to
 * COUNT THE ROWS, "so the figure cannot be wrong".
 *
 * Both of those counting reads were unbounded. Supabase caps one response at a
 * fixed number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * Measured against the TEST project on 20 September 2026:
 *
 *     Prefer: count=exact    HTTP 206   Content-Range: 0-999/14381
 *     no count requested     HTTP 200   Content-Range: 0-999/*
 *
 * The page size of 25 bounds the QUESTION and not the ANSWER: twenty-five
 * organisers with forty confirmed orders each is a thousand rows, and past that
 * the lifetime volume beside a real organiser stops growing. The drift the
 * function was written to end returns by another route, and this time with a
 * comment above it promising it cannot.
 *
 * TEST cannot show this. It holds 293 organisations and 285 published events,
 * so every real read returns everything. Hence a faked server ceiling here.
 */

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/stripe/connect', () => ({ retrieveAccount: async () => null }))
vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))

const audited: { action: string; metadata?: Record<string, unknown> }[] = []
vi.mock('@/lib/admin/audit', () => ({
  recordAuditEvent: async (input: { action: string; metadata?: Record<string, unknown> }) => {
    audited.push(input)
  },
}))

const { listOrganisations, getOrganiserDetail, applyOrganiserAction } = await import('@/lib/admin/organisers')

type Row = Record<string, unknown>

/**
 * A database that answers a window and never volunteers that there is more,
 * exactly as PostgREST does. `pageCeiling` is the server's own cap, which the
 * caller can neither see nor change.
 */
function database({
  organisations = [] as Row[],
  events = [] as Row[],
  orders = [] as Row[],
  pageCeiling = 1000,
  failOn = null as null | string,
  cascade = { count: 0 as number | null, error: null as null | { message: string } },
}) {
  const ordered = new Set<string>()
  const pages: Record<string, number[]> = { events: [], orders: [] }

  from.mockImplementation((table: string) => {
    const rowsFor = table === 'events' ? events : table === 'orders' ? orders : organisations

    const listChain: Record<string, unknown> = {}
    const afterOrder = () => {
      ordered.add(table)
      return {
        order: afterOrder,
        range: async (start: number, end: number) => {
          if (failOn === table) return { data: null, error: { message: `${table} went away` } }
          const window = rowsFor.slice(start, Math.min(end + 1, start + pageCeiling))
          pages[table]?.push(window.length)
          return { data: window, error: null }
        },
        // The organisations list read is ranged by page, not paged to the end.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(
            failOn === table
              ? { data: null, error: { message: `${table} went away` } }
              : { data: rowsFor, error: null },
          ).then(resolve),
        eq: () => afterOrder(),
        or: () => afterOrder(),
      }
    }
    listChain.order = afterOrder
    listChain.eq = () => listChain
    listChain.in = () => listChain
    listChain.or = () => listChain
    listChain.maybeSingle = async () =>
      failOn === table
        ? { data: null, error: { message: `${table} went away` } }
        : { data: rowsFor[0] ?? null, error: null }

    return {
      select: () => listChain,
      /*
       * TWO UPDATES REACH THIS MOCK AND THEY ARE DIFFERENT SHAPES. The status
       * write asks for its row back (`.select('id').maybeSingle()`); the
       * suspend cascade asks only for a COUNT and is awaited directly, which is
       * the point of the change under test.
       */
      update: () => {
        const mutation: Record<string, unknown> = {}
        mutation.eq = () => mutation
        mutation.in = () => mutation
        mutation.select = () => ({
          maybeSingle: async () => ({ data: rowsFor[0] ?? null, error: null }),
        })
        mutation.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve(table === 'events' ? cascade : { count: null, error: null }).then(resolve)
        return mutation
      },
    }
  })

  return { ordered, pages }
}

function org(id: string, overrides: Row = {}): Row {
  return {
    id,
    name: `Organiser ${id}`,
    slug: `organiser-${id}`,
    status: 'active',
    email: `${id}@example.test`,
    payout_status: 'active',
    stripe_charges_enabled: true,
    stripe_account_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  from.mockReset()
  audited.length = 0
})

describe('the organiser list counts every event, or fails loudly', () => {
  test('a catalogue inside one page counts as it always did', async () => {
    database({
      organisations: [org('a')],
      events: [{ organisation_id: 'a' }, { organisation_id: 'a' }, { organisation_id: 'b' }],
    })
    const list = await listOrganisations({})
    expect(list.rows[0].totalEventCount).toBe(2)
  })

  test('THE DEFECT: 2,500 events past a 1,000-row ceiling are all counted', async () => {
    const events = Array.from({ length: 2500 }, () => ({ organisation_id: 'a' }))
    const { pages } = database({ organisations: [org('a')], events, pageCeiling: 1000 })

    const list = await listOrganisations({})

    expect(list.rows[0].totalEventCount).toBe(2500)
    // Three full windows, one short, one empty: the loop stops on an empty page
    // rather than on a short one, so a ceiling lower than the page size cannot
    // end it early.
    expect(pages.events).toEqual([1000, 1000, 500, 0])
  })

  test('a ceiling LOWER than the page size is still read in full', async () => {
    const events = Array.from({ length: 1200 }, () => ({ organisation_id: 'a' }))
    database({ organisations: [org('a')], events, pageCeiling: 250 })
    const list = await listOrganisations({})
    expect(list.rows[0].totalEventCount).toBe(1200)
  })

  test('both counting reads carry a stable order, because paging without one is not paging', async () => {
    const { ordered } = database({ organisations: [org('a')], events: [{ organisation_id: 'a' }] })
    await listOrganisations({})
    expect(ordered.has('events')).toBe(true)
    expect(ordered.has('orders')).toBe(true)
  })

  test('an events read that FAILS raises rather than printing "0 events" beside a real organiser', async () => {
    database({ organisations: [org('a')], failOn: 'events' })
    await expect(listOrganisations({})).rejects.toThrow(/organiser event counts could not be read/)
  })

  test('an orders read that FAILS raises rather than printing a lifetime volume of nothing', async () => {
    database({ organisations: [org('a')], failOn: 'orders' })
    await expect(listOrganisations({})).rejects.toThrow(/organiser lifetime volume could not be read/)
  })
})

describe('the organiser detail', () => {
  test('lifetime volume sums every confirmed order, past the ceiling', async () => {
    const orders = Array.from({ length: 1500 }, () => ({ organisation_id: 'a', total_cents: 1000 }))
    database({ organisations: [org('a')], orders, pageCeiling: 1000 })
    const detail = await getOrganiserDetail('a')
    expect(detail?.totalVolumeCents).toBe(1_500_000)
  })

  test('A READ THAT FAILED IS NOT AN ORGANISER WHO IS NOT THERE', async () => {
    database({ organisations: [], failOn: 'organisations' })
    await expect(getOrganiserDetail('a')).rejects.toThrow(/could not be read/)
  })

  test('an organiser who genuinely is not there is still null', async () => {
    database({ organisations: [] })
    expect(await getOrganiserDetail('a')).toBeNull()
  })
})

describe('suspending an organiser: three outcomes, three records', () => {
  test('the events taken off sale are audited by the count the database returned', async () => {
    database({ organisations: [org('a', { status: 'active' })], cascade: { count: 7, error: null } })
    await applyOrganiserAction({ organisationId: 'a', action: 'suspend' }, session())
    const entry = audited.find(a => a.action === 'admin.organiser.events_unpublished')
    expect(entry?.metadata?.count).toBe(7)
  })

  test('nothing to pause writes no cascade entry at all', async () => {
    database({ organisations: [org('a', { status: 'active' })], cascade: { count: 0, error: null } })
    await applyOrganiserAction({ organisationId: 'a', action: 'suspend' }, session())
    expect(audited.map(a => a.action)).not.toContain('admin.organiser.events_unpublished')
  })

  test('THE SILENCE: a cascade that FAILED used to leave no record, and now leaves one', async () => {
    database({
      organisations: [org('a', { status: 'active' })],
      cascade: { count: null, error: { message: 'deadlock detected' } },
    })
    await applyOrganiserAction({ organisationId: 'a', action: 'suspend' }, session())
    const entry = audited.find(a => a.action === 'admin.organiser.events_unpublish_failed')
    expect(entry?.metadata?.error).toBe('deadlock detected')
  })

  test('a count that did not come back is recorded as unknown, never as zero', async () => {
    database({ organisations: [org('a', { status: 'active' })], cascade: { count: null, error: null } })
    await applyOrganiserAction({ organisationId: 'a', action: 'suspend' }, session())
    expect(audited.map(a => a.action)).toContain('admin.organiser.events_unpublish_count_unknown')
  })
})

function session() {
  return {
    userId: 'admin-1',
    email: 'admin@example.test',
    admin: { role: 'super_admin' },
  } as unknown as Parameters<typeof applyOrganiserAction>[1]
}
