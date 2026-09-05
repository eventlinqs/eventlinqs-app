import { describe, expect, test } from 'vitest'
import { getAllCities } from '@/lib/cities/data'
import { distanceKm } from '@/lib/cities/resolve-suburb'
import { CITY_MATCH_RADIUS_KM, resolveCityClaim, resolveCitySlugFromCoordinates } from '@/lib/cities/resolve'

/**
 * A Places pick reports the suburb as the locality, so the city claim must be
 * able to come from the coordinates. These pin the rule and the radius.
 */
describe('resolveCitySlugFromCoordinates', () => {
  test('the radius is below half the closest pair of canonical cities, so the nearest city is never ambiguous', () => {
    const cities = getAllCities()
    let closest = Number.POSITIVE_INFINITY
    for (let i = 0; i < cities.length; i += 1) {
      for (let j = i + 1; j < cities.length; j += 1) {
        const a = cities[i]
        const b = cities[j]
        closest = Math.min(closest, distanceKm(a.latitude, a.longitude, b.latitude, b.longitude))
      }
    }
    expect(closest).toBeGreaterThan(CITY_MATCH_RADIUS_KM * 2)
  })

  test('a Fitzroy venue resolves to melbourne; a Newtown venue to sydney; a Fortitude Valley venue to brisbane', () => {
    expect(resolveCitySlugFromCoordinates(-37.7996, 144.9784)).toBe('melbourne')
    expect(resolveCitySlugFromCoordinates(-33.8978, 151.1785)).toBe('sydney')
    expect(resolveCitySlugFromCoordinates(-27.4577, 153.0342)).toBe('brisbane')
  })

  test('a venue in the country between cities resolves to nothing', () => {
    // The centre of the continent, hundreds of kilometres from every canonical city.
    expect(resolveCitySlugFromCoordinates(-25.0, 133.0)).toBeNull()
    expect(resolveCitySlugFromCoordinates(null, 144.9)).toBeNull()
    expect(resolveCitySlugFromCoordinates(Number.NaN, 144.9)).toBeNull()
  })
})

describe('resolveCityClaim', () => {
  test('a typed canonical city wins even without coordinates', () => {
    expect(resolveCityClaim('Melbourne', null, null)).toBe('melbourne')
  })

  test('a suburb locality falls through to the coordinates', () => {
    expect(resolveCityClaim('Fitzroy', -37.7996, 144.9784)).toBe('melbourne')
  })

  test('a suburb locality with no coordinates stays unclaimed, which is the honest state', () => {
    expect(resolveCityClaim('Fitzroy', null, null)).toBeNull()
  })
})
