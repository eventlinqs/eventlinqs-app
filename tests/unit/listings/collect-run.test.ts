import { describe, expect, it } from 'vitest'
import { runCollection, type CandidateRow, type CollectionStore, type Fetcher, type RunRow } from '@/lib/listings/collect-run'
import type { KnownEvent, RegisteredSource } from '@/lib/listings/collect'

/* Item 19's run: robots.txt before the page, only due sources whose terms allow it, a second source a link. */

const NOW = new Date('2026-10-27T03:00:00Z')

function memoryStore(
  sources: RegisteredSource[],
  known: KnownEvent[] = [],
  held: Record<string, string[]> = {},
  venues: Record<string, Record<string, string>> = {},
) {
  const landed: CandidateRow[] = []
  const recorded: Record<string, string> = {}
  const added: { eventId: string; urls: string[] }[] = []
  const runs: RunRow[] = []
  const published: string[] = []
  const store: CollectionStore = {
    sources: async () => sources,
    known: async () => known,
    venueAddresses: async (citySlug) => new Map(Object.entries(venues[citySlug] ?? {})),
    heldLinks: async (id) => new Set(held[id] ?? []),
    land: async (row) => {
      if (landed.some((r) => r.sourceId === row.sourceId && r.pageUrl === row.pageUrl && r.startsAt === row.startsAt)) return false
      landed.push(row)
      return true
    },
    record: async (id, outcome) => {
      recorded[id] = outcome
    },
    addLinks: async (eventId, links) => {
      added.push({ eventId, urls: links.map((l) => l.url) })
    },
    logRun: async (row) => {
      runs.push(row)
    },
    publishPartnerNight: async (row) => {
      published.push(row.pageUrl)
    },
    expirePassed: async () => 0,
  }
  return { store, landed, recorded, added, runs, published }
}

function sites(pages: Record<string, { status: number; body?: string } | 'down'>): { fetcher: Fetcher; asked: string[] } {
  const asked: string[] = []
  const fetcher: Fetcher = async (url) => {
    asked.push(url)
    const p = pages[url]
    if (p === undefined || p === 'down') throw new Error('unreachable')
    return { status: p.status, text: async () => p.body ?? '' }
  }
  return { fetcher, asked }
}

const source = (id: string, pageUrl: string, over: Partial<RegisteredSource> = {}): RegisteredSource => ({
  id, name: id, pageUrl, collection: 'read', changes: 'weekly', lastCheckedAt: null, lastSuccessAt: null, permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, ...over,
})

