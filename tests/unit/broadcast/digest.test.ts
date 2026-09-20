// Weekly digest core proof.
//
// The invariants under test:
//   1. Consent gating: only recorded express consent makes anyone a
//      recipient, across BOTH consent sources (the platform consent table and
//      the bridged city waitlist), and a withdrawal excludes an address from
//      both (the mechanical guarantee behind "unsubscribe stops the next
//      send").
//   2. Content hygiene: private and seed events never reach a digest.
//   3. The email carries the Spam Act essentials: sender identification and
//      the recipient's own unsubscribe link, in both HTML and text parts.
//   4. The period is exactly the seven days from the send date.

import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed when a client is injected')
  },
}))

import {
  buildDigestEmailHtml,
  digestDateLabel,
  digestVenueLabel,
  fetchDigestCities,
  fetchDigestEvents,
  fetchDigestRecipients,
  resolveDigestPeriod,
} from '@/lib/broadcast/digest'
import { CONSENT_VERSION } from '@/lib/waitlist/city-waitlist'

type Row = Record<string, unknown>
type Filters = Record<string, unknown>
type Call = { table: string; filters: Filters }

/**
 * A stub client that dispatches per table AND per call, because the recipient
 * resolution issues three distinct queries: granted consents for the city, live
 * waitlist rows for the city, and the withdrawal suppression lookup. Every
 * filter applied is recorded, so the consent gate is provable rather than
 * assumed.
 *
 * IT SERVES RANGES, AND IT SERVES THEM WITH A CEILING OF ITS OWN. Every
 * audience read now pages through `readEveryRow`, and a fake that ignored
 * `.range()` and handed back the whole set on every page would prove nothing
 * except that the loop terminates. `serverCeiling` is the number of rows this
 * fake will return in one response REGARDLESS of the window asked for, which is
 * exactly what a Supabase project does and exactly the shape that breaks a
 * pager written to stop on a short page (see the header of
 * src/lib/supabase/read-every-row.ts). It defaults BELOW any page size the
 * tests use, so a pager that stopped early would fail here rather than in
 * production.
 */
function stubClient(
  resolve: (table: string, filters: Filters) => Row[],
  calls: Call[] = [],
  options: { serverCeiling?: number; failOn?: (table: string, filters: Filters) => string | null } = {},
) {
  const serverCeiling = options.serverCeiling ?? 3
  return {
    from: (table: string) => {
      const filters: Filters = {}
      calls.push({ table, filters })
      const builder: Record<string, unknown> = {}
      const chain = (name: string) =>
        ((...args: unknown[]) => {
          filters[`${name}:${String(args[0])}`] = args.length > 1 ? args[1] : true
          return builder
        }) as unknown
      for (const method of ['select', 'eq', 'gte', 'lte', 'not', 'order', 'is', 'in']) {
        builder[method] = chain(method)
      }
      let window: { from: number; to: number } | null = null
      builder.range = ((from: number, to: number) => {
        window = { from, to }
        filters['range'] = `${from}-${to}`
        return builder
      }) as unknown
      builder.limit = (() => builder) as unknown
      builder.then = ((r: (v: { data: Row[] | null; error: { message: string } | null }) => void) => {
        const failure = options.failOn?.(table, filters) ?? null
        if (failure) return r({ data: null, error: { message: failure } })
        const all = resolve(table, filters)
        /*
         * THE CEILING APPLIES TO A READ WITH NO WINDOW TOO, and that is the
         * whole point of this fake. A stub that handed the complete set back to
         * an UNBOUNDED read would let every test below pass against the exact
         * code they exist to stop: the truncation is what the server does, not
         * what the caller asks for.
         */
        const asked = window ? all.slice(window.from, window.to + 1) : all
        return r({ data: asked.slice(0, serverCeiling), error: null })
      }) as unknown
      return builder
    },
  } as never
}

describe('digest period', () => {
  test('covers exactly the seven days from the send date', () => {
    const period = resolveDigestPeriod(new Date('2026-07-04T22:00:00Z'))
    expect(period.start).toBe('2026-07-04')
    expect(period.end).toBe('2026-07-11')
  })
})

