import { describe, expect, it } from 'vitest'
import { runCollection, type CandidateRow, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
import type { RegisteredSource } from '@/lib/listings/collect'
import { huntOrder, huntVenue, ownProgrammeFor, OWN_PROGRAMME_SOURCES, HUNT_SOURCES } from '@/lib/listings/headline-hunt'

/*
 * A VENUE'S OWN PROGRAMME PUBLISHES CHECKED NIGHTS BY RULE (Lawal's 10:42 of 13 November 2026: capture 'publishes checked
 * nights' with no person in the loop; read on production at 10:45 that day: 607 upcoming nights captured and waiting for
 * a person, none accepted by a person in 7 days). A source on OWN_PROGRAMME_SOURCES publishes a new night at its own
 * venue by the hunt's rule, with every hold the hunt's rule keeps; it never joins the twice daily hunt's schedule.
 */

const NOW = new Date('2026-11-13T00:25:00Z')
const PAGE = 'https://www.comedyrepublic.com.au/shows/bp-proof-hour/'
const OPEN = { 'https://www.comedyrepublic.com.au/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /' } }

const night = (o: { venue?: string; start?: string } = {}) =>
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'ComedyEvent',
    name: 'Bp Proof Hour',
    startDate: o.start ?? '2026-11-21T20:00:00+11:00',
    location: { name: o.venue ?? 'Comedy Republic', address: '231 Bourke Street, Melbourne VIC 3000' },
    offers: { url: 'https://www.comedyrepublic.com.au/shows/bp-proof-hour/', availability: 'InStock' },
  })}</script>`

function sites(pages: Record<string, { status: number; body?: string }>): Fetcher {
  return async (url) => {
    const p = pages[url]
    if (!p) throw new Error('unreachable')
    return { status: p.status, text: async () => p.body ?? '' }
  }
}

function memory(src: RegisteredSource) {
  const landed: CandidateRow[] = []
  const huntPublished: string[] = []
  const partnerPublished: string[] = []
  const store: CollectionStore = {
    sources: async () => [src],
    known: async () => [],
    heldLinks: async () => new Set(),
    land: async (row) => {
      landed.push(row)
      return true
    },
    record: async () => {},
    addLinks: async () => {},
    logRun: async () => {},
    publishPartnerNight: async (row) => {
      partnerPublished.push(row.title)
    },
    publishHuntNight: async (row, rule, venueName) => {
      huntPublished.push(`${row.title} @ ${venueName} (${rule.host})`)
    },
    expirePassed: async () => 0,
  }
  return { store, landed, huntPublished, partnerPublished }
}

const comedyRepublic = (over: Partial<RegisteredSource> = {}): RegisteredSource => ({
  id: 'cr',
  name: 'Comedy Republic',
  pageUrl: PAGE,
  collection: 'read',
  changes: 'weekly',
  lastCheckedAt: null,
  lastSuccessAt: null,
  permits: { facts: true, descriptions: false, images: false, links: true },
  verified: true,
  partner: false,
  partnerVenue: null,
  citySlug: 'melbourne',
  hunt: null,
  ownProgramme: ownProgrammeFor(PAGE),
  ...over,
})

describe('a venue reading its own programme publishes a checked night by rule', () => {
  it('names its own programme sources by host, apart from the hunt, and never a host twice', () => {
    expect(ownProgrammeFor(PAGE)).toMatchObject({ host: 'comedyrepublic.com.au', venues: ['Comedy Republic'] })
    expect(ownProgrammeFor('https://example.com/whats-on')).toBeNull()
    const hosts = OWN_PROGRAMME_SOURCES.map((s) => s.host)
    expect(new Set(hosts).size).toBe(hosts.length)
    expect(hosts.filter((h) => HUNT_SOURCES.some((s) => s.host === h))).toEqual([])
  })

  it('publishes a clean, high confidence night at its own venue through the hunt publisher', async () => {
    const m = memory(comedyRepublic())
    const r = await runCollection(m.store, sites({ ...OPEN, [PAGE]: { status: 200, body: night() } }), NOW, Infinity, { pauseMs: 0 })
    expect(m.landed[0]).toMatchObject({ kind: 'new', confidence: 'high', decidedBy: 'partner_rule' })
    expect(m.huntPublished).toEqual(['Bp Proof Hour @ Comedy Republic (comedyrepublic.com.au)'])
    expect(m.partnerPublished).toEqual([])
    expect(r).toMatchObject({ acceptedByRule: 1, queued: 0 })
  })

  it('keeps every hold: a start before 9 am waits for a person', async () => {
    const m = memory(comedyRepublic())
    await runCollection(m.store, sites({ ...OPEN, [PAGE]: { status: 200, body: night({ start: '2026-11-21T07:00:00+11:00' }) } }), NOW, Infinity, { pauseMs: 0 })
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
    expect(m.huntPublished).toEqual([])
  })

  it('a night its page states at another venue waits for a person', async () => {
    const m = memory(comedyRepublic())
    await runCollection(m.store, sites({ ...OPEN, [PAGE]: { status: 200, body: night({ venue: 'Some Other Hall' }) } }), NOW, Infinity, { pauseMs: 0 })
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
    expect(m.huntPublished).toEqual([])
  })

  it('a source off the list stays a person\'s, however confident', async () => {
    const m = memory(comedyRepublic({ ownProgramme: null }))
    await runCollection(m.store, sites({ ...OPEN, [PAGE]: { status: 200, body: night() } }), NOW, Infinity, { pauseMs: 0 })
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
  })

  it('never joins the twice daily hunt: huntOrder takes only the hunt\'s own sources', () => {
    const own = comedyRepublic()
    const arena = comedyRepublic({ id: 'rla', ownProgramme: null, hunt: HUNT_SOURCES[0] })
    expect(huntOrder([own, arena]).map((s) => s.id)).toEqual(['rla'])
  })
})

describe("a venue's other names publish at the one venue", () => {
  it("the JazzLab's 'Jazzlab' and 'Bennetts Lane Jazz Club' are The JazzLab, never a second venue", () => {
    const jazz = ownProgrammeFor('https://thejazzlab.com.au/events/?ical=1')
    if (!jazz) throw new Error('no own programme rule for the JazzLab')
    expect(huntVenue(jazz, 'Jazzlab')).toBe('The JazzLab')
    expect(huntVenue(jazz, 'Bennetts Lane Jazz Club')).toBe('The JazzLab')
    expect(huntVenue(jazz, 'Some Other Club')).toBeNull()
  })
})
