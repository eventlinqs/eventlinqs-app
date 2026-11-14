/*
 * THE ENGINE READS LISTS, NOT PAGES, AND AN UNCHANGED LIST COSTS ONE CHEAP REQUEST (the PM's 07:00 of 15 November 2026,
 * item 4 (b); RFC 9110 sections 13.1.2, 13.1.3 and 15.4.5). src/lib/listings/collect-run.ts: a source whose own body carries
 * its nights is read with the validators it last answered with; a 304 confirms its own public nights still to come as
 * unchanged, and a 200 keeps its new validators.
 */
import { describe, expect, it } from 'vitest'
import { conditionalHeaders, runCollection, type CollectionStore, type Fetcher, type SeriesConfirmationRow } from '@/lib/listings/collect-run'
import type { KnownEvent, RegisteredSource } from '@/lib/listings/collect'

const NOW = new Date('2026-11-15T03:00:00Z')
const FEED = 'https://venue.example/events.ics'

const source = (over: Partial<RegisteredSource> = {}): RegisteredSource => ({
  id: 'src-feed', name: 'A venue feed', pageUrl: FEED, collection: 'read', changes: 'daily', lastCheckedAt: null, lastSuccessAt: null,
  permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, ...over,
})
const night = (eventId: string, startsAt: string, over: Partial<KnownEvent> = {}): KnownEvent => ({
  eventId, title: eventId, startsAt, venueId: null, venueName: 'The Venue', venueAddress: '1 Main St', seriesId: `series-${eventId}`,
  listedPublic: true, sourceIds: ['src-feed'], ...over,
})

function store(known: KnownEvent[], src: RegisteredSource) {
  const confirmed: SeriesConfirmationRow[] = []
  const validators: { etag: string | null; lastModified: string | null }[] = []
  const recorded: string[] = []
  const s: CollectionStore = {
    sources: async () => [src],
    known: async () => known,
    heldLinks: async () => new Set(),
    addLinks: async () => {},
    land: async () => true,
    record: async (_id, outcome) => {
      recorded.push(outcome)
    },
    logRun: async () => {},
    publishPartnerNight: async () => {},
    expirePassed: async () => 0,
    confirmSeries: async (rows) => {
      confirmed.push(...rows)
    },
    noteValidators: async (_id, etag, lastModified) => {
      validators.push({ etag, lastModified })
    },
  }
  return { s, confirmed, validators, recorded }
}

describe('the conditional read of a list', () => {
  it('sends the ETag first, else Last-Modified, and nothing before either is known', () => {
    expect(conditionalHeaders({ pageUrl: FEED, lastEtag: '"v1"', lastModified: 'Sat, 14 Nov 2026 20:00:00 GMT' })).toEqual({ 'If-None-Match': '"v1"' })
    expect(conditionalHeaders({ pageUrl: FEED, lastEtag: null, lastModified: 'Sat, 14 Nov 2026 20:00:00 GMT' })).toEqual({ 'If-Modified-Since': 'Sat, 14 Nov 2026 20:00:00 GMT' })
    expect(conditionalHeaders({ pageUrl: FEED })).toEqual({})
  })

  it('a 304 confirms each public night still to come that this source published, and nothing else', async () => {
    const known = [
      night('a', '2026-11-20T09:00:00Z'),
      night('b', '2026-12-01T09:00:00Z'),
      night('hidden', '2026-11-21T09:00:00Z', { listedPublic: false }),
      night('passed', '2026-11-14T09:00:00Z'),
      night('other', '2026-11-22T09:00:00Z', { sourceIds: ['src-else'] }),
    ]
    const src = source({ lastEtag: '"v1"' })
    const { s, confirmed, recorded } = store(known, src)
    const seen: Record<string, string>[] = []
    const fetcher: Fetcher = async (url, init) => {
      if (url.endsWith('/robots.txt')) return { status: 404, text: async () => '' }
      seen.push(init.headers)
      return { status: 304, text: async () => '' }
    }
    const out = await runCollection(s, fetcher, NOW, Infinity, { pauseMs: 0 })
    expect(seen[0]['If-None-Match']).toBe('"v1"')
    expect(out.read).toBe(1)
    expect(confirmed.map((c) => c.seriesId).sort()).toEqual(['series-a', 'series-b'])
    expect(confirmed.every((c) => c.sourceUrl === FEED && c.outcome === 'confirmed' && c.sourceId === 'src-feed')).toBe(true)
    expect(recorded[0]).toMatch(/unchanged since the last read \(304\): 2 series confirmed/)
  })

  it('a 200 keeps the validators the list answered with', async () => {
    const src = source()
    const { s, validators } = store([], src)
    const fetcher: Fetcher = async (url) => {
      if (url.endsWith('/robots.txt')) return { status: 404, text: async () => '' }
      return { status: 200, text: async () => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', headers: { get: (n: string) => (n === 'etag' ? '"v2"' : null) } }
    }
    await runCollection(s, fetcher, NOW, Infinity, { pauseMs: 0 })
    expect(validators).toEqual([{ etag: '"v2"', lastModified: null }])
  })
})