describe('consent gating', () => {
  test('recipients query filters to granted rows for the city', async () => {
    const calls: Call[] = []
    const client = stubClient((table, filters) => {
      if (table === 'marketing_consents' && filters['eq:status'] === 'granted') {
        return [{ email: 'a@example.com', unsubscribe_token: 'tok-a', status: 'granted' }]
      }
      return []
    }, calls)

    const recipients = await fetchDigestRecipients(client, 'geelong')
    expect(recipients).toEqual([
      { email: 'a@example.com', unsubscribeToken: 'tok-a', source: 'consent' },
    ])

    const granted = calls.find(
      (c) => c.table === 'marketing_consents' && c.filters['eq:status'] === 'granted',
    )
    expect(granted?.filters['eq:city_slug']).toBe('geelong')
  })

  test('the bridge: a waitlist signup for the city is a recipient, with its own token', async () => {
    const calls: Call[] = []
    const client = stubClient((table) => {
      if (table === 'city_waitlist_signups') {
        return [
          {
            email: 'promoter@example.com',
            unsubscribe_token: 'wl-tok',
            consent_version: CONSENT_VERSION,
            unsubscribed_at: null,
          },
        ]
      }
      return []
    }, calls)

    const recipients = await fetchDigestRecipients(client, 'geelong')
    expect(recipients).toEqual([
      { email: 'promoter@example.com', unsubscribeToken: 'wl-tok', source: 'waitlist' },
    ])

    // Scoped to the city, and rows that already left are excluded in SQL.
    const waitlistCall = calls.find((c) => c.table === 'city_waitlist_signups')
    expect(waitlistCall?.filters['eq:city_slug']).toBe('geelong')
    expect(waitlistCall?.filters['is:unsubscribed_at']).toBe(null)
  })

  test('a withdrawn address is suppressed even though a live waitlist row exists', async () => {
    const client = stubClient((table, filters) => {
      if (table === 'city_waitlist_signups') {
        return [
          {
            email: 'gone@example.com',
            unsubscribe_token: 'wl-tok',
            consent_version: CONSENT_VERSION,
            unsubscribed_at: null,
          },
        ]
      }
      if (table === 'marketing_consents' && filters['eq:status'] === 'withdrawn') {
        return [{ email: 'gone@example.com' }]
      }
      return []
    })

    expect(await fetchDigestRecipients(client, 'geelong')).toEqual([])
  })

  test('a waitlist signup on older wording is never emailed', async () => {
    const client = stubClient((table) => {
      if (table === 'city_waitlist_signups') {
        return [
          {
            email: 'older@example.com',
            unsubscribe_token: 'wl-old',
            consent_version: 'v1',
            unsubscribed_at: null,
          },
        ]
      }
      return []
    })

    expect(await fetchDigestRecipients(client, 'geelong')).toEqual([])
  })

  test('the city list includes a city whose only audience is the waitlist', async () => {
    const client = stubClient((table) => {
      if (table === 'city_waitlist_signups') {
        return [
          { city_slug: 'geelong', consent_version: CONSENT_VERSION },
          { city_slug: 'perth', consent_version: 'v1' },
        ]
      }
      if (table === 'marketing_consents') return [{ city_slug: 'sydney' }]
      return []
    })

    expect(await fetchDigestCities(client)).toEqual(['geelong', 'sydney'])
  })
})

// Both of these were found by reading a real digest, not by a failing test.
// They are pinned here so they cannot come back.
describe('what the line actually says', () => {
  test('the date carries the time, because a reader has to know when to turn up', () => {
    expect(digestDateLabel('2026-08-12T08:00:00+00:00', 'Australia/Melbourne')).toBe(
      'Wed 12 Aug, 6pm',
    )
  })

  test('minutes are shown when there are any, and dropped on the hour', () => {
    expect(digestDateLabel('2026-08-12T09:30:00+00:00', 'Australia/Melbourne')).toBe(
      'Wed 12 Aug, 7:30pm',
    )
  })

  test('the event timezone decides the label, not the server', () => {
    expect(digestDateLabel('2026-08-12T08:00:00+00:00', 'Australia/Perth')).toBe(
      'Wed 12 Aug, 4pm',
    )
  })

  test('the venue does not tell a Geelong reader the event is in Geelong', () => {
    expect(digestVenueLabel(null, 'Geelong', 'Geelong')).toBe('')
    expect(digestVenueLabel('Waterfront Pavilion', 'Geelong', 'Geelong')).toBe(
      'Waterfront Pavilion',
    )
  })

  test('a locality outside the digest city is worth saying, so it is said', () => {
    expect(digestVenueLabel('The Barwon', 'Torquay', 'Geelong')).toBe('The Barwon, Torquay')
  })

  test('with nothing to add the label is empty rather than noise', () => {
    expect(digestVenueLabel(null, null, 'Geelong')).toBe('')
    expect(digestVenueLabel('  ', '  ', 'Geelong')).toBe('')
  })
})

