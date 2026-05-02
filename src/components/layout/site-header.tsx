import { MELBOURNE_FALLBACK } from '@/lib/geo/detect'
import { getPickerCities } from '@/lib/locations/picker-cities'
import { SiteHeaderClient } from './site-header-client'

/**
 * SiteHeader - public site top navigation.
 *
 * Server wrapper. Resolves the picker city list (cached) and hands it to
 * the client inner along with a default location. The client inner self-
 * hydrates the displayed location from the `el_city` cookie post-mount,
 * which keeps this header free of `cookies()`/`headers()` reads. Without
 * that, every page with the site header would be forced into dynamic
 * SSR and lose ISR / static-generation eligibility.
 */
export async function SiteHeader() {
  const cities = await getPickerCities()
  return <SiteHeaderClient location={MELBOURNE_FALLBACK} cities={cities} />
}
