import { describe, expect, test, vi, beforeEach } from 'vitest'

/**
 * THE FOUNDER'S DEMAND SIGNAL READS EVERY ROW, OR IT SAYS IT COULD NOT.
 *
 * ---------------------------------------------------------------------------
 * The page these numbers are rendered on says, in its own header, that all
 * figures are live counts. Until 20 September 2026 the module behind it could
 * not keep that promise in either direction.
 *
 * THE CEILING. `city_waitlist_signups` was read with no bound and no order.
 * Supabase caps one response at a fixed number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * Measured against the TEST project on 20 September 2026, twice:
 *
 *     Prefer: count=exact    HTTP 206   Content-Range: 0-999/14381
 *     no count requested     HTTP 200   Content-Range: 0-999/*
 *
 * An ordinary read is the second line, and it is why nothing notices: the
 * server withholds the total, answers 200 with `error` null and a thousand-long
 * array, and no property of that response says anything was left out.
 *
 * With no `order by`, past that ceiling each city's demand would have been an
 * ARBITRARY subset that moved between page loads, on the one screen whose whole
 * purpose is to say which city has tipped.
 *
 * THE SILENCE. Every read fell back to a zero: `rows ?? []` for the waitlist,
 * `count ?? 0` for the four Launch Kit figures and the four founding figures. A
 * database that could not be reached rendered as a platform nobody is using,
 * and the worst of them was derived by subtraction: `CAP - (taken ?? 0)` showed
 * all fifty founding spots free.
 *
 * TEST HOLDS 9 WAITLIST ROWS, so no drive against it can tell the fixed tree
 * from the broken one. That is why the ceiling is proven here, against a faked
 * server cap, rather than claimed from a screenshot.
 */

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/admin/audit', () => ({ recordAnonAuditEvent: vi.fn() }))
vi.mock('@/lib/flags/broadcast', () => ({ isFeatureEnabled: async () => true }))

const { getDemandSignal } = await import('@/lib/admin/demand-signal')
const { getFoundingCounts } = await import('@/lib/founding/invites')
const { getWaitlistCities } = await import('@/lib/waitlist/city-waitlist')

type Row = Record<string, unknown>

const CITIES = getWaitlistCities()
const FIRST_CITY = CITIES[0].slug
const SECOND_CITY = CITIES[1].slug

/**
 * A database that answers a window and never volunteers that there is more,
 * exactly as PostgREST does. `pageCeiling` is the server's own cap, which the
 * caller cannot see and cannot change.
 *
 * `counts` are the head-only `{ count: 'exact', head: true }` reads, keyed by
 * table. `failOn` makes one table unreachable, for both shapes of read.
 */
function database({
  waitlist = [] as Row[],
  counts = {} as Record<string, number>,
  pageCeiling = 1000,
  failOn = null as null | string,
  nullCountFor = null as null | string,
}) {
  const ordered = new Set<string>()
  const pagesServed: number[] = []

  from.mockImplementation((table: string) => ({
    select: (_columns: string, options?: { head?: boolean; count?: string }) => {
      if (options?.head) {
        const answer =
          failOn === table
            ? { count: null, error: { message: `${table} went away` } }
            : { count: nullCountFor === table ? null : (counts[table] ?? 0), error: null }
        // Every filter on a head read returns a thenable carrying the count.
        const headChain: Record<string, unknown> = {
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(answer).then(resolve),
        }
        headChain.eq = () => headChain
        headChain.not = () => headChain
        headChain.is = () => headChain
        return headChain
      }

      // `.order()` is chainable, because a total order is often two keys.
      const afterOrder = () => {
        ordered.add(table)
        return {
          order: afterOrder,
          range: async (start: number, end: number) => {
            if (failOn === table) return { data: null, error: { message: `${table} went away` } }
            const window = waitlist.slice(start, Math.min(end + 1, start + pageCeiling))
            pagesServed.push(window.length)
            return { data: window, error: null }
          },
        }
      }
      const chain: Record<string, unknown> = { order: afterOrder }
      chain.eq = () => chain
      chain.in = () => chain
      chain.is = () => chain
      chain.not = () => chain
      return chain
    },
  }))

  return { ordered, pagesServed }
}

/** Every count the two functions ask for, so a test can vary one at a time. */
function allCounts(overrides: Record<string, number> = {}): Record<string, number> {
  return { events: 0, kit_poster_downloads: 0, share_link_events: 0, organisations: 0, founding_invites: 0, ...overrides }
}

function signup(city: string, role: string, daysAgo = 0, unsubscribed = false): Row {
  return {
    city_slug: city,
    role,
    created_at: new Date(Date.now() - daysAgo * 86400_000).toISOString(),
    unsubscribed_at: unsubscribed ? new Date().toISOString() : null,
  }
}

beforeEach(() => {
  from.mockReset()
})

