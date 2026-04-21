import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  LAUNCH_TARGET_CITIES,
  toCitySlug,
  type LaunchCity,
} from './launch-cities'

/**
 * Merged picker city list: 32 curated launch targets ∪ every distinct
 * venue_city currently present in the published catalogue. Cached for
 * 1h via unstable_cache. Invalidated on event create/update/publish by
 * calling revalidateTag('picker-cities') in those server actions.
 *
 * Shape returned groups Australia first (always the AU section of the
 * picker) and everything else grouped by country name (the "Global
 * diaspora cities" expander). No event counts — counts appear on the
 * results page only (competitor-aligned with Ticketmaster, DICE,
 * Eventbrite).
 */
export type PickerCity = {
  city: string
  slug: string
  country: string
  countryCode: string | null
  latitude: number | null
  longitude: number | null
  /** True when the slug matches a LAUNCH_TARGET_CITIES entry. */
  isLaunchCity: boolean
}

export type PickerCityGroups = {
  australia: PickerCity[]
  internationalByCountry: Array<{ country: string; cities: PickerCity[] }>
  /** Every valid picker slug, flattened — used for /events/browse/[city] validation. */
  validSlugs: string[]
}

function launchToPicker(c: LaunchCity): PickerCity {
  return {
    city: c.city,
    slug: c.slug,
    country: c.country,
    countryCode: c.countryCode,
    latitude: c.latitude,
    longitude: c.longitude,
    isLaunchCity: true,
  }
}

async function buildPickerCitiesRaw(): Promise<PickerCityGroups> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('events')
    .select('venue_city, venue_country')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .not('venue_city', 'is', null)

  const bySlug = new Map<string, PickerCity>()
  for (const c of LAUNCH_TARGET_CITIES) {
    bySlug.set(c.slug, launchToPicker(c))
  }

  for (const row of data ?? []) {
    const cityName = row.venue_city?.trim()
    if (!cityName) continue
    const slug = toCitySlug(cityName)
    if (!slug) continue
    if (bySlug.has(slug)) continue
    bySlug.set(slug, {
      city: cityName,
      slug,
      country: row.venue_country ?? 'Other',
      countryCode: null,
      latitude: null,
      longitude: null,
      isLaunchCity: false,
    })
  }

  const all = Array.from(bySlug.values())
  const australia = all
    .filter(c => c.country === 'Australia')
    .sort((a, b) => a.city.localeCompare(b.city))
  const rest = all.filter(c => c.country !== 'Australia')

  const countryMap = new Map<string, PickerCity[]>()
  for (const c of rest) {
    const list = countryMap.get(c.country) ?? []
    list.push(c)
    countryMap.set(c.country, list)
  }
  const internationalByCountry = Array.from(countryMap.entries())
    .map(([country, cities]) => ({
      country,
      cities: cities.sort((a, b) => a.city.localeCompare(b.city)),
    }))
    .sort((a, b) => a.country.localeCompare(b.country))

  return {
    australia,
    internationalByCountry,
    validSlugs: all.map(c => c.slug),
  }
}

const getPickerCitiesCached = unstable_cache(
  buildPickerCitiesRaw,
  ['picker-cities'],
  { revalidate: 60 * 60, tags: ['picker-cities'] },
)

export async function getPickerCities(): Promise<PickerCityGroups> {
  return getPickerCitiesCached()
}
