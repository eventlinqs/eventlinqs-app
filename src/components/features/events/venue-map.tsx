'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getGoogleMapsLoader } from '@/lib/maps/google-maps-loader'
import { EVENTLINQS_MAP_STYLE } from '@/lib/maps/google-maps-style'

interface Props {
  venueName: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
}

const BRAND_GOLD = '#D4AF37'

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
  const markerRef = useRef<google.maps.Marker | null>(null)
  const [interactive, setInteractive] = useState(false)
  const [inView, setInView] = useState(false)

  const hasCoords = latitude !== null && longitude !== null

  // Defer Google Maps JS download (~290KB) until the venue section nears
  // the viewport. On event detail the map sits well below the fold, so
  // eagerly loading on mount wastes mobile bandwidth and pushes LCP.
  // Triple-trigger for reliability: IntersectionObserver with wide margin,
  // 2s fallback so we never stall if the observer never fires, and the
  // native lazy-img sentinel below as a secondary trigger.
  useEffect(() => {
    if (!hasCoords) return
    const el = containerRef.current
    if (!el) {
      setInView(true)
      return
    }
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
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
      { rootMargin: '1000px 0px' },
    )
    io.observe(el)
    const fallback = window.setTimeout(() => setInView(true), 2000)
    return () => {
      io.disconnect()
      window.clearTimeout(fallback)
    }
  }, [hasCoords])
  const mapsLinkQuery = [venueName, address, city, state, country].filter(Boolean).join(', ')
  const mapsLink = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsLinkQuery)}`
  const fullAddress = [address, city, state, country].filter(Boolean).join(', ')

  useEffect(() => {
    if (!hasCoords) return
    if (!inView) return
    const loader = getGoogleMapsLoader()
    if (!loader) return
    if (!containerRef.current) return

    let cancelled = false

    ;(async () => {
      try {
        const { Map } = (await loader.importLibrary('maps')) as google.maps.MapsLibrary
        if (cancelled || !containerRef.current) return

        const center = { lat: latitude, lng: longitude }
        const map = new Map(containerRef.current, {
          center,
          zoom: 15,
          styles: EVENTLINQS_MAP_STYLE,
          disableDefaultUI: true,
          clickableIcons: false,
          zoomControl: true,
          gestureHandling: 'cooperative',
          keyboardShortcuts: false,
        })
        mapRef.current = map

        markerRef.current = new google.maps.Marker({
          position: center,
          map,
          title: venueName ?? undefined,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: BRAND_GOLD,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        })
        setInteractive(true)
      } catch (err) {
        console.warn('[VenueMap] google maps init failed:', err)
      }
    })()

    return () => {
      cancelled = true
      markerRef.current?.setMap(null)
      markerRef.current = null
      mapRef.current = null
    }
  }, [hasCoords, inView, latitude, longitude, venueName])

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="relative aspect-[2/1] bg-ink-100">
        {hasCoords ? (
          <>
            <div ref={containerRef} className="absolute inset-0 h-full w-full" />
            {/* Native lazy-img sentinel — when the browser decides this
                pseudo-image is near the viewport it kicks off `onLoad`,
                giving us a second independent trigger alongside the IO. */}
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