describe('content hygiene', () => {
  test('private and seed events are filtered out', async () => {
    const base = {
      slug: 's',
      title: 'T',
      start_date: '2026-07-05T09:00:00Z',
      timezone: 'Australia/Melbourne',
      venue_name: 'V',
      venue_city: 'Geelong',
      ticket_tiers: [{ price: 0, currency: 'AUD' }],
    }
    const client = stubClient(() => [
      { ...base, slug: 'public-real', visibility: 'public', is_seed_data: false },
      { ...base, slug: 'private-one', visibility: 'private', is_seed_data: false },
      { ...base, slug: 'seed-one', visibility: 'public', is_seed_data: true },
    ])
    const events = await fetchDigestEvents(client, 'geelong', {
      start: '2026-07-04',
      end: '2026-07-11',
    })
    expect(events.map((e) => e.slug)).toEqual(['public-real'])
  })

  test('when a tracked link cannot be minted the event still carries a working link', async () => {
    // This stub cannot satisfy getOrCreateShareLink (no maybeSingle), which is
    // exactly the shape of the failure this guards: the digest must still
    // send, with the plain event page, rather than break or link to nothing.
    const client = stubClient(() => [
      {
        id: 'evt-1',
        slug: 'harbour-jazz',
        title: 'Harbour Jazz Night',
        start_date: '2026-07-05T09:00:00Z',
        timezone: 'Australia/Melbourne',
        venue_name: 'The Wharf',
        venue_city: 'Geelong',
        visibility: 'public',
        is_seed_data: false,
        ticket_tiers: [{ price: 0, currency: 'AUD' }],
      },
    ])

    const events = await fetchDigestEvents(
      client,
      'geelong',
      { start: '2026-07-04', end: '2026-07-11' },
      10,
      'https://staging.eventlinqs.com',
    )
    expect(events[0].url).toBe('https://staging.eventlinqs.com/events/harbour-jazz')
  })
})

