import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chosenCitySlug, cityCookieValue, eventsHrefFor } from '@/lib/events/chosen-city'

/*
 * THE CONTROLLER'S 08:50 (7), FROM THE 5 NOVEMBER AUDIT: a visitor who chose Melbourne on the guide and then pressed
 * 'Browse Events' was shown the whole country. Browse follows the city the visitor chose (the el_city cookie, which the
 * header's location picker writes and now the guide's city choice too). /events itself stays all of Australia: a bare
 * visit is never redirected, because the production-rows run of 5 November 21:44 showed the redirect as a flash of the
 * national list then a jump, once per new tab, and it took over links that promise every event ('Browse all events').
 */
describe('the chosen city, read from the el_city cookie (chosenCitySlug)', () => {
  it('reads the city the cookie names as its guide slug, encoded or plain', () => {
    const value = cityCookieValue({ name: 'Melbourne' })
    expect(chosenCitySlug(value)).toBe('melbourne')
    expect(chosenCitySlug(encodeURIComponent(value))).toBe('melbourne')
    expect(chosenCitySlug(JSON.stringify({ city: 'Geelong', country: 'Australia', countryCode: 'AU' }))).toBe('geelong')
  })
  it('reads nothing from a missing, malformed or unknown city', () => {
    expect(chosenCitySlug(null)).toBeNull()
    expect(chosenCitySlug('not json')).toBeNull()
    expect(chosenCitySlug(JSON.stringify({ city: 'Atlantis' }))).toBeNull()
  })
  it('writes the same shape /api/location/set writes', () => {
    expect(JSON.parse(cityCookieValue({ name: 'Ballarat' }))).toEqual({ city: 'Ballarat', country: 'Australia', countryCode: 'AU', latitude: null, longitude: null })
  })
})

describe('where Browse Events goes', () => {
  it('opens the chosen city\'s guide, else every event', () => {
    // Straight to the city's guide: /events?city=<a guided city> 308s there by round 3, item 7 (next.config.ts), and
    // carried its query along ('/city/melbourne?city=melbourne', the production-rows look of 5 November 21:11).
    expect(eventsHrefFor('melbourne')).toBe('/city/melbourne')
    expect(eventsHrefFor(null)).toBe('/events')
  })
})

describe('the surfaces use it', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  it('the guide records a city choice, and its All of Australia link is every event', () => {
    const guide = read('src/components/features/city-guide/city-guide.tsx')
    expect(guide).toMatch(/rememberCity\(/)
    expect(guide).toMatch(/href=\{`\/events\$\{q\.trim\(\)/)
  })
  it('the header and both bottom bars open Browse on the chosen city', () => {
    for (const f of ['src/components/layout/site-header-client.tsx', 'src/components/layout/mobile-bottom-nav.tsx', 'src/components/layout/bottom-nav.tsx']) {
      expect(read(f), f).toMatch(/useChosenEventsHref\(/)
    }
  })
  it('/events itself never redirects a visit: it stays all of Australia', () => {
    expect(read('src/app/events/page.tsx')).not.toMatch(/FollowChosenCity/)
  })
})
