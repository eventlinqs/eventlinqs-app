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

const TEMPLATES = ['src/components/templates/CityLandingPage.tsx', 'src/components/templates/CommunityCityLandingPage.tsx']

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
        /Events: $/.test(before) || /events: $/.test(before) || /const $/.test(before) || after.startsWith('.length') || /^\.map\(\(r[,)]/.test(after)
      expect(allowed, `${m[0]} used as ${before}|${m[0]}|${after}`).toBe(true)
    }
  })

  it('never draws the full list directly: the last grid is the remainder', () => {
    expect(source).not.toMatch(/allEvents\.slice\(0, ALL_EVENTS_SHOWN\)/)
    expect(source).toMatch(/\{ events: allEvents, cap: ALL_EVENTS_SHOWN \}/)
  })
})
