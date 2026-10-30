import type { ReactNode } from 'react'
import { VenueMapLazy } from '@/components/features/events/venue-map-lazy'
import { formatVenueWithAddress } from '@/lib/venues/format-venue-address'
import { ACCESS, GET_DIRECTIONS } from '@/lib/walk-in/page-copy'
import { EventSection } from './event-sections'

/** The venue facts an event row carries. */
export type EventVenue = {
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  venue_latitude: number | null
  venue_longitude: number | null
}

/** Google Maps directions to the venue (https://developers.google.com/maps/documentation/urls/get-started). */
export function directionsHref(event: EventVenue): string | null {
  const destination =
    typeof event.venue_latitude === 'number' && typeof event.venue_longitude === 'number'
      ? `${event.venue_latitude},${event.venue_longitude}`
      : formatVenueWithAddress({
          name: event.venue_name,
          address: event.venue_address,
          city: event.venue_city,
          state: event.venue_state,
          country: event.venue_country,
        })
  if (!destination) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/**
 * THE VENUE, ONE COMPONENT ON EVERY EVENT PAGE (the CONTROLLER's 31 October 2026 10:05; Lawal 08:57: the AMCF page
 * showed no map while Michael's did): the map with its pin, then getting there: the venue and its address, or the
 * organiser's own getting-there words; their access notes; Get directions. Each page keeps its own heading.
 * `textSource` marks the organiser's own words for the copy tests (data-text-source).
 */
export function EventVenueSection({
  event,
  heading,
  gettingThere = null,
  accessNotes = null,
  textSource,
  addressStatedAbove = false,
}: {
  event: EventVenue
  heading: ReactNode
  gettingThere?: string | null
  accessNotes?: string | null
  textSource?: string
  /** The page's facts already state the venue and its address: say them once, so only the map and the way there show. */
  addressStatedAbove?: boolean
}) {
  if (!event.venue_name && !event.venue_address && !gettingThere && !accessNotes) return null
  const directions = directionsHref(event)
  const place = [event.venue_name, event.venue_city].filter(Boolean).join(', ')
  const where = gettingThere ?? formatVenueWithAddress({ name: event.venue_name, address: event.venue_address })
  return (
    <section className="flex flex-col gap-2.5 lg:gap-4">
      {heading}
      <EventSection name="map">
        <VenueMapLazy
          bare
          venueName={event.venue_name}
          address={event.venue_address}
          city={event.venue_city}
          state={event.venue_state}
          country={event.venue_country}
          latitude={event.venue_latitude}
          longitude={event.venue_longitude}
        />
      </EventSection>
      <EventSection name="getting-there">
        {addressStatedAbove ? (
          directions && (
            <a href={directions} target="_blank" rel="noopener noreferrer" className="text-[15px] font-bold text-ink-900 underline">
              {GET_DIRECTIONS}
            </a>
          )
        ) : (
          <>
            {/* Phone: one card, the link under it. */}
            <div className="rounded-[var(--radius-card)] bg-white p-4 text-sm leading-[1.6] text-ink-800 lg:hidden">
              {(where || accessNotes) && (
                <p data-text-source={textSource} className="m-0">
                  {[where, accessNotes].filter(Boolean).join(' ')}
                </p>
              )}
            </div>
            {directions && (
              <a href={directions} target="_blank" rel="noopener noreferrer" className="text-[15px] font-bold text-ink-900 underline lg:hidden">
                {GET_DIRECTIONS}
              </a>
            )}
            {/* lg: two cards. */}
            <div className="hidden gap-3 lg:grid lg:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-white p-6">
                {place && <h3 data-text-source={textSource} className="m-0 text-[17px] font-bold text-ink-900">{place}</h3>}
                {(gettingThere || event.venue_address) && (
                  <p data-text-source={textSource} className="m-0 text-[15px] leading-[1.6] text-ink-600">
                    {gettingThere ?? event.venue_address}
                  </p>
                )}
                {directions && (
                  <a href={directions} target="_blank" rel="noopener noreferrer" className="text-[15px] font-bold text-ink-900 underline">
                    {GET_DIRECTIONS}
                  </a>
                )}
              </div>
              {accessNotes && (
                <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-white p-6">
                  <h3 className="m-0 text-[17px] font-bold text-ink-900">{ACCESS}</h3>
                  <p data-text-source={textSource} className="m-0 text-[15px] leading-[1.6] text-ink-600">
                    {accessNotes}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </EventSection>
    </section>
  )
}
