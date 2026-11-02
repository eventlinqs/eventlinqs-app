import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * ONE CARD PER EVENT PER PAGE ON THE CITY AND COMMUNITY-IN-CITY PAGES (the photo system's P5; WINDOW 6's baseline of
 * 31 October 2026, 00:36, found AMCF twice on /community/african/melbourne). Their sections overlap by design (tonight
 * and tomorrow, this weekend, this week, the hubs, popular, the full grid), so each template passes them, in the order
 * it draws them, through oneCardPerEvent, and draws only what comes back. The candidate lists are read for counts
 * only. The proof on a real page is WINDOW 6's crawl, rerun on the preview.
 */

const TEMPLATES = ['src/components/templates/CommunityCityLandingPage.tsx']

describe.each(TEMPLATES)('%s', (path) => {
  const source = readFileSync(join(process.cwd(), path), 'utf8')

  it('passes its event sections through oneCardPerEvent', () => {
    expect(source).toContain("import { oneCardPerEvent } from '@/lib/events/one-card-per-event'")
    expect(source).toMatch(/= oneCardPerEvent\(\[/)
  })

  it('draws no card from a candidate list: it is renamed, fed to oneCardPerEvent, or counted, and nothing else', () => {
    for (const m of source.matchAll(/\b\w+Candidates\b/g)) {
      const before = source.slice(Math.max(0, (m.index ?? 0) - 8), m.index)
      const after = source.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 9)
      const allowed =
        /Events: $/.test(before) || /events: $/.test(before) || /toFirst\($/.test(before) || /const $/.test(before) || after.startsWith('.length') || /^\.map\(\(r[,)]/.test(after)
      expect(allowed, `${m[0]} used as ${before}|${m[0]}|${after}`).toBe(true)
    }
  })

  it('never draws the full list directly: the last grid is the remainder', () => {
    expect(source).not.toMatch(/allEvents\.slice\(0, ALL_EVENTS_SHOWN\)/)
    expect(source).toMatch(/\{ events: allEvents, cap: ALL_EVENTS_SHOWN \}/)
  })
})

/*
 * THE DISCOVERY DESIGN (Lawal's orders of 1 November 2026, 11:01 and 11:14). The homepage and the city page draw
 * CARDS in one place only, Featured this week, one night of a series; every other night is one row of What's on, the
 * directory, never a second card. So one card per listing holds by construction.
 */
describe('the discovery pages draw cards only in Featured this week, one per series', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
  it('the city page draws Featured from its cards and every night as a directory row, and no card of its own', () => {
    const src = read('src/components/templates/CityLandingPage.tsx')
    expect(src).toContain('<FeaturedFromCards events={allEvents} />')
    expect(src).toMatch(/<WhatsOnSection\s/)
    expect(src).not.toMatch(/<EventCard[\s>]/)
    expect(read('src/components/features/events/featured-this-week-loader.tsx')).toMatch(/listing_series_id \?\? e\.id/)
  })
  it('the homepage and every city page draw the city guide, whose only cards are Featured, one per series', () => {
    const home = read('src/app/page.tsx')
    expect(home).toMatch(/<CityGuideScreen\s/)
    expect(home).not.toMatch(/<EventRailSection/)
    expect(read('src/app/city/[slug]/page.tsx')).toMatch(/<CityGuideScreen\s/)
    expect(read('src/lib/events/discovery-data.ts')).toMatch(/listing_series_id \?\? r\.id/)
  })
})

/* WINDOW 1's 09:04 crawl of live after car 19: still twice on /events, /events/browse/melbourne and two suburb pages. */
describe('the multi-rail pages WINDOW 1 found on live', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
  it('the suburb page passes its weekend rail and its full list through oneCardPerEvent, in that order', () => {
    const src = read('src/components/templates/SuburbLandingPage.tsx')
    expect(src).toMatch(/= oneCardPerEvent\(\[\s*\{ events: weekendEvents, cap: \d+ \},\s*\{ events, cap: ALL_EVENTS_SHOWN \},?\s*\]\)/)
  })
  it('/events draws Featured this week over the directory of its results, and no popular rail', () => {
    const src = read('src/app/events/page.tsx')
    expect(src).toContain('<FeaturedThisWeekLoader />')
    expect(src).toContain('<EventsDirectoryResults resultPromise={resultPromise} params={raw} />')
    expect(src).not.toContain('<EventsPopularSection')
  })
  it('/events/browse/<city> drops from its popular rail what its results list draws', () => {
    expect(read('src/app/events/browse/[city]/page.tsx')).toMatch(/notAlreadyListed\(popularEvents, result\.events\)/)
  })
})
