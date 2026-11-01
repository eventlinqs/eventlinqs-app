import { describe, expect, it } from 'vitest'
import { runCollection, type CollectionStore, type Fetcher, type SeriesConfirmationRow } from '@/lib/listings/collect-run'
import { seriesConfirmations, type KnownEvent, type RegisteredSource } from '@/lib/listings/collect'

/*
 * THE CLIFF (the controller's 15:40 of 1 November 2026): a regular night's freshness moves only when a listing check is
 * written, and only the manual import wrote one, so 278 of 317 listings were due to leave every guide on 14 November.
 * When the daily run reads a source and finds again a night EventLinqs holds as part of a series, it writes the
 * series' confirmed check, and the database's trigger moves every night of it forward. A night with no series, a
 * night found with different facts, or a source that could not be read confirms nothing.
 */

const NOW = new Date('2026-11-01T09:00:00Z') // 20:00 in Melbourne, 1 November

const gig = (name: string, start = '2026-11-14T20:00:00+11:00') =>
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'MusicEvent',
    name,
    startDate: start,
    location: { name: 'The Barwon Club', address: '509 Moorabool St, Geelong' },
    offers: { url: 'https://www.eventbrite.com.au/e/x', availability: 'InStock' },
  })}</script>`

const source = (over: Partial<RegisteredSource> = {}): RegisteredSource => ({
  id: 'club', name: 'club', pageUrl: 'https://club.example.com.au/gigs', collection: 'read', changes: 'daily', lastCheckedAt: null, lastSuccessAt: null,
  permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, ...over,
})

const held = (over: Partial<KnownEvent> = {}): KnownEvent => ({
  eventId: 'ev-1', venueId: null, venueName: 'The Barwon Club', venueAddress: null, title: 'Trivia Night', startsAt: '2026-11-14T09:00:00.000Z', seriesId: 'series-1', ...over,
})

function store(known: KnownEvent[]) {
  const confirmed: { rows: SeriesConfirmationRow[] }[] = []
  const s: CollectionStore = {
    sources: async () => [source()],
    known: async () => known,
    heldLinks: async () => new Set(['https://www.eventbrite.com.au/e/x']),
    land: async () => true,
    record: async () => undefined,
    addLinks: async () => undefined,
    logRun: async () => undefined,
    publishPartnerNight: async () => undefined,
    expirePassed: async () => 0,
    confirmSeries: async (rows) => {
      confirmed.push({ rows })
    },
  }
  return { s, confirmed }
}

function site(body: string | 'down'): Fetcher {
  return async (url) => {
    if (url.endsWith('/robots.txt')) return { status: 404, text: async () => '' }
    if (body === 'down') return { status: 503, text: async () => '' }
    return { status: 200, text: async () => body }
  }
}

describe('the daily run confirms the held nights its source still lists', () => {
  it('a held night of a series found again writes one confirmed check for that series, on the licensed basis, dated in Melbourne', async () => {
    const { s, confirmed } = store([held()])
    await runCollection(s, site(gig('Trivia Night')), NOW)
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0].rows).toEqual([
      {
        seriesId: 'series-1',
        sourceUrl: 'https://club.example.com.au/gigs',
        sourceDate: '2026-11-01',
        sourceId: 'club',
        outcome: 'confirmed',
        reuseBasis: 'licensed_source',
      },
    ])
  })

  it('a held night with no series (an organiser night) confirms nothing', async () => {
    const { s, confirmed } = store([held({ seriesId: null })])
    await runCollection(s, site(gig('Trivia Night')), NOW)
    expect(confirmed).toEqual([])
  })

  it('a source that could not be read confirms nothing', async () => {
    const { s, confirmed } = store([held()])
    await runCollection(s, site('down'), NOW)
    expect(confirmed).toEqual([])
  })

  it('two nights of one series on one page are one check, not two', () => {
    const known = [held(), held({ eventId: 'ev-2', startsAt: '2026-11-21T09:00:00.000Z' })]
    const plans = [
      { kind: 'adds_links' as const, eventId: 'ev-1', event: { pageUrl: 'https://club.example.com.au/gigs' } },
      { kind: 'adds_links' as const, eventId: 'ev-2', event: { pageUrl: 'https://club.example.com.au/gigs' } },
      { kind: 'new' as const, event: { pageUrl: 'https://club.example.com.au/gigs' } },
    ]
    expect(seriesConfirmations(plans, known)).toEqual([{ seriesId: 'series-1', sourceUrl: 'https://club.example.com.au/gigs' }])
  })
})
