import { describe, expect, it } from 'vitest'
import { runCollection, type CandidateRow, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
import type { RegisteredSource } from '@/lib/listings/collect'
import { CAPTURE_RULE_PER_RUN, captureDecision, hasBannedWord, knownVenueMatch, underCaptureRule } from '@/lib/listings/capture-rule'
import { rulePublishedGlance } from '@/lib/admin/today-math'

/*
 * CAPTURE PUBLISHES BY ITSELF (Lawal's 10:42, 10:49 and 11:05 of 13 November 2026; the project manager's 11:06 item 1). A
 * verified source's new night in a guide's city publishes without a person when it passes every check, and waits with its
 * reason when it fails one. Each check below is the PM's, in his order.
 */

const NOW = new Date('2026-11-13T00:25:00Z')
const PAGE = 'https://www.bp-proof-library.vic.gov.au/whats-on/'
const OPEN = { 'https://www.bp-proof-library.vic.gov.au/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /' } }
const KNOWN = ['Bp Proof Library', 'Costa Hall']

const night = (o: { title?: string; venue?: string; start?: string } = {}) =>
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Event',
    name: o.title ?? 'Bp Proof Author Talk',
    startDate: o.start ?? '2026-11-21T18:00:00+11:00',
    location: { name: o.venue ?? 'Bp Proof Library', address: '51 Little Malop Street, Geelong VIC 3220' },
    offers: { url: PAGE, availability: 'InStock' },
  })}</script>`

const nights = (n: number) =>
  Array.from({ length: n }, (_, i) => night({ title: `Bp Proof Talk ${i + 1}`, start: `2026-11-${String(14 + (i % 14)).padStart(2, '0')}T${String(10 + (i % 8)).padStart(2, '0')}:00:00+11:00` })).join('')

function sites(pages: Record<string, { status: number; body?: string }>): Fetcher {
  return async (url) => {
    const p = pages[url]
    if (!p) throw new Error('unreachable')
    return { status: p.status, text: async () => p.body ?? '' }
  }
}

function memory(src: RegisteredSource, venues: readonly string[] | null = KNOWN) {
  const landed: CandidateRow[] = []
  const published: string[] = []
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
    publishPartnerNight: async () => {},
    publishHuntNight: async (row, rule, venueName) => {
      published.push(`${row.title} @ ${venueName} (${rule.citySlug}, ${rule.usualCategory})`)
    },
    expirePassed: async () => 0,
    ...(venues ? { knownVenueNames: async () => venues } : {}),
  }
  return { store, landed, published }
}

const library = (over: Partial<RegisteredSource> = {}): RegisteredSource => ({
  id: 'lib',
  name: 'Bp Proof Library',
  pageUrl: PAGE,
  collection: 'read',
  changes: 'weekly',
  lastCheckedAt: null,
  lastSuccessAt: null,
  permits: { facts: true, descriptions: false, images: false, links: true },
  verified: true,
  partner: false,
  partnerVenue: null,
  citySlug: 'geelong',
  hunt: null,
  ownProgramme: null,
  categorySlug: 'arts-community',
  ...over,
})

const run = (m: ReturnType<typeof memory>, body: string) =>
  runCollection(m.store, sites({ ...OPEN, [PAGE]: { status: 200, body } }), NOW, Infinity, { pauseMs: 0 })

describe('the capture rule, pure', () => {
  it('covers a verified source in a guide city under no other rule, and nothing else', () => {
    expect(underCaptureRule(library())).toBe(true)
    expect(underCaptureRule(library({ verified: false }))).toBe(false)
    expect(underCaptureRule(library({ partner: true }))).toBe(false)
    expect(underCaptureRule(library({ citySlug: 'sydney' }))).toBe(false)
    expect(underCaptureRule(library({ citySlug: null }))).toBe(false)
  })

  it('matches a held venue by its exact name only, never by a part of it', () => {
    expect(knownVenueMatch('COSTA HALL', KNOWN)).toBe('Costa Hall')
    expect(knownVenueMatch('Costa Hall Foyer', KNOWN)).toBeNull()
    expect(knownVenueMatch('', KNOWN)).toBeNull()
  })

  it("reads the banned word from the platform's one lexicon", () => {
    expect(hasBannedWord(`An evening of ${'cult'}ural dance`)).toBe(true)
    expect(hasBannedWord('An evening of community dance')).toBe(false)
  })

  it('names every check a night fails', () => {
    const src = library({ categorySlug: null }) as RegisteredSource & { citySlug: 'geelong' }
    const d = captureDecision({ title: `${'x'.repeat(70)} ${'cult'}ure night`, venueName: 'Somewhere Else' }, src, KNOWN)
    expect(d).toMatchObject({ holds: expect.arrayContaining(['venue_not_known', 'title_too_long', 'banned_words']) })
    expect(captureDecision({ title: 'Bp Proof', venueName: 'Costa Hall' }, src, KNOWN)).toEqual({ holds: ['no_category'] })
  })
})

describe('the capture rule in the collection run', () => {
  it('publishes a checked night at its held venue without a person', async () => {
    const m = memory(library())
    const r = await run(m, night())
    expect(m.landed[0]).toMatchObject({ kind: 'new', confidence: 'high', decidedBy: 'partner_rule', reasons: [] })
    expect(m.published).toHaveLength(1)
    expect(m.published[0]).toMatch(/^Bp Proof Author Talk @ Bp Proof Library \(geelong, [a-z-]+\)$/)
    expect(r).toMatchObject({ acceptedByRule: 1, queued: 0 })
  })

  it('a night at a venue EventLinqs does not hold waits, saying so', async () => {
    const m = memory(library())
    await run(m, night({ venue: 'A Hall Nobody Holds' }))
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person', confidence: 'low', reasons: ['venue_not_known'] })
    expect(m.published).toEqual([])
  })

  it('a title with a banned word waits, saying so', async () => {
    const m = memory(library())
    await run(m, night({ title: `Bp Proof ${'Cult'}ural Night` }))
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person', reasons: ['banned_words'] })
  })

  it('a time not to be trusted waits: a start before 9 am in Melbourne', async () => {
    const m = memory(library())
    await run(m, night({ start: '2026-11-21T07:00:00+11:00' }))
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
    expect(m.published).toEqual([])
  })

  it('the per-source switch: an unverified source publishes nothing by the rule', async () => {
    const m = memory(library({ verified: false }))
    await run(m, night())
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person' })
    expect(m.published).toEqual([])
  })

  it('a store that cannot name its venues publishes nothing by the rule', async () => {
    const m = memory(library(), null)
    await run(m, night())
    expect(m.landed[0]).toMatchObject({ decidedBy: 'person', reasons: [] })
  })

  it(`decides at most ${CAPTURE_RULE_PER_RUN} nights a source a run; the rest wait for the next runs`, async () => {
    const m = memory(library())
    const r = await run(m, nights(CAPTURE_RULE_PER_RUN + 5))
    expect(m.published).toHaveLength(CAPTURE_RULE_PER_RUN)
    expect(r).toMatchObject({ acceptedByRule: CAPTURE_RULE_PER_RUN, queued: 5 })
  })
})

describe("the Command Centre's glance", () => {
  it('names how many the rule published, the checks, and ten by name', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ title: `Night ${i + 1}`, venue_name: 'Costa Hall', starts_at: '2026-11-21T08:00:00Z', reviewed_at: `2026-11-13T0${i % 10}:00:00Z` }))
    const [item] = rulePublishedGlance(rows, 34, ['a', 'b'])
    expect(item.what).toBe('34 nights published by the rule since yesterday')
    expect(item.why).toContain('Each passed every check (a; b). 10 for a glance: Night 1 at Costa Hall, Sat 21 Nov.')
    expect(item.since).toBe('2026-11-13T00:00:00Z')
    expect(rulePublishedGlance([], 0, ['a'])).toEqual([])
  })
})
