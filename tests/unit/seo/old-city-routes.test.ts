import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllCities } from '@/lib/cities/data'
import { isRedirected, redirectFor } from '@/lib/seo/permanent-redirects'
import { guideForEventsQuery } from '@/lib/seo/query-redirects'

/*
 * ROUND 3, ITEM 7 (Lawal, 2 November 2026; C:\dev\DESIGN\CITY-FIRST-1NOV\ROUND3-LOCKED\ROUND3-DIRECTIVE-2NOV.md; the
 * CONTROLLER's 18:09 (3)(a) and 00:01): the old city listing /events/browse/<city> counted DATES as events ('383 events
 * available' where Geelong holds 191 events). Every city with a city guide now takes a 301 to /city/<city>, from the
 * one redirect table the sitemap reads; a browse city WITHOUT a guide keeps its page (nothing turns into a 404).
 */
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n')

describe('the old city routes', () => {
  it('every city with a guide sends /events/browse/<city> to /city/<city>, permanently', () => {
    for (const c of getAllCities()) {
      expect(redirectFor(`/events/browse/${c.slug}`), c.slug).toEqual({ source: `/events/browse/${c.slug}`, destination: `/city/${c.slug}`, permanent: true })
    }
    expect(redirectFor('/events/browse/geelong')?.destination).toBe('/city/geelong')
  })
  it('a browse city without a guide is NOT redirected (it keeps its page)', () => {
    expect(isRedirected('/events/browse/aireys-inlet')).toBe(false)
  })
  it("/events?city=<city> goes to the city's guide too, for the guided cities only, and only when nothing else /events reads is asked", () => {
    expect(src('src/app/events/page.tsx')).toMatch(/if \(guide\) permanentRedirect\(guide\)/)
    expect(guideForEventsQuery({ city: 'geelong' })).toBe('/city/geelong')
    expect(guideForEventsQuery({ city: 'Geelong' })).toBe('/city/geelong')
    expect(guideForEventsQuery({ city: 'geelong', utm_source: 'x' })).toBe('/city/geelong?utm_source=x')
    expect(guideForEventsQuery({ city: 'aireys-inlet' })).toBeNull()
    for (const key of ['q', 'view', 'sort', 'event_type', 'category', 'date', 'free']) expect(guideForEventsQuery({ city: 'geelong', [key]: 'x' })).toBeNull()
    expect(guideForEventsQuery({ city: 'geelong', q: '' })).toBe('/city/geelong')
  })
  it('every has and missing in next.config.ts is a literal list of at most 16, which Vercel accepts (21 November 2026)', () => {
    // Vercel refused AV's preview, quoted: 'Builder returned invalid routes: should NOT have more than 16 items' (26).
    const cfg = src('next.config.ts')
    const all = [...cfg.matchAll(/\b(has|missing):\s*([^,\n]*)/g)]
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(m[2].startsWith('['), `${m[1]}: ${m[2]}`).toBe(true)
      const list = cfg.slice(m.index! + m[0].length - m[2].length, cfg.indexOf(']', m.index!) + 1)
      expect((list.match(/\btype:/g) ?? []).length, list).toBeLessThanOrEqual(16)
    }
    expect(cfg).not.toContain('EVENTS_CITY_TO_GUIDE')
  })
  it('the sitemap publishes no browse page that redirects, and our own links go straight to the guide', () => {
    expect(src('src/app/sitemap.ts')).toMatch(/if \(isRedirected\(`\/events\/browse\/\$\{c\.slug\}`\)\) continue/)
    expect(src('src/components/features/events/city-rail-tile.tsx')).toMatch(/redirectFor\(browse\)\?\.destination \?\? browse/)
    expect(src('src/app/api/cron/warm/route.ts')).not.toMatch(/\/events\/browse\//)
  })
})
