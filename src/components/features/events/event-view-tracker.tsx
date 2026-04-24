'use client'

import { useEffect } from 'react'
import { trackEventView } from '@/lib/analytics/plausible'

interface Props {
  eventId: string
  eventTitle: string
  category: string
  venueCity: string
  priceRange: string
}

export function EventViewTracker({
  eventId,
  eventTitle,
  category,
  venueCity,
  priceRange,
}: Props) {
  useEffect(() => {
    trackEventView({
      event_id: eventId,
      event_title: eventTitle,
      category,
      venue_city: venueCity,
      price_range: priceRange,
    })
  }, [eventId, eventTitle, category, venueCity, priceRange])

  return null
}