describe('getDemandSignal: every waitlist row, or an honest failure', () => {
  test('a waitlist inside one page buckets as it always did', async () => {
    database({
      waitlist: [
        signup(FIRST_CITY, 'organiser'),
        signup(FIRST_CITY, 'attendee'),
        signup(SECOND_CITY, 'organiser'),
      ],
      counts: allCounts(),
    })
    const signal = await getDemandSignal()
    const first = signal.cities.find(c => c.slug === FIRST_CITY)
    expect(first).toMatchObject({ total: 2, organisers: 1, attendees: 1 })
    expect(signal.cities.find(c => c.slug === SECOND_CITY)).toMatchObject({ total: 1, organisers: 1 })
  })

  test('THE DEFECT: 2,500 waitlist rows past a 1,000-row ceiling are all counted', async () => {
    const waitlist = Array.from({ length: 2500 }, () => signup(FIRST_CITY, 'organiser'))
    const { pagesServed } = database({ waitlist, counts: allCounts(), pageCeiling: 1000 })

    const signal = await getDemandSignal()

    expect(signal.cities.find(c => c.slug === FIRST_CITY)?.total).toBe(2500)
    // Three full windows, one short, one empty: the loop stops on an empty page
    // rather than on a short one, so a ceiling lower than the page size cannot
    // end it early.
    expect(pagesServed).toEqual([1000, 1000, 500, 0])
  })

  test('a ceiling LOWER than the page size is still read in full', async () => {
    const waitlist = Array.from({ length: 1200 }, () => signup(FIRST_CITY, 'attendee'))
    database({ waitlist, counts: allCounts(), pageCeiling: 250 })
    const signal = await getDemandSignal()
    expect(signal.cities.find(c => c.slug === FIRST_CITY)?.attendees).toBe(1200)
  })

  test('the paged read carries a stable order, because paging without one is not paging', async () => {
    const { ordered } = database({ waitlist: [signup(FIRST_CITY, 'organiser')], counts: allCounts() })
    await getDemandSignal()
    expect(ordered.has('city_waitlist_signups')).toBe(true)
  })

  test('a waitlist read that FAILS raises rather than reporting no demand anywhere', async () => {
    database({ counts: allCounts(), failOn: 'city_waitlist_signups' })
    await expect(getDemandSignal()).rejects.toThrow(/per-city waitlist demand could not be read/)
  })

  test('a Launch Kit count that FAILS raises rather than rendering zero', async () => {
    database({ waitlist: [signup(FIRST_CITY, 'organiser')], counts: allCounts(), failOn: 'kit_poster_downloads' })
    await expect(getDemandSignal()).rejects.toThrow(/posters downloaded could not be read/)
  })

  test('a count that comes back null with no error is reported as the caller mistake it is', async () => {
    database({ waitlist: [], counts: allCounts(), nullCountFor: 'events' })
    await expect(getDemandSignal()).rejects.toThrow(/came back null with no error/)
  })

  test('unsubscribed rows are excluded, and the 7 and 30 day windows still count', async () => {
    database({
      waitlist: [
        signup(FIRST_CITY, 'organiser', 1),
        signup(FIRST_CITY, 'organiser', 14),
        signup(FIRST_CITY, 'organiser', 90),
        signup(FIRST_CITY, 'organiser', 1, true),
      ],
      counts: allCounts(),
    })
    const first = (await getDemandSignal()).cities.find(c => c.slug === FIRST_CITY)
    expect(first).toMatchObject({ total: 3, last7: 1, last30: 2 })
  })

  test('the Launch Kit figures are the counts the database gave, zero included', async () => {
    database({
      waitlist: [],
      counts: allCounts({ events: 285, kit_poster_downloads: 39, share_link_events: 41 }),
    })
    const signal = await getDemandSignal()
    expect(signal.kit).toEqual({
      eventsPublished: 285,
      postersDownloaded: 39,
      linkClicks: 41,
      linkConversions: 41,
    })
  })
})

describe('getFoundingCounts: the number the founder acts on', () => {
  // Three figures since LAW 24 (26 September 2026): spotsRemaining was fifty
  // minus spotsTaken, and there is no fifty any more.
  test('the three figures are the counts the database gave', async () => {
    database({ counts: allCounts({ organisations: 5, founding_invites: 12 }) })
    const counts = await getFoundingCounts()
    expect(counts).toEqual({
      spotsTaken: 5,
      invitesIssued: 12,
      invitesAccepted: 12,
    })
  })

  test('THE WORST ONE: a failed count no longer reports every founding spot as free', async () => {
    database({ counts: allCounts(), failOn: 'organisations' })
    await expect(getFoundingCounts()).rejects.toThrow(/organisations that joined through a founding invite could not be read/)
  })

  test('a failed invites count raises rather than reporting no invites ever issued', async () => {
    database({ counts: allCounts({ organisations: 5 }), failOn: 'founding_invites' })
    await expect(getFoundingCounts()).rejects.toThrow(/founding invites (issued|accepted) could not be read/)
  })
})
