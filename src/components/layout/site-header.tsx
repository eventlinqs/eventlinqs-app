import { detectLocation } from '@/lib/geo/detect'
import { getPickerCities } from '@/lib/locations/picker-cities'
import { SiteHeaderClient } from './site-header-client'

/**
 * SiteHeader - public site top navigation.
 *
 * Server wrapper that resolves the visitor's detected location and the
 * merged (launch-target + DB-distinct) picker city list, then passes
 * both to the client inner.
 */
export async function SiteHeader() {
  const [location, cities] = await Promise.all([
    detectLocation(),
    getPickerCities(),
  ])
  return <SiteHeaderClient location={location} cities={cities} />
}
