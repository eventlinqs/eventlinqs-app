import { LocationPicker } from '@/components/ui/location-picker'
import { getPickerCities } from '@/lib/locations/picker-cities'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * LocationFilterBanner — small strip above the homepage lineup that
 * tells the visitor which city is filtering their results and lets them
 * change it. The "Change city" button is a real LocationPicker trigger,
 * so the cookie is updated and the page re-renders with the new city.
 *
 * Server component: fetches the merged picker cities server-side
 * (cached) and passes them to the client picker.
 */

interface Props {
  location: DetectedLocation
  filteredActive: boolean
}

export async function LocationFilterBanner({ location, filteredActive }: Props) {
  const cities = await getPickerCities()
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
      <span>
        {filteredActive
          ? `Showing events in ${location.city}.`
          : `Not many events in ${location.city} yet — showing everything.`}
      </span>
      <LocationPicker currentLocation={location} cities={cities} variant="pill" />
    </div>
  )
}
