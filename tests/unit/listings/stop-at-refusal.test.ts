import { describe, expect, it } from 'vitest'
import { runCollection, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
import type { RegisteredSource } from '@/lib/listings/collect'

/*
 * LAW 14 (k): A STOP AT THE FIRST 403 OR 429 (the PM's 09:05 (2) of 13 November 2026). Forum Melbourne answered 403 to
 * our named agent on 18 runs in a row from 5 November 12:25, because the run treated a refusal like an outage and read
 * the source again every day. A source that refuses us on its robots.txt (429), its page (403 or 429) or any page its rule
 * reads is now stopped: put back to 'ask' with its reason, so no run reads it again until a person re-opens it. An outage
 * (a 5xx, no answer) is still retried within the day, as demonstration 18 requires.
 */

const NOW = new Date('2026-11-13T00:25:00Z')

function store(sources: RegisteredSource[]) {
  const stopped: { id: string; because: string }[] = []
  const outcomes: Record<string, string> = {}
  const s: CollectionStore = {
    sources: async () => sources,
    known: async () => [],
    heldLinks: async () => new Set(),
    land: async () => true,
    record: async (id, outcome) => {
      outcomes[id] = outcome
    },
    addLinks: async () => {},
    logRun: async () => {},
    publishPartnerNight: async () => {},
    expirePassed: async () => 0,
    stopSource: async (id, because) => {
      stopped.push({ id, because })
    },
  }
  return { s, stopped, outcomes }
}

function sites(pages: Record<string, { status: number; body?: string } | 'down'>): Fetcher {
  return async (url) => {
    const p = pages[url]
    if (p === undefined || p === 'down') throw new Error('unreachable')
    return { status: p.status, text: async () => p.body ?? '' }
  }
}

const source = (id: string, pageUrl: string): RegisteredSource => ({
  id,
  name: id,
  pageUrl,
  collection: 'read',
  changes: 'weekly',
  lastCheckedAt: null,
  lastSuccessAt: null,
  permits: { facts: true, descriptions: false, images: false, links: true },
  verified: true,
  partner: false,
  partnerVenue: null,
})

const robotsOk = { status: 200, body: 'User-agent: *\nAllow: /' }

describe('a source that refuses us is stopped at the first 403 or 429 (law 14 (k))', () => {
  it('a page answering 403 stops the source, with its reason, and says so in its outcome', async () => {
    const { s, stopped, outcomes } = store([source('forum', 'https://forum.example.com.au/')])
    await runCollection(s, sites({ 'https://forum.example.com.au/robots.txt': robotsOk, 'https://forum.example.com.au/': { status: 403 } }), NOW, Infinity, { pauseMs: 0 })
    expect(stopped.map((x) => x.id)).toEqual(['forum'])
    expect(stopped[0].because).toMatch(/answered 403 to our named agent on 2026-11-13/)
    expect(stopped[0].because).toMatch(/Law 14 \(k\)/)
    expect(outcomes.forum).toMatch(/the page answered 403: nothing read; stopped: it answered 403/)
  })

  it('a page answering 429 stops the source', async () => {
    const { s, stopped } = store([source('busy', 'https://busy.example.com.au/gigs')])
    await runCollection(s, sites({ 'https://busy.example.com.au/robots.txt': robotsOk, 'https://busy.example.com.au/gigs': { status: 429 } }), NOW, Infinity, { pauseMs: 0 })
    expect(stopped.map((x) => x.id)).toEqual(['busy'])
  })

  it('a robots.txt answering 429 stops the source before its page is asked', async () => {
    const { s, stopped } = store([source('slow', 'https://slow.example.com.au/gigs')])
    await runCollection(s, sites({ 'https://slow.example.com.au/robots.txt': { status: 429 } }), NOW, Infinity, { pauseMs: 0 })
    expect(stopped.map((x) => x.id)).toEqual(['slow'])
  })

  it('an outage is NOT a refusal: a 500, a 503 or no answer is retried, never stopped (demonstration 18)', async () => {
    const { s, stopped } = store([
      source('down500', 'https://a.example.com.au/gigs'),
      source('down503', 'https://b.example.com.au/gigs'),
      source('gone', 'https://c.example.com.au/gigs'),
    ])
    await runCollection(
      s,
      sites({
        'https://a.example.com.au/robots.txt': robotsOk,
        'https://a.example.com.au/gigs': { status: 500 },
        'https://b.example.com.au/robots.txt': robotsOk,
        'https://b.example.com.au/gigs': { status: 503 },
        'https://c.example.com.au/robots.txt': robotsOk,
        'https://c.example.com.au/gigs': 'down',
      }),
      NOW,
      Infinity,
      { pauseMs: 0 },
    )
    expect(stopped).toEqual([])
  })

  it('a robots.txt that answers 403 or 404 means no rules (robotsVerdict), so only the page decides', async () => {
    const { s, stopped } = store([source('open', 'https://open.example.com.au/gigs')])
    await runCollection(s, sites({ 'https://open.example.com.au/robots.txt': { status: 404 }, 'https://open.example.com.au/gigs': { status: 200, body: '<html></html>' } }), NOW, Infinity, { pauseMs: 0 })
    expect(stopped).toEqual([])
  })

  it('a page read in full stops nothing', async () => {
    const { s, stopped } = store([source('fine', 'https://fine.example.com.au/gigs')])
    await runCollection(s, sites({ 'https://fine.example.com.au/robots.txt': robotsOk, 'https://fine.example.com.au/gigs': { status: 200, body: '<html></html>' } }), NOW, Infinity, { pauseMs: 0 })
    expect(stopped).toEqual([])
  })

  it('a store without the method still runs (the stop is the store\'s to record)', async () => {
    const { s } = store([source('forum', 'https://forum.example.com.au/')])
    delete (s as { stopSource?: unknown }).stopSource
    const r = await runCollection(s, sites({ 'https://forum.example.com.au/robots.txt': robotsOk, 'https://forum.example.com.au/': { status: 403 } }), NOW, Infinity, { pauseMs: 0 })
    expect(r.skipped).toBe(1)
  })
})
