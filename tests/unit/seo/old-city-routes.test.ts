import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllCities } from '@/lib/cities/data'
import { EVENTS_CITY_TO_GUIDE, GUIDED_CITY_SLUGS, isRedirected, redirectFor } from '@/lib/seo/permanent-redirects'

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
    expect(src('next.config.ts')).toContain('EVENTS_CITY_TO_GUIDE,')
    expect(EVENTS_CITY_TO_GUIDE.source).toBe('/events')
    expect(EVENTS_CITY_TO_GUIDE.has).toEqual([{ type: 'query', key: 'city', value: `(?<city>${GUIDED_CITY_SLUGS.join('|')})` }])
    expect(EVENTS_CITY_TO_GUIDE.destination).toBe('/city/:city')
    expect(EVENTS_CITY_TO_GUIDE.permanent).toBe(true)
    // The words, the map, a sort, a type or a date stay on /events (21 November 2026; tests/unit/seo/city-controls-end-on-a-page.test.ts).
    expect(EVENTS_CITY_TO_GUIDE.missing.map((m) => m.key)).toEqual(expect.arrayContaining(['q', 'view', 'sort', 'event_type', 'category', 'date']))
  })
  it('the sitemap publishes no browse page that redirects, and our own links go straight to the guide', () => {
    expect(src('src/app/sitemap.ts')).toMatch(/if \(isRedirected\(`\/events\/browse\/\$\{c\.slug\}`\)\) continue/)
    expect(src('src/components/features/events/city-rail-tile.tsx')).toMatch(/redirectFor\(browse\)\?\.destination \?\? browse/)
    expect(src('src/app/api/cron/warm/route.ts')).not.toMatch(/\/events\/browse\//)
  })
})
