import { describe, it, expect } from 'vitest'
import {
  SUBURB_MATCH_RADIUS_KM,
  distanceKm,
  resolveSuburbSlug,
} from '@/lib/cities/resolve-suburb'
import { getAllSuburbs, getCity, getSuburb } from '@/lib/cities/data'

/**
 * THE DEFECT. `events.suburb_primary` was never written by anything, so every
 * suburb landing page was permanently empty of organiser events. The page hid
 * that by selecting every event in the CITY instead, which meant
 * /city/melbourne/inner-melbourne and /city/melbourne/bayside rendered the
 * identical list, each claiming to be that district's events.
 *
 * THE RULE THIS TESTS. A suburb cannot be derived from a city name, and the
 * districts the platform ships are not names any organiser types. What is real
 * is the venue's coordinates and the district centroids in the suburbs table.
 */
describe('suburb resolution', () => {
  describe('the honest refusals', () => {
    it('returns null with no coordinates, rather than guessing from the city', () => {
      expect(resolveSuburbSlug({ citySlug: 'melbourne', latitude: null, longitude: null })).toBeNull()
      expect(resolveSuburbSlug({ citySlug: 'melbourne', latitude: undefined, longitude: undefined })).toBeNull()
    })

    it('returns null with no city, so a venue near a boundary is never filed under the next city', () => {
      expect(resolveSuburbSlug({ citySlug: null, latitude: -37.8136, longitude: 144.9631 })).toBeNull()
    })

    it('returns null for a city that ships no districts', () => {
      // Only tier-1 cities carry suburb pages. Bendigo has none, so an event
      // there resolves to no district rather than to the nearest one anywhere.
      expect(getCity('bendigo')?.suburbs).toEqual([])
      expect(resolveSuburbSlug({ citySlug: 'bendigo', latitude: -36.7570, longitude: 144.2794 })).toBeNull()
    })

    it('returns null when nothing is within the radius', () => {
      // Melbourne coordinates, but far out past every Melbourne district.
      expect(resolveSuburbSlug({ citySlug: 'melbourne', latitude: -38.6, longitude: 146.5 })).toBeNull()
    })

    it('rejects non-finite coordinates instead of computing a distance from them', () => {
      expect(resolveSuburbSlug({ citySlug: 'melbourne', latitude: Number.NaN, longitude: 144.9 })).toBeNull()
      expect(resolveSuburbSlug({ citySlug: 'melbourne', latitude: Number.POSITIVE_INFINITY, longitude: 144.9 })).toBeNull()
    })
  })

  describe('the resolutions', () => {
    it('resolves a venue at a district centroid to that district', () => {
      for (const suburb of getAllSuburbs()) {
        expect(
          resolveSuburbSlug({
            citySlug: suburb.citySlug,
            latitude: suburb.latitude,
            longitude: suburb.longitude,
          }),
          suburb.slug,
        ).toBe(suburb.slug)
      }
    })

    it('picks the NEAREST district, not merely one in range', () => {
      const bayside = getSuburb('melbourne-bayside')!
      // A point nudged towards Bayside from its own centroid must still be
      // Bayside even though Inner Melbourne is also a Melbourne district.
      const resolved = resolveSuburbSlug({
        citySlug: 'melbourne',
        latitude: bayside.latitude - 0.01,
        longitude: bayside.longitude,
      })
      expect(resolved).toBe('melbourne-bayside')
    })

    it('never returns a district belonging to another city', () => {
      // Sydney coordinates asserted under Melbourne: the city restriction has
      // to win, so the answer is null rather than a Sydney district.
      const sydney = getSuburb('sydney-inner-west')!
      expect(
        resolveSuburbSlug({ citySlug: 'melbourne', latitude: sydney.latitude, longitude: sydney.longitude }),
      ).toBeNull()
    })

    it('only ever returns a district of the city it was given', () => {
      for (const suburb of getAllSuburbs()) {
        const resolved = resolveSuburbSlug({
          citySlug: suburb.citySlug,
          latitude: suburb.latitude,
          longitude: suburb.longitude,
        })
        expect(resolved).not.toBeNull()
        expect(getSuburb(resolved!)?.citySlug).toBe(suburb.citySlug)
      }
    })
  })

  describe('distanceKm', () => {
    it('is zero for a point against itself', () => {
      expect(distanceKm(-37.8136, 144.9631, -37.8136, 144.9631)).toBeCloseTo(0, 6)
    })

    it('gives the known Melbourne to Sydney great-circle distance', () => {
      // About 714 km. A wrong formula (flat earth, swapped arguments, degrees
      // for radians) misses this by hundreds of kilometres.
      expect(distanceKm(-37.8136, 144.9631, -33.8688, 151.2093)).toBeGreaterThan(700)
      expect(distanceKm(-37.8136, 144.9631, -33.8688, 151.2093)).toBeLessThan(730)
    })

    it('is symmetric', () => {
      const a = distanceKm(-37.8136, 144.9631, -33.8688, 151.2093)
      const b = distanceKm(-33.8688, 151.2093, -37.8136, 144.9631)
      expect(a).toBeCloseTo(b, 9)
    })
  })

  describe('the districts themselves', () => {
    it('every district a city lists resolves and belongs to that city', () => {
      for (const suburb of getAllSuburbs()) {
        const city = getCity(suburb.citySlug)
        expect(city, suburb.slug).not.toBeNull()
        expect(city!.suburbs).toContain(suburb.slug)
      }
    })

    it('no two districts of one city share a centroid, or one could never be reached', () => {
      const byCity = new Map<string, typeof suburbs>()
      const suburbs = getAllSuburbs()
      for (const s of suburbs) {
        byCity.set(s.citySlug, [...(byCity.get(s.citySlug) ?? []), s])
      }
      for (const [city, districts] of byCity) {
        for (let i = 0; i < districts.length; i++) {
          for (let j = i + 1; j < districts.length; j++) {
            const apart = distanceKm(
              districts[i].latitude,
              districts[i].longitude,
              districts[j].latitude,
              districts[j].longitude,
            )
            expect(apart, `${city}: ${districts[i].slug} vs ${districts[j].slug}`).toBeGreaterThan(0)
          }
        }
      }
    })

    it('the radius is the one the filter and the landing page share', () => {
      expect(SUBURB_MATCH_RADIUS_KM).toBe(12)
    })
  })
})
