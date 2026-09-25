import { LocationPicker } from '@/components/ui/location-picker'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * LocationFilterBanner - small strip above the homepage lineup that
 * tells the visitor which city is filtering their results and lets them
 * change it. The "Change city" button is a real LocationPicker trigger,
 * so the cookie is updated and the page re-renders with the new city.
 *
 * Server component. It USED to fetch the merged picker catalogue and pass it
 * to the client picker, which put that catalogue in the homepage document a
 * third time on top of the header's two copies. The dialog fetches its own
 * list on intent now; this component only says which city is filtering.
 */

interface Props {
  location: DetectedLocation
  filteredActive: boolean
}

export async function LocationFilterBanner({ location, filteredActive }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
      <span>
        {filteredActive
          ? `Showing events in ${location.city}.`
          : `Not many events in ${location.city} yet - showing everything.`}
      </span>
      <LocationPicker currentLocation={location} variant="pill" />
    </div>
  )
}
