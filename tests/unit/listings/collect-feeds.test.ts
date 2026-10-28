import { describe, expect, it } from 'vitest'
import { eventsFromBody, eventsFromIcs } from '@/lib/listings/collect'
import { runCollection, type CandidateRow, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
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
    expect(found[1].pageUrl).toBe(FEED)
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
    const src: RegisteredSource = { id: 'lib', name: 'lib', pageUrl: FEED, collection: 'read', changes: 'weekly', lastCheckedAt: null }
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
