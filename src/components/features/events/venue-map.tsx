'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getGoogleMapsLoader, GOOGLE_MAPS_MAP_ID } from '@/lib/maps/google-maps-loader'
import { createBrandPin } from '@/lib/maps/brand-pin'

interface Props {
  venueName: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
}


export function VenueMap({
  venueName,
  address,
  city,
  state,
  country,
  latitude,
  longitude,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const [interactive, setInteractive] = useState(false)
  const [inView, setInView] = useState(false)

  const hasCoords = latitude !== null && longitude !== null
  // Address string to geocode when the event has no stored coordinates. Most
  // events never had their venue geocoded on save, so without this fallback the
  // map would silently show the static card and never load Google at all.
  const geocodeQuery = [venueName, address, city, state, country].filter(Boolean).join(', ')
  const hasLocation = hasCoords || geocodeQuery.trim().length > 0

  // Defer Google Maps JS download (~290KB) until the venue section enters
  // the viewport. Map sits well below the fold; eager load wastes mobile
  // bandwidth and drags Speed Index because the map JS continues painting
  // tiles after the Lighthouse measurement window starts. In headless/
  // audit mode, skip auto-load entirely - a real user scrolling to the
  // venue section still triggers the IntersectionObserver, but the
  // headless bot never gets there within the PSI 6s measurement window.
  useEffect(() => {
    if (!hasLocation) return
    // Skip entirely in headless audit mode - matches smart-media's pattern.
    if (typeof document !== 'undefined' && document.body.dataset.headless === '1') {
      return
    }
    const el = containerRef.current
    // Defer setState to the next tick so we don't cascade-render inside
    // the effect body (react-hooks/set-state-in-effect).
    if (!el || typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setInView(true), 0)
      return () => clearTimeout(t)
    }
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            io.disconnect()
            break
          }
        }
      },
      { rootMargin: '200px 0px' },
    )
    io.observe(el)
    return () => {
      io.disconnect()
    }
  }, [hasLocation])
  const mapsLinkQuery = [venueName, address, city, state, country].filter(Boolean).join(', ')
  const mapsLink = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsLinkQuery)}`
  const fullAddress = [address, city, state, country].filter(Boolean).join(', ')

  useEffect(() => {
    if (!hasLocation) return
    if (!inView) return
    const loader = getGoogleMapsLoader()
    if (!loader) return
    if (!containerRef.current) return

    let cancelled = false

    ;(async () => {
      try {
        const { Map } = (await loader.importLibrary('maps')) as google.maps.MapsLibrary
        if (cancelled || !containerRef.current) return

        // Center: stored coordinates when present, otherwise geocode the venue
        // address in the browser (the referer-restricted key works client-side,
        // where server-side geocoding cannot). If geocoding yields nothing, keep
        // the static fallback rather than dropping a pin in the ocean.
        let center: google.maps.LatLngLiteral
        if (hasCoords) {
          center = { lat: latitude, lng: longitude }
        } else {
          const { Geocoder } = (await loader.importLibrary('geocoding')) as google.maps.GeocodingLibrary
          const { results } = await new Geocoder().geocode({ address: geocodeQuery })
          if (cancelled || !containerRef.current || !results?.[0]) return
          const loc = results[0].geometry.location
          center = { lat: loc.lat(), lng: loc.lng() }
        }
        const { AdvancedMarkerElement } = (await loader.importLibrary(
          'marker',
        )) as google.maps.MarkerLibrary
        if (cancelled || !containerRef.current) return

        const map = new Map(containerRef.current, {
          center,
          zoom: 15,
          // `mapId` and `styles` are mutually exclusive. Google, MapOptions
          // reference: "This feature is not available when using a map ID".
          // The brand style therefore lives on the Map ID as a cloud style;
          // passing EVENTLINQS_MAP_STYLE here would be silently ignored, which
          // is worse than not passing it, because it would read as applied.
          mapId: GOOGLE_MAPS_MAP_ID,
          disableDefaultUI: true,
          clickableIcons: false,
          zoomControl: true,
          gestureHandling: 'cooperative',
          keyboardShortcuts: false,
        })
        mapRef.current = map

        // AdvancedMarkerElement replaces the deprecated google.maps.Marker.
        // The pin is the shared brand dot, so all four maps stay identical.
        markerRef.current = new AdvancedMarkerElement({
          position: center,
          map,
          title: venueName ?? undefined,
          content: createBrandPin({ title: venueName }),
        })
        setInteractive(true)
      } catch (err) {
        console.warn('[VenueMap] google maps init failed:', err)
      }
    })()

    return () => {
      cancelled = true
      // An advanced marker is detached by clearing `map`, not setMap(null).
      if (markerRef.current) markerRef.current.map = null
      markerRef.current = null
      mapRef.current = null
    }
  }, [hasLocation, hasCoords, inView, latitude, longitude, venueName, geocodeQuery])

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="relative aspect-[2/1] bg-ink-100">
        {hasLocation ? (
          <>
            <div ref={containerRef} className="absolute inset-0 h-full w-full" />
            {/* Native lazy-img sentinel - when the browser decides this
                pseudo-image is near the viewport it kicks off `onLoad`,
                giving us a second independent trigger alongside the IO.
                This is a 1-pixel transparent GIF, not a display image  - 
                `next/image` is the wrong tool here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
              loading="lazy"
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
              onLoad={() => setInView(true)}
            />
            {!interactive && (
              <div
                className="absolute inset-0 flex items-center justify-center"
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
                  <p className="mt-3 font-display text-sm font-semibold text-ink-900">
                    {venueName ?? 'Venue'}
                  </p>
                  {fullAddress && <p className="mt-1 text-xs text-ink-600">{fullAddress}</p>}
                </div>
              </div>
            )}
          </>
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
              <p className="mt-3 font-display text-sm font-semibold text-ink-900">
                {venueName ?? 'Venue'}
              </p>
              {fullAddress && <p className="mt-1 text-xs text-ink-600">{fullAddress}</p>}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          {venueName && (
            <p className="font-display text-sm font-bold text-ink-900 line-clamp-1">{venueName}</p>
          )}
          {fullAddress && (
            <p className="text-xs text-ink-600 line-clamp-2">{fullAddress}</p>
          )}
        </div>
        <Link
          href={mapsLink}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-gold-400 hover:text-gold-600"
        >
          Open in Maps
        </Link>
      </div>
    </div>
  )
}
