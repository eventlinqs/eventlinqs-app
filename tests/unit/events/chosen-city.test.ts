import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_OF_AUSTRALIA_HREF, chosenCitySlug, cityCookieValue, eventsHrefFor, followsChosenCity } from '@/lib/events/chosen-city'

/*
 * THE CONTROLLER'S 08:50 (7), FROM THE 5 NOVEMBER AUDIT: a visitor who chose Melbourne on the guide and then pressed
 * 'Browse Events' was shown the whole country. /events follows the city the visitor chose (the el_city cookie, which
 * the header's location picker writes and now the guide's city choice too), while 'All of Australia' stays the whole
 * country and a visitor who clears the city on /events is never sent back to it.
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

describe('where Browse Events goes, and when /events follows the city', () => {
  it('Browse Events opens on the chosen city, else every event', () => {
    expect(eventsHrefFor('melbourne')).toBe('/events?city=melbourne')
    expect(eventsHrefFor(null)).toBe('/events')
  })
  it('a bare /events follows the chosen city; any filter, a search or All of Australia does not', () => {
    expect(followsChosenCity('')).toBe(true)
    expect(followsChosenCity('?all=1')).toBe(false)
    expect(followsChosenCity('?city=geelong')).toBe(false)
    expect(followsChosenCity('?q=jazz')).toBe(false)
    expect(ALL_OF_AUSTRALIA_HREF).toBe('/events?all=1')
  })
})

describe('the surfaces use it', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  it('the guide records a city choice and its All of Australia link says so', () => {
    const guide = read('src/components/features/city-guide/city-guide.tsx')
    expect(guide).toMatch(/rememberCity\(/)
    expect(guide).toMatch(/ALL_OF_AUSTRALIA_HREF/)
  })
  it('the header and both bottom bars open Browse on the chosen city', () => {
    for (const f of ['src/components/layout/site-header-client.tsx', 'src/components/layout/mobile-bottom-nav.tsx', 'src/components/layout/bottom-nav.tsx']) {
      expect(read(f), f).toMatch(/useChosenEventsHref\(/)
    }
  })
  it('/events follows the chosen city once a session when entered bare', () => {
    expect(read('src/app/events/page.tsx')).toMatch(/<FollowChosenCity \/>/)
  })
})
