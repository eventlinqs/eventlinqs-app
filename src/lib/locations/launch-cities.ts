/**
 * Curated 32-city launch list for the EventLinqs location picker and
 * /events/browse/{city-slug} path-based routing. Chosen for African
 * diaspora community density rather than raw population — Ticketmaster's
 * city list is generic; ours is cultural.
 *
 * These cities ALWAYS appear in the picker and sitemap regardless of
 * current event count, so they accumulate Google authority for when
 * events arrive. Cities with zero events remain clickable and land
 * on the empty-state page.
 */

export type LaunchCity = {
  city: string
  slug: string
  country: string
  countryCode: string
  latitude: number
  longitude: number
  isAustralia: boolean
}

export const LAUNCH_TARGET_CITIES: readonly LaunchCity[] = [
  // Australia — 13 cities, sorted roughly by population
  { city: 'Melbourne',     slug: 'melbourne',     country: 'Australia', countryCode: 'AU', latitude: -37.8136, longitude: 144.9631, isAustralia: true },
  { city: 'Sydney',        slug: 'sydney',        country: 'Australia', countryCode: 'AU', latitude: -33.8688, longitude: 151.2093, isAustralia: true },
  { city: 'Brisbane',      slug: 'brisbane',      country: 'Australia', countryCode: 'AU', latitude: -27.4698, longitude: 153.0251, isAustralia: true },
  { city: 'Perth',         slug: 'perth',         country: 'Australia', countryCode: 'AU', latitude: -31.9523, longitude: 115.8613, isAustralia: true },
  { city: 'Adelaide',      slug: 'adelaide',      country: 'Australia', countryCode: 'AU', latitude: -34.9285, longitude: 138.6007, isAustralia: true },
  { city: 'Gold Coast',    slug: 'gold-coast',    country: 'Australia', countryCode: 'AU', latitude: -28.0167, longitude: 153.4000, isAustralia: true },
  { city: 'Newcastle',     slug: 'newcastle',     country: 'Australia', countryCode: 'AU', latitude: -32.9283, longitude: 151.7817, isAustralia: true },
  { city: 'Wollongong',    slug: 'wollongong',    country: 'Australia', countryCode: 'AU', latitude: -34.4278, longitude: 150.8931, isAustralia: true },
  { city: 'Geelong',       slug: 'geelong',       country: 'Australia', countryCode: 'AU', latitude: -38.1499, longitude: 144.3617, isAustralia: true },
  { city: 'Hobart',        slug: 'hobart',        country: 'Australia', countryCode: 'AU', latitude: -42.8821, longitude: 147.3272, isAustralia: true },
  { city: 'Canberra',      slug: 'canberra',      country: 'Australia', countryCode: 'AU', latitude: -35.2809, longitude: 149.1300, isAustralia: true },
  { city: 'Darwin',        slug: 'darwin',        country: 'Australia', countryCode: 'AU', latitude: -12.4634, longitude: 130.8456, isAustralia: true },
  { city: 'Cairns',        slug: 'cairns',        country: 'Australia', countryCode: 'AU', latitude: -16.9186, longitude: 145.7781, isAustralia: true },

  // New Zealand
  { city: 'Auckland',      slug: 'auckland',      country: 'New Zealand', countryCode: 'NZ', latitude: -36.8485, longitude: 174.7633, isAustralia: false },

  // United Kingdom
  { city: 'London',        slug: 'london',        country: 'United Kingdom', countryCode: 'GB', latitude: 51.5074, longitude:  -0.1278, isAustralia: false },
  { city: 'Manchester',    slug: 'manchester',    country: 'United Kingdom', countryCode: 'GB', latitude: 53.4808, longitude:  -2.2426, isAustralia: false },
  { city: 'Birmingham',    slug: 'birmingham',    country: 'United Kingdom', countryCode: 'GB', latitude: 52.4862, longitude:  -1.8904, isAustralia: false },

  // Ireland
  { city: 'Dublin',        slug: 'dublin',        country: 'Ireland', countryCode: 'IE', latitude: 53.3498, longitude: -6.2603, isAustralia: false },

  // Canada
  { city: 'Toronto',       slug: 'toronto',       country: 'Canada', countryCode: 'CA', latitude: 43.6532, longitude: -79.3832, isAustralia: false },
  { city: 'Montreal',      slug: 'montreal',      country: 'Canada', countryCode: 'CA', latitude: 45.5017, longitude: -73.5673, isAustralia: false },
  { city: 'Ottawa',        slug: 'ottawa',        country: 'Canada', countryCode: 'CA', latitude: 45.4215, longitude: -75.6972, isAustralia: false },

  // United States
  { city: 'New York',      slug: 'new-york',      country: 'United States', countryCode: 'US', latitude: 40.7128, longitude: -74.0060, isAustralia: false },
  { city: 'Houston',       slug: 'houston',       country: 'United States', countryCode: 'US', latitude: 29.7604, longitude: -95.3698, isAustralia: false },
  { city: 'Atlanta',       slug: 'atlanta',       country: 'United States', countryCode: 'US', latitude: 33.7490, longitude: -84.3880, isAustralia: false },
  { city: 'Washington DC', slug: 'washington-dc', country: 'United States', countryCode: 'US', latitude: 38.9072, longitude: -77.0369, isAustralia: false },
  { city: 'Minneapolis',   slug: 'minneapolis',   country: 'United States', countryCode: 'US', latitude: 44.9778, longitude: -93.2650, isAustralia: false },

  // Africa
  { city: 'Lagos',         slug: 'lagos',         country: 'Nigeria',      countryCode: 'NG', latitude:   6.5244, longitude:   3.3792, isAustralia: false },
  { city: 'Abuja',         slug: 'abuja',         country: 'Nigeria',      countryCode: 'NG', latitude:   9.0765, longitude:   7.3986, isAustralia: false },
  { city: 'Accra',         slug: 'accra',         country: 'Ghana',        countryCode: 'GH', latitude:   5.6037, longitude:  -0.1870, isAustralia: false },
  { city: 'Nairobi',       slug: 'nairobi',       country: 'Kenya',        countryCode: 'KE', latitude:  -1.2921, longitude:  36.8219, isAustralia: false },
  { city: 'Johannesburg',  slug: 'johannesburg',  country: 'South Africa', countryCode: 'ZA', latitude: -26.2041, longitude:  28.0473, isAustralia: false },

  // UAE
  { city: 'Dubai',         slug: 'dubai',         country: 'United Arab Emirates', countryCode: 'AE', latitude: 25.2048, longitude: 55.2708, isAustralia: false },
]

const BY_SLUG = new Map(LAUNCH_TARGET_CITIES.map(c => [c.slug, c]))

export function findLaunchCityBySlug(slug: string): LaunchCity | null {
  return BY_SLUG.get(slug.toLowerCase()) ?? null
}

export function toCitySlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
