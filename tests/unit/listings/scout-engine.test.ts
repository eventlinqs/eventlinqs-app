import { describe, expect, it } from 'vitest'
import { cityOfNights, judgeTerms, runScout, scoutOrder, termsLinks, type ScoutRegistration, type ScoutStore } from '@/lib/listings/scout-engine'
import { scoutable } from '@/lib/listings/scout-store'
import type { Fetcher } from '@/lib/listings/collect-run'
import type { CaptureCity } from '@/lib/listings/capture-rule'

/*
 * THE SCOUT RUNS ITSELF (Lawal's 10:42 of 13 November 2026). Each check is one of the four the engine's header names:
 * robots, a reader the engine already has, a dry run that reads a future night placed in a guide city, and terms that
 * permit by the fixed words. Built by hand in the shape of a venue's site; no site's own text is copied.
 */

const NOW = new Date('2026-11-13T18:25:00Z')
const SITE = 'https://www.bp-proof-hall.com.au'
const ld = (venue = 'Bp Proof Hall') =>
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'MusicEvent',
    name: 'Bp Proof Band',
    startDate: '2026-11-28T20:00:00+11:00',
    location: { name: venue, address: '1 Proof Street, Geelong VIC 3220' },
  })}</script>`

function sites(pages: Record<string, { status: number; body?: string }>): Fetcher {
  return async (url) => {
    const p = pages[url]
    if (!p) return { status: 404, text: async () => '' }
    return { status: p.status, text: async () => p.body ?? '' }
  }
}

function memory(candidates: Awaited<ReturnType<ScoutStore['candidates']>>) {
  const registered: ScoutRegistration[] = []
  const store: ScoutStore = {
    candidates: async () => candidates,
    knownVenueNames: async (city) => (city === 'geelong' ? ['Bp Proof Hall'] : []),
    register: async (r) => {
      registered.push(r)
      return true
    },
  }
  return { store, registered }
}

const hall = { name: 'Bp Proof Hall', kind: 'venue' as const, website: `${SITE}/`, citySlug: 'geelong' as const, venueId: 'v1' }
const OPEN = { [`${SITE}/robots.txt`]: { status: 200, body: 'User-agent: *\nAllow: /' } }

describe('the terms, by the fixed words', () => {
  it('refuses on a word, quoting its sentence', () => {
    const j = judgeTerms([{ url: `${SITE}/terms`, text: 'Welcome. You must not scrape this website by any means. Thanks.' }], '2026-11-14')
    expect(j).toMatchObject({ permits: false, word: 'scraping' })
    expect(j.quote).toContain('You must not scrape this website by any means.')
  })

  it('a robots.txt mention alone does not refuse; silent terms permit, said as read', () => {
    const j = judgeTerms([{ url: `${SITE}/terms`, text: 'See our robots.txt for our rules. Enjoy the show.' }], '2026-11-14')
    expect(j).toMatchObject({ permits: true })
    expect(j.quote).toContain('read 2026-11-14 by the nightly scout')
  })

  it('no terms page: permitted, saying where it looked', () => {
    expect(judgeTerms([], '2026-11-14').quote).toMatch(/^No terms of use or copyright page is linked/)
  })

  it('finds only the site\'s own terms of use, never its ticket terms or another site', () => {
    const html = `<a href="/terms-of-use">Terms of use</a><a href="/ticket-terms">Ticket terms and conditions</a><a href="https://other.example/terms">Terms</a>`
    expect(termsLinks(html, SITE)).toEqual([`${SITE}/terms-of-use`])
  })
})

describe('the scout, pure', () => {
  it('places an organiser in the city of the venues its nights name', () => {
    const known = new Map<CaptureCity, readonly string[]>([['melbourne', ['Forum Melbourne']], ['geelong', ['Bp Proof Hall']]])
    expect(cityOfNights([{ venueName: 'BP PROOF HALL' }], known)).toBe('geelong')
    expect(cityOfNights([{ venueName: 'Somewhere' }], known)).toBeNull()
  })

  it('tries a different order each day, the same order all day', () => {
    const c = Array.from({ length: 8 }, (_, i) => ({ website: `https://site${i}.example/` }))
    expect(scoutOrder(c, '2026-11-14')).toEqual(scoutOrder(c, '2026-11-14'))
    expect(scoutOrder(c, '2026-11-14').map((x) => x.website)).not.toEqual(scoutOrder(c, '2026-11-15').map((x) => x.website))
  })

  it('never tries a ticketing platform or a social page', () => {
    expect(scoutable('https://www.eventbrite.com.au/o/bp-proof-1')).toBe(false)
    expect(scoutable('https://www.facebook.com/bpproofhall')).toBe(false)
    expect(scoutable(`${SITE}/`)).toBe(true)
  })
})

describe('the scout in a night', () => {
  it('registers a site with Event data, robots allowing and no terms, in its venue city', async () => {
    const m = memory([hall])
    const out = await runScout(m.store, sites({ ...OPEN, [`${SITE}/`]: { status: 200, body: `<html>${ld()}</html>` } }), NOW, Infinity, { pauseMs: 0 })
    expect(out).toEqual([{ site: SITE, outcome: 'registered: jsonld, 1 future night(s), geelong', registered: true }])
    expect(m.registered[0]).toMatchObject({ citySlug: 'geelong', pageUrl: `${SITE}/`, adapter: 'jsonld', venueId: 'v1', day: '2026-11-14' })
    expect(m.registered[0].robotsQuote).toContain('[User-agent: *] [Allow: /]')
  })

  it('does not register a site whose terms refuse', async () => {
    const m = memory([hall])
    const pages = { ...OPEN, [`${SITE}/`]: { status: 200, body: `<a href="/terms">Terms of use</a>${ld()}` }, [`${SITE}/terms`]: { status: 200, body: '<p>No automated collection of this site is allowed.</p>' } }
    const out = await runScout(m.store, sites(pages), NOW, Infinity, { pauseMs: 0 })
    expect(out[0]).toMatchObject({ registered: false })
    expect(out[0].outcome).toMatch(/^its terms name automated/)
    expect(m.registered).toEqual([])
  })

  it('reads nothing robots.txt bars, and stops at a 403', async () => {
    const barred = memory([hall])
    await runScout(barred.store, sites({ [`${SITE}/robots.txt`]: { status: 200, body: 'User-agent: *\nDisallow: /' } }), NOW, Infinity, { pauseMs: 0 })
    expect(barred.registered).toEqual([])
    const refused = memory([hall])
    const out = await runScout(refused.store, sites({ ...OPEN, [`${SITE}/`]: { status: 403 } }), NOW, Infinity, { pauseMs: 0 })
    expect(out[0]).toMatchObject({ outcome: 'the site answered 403: never read', registered: false })
  })

  it('an organiser whose nights are at no venue EventLinqs holds is not registered', async () => {
    const m = memory([{ ...hall, kind: 'organiser', citySlug: null, venueId: null }])
    const out = await runScout(m.store, sites({ ...OPEN, [`${SITE}/`]: { status: 200, body: ld('A Hall Nobody Holds') } }), NOW, Infinity, { pauseMs: 0 })
    expect(out[0].outcome).toBe('1 future night(s), none at a venue EventLinqs holds in a guide city')
    expect(m.registered).toEqual([])
  })
})
