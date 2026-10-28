import { describe, expect, it } from 'vitest'
import { eventsFromBody, eventsFromIcs, sourceFreshness } from '@/lib/listings/collect'
import { FETCH_TIMEOUT_MS, runCollection, type CandidateRow, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
import type { RegisteredSource } from '@/lib/listings/collect'

/*
 * Item 19's licensed sources (the project manager's 12:26 of 28 October 2026, ruling (2)): a calendar feed a venue or
 * council publishes for people to subscribe to is read as RFC 5545 says (https://www.rfc-editor.org/rfc/rfc5545, read
 * 28 October 2026): folded lines unfolded, text unescaped, and the three date-time forms each read in their own zone.
 */

const FEED = 'https://library.example.vic.gov.au/events.ics'

const ics = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bp proof//EN', ...events, 'END:VCALENDAR'].join('\r\n')

const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')

describe('a calendar feed (RFC 5545)', () => {
  it('reads each event with its zone: TZID, UTC and a floating time in Melbourne', () => {
    const found = eventsFromIcs(
      ics(
        vevent('UID:a', 'SUMMARY:Bp Author Talk', 'DTSTART;TZID=Australia/Melbourne:20261112T183000', 'DTEND;TZID=Australia/Melbourne:20261112T193000', 'LOCATION:Geelong Library and Heritage Centre\\, 51 Little Malop St\\, Geelong VIC 3220', 'URL:https://library.example.vic.gov.au/events/bp-author-talk'),
        vevent('UID:b', 'SUMMARY:Bp Jazz Night', 'DTSTART:20261114T090000Z', 'LOCATION:The Capital\\, Bendigo'),
        vevent('UID:c', 'SUMMARY:Bp Market', 'DTSTART:20261115T080000', 'LOCATION:Camp Street\\, Ballarat'),
      ),
      FEED,
    )
    expect(found.map((e) => [e.title, e.startsAt, e.venueName])).toEqual([
      ['Bp Author Talk', '2026-11-12T07:30:00.000Z', 'Geelong Library and Heritage Centre'],
      ['Bp Jazz Night', '2026-11-14T09:00:00.000Z', 'The Capital'],
      ['Bp Market', '2026-11-14T21:00:00.000Z', 'Camp Street'],
    ])
    expect(found[0]).toMatchObject({
      endsAt: '2026-11-12T08:30:00.000Z',
      venueAddress: 'Geelong Library and Heritage Centre, 51 Little Malop St, Geelong VIC 3220',
      pageUrl: 'https://library.example.vic.gov.au/events/bp-author-talk',
      links: [],
    })
    expect(found[1].pageUrl).toBe(`${FEED}#b`)
  })

  it('unfolds a folded line and reads an all day event at the start of its day in Melbourne', () => {
    const [e] = eventsFromIcs(ics(vevent('SUMMARY:Bp Festival of the', '  Long Title', 'DTSTART;VALUE=DATE:20261121', 'LOCATION:Sovereign Hill')), FEED)
    expect(e.title).toBe('Bp Festival of the Long Title')
    expect(e.startsAt).toBe('2026-11-20T13:00:00.000Z')
  })

  it('takes no cancelled event, none without a place, and no address that is not https', () => {
    const found = eventsFromIcs(
      ics(
        vevent('SUMMARY:Bp Called Off', 'STATUS:CANCELLED', 'DTSTART:20261114T090000Z', 'LOCATION:Town Hall'),
        vevent('SUMMARY:Bp Online Only', 'DTSTART:20261114T090000Z'),
        vevent('SUMMARY:Bp Plain Link', 'DTSTART:20261114T090000Z', 'LOCATION:Town Hall', 'URL:http://insecure.example.com/e'),
      ),
      FEED,
    )
    expect(found.map((e) => [e.title, e.pageUrl])).toEqual([['Bp Plain Link', FEED]])
  })

  it('a page is still read for its own Event data, a feed for its events', () => {
    expect(eventsFromBody('<html><body>no data</body></html>', 'https://club.example.com.au/gigs')).toEqual([])
    expect(eventsFromBody(ics(vevent('SUMMARY:Bp Feed', 'DTSTART:20261114T090000Z', 'LOCATION:Town Hall')), FEED)).toHaveLength(1)
  })
})

describe('the weekly run over a calendar feed', () => {
  it('reads robots.txt first, then the feed, and lands its events for review', async () => {
    const landed: CandidateRow[] = []
    const recorded: Record<string, string> = {}
    const src: RegisteredSource = { id: 'lib', name: 'lib', pageUrl: FEED, collection: 'read', changes: 'weekly', lastCheckedAt: null, lastSuccessAt: null, permits: FACTS_ONLY }
    const store: CollectionStore = {
      sources: async () => [src],
      known: async () => [],
      heldLinks: async () => new Set(),
      land: async (row) => (landed.push(row), true),
      record: async (id, outcome) => {
        recorded[id] = outcome
      },
    }
    const asked: string[] = []
    const fetcher: Fetcher = async (url) => {
      asked.push(url)
      if (url.endsWith('/robots.txt')) return { status: 200, text: async () => 'User-agent: *\nAllow: /' }
      return { status: 200, text: async () => ics(vevent('SUMMARY:Bp Author Talk', 'DTSTART;TZID=Australia/Melbourne:20261112T183000', 'LOCATION:Geelong Library and Heritage Centre')) }
    }
    const r = await runCollection(store, fetcher, new Date('2026-10-28T03:00:00Z'))
    expect(asked).toEqual(['https://library.example.vic.gov.au/robots.txt', FEED])
    expect(r).toMatchObject({ read: 1, landed: 1 })
    expect(landed[0]).toMatchObject({ kind: 'new', title: 'Bp Author Talk', startsAt: '2026-11-12T07:30:00.000Z' })
    expect(recorded.lib).toBe('read: 1 event(s) found, 1 new for review')
  })
})

/*
 * Geelong Regional Libraries' feed, as served on 28 October 2026, writes LOCATION as the venue, a spaced hyphen and a
 * room, the room often empty: "Geelong Library and Heritage Centre (The Dome) - ", "Biyal-a Armstrong Creek Library -
 * Djilaga Makers Room (Level 2)". The venue is the part before the spaced hyphen; a hyphen inside a name stays.
 */
describe('a feed that names a room after the venue', () => {
  it('reads the venue as the part before " - ", never ending in a hyphen', () => {
    const found = eventsFromIcs(
      ics(
        vevent('SUMMARY:Bp Story Time', 'DTSTART:20261114T000000Z', 'LOCATION:Geelong Library and Heritage Centre (The Dome) - '),
        vevent('SUMMARY:Bp Makers', 'DTSTART:20261114T010000Z', 'LOCATION:Biyal-a Armstrong Creek Library - Djilaga Makers Room (Level 2)'),
      ),
      FEED,
    )
    expect(found.map((e) => e.venueName)).toEqual(['Geelong Library and Heritage Centre (The Dome)', 'Biyal-a Armstrong Creek Library'])
    for (const e of found) expect(e.venueName).not.toMatch(/-\s*$/)
  })
})

/*
 * Geelong Regional Libraries' 500 events carry a UID each and no URL (28 October 2026), so each took the feed's own
 * address, and two branches' story times at one instant were one candidate (source, page, start is the candidates'
 * unique key): the first TEST run found 454 and landed 190. An event with no URL of its own is told apart by its UID.
 */
describe('feed events with no address of their own', () => {
  it('are told apart by their UID, at the feed address', () => {
    const found = eventsFromIcs(
      ics(
        vevent('UID:17016085', 'SUMMARY:Bp Story Time', 'DTSTART:20261109T233000Z', 'LOCATION:Belmont Library - '),
        vevent('UID:17004928', 'SUMMARY:Bp Story Time', 'DTSTART:20261109T233000Z', 'LOCATION:Corio Library - '),
        vevent('SUMMARY:Bp No Uid', 'DTSTART:20261109T233000Z', 'LOCATION:Lara Library - '),
      ),
      FEED,
    )
    expect(found.map((e) => e.pageUrl)).toEqual([`${FEED}#17016085`, `${FEED}#17004928`, FEED])
    expect(new Set(found.map((e) => `${e.pageUrl}|${e.startsAt}`)).size).toBe(3)
  })
})

/*
 * The checklist's D4 (START-16OCT/EVENTLINQS-RELEASE-CHECKLIST-28OCT.md): "Permitted content is machine readable and
 * enforced: facts only means the image stays blank, never copied." A source's permitted content is the register's
 * permits_facts, permits_descriptions, permits_images and permits_links (20261028140001).
 */
type Permits = { facts: boolean; descriptions: boolean; images: boolean; links: boolean }
const FACTS_ONLY: Permits = { facts: true, descriptions: false, images: false, links: false }

function feedRun(permits: Permits, body: string, robots = { status: 200, body: 'User-agent: *\nAllow: /' }) {
  const landed: CandidateRow[] = []
  const recorded: { id: string; outcome: string; succeeded: unknown }[] = []
  const src: RegisteredSource = { id: 'lib', name: 'lib', pageUrl: FEED, collection: 'read', changes: 'weekly', lastCheckedAt: null, lastSuccessAt: null, permits }
  const store: CollectionStore = {
    sources: async () => [src],
    known: async () => [],
    heldLinks: async () => new Set(),
    land: async (row) => (landed.push(row), true),
    record: async (id, outcome, _at, succeeded) => {
      recorded.push({ id, outcome, succeeded })
    },
  }
  const asked: string[] = []
  const fetcher: Fetcher = async (url) => {
    asked.push(url)
    if (url.endsWith('/robots.txt')) return { status: robots.status, text: async () => robots.body }
    return { status: 200, text: async () => body }
  }
  return { landed, recorded, asked, go: () => runCollection(store, fetcher, new Date('2026-10-28T03:00:00Z')) }
}

const WITH_MEDIA = ics(
  vevent(
    'SUMMARY:Bp Poster Night',
    'DTSTART:20261114T090000Z',
    'LOCATION:Town Hall',
    'DESCRIPTION:Bp the publisher\'s own words about the night\\, written by them.',
    'ATTACH;FMTTYPE=image/jpeg:https://library.example.vic.gov.au/posters/bp-poster.jpg',
  ),
)

describe('permitted content, enforced in the run', () => {
  it('a facts only feed lands its facts with no image and no description, though the feed carries both', async () => {
    const run = feedRun(FACTS_ONLY, WITH_MEDIA)
    await run.go()
    expect(run.landed).toHaveLength(1)
    expect(run.landed[0]).toMatchObject({ title: 'Bp Poster Night', venueName: 'Town Hall' })
    expect(run.landed[0].imageUrl).toBeNull()
    expect(run.landed[0].description ?? null).toBeNull()
  })

  it('a source that permits its images and descriptions lands them', async () => {
    const run = feedRun({ facts: true, descriptions: true, images: true, links: true }, WITH_MEDIA)
    await run.go()
    expect(run.landed[0].imageUrl).toBe('https://library.example.vic.gov.au/posters/bp-poster.jpg')
    expect(run.landed[0].description).toBe("Bp the publisher's own words about the night, written by them.")
  })

  it('links land only where links are permitted', async () => {
    const page = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'MusicEvent',
      name: 'Bp Linked Gig',
      startDate: '2026-11-14T20:00:00+11:00',
      location: { name: 'The Barwon Club' },
      offers: { url: 'https://events.humanitix.com/bp-linked', availability: 'InStock' },
    })}</script>`
    const without = feedRun(FACTS_ONLY, page)
    await without.go()
    expect(without.landed[0].links).toEqual([])
    const withLinks = feedRun({ ...FACTS_ONLY, links: true }, page)
    await withLinks.go()
    expect(withLinks.landed[0].links.map((l) => l.url)).toEqual(['https://events.humanitix.com/bp-linked'])
  })

  it('a source that permits no facts is not fetched and lands nothing', async () => {
    const run = feedRun({ facts: false, descriptions: false, images: false, links: false }, WITH_MEDIA)
    const r = await run.go()
    expect(run.asked).toEqual([])
    expect(run.landed).toEqual([])
    expect(r).toMatchObject({ read: 0, skipped: 1, landed: 0 })
  })
})

/*
 * Bendigo Pride Festival's feed answered in 7.3 s (curl) and 12.6 s (Node's fetch) on 28 October 2026 and timed out
 * once at the run's 15 s, so it read nothing. Each fetch waits 30 s: robots.txt and the page together still end inside
 * the 60 s the cron keeps after its last start (src/app/api/cron/collection-run, maxDuration 300, budget 240 s).
 */
describe('a slow feed', () => {
  it('is given 30 seconds, and a source started at the budget still ends inside the cron', () => {
    expect(FETCH_TIMEOUT_MS).toBe(30_000)
    expect(2 * FETCH_TIMEOUT_MS).toBeLessThanOrEqual(60_000)
  })
})

/* The checklist's D3: "last successful collection", written only when a read succeeds. */
describe('the last successful collection', () => {
  it('is marked succeeded when the feed is read, and not when robots.txt keeps the run out', async () => {
    const read = feedRun(FACTS_ONLY, WITH_MEDIA)
    await read.go()
    expect(read.recorded).toEqual([{ id: 'lib', outcome: 'read: 1 event(s) found, 1 new for review', succeeded: true }])
    const kept = feedRun(FACTS_ONLY, WITH_MEDIA, { status: 200, body: 'User-agent: *\nDisallow: /' })
    await kept.go()
    expect(kept.recorded).toEqual([{ id: 'lib', outcome: 'robots.txt disallows this page: nothing read', succeeded: false }])
  })

  it('a source past twice its pace is stale; one never collected says so', () => {
    const now = new Date('2026-10-28T03:00:00Z')
    const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
    expect(sourceFreshness({ changes: 'weekly', lastSuccessAt: null }, now)).toBe('never')
    expect(sourceFreshness({ changes: 'weekly', lastSuccessAt: at(13) }, now)).toBe('fresh')
    expect(sourceFreshness({ changes: 'weekly', lastSuccessAt: at(15) }, now)).toBe('stale')
    expect(sourceFreshness({ changes: 'monthly', lastSuccessAt: at(45) }, now)).toBe('fresh')
    expect(sourceFreshness({ changes: 'monthly', lastSuccessAt: at(61) }, now)).toBe('stale')
    expect(sourceFreshness({ changes: 'rarely', lastSuccessAt: at(179) }, now)).toBe('fresh')
    expect(sourceFreshness({ changes: 'rarely', lastSuccessAt: at(181) }, now)).toBe('stale')
  })
})