describe('the digest email', () => {
  const built = buildDigestEmailHtml({
    cityName: 'Geelong',
    events: [
      {
        id: 'evt-1',
        slug: 'harbour-jazz',
        title: 'Harbour Jazz Night',
        dateLabel: 'Sat 11 Jul',
        venueLabel: 'The Wharf, Geelong',
        priceLabel: 'From $25',
        url: 'https://staging.eventlinqs.com/s/AbCd1234Ef',
      },
    ],
    origin: 'https://staging.eventlinqs.com',
    unsubscribeUrl: 'https://staging.eventlinqs.com/unsubscribe/digest/tok-123',
  })

  test('subject names the city and the count', () => {
    expect(built.subject).toBe('This week in Geelong: 1 event worth a look')
  })

  test('html carries the tracked event link, sender identity, and unsubscribe link', () => {
    expect(built.html).toContain('/s/AbCd1234Ef')
    expect(built.html).toContain('EventLinqs, hello@eventlinqs.com')
    expect(built.html).toContain('/unsubscribe/digest/tok-123')
    expect(built.html).toContain('This week in Geelong')
  })

  test('text part carries the same tracked link, the unsubscribe link and the sender', () => {
    expect(built.text).toContain('/s/AbCd1234Ef')
    expect(built.text).toContain('/unsubscribe/digest/tok-123')
    expect(built.text).toContain('EventLinqs, hello@eventlinqs.com')
  })

  test('an unnamed venue leaves no dangling separator in the text part', () => {
    const noVenue = buildDigestEmailHtml({
      cityName: 'Geelong',
      events: [
        {
          id: 'evt-3',
          slug: 'no-venue',
          title: 'No Venue Night',
          dateLabel: 'Wed 12 Aug, 6pm',
          venueLabel: '',
          priceLabel: 'Free entry',
          url: 'https://staging.eventlinqs.com/events/no-venue',
        },
      ],
      origin: 'https://staging.eventlinqs.com',
      unsubscribeUrl: 'https://staging.eventlinqs.com/unsubscribe/digest/tok-8',
    })
    expect(noVenue.text).toContain('Wed 12 Aug, 6pm: No Venue Night - Free entry')
    expect(noVenue.text).not.toContain('-  -')
    expect(noVenue.html).not.toContain('&middot;')
  })

  test('an event that could not be tracked still links to a working page', () => {
    const untracked = buildDigestEmailHtml({
      cityName: 'Geelong',
      events: [
        {
          id: 'evt-2',
          slug: 'fallback-night',
          title: 'Fallback Night',
          dateLabel: 'Sun 12 Jul',
          venueLabel: 'The Wharf, Geelong',
          priceLabel: 'Free entry',
          url: 'https://staging.eventlinqs.com/events/fallback-night',
        },
      ],
      origin: 'https://staging.eventlinqs.com',
      unsubscribeUrl: 'https://staging.eventlinqs.com/unsubscribe/digest/tok-9',
    })
    expect(untracked.html).toContain('/events/fallback-night')
    expect(untracked.text).toContain('/events/fallback-night')
  })

  test('titles are html-escaped', () => {
    const evil = buildDigestEmailHtml({
      cityName: 'Geelong',
      events: [
        {
          id: 'evt-x',
          slug: 'x',
          title: '<script>alert(1)</script>',
          dateLabel: 'Sat',
          venueLabel: '',
          priceLabel: 'Free entry',
          url: 'https://staging.eventlinqs.com/events/x',
        },
      ],
      origin: 'https://staging.eventlinqs.com',
      unsubscribeUrl: 'https://staging.eventlinqs.com/unsubscribe/digest/t',
    })
    expect(evil.html).not.toContain('<script>alert(1)</script>')
    expect(evil.html).toContain('&lt;script&gt;')
  })
})

/**
 * THE CEILINGS THIS SEND PATH CARRIED UNTIL 20 SEPTEMBER 2026.
 *
 * Every read below was unbounded, and a Supabase project stops at 1,000 rows in
 * silence: HTTP 200, `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * The stub above serves ranges with a ceiling of its own, so a read that stopped
 * early fails here rather than in somebody's inbox.
 */
describe('nobody is dropped from the weekly email', () => {
  const consentRows = (n: number, prefix = 'person') =>
    Array.from({ length: n }, (_, i) => ({
      email: `${prefix}-${i}@example.com`,
      unsubscribe_token: `tok-${prefix}-${i}`,
      status: 'granted',
    }))

  test('a city with more consenting people than one response can carry is written to in full', async () => {
    const all = consentRows(2500)
    const client = stubClient(
      (table) => (table === 'marketing_consents' ? all : []),
      [],
      // The documented default. A pager that trusted the page size it asked for
      // would stop after one window and report 1,000 of 2,500 as everybody.
      { serverCeiling: 1000 },
    )

    const recipients = await fetchDigestRecipients(client, 'geelong')
    expect(recipients).toHaveLength(2500)
    expect(recipients[0].email).toBe('person-0@example.com')
    expect(recipients[2499].email).toBe('person-2499@example.com')
  })

  test('the audience is ordered oldest first and broken on the primary key, because it is also the resume order', async () => {
    const calls: Call[] = []
    stubClient((table) => (table === 'marketing_consents' ? consentRows(1) : []), calls)
    await fetchDigestRecipients(
      stubClient((table) => (table === 'marketing_consents' ? consentRows(1) : []), calls),
      'geelong',
    )
    const granted = calls.find(
      (c) => c.table === 'marketing_consents' && c.filters['eq:status'] === 'granted',
    )
    // `granted_at` alone is not unique, so a tie across a page boundary could
    // put one person in two windows and another in none. The cron resumes an
    // unfinished period at a COUNT into this list, so that is a second copy of
    // a marketing email and somebody who never hears from us.
    expect(granted?.filters['order:granted_at']).toBeTruthy()
    expect(granted?.filters['order:id']).toBeTruthy()
  })

  test('the city list survives a consent table larger than one response', async () => {
    const spread = Array.from({ length: 2400 }, (_, i) => ({
      city_slug: i === 2399 ? 'broken-hill' : 'geelong',
    }))
    const client = stubClient(
      (table) => (table === 'marketing_consents' ? spread : []),
      [],
      { serverCeiling: 1000 },
    )
    // Before this pass the platform-wide read stopped at the ceiling, so a city
    // whose only members sorted late was never considered for a send at all and
    // nobody in it ever received a digest.
    expect(await fetchDigestCities(client)).toEqual(['broken-hill', 'geelong'])
  })
})

