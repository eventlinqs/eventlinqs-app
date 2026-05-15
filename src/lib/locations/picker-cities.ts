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
 * cities" expander). No event counts - counts appear on the results
 * page only (competitor-aligned with Ticketmaster, DICE, Eventbrite).
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
  /** Every valid picker slug, flattened - used for /events/browse/[city] validation. */
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
  // Admin client may be unavailable during build (CI has placeholder env with
  // no SUPABASE_SERVICE_ROLE_KEY). Fall through to launch-target cities only;
  // DB-sourced cities fill in at runtime once ISR revalidates.
  //
  // Batch 11.0 Round 3 AU-first launch lock: filter DB-sourced cities to
  // `venue_country = 'Australia'`. Without this guard, an organiser
  // seeding a London event would add `london` back to the picker even
  // after the LAUNCH_TARGET_CITIES list was trimmed to AU. The cities
  // table itself has a `country = 'AU'` check constraint at the DB
  // layer; this client-side filter is belt-and-braces.
  //
  // Batch 11.1 D1 root-cause expansion: pull from `public.cities`
  // directly (not just `events.venue_city`). Without this, any city
  // that exists in the cities table but has no published event yet
  // (Toowoomba, Bendigo, Launceston, Sunshine Coast, Townsville,
  // Ballarat, Albury at the time of fix) was absent from the picker
  // even though it had a valid /city/[slug] landing page. The picker
  // now reflects every AU city the platform supports.
  let eventRows: Array<{ venue_city: string | null; venue_country: string | null }> = []
  let citiesRows: Array<{ slug: string; name: string; state: string; country: string | null; latitude: number | null; longitude: number | null }> = []
  try {
    const supabase = createAdminClient()
    const [eventsResult, citiesResult] = await Promise.all([
      supabase
        .from('events')
        .select('venue_city, venue_country')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .eq('venue_country', 'Australia')
        .not('venue_city', 'is', null),
      supabase
        .from('cities')
        .select('slug, name, state, country, latitude, longitude')
        .eq('country', 'AU')
        .order('slug', { ascending: true }),
    ])
    eventRows = eventsResult.data ?? []
    citiesRows = citiesResult.data ?? []
  } catch {
    eventRows = []
    citiesRows = []
  }

  const bySlug = new Map<string, PickerCity>()
  for (const c of LAUNCH_TARGET_CITIES) {
    bySlug.set(c.slug, launchToPicker(c))
  }

  // Cities table is the authoritative AU city list. Add every row not
  // already in bySlug so the picker covers every supported city.
  for (const row of citiesRows) {
    if (!row.slug) continue
    if (bySlug.has(row.slug)) continue
    bySlug.set(row.slug, {
      city: row.name,
      slug: row.slug,
      country: 'Australia',
      countryCode: 'AU',
      latitude: row.latitude,
      longitude: row.longitude,
      isLaunchCity: false,
    })
  }

  // Backstop: any organiser-seeded venue_city not yet in `cities` (e.g.
  // a regional venue that hasn't been added to the taxonomy) still
  // surfaces in the picker as a launch-candidate.
  for (const row of eventRows) {
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
