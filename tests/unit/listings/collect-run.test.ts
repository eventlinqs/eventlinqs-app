import { describe, expect, it } from 'vitest'
import { runCollection, type CandidateRow, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
import type { KnownEvent, RegisteredSource } from '@/lib/listings/collect'

/* Item 19's run: robots.txt before the page, only due sources whose terms allow it, a second source a link. */

const NOW = new Date('2026-10-27T03:00:00Z')

function memoryStore(sources: RegisteredSource[], known: KnownEvent[] = [], held: Record<string, string[]> = {}) {
  const landed: CandidateRow[] = []
  const recorded: Record<string, string> = {}
  const store: CollectionStore = {
    sources: async () => sources,
    known: async () => known,
    heldLinks: async (id) => new Set(held[id] ?? []),
    land: async (row) => {
      if (landed.some((r) => r.sourceId === row.sourceId && r.pageUrl === row.pageUrl && r.startsAt === row.startsAt)) return false
      landed.push(row)
      return true
    },
    record: async (id, outcome) => {
      recorded[id] = outcome
    },
  }
  return { store, landed, recorded }
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
  id, name: id, pageUrl, collection: 'read', changes: 'weekly', lastCheckedAt: null, lastSuccessAt: null, permits: { facts: true, descriptions: false, images: false, links: true }, ...over,
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
      source('fresh', 'https://fresh.example.com/e', { lastCheckedAt: '2026-10-26T00:00:00Z' }),
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
