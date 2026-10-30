'use client'

import Link from 'next/link'
import { formatVenueAddress } from '@/lib/venues/format-venue-address'
import { OsmAttribution } from '@/components/features/events/osm-attribution'

interface Props {
  venueName: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  /**
   * The map alone, with no venue name or address written on it (the PROJECT MANAGER's 13:10 of 30 October 2026). The
   * event page prints the address once, in its Where card; this card printed it twice more (its plate and its footer),
   * which is how the page read the address three times and more. Open in Maps stays.
   */
  bare?: boolean
}

/**
 * THE EVENT PAGE MAP, BY GOOGLE'S MAPS EMBED API (Lawal's word through the controller's 08:27 (3), 31 October 2026:
 * the map SHOWS on every event page). Google serves the map and its pin in an iframe; the Maps Embed API is "free to use
 * with unlimited requests" with "no daily or usage rate limitations"
 * (https://developers.google.com/maps/documentation/embed/usage-and-billing, last updated 2026-10-28, fetched
 * 31 October 2026). So the event page no longer loads the metered Maps JavaScript API at all, and nothing here runs a
 * script of ours: no loader, no geocoder, no marker. The frame is lazy, so it never competes with the hero for the
 * first paint, and it takes the place by its stored point, else by its address.
 *
 * Without a browser key, or with no place to show, our own plate stands, never an empty frame; 'Open in Maps' is always
 * a plain link to Google Maps.
 */
export function VenueMap({ venueName, address, city, state, country, latitude, longitude, bare = false }: Props) {
  const hasCoords = latitude !== null && longitude !== null
  const placeQuery = [venueName, address, city, state, country].filter(Boolean).join(', ')
  const query = hasCoords ? `${latitude},${longitude}` : placeQuery
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const embedSrc =
    key && query.trim()
      ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&zoom=15`
      : null
  const mapsLink = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery)}`
  // Google's Maps URLs: 'https://www.google.com/maps/dir/?api=1&parameters', destination 'a place name, address, or
  // comma-separated latitude/longitude coordinates' (https://developers.google.com/maps/documentation/urls/get-started,
  // last updated 2026-10-30, fetched 31 October 2026). A plain link: it opens the visitor's own maps, nothing loads here.
  const directionsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query || placeQuery)}`
  // UX1.2: one formatter composes every venue address on the platform, so a
  // city typed into the address field is not printed twice beside the map.
  const fullAddress = formatVenueAddress({ name: venueName, address, city, state, country }) ?? ''

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="relative aspect-[2/1] bg-ink-100">
        {embedSrc ? (
          <iframe
            title={`Map of ${venueName ?? 'the venue'}`}
            src={embedSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              background:
                'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(212,160,23,0.14), transparent 70%), linear-gradient(180deg, #f5f4ef 0%, #e8e6df 100%)',
            }}
          >
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15">
                <svg className="h-6 w-6 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              {!bare && (
                <>
                  <p className="mt-3 font-display text-sm font-semibold text-ink-900">
                    {venueName ?? 'Venue'}
                  </p>
                  {fullAddress && <p className="mt-1 text-xs text-ink-600">{fullAddress}</p>}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          {!bare && venueName && (
            <p className="font-display text-sm font-bold text-ink-900 line-clamp-1">{venueName}</p>
          )}
          {!bare && fullAddress && (
            <p className="text-xs text-ink-600 line-clamp-2">{fullAddress}</p>
          )}
          {(hasCoords || placeQuery.trim().length > 0) && <OsmAttribution className="mt-1" />}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Link
            href={directionsLink}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition-colors hover:border-gold-400 hover:text-[var(--brand-accent-strong)]"
          >
            Get directions
          </Link>
          <Link
            href={mapsLink}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition-colors hover:border-gold-400 hover:text-[var(--brand-accent-strong)]"
          >
            Open in Maps
          </Link>
        </div>
      </div>
    </div>
  )
}
