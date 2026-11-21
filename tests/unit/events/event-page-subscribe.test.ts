import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveCitySlug } from '@/lib/cities/resolve'

/*
 * THE WEEKLY GUIDE ON THE EVENT PAGE (the PM's 11:58 of 21 November 2026, item 4, engine 2). The city guide's own one
 * step block, below the night's facts and organiser, only where the night's city has a weekly guide: the subscribe
 * route takes exactly the cities resolveCitySlug resolves, so a block shown elsewhere would fail on its press.
 */
const page = readFileSync('src/app/events/[slug]/page.tsx', 'utf8')

describe('the event page subscribe point', () => {
  it("draws the city guide's own block, only for a city with a weekly guide", () => {
    expect(page).toContain('const guideSlug = resolveCitySlug(event.city_primary ?? event.venue_city ?? null)')
    expect(page).toMatch(/\{guideCity \? \([\s\S]*?<CityNewsletterCapture cityName=\{guideCity\} tone="light" \/>/)
  })

  it("sits after the night's facts and organiser, never above them", () => {
    const at = page.indexOf('data-event-subscribe')
    expect(at).toBeGreaterThan(page.indexOf('<EventSection name="facts">'))
    expect(at).toBeGreaterThan(page.indexOf('<EventSection name="organiser">'))
  })

  it('the cities it shows for are the ones the subscribe route accepts', () => {
    expect(resolveCitySlug('Melbourne')).toBe('melbourne')
    expect(resolveCitySlug('Geelong')).toBe('geelong')
    const route = readFileSync('src/app/api/newsletter/subscribe/route.ts', 'utf8')
    expect(route).toContain('resolveCitySlug(city)')
  })
})
