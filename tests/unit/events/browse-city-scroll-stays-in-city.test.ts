import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEventsSearchParams } from '@/lib/events/search-params'

/**
 * THE CITY PAGE's SCROLL STAYS IN ITS CITY. Measured on live, 1 November 2026 at 390
 * (C:\dev\EVIDENCE\VISUAL-QA-31OCT\cls-probe2.txt): /events/browse/bendigo opened with 26 Bendigo nights, and reaching
 * the foot of the grid called loadMoreEventCards with '[{},2]', '[{},3]' ... so the page grew to 323 nights from every
 * city (Geelong City Market, The Melbourne Book Market, Hop Temple in Ballarat) and pushed its own pagination and
 * footer away (layout shift 0.20; Ballarat 0.19). The city lives in the ROUTE, not the query, and the grid was handed
 * the raw query only. The grid's params must carry the city and country the page itself filters by.
 */

const page = readFileSync(join(process.cwd(), 'src/app/events/browse/[city]/page.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('/events/browse/[city] hands its city to the infinite scroll', () => {
  test("the grid's params carry the page's city and country, not the raw query alone", () => {
    const grid = page.match(/<EventsGrid[\s\S]*?\/>/)?.[0] ?? ''
    expect(grid).not.toMatch(/params=\{raw\}/)
    expect(grid).toMatch(/params=\{scrollParams\}/)
    expect(page).toMatch(/const scrollParams = \{ \.\.\.raw, city: city\.city, country: city\.country \}/)
  })

  test('the action reads them back as the same filters the page used', () => {
    const { filters } = parseEventsSearchParams({ category: 'music', city: 'Bendigo', country: 'Australia' })
    expect(filters.city).toBe('Bendigo')
    expect(filters.country).toBe('Australia')
    expect(filters.category).toBe('music')
  })
})