/**
 * THE SUPPRESSION READ, which did not come back SHORT. It came back EMPTY.
 *
 * It was one un-chunked `.in('email', waitlistEmails)` over a city's whole
 * waitlist, and an `in` list is bounded by bytes rather than by count: Supabase
 * bounds URL and headers together at 16 KB and names lengthy `in` clauses as the
 * usual cause
 * (https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2,
 * fetched 2026-09-19), measured on this project's TEST instance between 15,038
 * and 16,083 joined bytes. So the request failed, the discarded error left the
 * list empty, and rule 1 of the merge, "SUPPRESSION WINS", was switched off.
 */
describe('a person who unsubscribed stays unsubscribed', () => {
  const waitlistRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      email: `waiter-${i}@example.com`,
      unsubscribe_token: `wl-${i}`,
      consent_version: CONSENT_VERSION,
      unsubscribed_at: null,
    }))

  test('a withdrawal past the first chunk of addresses still suppresses', async () => {
    const waitlist = waitlistRows(400)
    const withdrawnAddress = 'waiter-399@example.com'
    const calls: Call[] = []
    const client = stubClient((table, filters) => {
      if (table === 'city_waitlist_signups') return waitlist
      if (table === 'marketing_consents' && filters['eq:status'] === 'withdrawn') {
        const asked = (filters['in:email'] ?? []) as string[]
        return asked.includes(withdrawnAddress) ? [{ email: withdrawnAddress }] : []
      }
      return []
    }, calls)

    const recipients = await fetchDigestRecipients(client, 'geelong')
    expect(recipients.map((r) => r.email)).not.toContain(withdrawnAddress)
    expect(recipients).toHaveLength(399)

    // More than one request, because four hundred addresses do not fit in one
    // URL. A single request here is the defect, not an optimisation.
    const suppressionCalls = calls.filter(
      (c) => c.table === 'marketing_consents' && c.filters['eq:status'] === 'withdrawn',
    )
    expect(suppressionCalls.length).toBeGreaterThan(1)
  })

  test('a suppression read that FAILS raises, rather than handing back an unsuppressed audience', async () => {
    const client = stubClient(
      (table) => (table === 'city_waitlist_signups' ? waitlistRows(10) : []),
      [],
      {
        failOn: (table, filters) =>
          table === 'marketing_consents' && filters['eq:status'] === 'withdrawn'
            ? 'TypeError: fetch failed'
            : null,
      },
    )
    // The old code answered with ten recipients and no suppression at all. The
    // caller skips the city instead: one week of one city's marketing email is
    // the cheaper failure than writing to somebody who asked us to stop.
    await expect(fetchDigestRecipients(client, 'geelong')).rejects.toThrow(/suppression/i)
  })

  test('an audience read that FAILS raises, so a partial city is never sent to', async () => {
    const client = stubClient(() => [], [], {
      failOn: (table, filters) =>
        table === 'marketing_consents' && filters['eq:status'] === 'granted'
          ? 'upstream connect error'
          : null,
    })
    await expect(fetchDigestRecipients(client, 'geelong')).rejects.toThrow(/could not be read in full/)
  })
})
