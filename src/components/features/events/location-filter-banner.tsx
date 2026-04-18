'use client'

import { LocationPicker } from '@/components/ui/location-picker'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * LocationFilterBanner — small strip above the homepage lineup that
 * tells the visitor which city is filtering their results and lets them
 * change it. The "Change city" button is a real LocationPicker trigger,
 * so the cookie is updated and the page re-renders with the new city.
 */

interface Props {
  location: DetectedLocation
  filteredActive: boolean
}

export function LocationFilterBanner({ location, filteredActive }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
      <span>
        {filteredActive
          ? `Showing events in ${location.city}.`
          : `Not many events in ${location.city} yet — showing everything.`}
      </span>
      <LocationPicker currentLocation={location} variant="pill" />
    </div>
  )
}