const gig = (name: string, ticket: string) =>
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'MusicEvent',
    name,
    startDate: '2026-11-14T20:00:00+11:00',
    location: { name: 'The Barwon Club', address: '509 Moorabool St, Geelong' },
    offers: { url: ticket, availability: 'InStock' },
  })}</script>`

describe('the weekly collection run', () => {
  it('reads robots.txt first, then the page, and lands what it finds for review', async () => {
    const { store, landed, recorded } = memoryStore([source('club', 'https://club.example.com.au/gigs')])
    const { fetcher, asked } = sites({
      'https://club.example.com.au/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /admin' },
      'https://club.example.com.au/gigs': { status: 200, body: gig('Bp Proof Trio', 'https://events.humanitix.com/bp-trio') },
    })
    const r = await runCollection(store, fetcher, NOW)
    expect(asked).toEqual(['https://club.example.com.au/robots.txt', 'https://club.example.com.au/gigs'])
    expect(r).toMatchObject({ read: 1, skipped: 0, landed: 1 })
    expect(landed[0]).toMatchObject({ kind: 'new', title: 'Bp Proof Trio', eventId: null })
    expect(recorded.club).toBe('read: 1 event(s) found, 1 new for review')
  })

  it('a robots.txt disallow, or one it cannot reach, reads nothing of the page', async () => {
    const { store, landed, recorded } = memoryStore([
      source('closed', 'https://closed.example.com/events'),
      source('down', 'https://down.example.com/events'),
    ])
    const { fetcher, asked } = sites({
      'https://closed.example.com/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /' },
      'https://down.example.com/robots.txt': { status: 503 },
    })
    const r = await runCollection(store, fetcher, NOW)
    expect(asked).toEqual(['https://closed.example.com/robots.txt', 'https://down.example.com/robots.txt'])
    expect(r).toMatchObject({ read: 0, skipped: 2, landed: 0 })
    expect(landed).toEqual([])
    expect(recorded).toEqual({ closed: 'robots.txt disallows this page: nothing read', down: 'robots.txt unreachable: nothing read' })
  })

  it('never fetches a source whose terms do not allow it, or one not yet due', async () => {
    const { store } = memoryStore([
      source('ask', 'https://ask.example.com/e', { collection: 'ask' }),
      /* A check that SUCCEEDED (last_success_at with it); a failed one is read again daily (failed-source-retried.test.ts). */
      /* Read after this morning's 04:00 Melbourne run (every source once a day: Lawal, 1 November 2026, 16:15). */
      source('fresh', 'https://fresh.example.com/e', { lastCheckedAt: '2026-10-26T20:00:00Z', lastSuccessAt: '2026-10-26T20:00:00Z' }),
    ])
    const { fetcher, asked } = sites({})
    const r = await runCollection(store, fetcher, NOW)
    expect(asked).toEqual([])
    expect(r.sources).toEqual([])
  })

  it('an event already listed gains only links it does not carry; with none new, nothing lands', async () => {
    const known: KnownEvent[] = [
      { eventId: 'ev-1', venueId: null, venueName: 'The Barwon Club', venueAddress: null, title: 'Bp Proof Trio', startsAt: '2026-11-14T09:00:00.000Z' },
    ]
    const page = { status: 200, body: gig('Bp Proof Trio', 'https://www.eventbrite.com.au/e/bp-trio') }
    const robots = { status: 404 }
    const a = memoryStore([source('club', 'https://club.example.com.au/gigs')], known)
    await runCollection(a.store, sites({ 'https://club.example.com.au/robots.txt': robots, 'https://club.example.com.au/gigs': page }).fetcher, NOW)
    expect(a.landed).toHaveLength(1)
    expect(a.landed[0]).toMatchObject({ kind: 'adds_links', eventId: 'ev-1' })

    const b = memoryStore([source('club', 'https://club.example.com.au/gigs')], known, { 'ev-1': ['https://www.eventbrite.com.au/e/bp-trio'] })
    const r = await runCollection(b.store, sites({ 'https://club.example.com.au/robots.txt': robots, 'https://club.example.com.au/gigs': page }).fetcher, NOW)
    expect(b.landed).toEqual([])
    expect(r.landed).toBe(0)
  })

  it('one source failing never stops the next', async () => {
    const { store, landed } = memoryStore([source('broken', 'https://broken.example.com/e'), source('club', 'https://club.example.com.au/gigs')])
    const { fetcher } = sites({
      'https://broken.example.com/robots.txt': { status: 404 },
      'https://broken.example.com/e': 'down',
      'https://club.example.com.au/robots.txt': { status: 404 },
      'https://club.example.com.au/gigs': { status: 200, body: gig('Bp Proof Trio', 'https://events.humanitix.com/bp-trio') },
    })
    const r = await runCollection(store, fetcher, NOW)
    expect(r.sources.map((s) => s.outcome)).toEqual(['the page answered nothing: nothing read', 'read: 1 event(s) found, 1 new for review'])
    expect(landed).toHaveLength(1)
  })

  it('starts no source after its deadline, and says how many were not reached', async () => {
    const { store } = memoryStore([source('a', 'https://a.example.com/e'), source('b', 'https://b.example.com/e')])
    const r = await runCollection(store, sites({}).fetcher, NOW, Date.now() - 1)
    expect(r.notReached).toBe(2)
    expect(r.sources).toEqual([])
  })
})

/* The engine plan's parts A and E (28 October 2026): a run log per source, and the partner rule. */
/*
 * Production, 1 November 2026: Geelong Regional Libraries' calendar names the branch ('Corio Library') with no street,
 * so 404 nights waited with 'no_venue_address' although the branch is a known place with a published address. The
 * run takes a KNOWN venue's address, of the source's own city only, and never invents one.
 */
describe("a feed that names a known venue of its own city", () => {
  const library = (location: string) =>
    ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:17245503', 'DTSTART:20261103T230000Z', 'DTEND:20261104T000000Z',
      'SUMMARY:Toddler time', `LOCATION:${location}`, 'GEO:-38.0896;144.3576', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const feed = 'https://events.example.vic.gov.au/feeds/ical'
  const pages = (body: string) => ({ 'https://events.example.vic.gov.au/robots.txt': { status: 200, body: '' }, [feed]: { status: 200, body } })

  it("lands the night with that venue's address, and it passes the address check", async () => {
    const { store, landed } = memoryStore([source('grl', feed, { citySlug: 'geelong' })], [], {}, {
      geelong: { 'corio library': 'Cox Road (corner Moa Street), Norlane VIC 3214' },
    })
    await runCollection(store, sites(pages(library('Corio Library'))).fetcher, NOW)
    expect(landed[0]).toMatchObject({ venueName: 'Corio Library', venueAddress: 'Cox Road (corner Moa Street), Norlane VIC 3214' })
    expect(landed[0].reasons).not.toContain('no_venue_address')
  })

  it("never takes a venue of another city, and leaves the address empty when the place is unknown", async () => {
    const { store, landed } = memoryStore([source('grl', feed, { citySlug: 'geelong' })], [], {}, {
      bendigo: { 'corio library': '1 Somewhere Street, Bendigo' },
    })
    await runCollection(store, sites(pages(library('Corio Library'))).fetcher, NOW)
    expect(landed[0].venueAddress).toBeNull()
    expect(landed[0].reasons).toContain('no_venue_address')
  })
})

describe('the run log and the partner rule', () => {
  const club = 'https://club.example.com.au/gigs'
  const open = { 'https://club.example.com.au/robots.txt': { status: 404 } }
  const trio = { status: 200, body: gig('Bp Proof Trio', 'https://events.humanitix.com/bp-trio') }
  const barwon = { name: 'The Barwon Club', address: '509 Moorabool St, Geelong' }

  it('logs one run row per source, a failure included, with the answer it got', async () => {
    const { store, runs } = memoryStore([source('broken', 'https://broken.example.com/e'), source('club', club)])
    await runCollection(store, sites({ 'https://broken.example.com/robots.txt': { status: 404 }, 'https://broken.example.com/e': { status: 500 }, ...open, [club]: trio }).fetcher, NOW)
    expect(runs).toEqual([
      { sourceId: 'broken', ranAt: NOW.toISOString(), succeeded: false, httpStatus: 500, outcome: 'the page answered 500: nothing read', found: 0, landed: 0, queued: 0, acceptedByRule: 0 },
      { sourceId: 'club', ranAt: NOW.toISOString(), succeeded: true, httpStatus: 200, outcome: 'read: 1 event(s) found, 1 new for review', found: 1, landed: 1, queued: 1, acceptedByRule: 0 },
    ])
  })

  it("accepts and publishes a high confidence new night at a partner's own venue, from its verified feed", async () => {
    const { store, landed, runs, published } = memoryStore([source('club', club, { partner: true, partnerVenue: barwon })])
    const r = await runCollection(store, sites({ ...open, [club]: trio }).fetcher, NOW)
    expect(landed[0]).toMatchObject({ kind: 'new', confidence: 'high', reasons: [], decidedBy: 'partner_rule' })
    expect(published).toEqual([landed[0].pageUrl])
    expect(r).toMatchObject({ landed: 1, acceptedByRule: 1, queued: 0 })
    expect(runs[0]).toMatchObject({ acceptedByRule: 1, queued: 0, outcome: 'read: 1 event(s) found, 1 new: 1 accepted by the partner rule, 0 for review' })
  })

  it("asks the store to finish a publish on the next run, when the night landed before", async () => {
    const { store, published } = memoryStore([source('club', club, { partner: true, partnerVenue: barwon })])
    await runCollection(store, sites({ ...open, [club]: trio }).fetcher, NOW)
    await runCollection(store, sites({ ...open, [club]: trio }).fetcher, new Date(NOW.getTime() + 24 * 60 * 60 * 1000))
    expect(published).toHaveLength(2)
  })

  it('one night that cannot be published never stops the rest of the feed, and the run says so', async () => {
    const two = {
      status: 200,
      body:
        gig('Bp Proof Trio', 'https://events.humanitix.com/bp-trio') +
        gig('Bp Proof Quartet Second Set', 'https://events.humanitix.com/bp-quartet').replace('2026-11-14T20:00:00+11:00', '2026-11-15T20:00:00+11:00'),
    }
    const m = memoryStore([source('club', club, { partner: true, partnerVenue: barwon })])
    let calls = 0
    m.store.publishPartnerNight = async () => {
      calls += 1
      if (calls === 1) throw new Error('the venue has no city')
    }
    const r = await runCollection(m.store, sites({ ...open, [club]: two }).fetcher, NOW)
    expect(m.landed).toHaveLength(2)
    expect(calls).toBe(2)
    expect(r.sources[0].outcome).toBe('read: 2 event(s) found, 2 new: 2 accepted by the partner rule, 0 for review; 1 accepted night(s) not yet published: the venue has no city')
    expect(m.runs[0]).toMatchObject({ succeeded: true, landed: 2 })
  })

  it("queues a partner's night held at another venue, and a partner with no venue named", async () => {
    const elsewhere = memoryStore([source('club', club, { partner: true, partnerVenue: { name: 'Costa Hall', address: '1 Gheringhap St, Geelong' } })])
    await runCollection(elsewhere.store, sites({ ...open, [club]: trio }).fetcher, NOW)
    expect(elsewhere.landed[0]).toMatchObject({ confidence: 'high', decidedBy: 'person' })
    expect(elsewhere.published).toEqual([])
    const noVenue = memoryStore([source('club', club, { partner: true, partnerVenue: null })])
    await runCollection(noVenue.store, sites({ ...open, [club]: trio }).fetcher, NOW)
    expect(noVenue.landed[0]).toMatchObject({ decidedBy: 'person' })
  })

  it('queues a partner row that is low confidence, and every row from a source that is not a partner or not verified', async () => {
    const noAddress = { status: 200, body: gig('Bp Proof Trio', 'https://events.humanitix.com/bp-trio').replace('"address":"509 Moorabool St, Geelong"', '"address":""') }
    const low = memoryStore([source('club', club, { partner: true, partnerVenue: barwon })])
    await runCollection(low.store, sites({ ...open, [club]: noAddress }).fetcher, NOW)
    expect(low.landed[0]).toMatchObject({ confidence: 'low', reasons: ['no_venue_address'], decidedBy: 'person' })

    const stranger = memoryStore([source('club', club, { partner: false })])
    await runCollection(stranger.store, sites({ ...open, [club]: trio }).fetcher, NOW)
    expect(stranger.landed[0]).toMatchObject({ confidence: 'high', decidedBy: 'person' })

    const unverified = memoryStore([source('club', club, { partner: true, partnerVenue: barwon, verified: false })])
    await runCollection(unverified.store, sites({ ...open, [club]: trio }).fetcher, NOW)
    expect(unverified.landed[0]).toMatchObject({ confidence: 'low', reasons: ['source_unverified'], decidedBy: 'person' })
  })

  it("writes a partner's new link on a listed night before it lands the accepted row", async () => {
    const known: KnownEvent[] = [
      { eventId: 'ev-1', venueId: null, venueName: 'The Barwon Club', venueAddress: '509 Moorabool St, Geelong', title: 'Bp Proof Trio', startsAt: '2026-11-14T09:00:00.000Z' },
    ]
    const { store, landed, added } = memoryStore([source('club', club, { partner: true })], known)
    await runCollection(store, sites({ ...open, [club]: trio }).fetcher, NOW)
    expect(added).toEqual([{ eventId: 'ev-1', urls: ['https://events.humanitix.com/bp-trio'] }])
    expect(landed[0]).toMatchObject({ kind: 'adds_links', eventId: 'ev-1', decidedBy: 'partner_rule' })
  })

  it('never accepts a changed time by rule, even from a partner: it waits for a person, naming the event', async () => {
    const known: KnownEvent[] = [
      { eventId: 'ev-1', venueId: null, venueName: 'The Barwon Club', venueAddress: '509 Moorabool St, Geelong', title: 'Bp Proof Trio', startsAt: '2026-11-14T05:00:00.000Z' },
    ]
    const { store, landed, added } = memoryStore([source('club', club, { partner: true })], known)
    await runCollection(store, sites({ ...open, [club]: trio }).fetcher, NOW)
    expect(added).toEqual([])
    expect(landed[0]).toMatchObject({ kind: 'changes_facts', eventId: 'ev-1', change: 'time_changed', confidence: 'low', reasons: ['time_changed'], decidedBy: 'person' })
  })
})

describe('passed nights leave the queue on their own', () => {
  it('asks the store once per run, counts what left, and a failure there never stops the read', async () => {
    const m = memoryStore([source('club', 'https://club.example.com.au/gigs')])
    let asked = 0
    m.store.expirePassed = async (now) => {
      asked += 1
      expect(now).toEqual(NOW)
      return 3
    }
    const r = await runCollection(m.store, sites({ 'https://club.example.com.au/robots.txt': { status: 404 }, 'https://club.example.com.au/gigs': { status: 200, body: gig('Bp Proof Trio', 'https://events.humanitix.com/bp-trio') } }).fetcher, NOW)
    expect(asked).toBe(1)
    expect(r.expired).toBe(3)

    const broken = memoryStore([source('club', 'https://club.example.com.au/gigs')])
    broken.store.expirePassed = async () => {
      throw new Error('the database is away')
    }
    const r2 = await runCollection(broken.store, sites({ 'https://club.example.com.au/robots.txt': { status: 404 }, 'https://club.example.com.au/gigs': { status: 200, body: gig('Bp Proof Trio', 'https://events.humanitix.com/bp-trio') } }).fetcher, NOW)
    expect(r2).toMatchObject({ expired: 0, landed: 1 })
  })
})

/*
 * CAR 44, THE DAILY BIG EVENT HUNT (Lawal's 15:12 of 4 November 2026: 'Make sure this is not something I'm doing daily'):
 * a headline venue's own What's on page on the hunt's list (src/lib/listings/headline-hunt.ts) lists a new night it
 * states AT ITS OWN VENUE, with high confidence, without a person; a night it states anywhere else waits, as before.
 */
describe("the hunt's rule", () => {
  const arena = 'https://rodlaverarena.com.au/event/a-big-show/'
  const open = { 'https://rodlaverarena.com.au/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /' } }
  const show = (venue: string) =>
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'MusicEvent',
      name: 'A Big Show',
      startDate: '2026-11-21T20:00:00+11:00',
      location: { name: venue, address: 'Olympic Boulevard, Melbourne VIC 3001' },
      offers: { url: 'https://www.ticketmaster.com.au/a-big-show/event/1', availability: 'InStock' },
    })}</script>`
  const hunted = (over: Partial<RegisteredSource> = {}) =>
    source('rla', arena, { citySlug: 'melbourne', hunt: { host: 'rodlaverarena.com.au', citySlug: 'melbourne', venues: ['Rod Laver Arena'], usualCategory: 'music' }, ...over })

  it('lists a high confidence new night at the venue the page speaks for, through the hunt publisher', async () => {
    const m = memoryStore([hunted()])
    const huntPublished: string[] = []
    m.store.publishHuntNight = async (row, _hunt, venueName) => {
      huntPublished.push(`${row.title} @ ${venueName}`)
    }
    const r = await runCollection(m.store, sites({ ...open, [arena]: { status: 200, body: show('Rod Laver Arena') } }).fetcher, NOW)
    expect(m.landed[0]).toMatchObject({ kind: 'new', confidence: 'high', decidedBy: 'partner_rule' })
    expect(huntPublished).toEqual(['A Big Show @ Rod Laver Arena'])
    expect(m.published).toEqual([])
    expect(r).toMatchObject({ acceptedByRule: 1, queued: 0 })
  })

  it('leaves a night the page states at another venue for a person', async () => {
    const m = memoryStore([hunted()])
    m.store.publishHuntNight = async () => {
      throw new Error('never')
    }
    await runCollection(m.store, sites({ ...open, [arena]: { status: 200, body: show('Some Other Hall') } }).fetcher, NOW)
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
  })

  it('a source off the list stays a person\'s, however confident', async () => {
    const m = memoryStore([hunted({ hunt: null })])
    await runCollection(m.store, sites({ ...open, [arena]: { status: 200, body: show('Rod Laver Arena') } }).fetcher, NOW)
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
  })

  /* Car 44b (the CONTROLLER's 01:05 of 5 November 2026): 'For review ends for these sources ... only a likely duplicate is
     held, and the duplicate check matches Mt and Mount and the same title on the same day'. */
  const page = (night: Record<string, unknown>) =>
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'MusicEvent',
      name: 'A Big Show',
      startDate: '2026-11-21T20:00:00+11:00',
      location: { name: 'Rod Laver Arena', address: 'Olympic Boulevard, Melbourne VIC 3001' },
      offers: { url: 'https://www.ticketmaster.com.au/a-big-show/event/1', availability: 'InStock' },
      ...night,
    })}</script>`

  it('lists a night with no street address at its own venue directly, with no review row', async () => {
    const m = memoryStore([hunted()])
    const direct: string[] = []
    m.store.publishHuntNight = async (row, _hunt, venueName, options) => {
      direct.push(`${row.title} @ ${venueName}${options?.direct ? ' (direct)' : ''}`)
    }
    const r = await runCollection(m.store, sites({ ...open, [arena]: { status: 200, body: page({ location: { name: 'Rod Laver Arena' } }) } }).fetcher, NOW)
    expect(direct).toEqual(['A Big Show @ Rod Laver Arena (direct)'])
    expect(m.landed).toEqual([])
    expect(r).toMatchObject({ acceptedByRule: 1, queued: 0 })
    // The run log's rule holds for a direct listing too (listing_source_runs_counts_add_up).
    expect(m.runs[0].queued + m.runs[0].acceptedByRule).toBeLessThanOrEqual(m.runs[0].landed)
    expect(m.runs[0].landed).toBeLessThanOrEqual(m.runs[0].found)
  })

  it('counts a night that waited from before the hunt, and is decided by its rule now, as listed', async () => {
    const m = memoryStore([hunted({ hunt: null })])
    const fetcher = sites({ ...open, [arena]: { status: 200, body: page({}) } }).fetcher
    await runCollection(m.store, fetcher, NOW)
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
    const later = memoryStore([hunted()])
    later.store.land = m.store.land
    later.store.publishHuntNight = async () => 'promoted'
    const r = await runCollection(later.store, fetcher, new Date(NOW.getTime() + 60_000))
    expect(r).toMatchObject({ acceptedByRule: 1, queued: 0 })
    /* The run log's own rule (listing_source_runs_counts_add_up, 20261028204001): queued + accepted_by_rule <= landed <=
       found. Production refused GMHBA's row on 5 November 2026, 14:46, when two promoted nights counted as accepted, not
       landed. */
    const run = later.runs[0]
    expect(run.queued + run.acceptedByRule).toBeLessThanOrEqual(run.landed)
    expect(run.landed).toBeLessThanOrEqual(run.found)
  })

  it('holds a likely duplicate, the same title the same day at any venue, for a person', async () => {
    const known: KnownEvent[] = [
      { eventId: 'e1', venueId: null, venueName: 'Melbourne Park', venueAddress: null, title: 'A BIG SHOW', startsAt: '2026-11-21T19:30:00+11:00', citySlug: 'melbourne' },
    ]
    const m = memoryStore([hunted()], known)
    m.store.publishHuntNight = async () => {
      throw new Error('a likely duplicate is never listed by the hunt')
    }
    await runCollection(m.store, sites({ ...open, [arena]: { status: 200, body: page({}) } }).fetcher, NOW)
    expect(m.landed.every((r) => r.decidedBy === 'person')).toBe(true)
  })

  it('holds a night its own words call off, and a night with no time, for a person', async () => {
    for (const night of [{ name: 'A Big Show (Postponed)' }, { startDate: '2026-11-21T00:00:00+11:00' }]) {
      const m = memoryStore([hunted()])
      m.store.publishHuntNight = async () => {
        throw new Error('never')
      }
      await runCollection(m.store, sites({ ...open, [arena]: { status: 200, body: page(night) } }).fetcher, NOW)
      expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
    }
  })
})
