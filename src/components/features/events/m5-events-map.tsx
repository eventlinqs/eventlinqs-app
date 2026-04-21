'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPinOff } from 'lucide-react'
import { loadEventsInBbox } from '@/app/events/actions'
import { getGoogleMapsLoader } from '@/lib/maps/google-maps-loader'
import { EVENTLINQS_MAP_STYLE } from '@/lib/maps/google-maps-style'
import type { EventsSearchParams } from '@/lib/events/search-params'
import type { MapEventPoint } from './m5-events-map-types'

type Props = {
  params: EventsSearchParams
  initialCenter: { lat: number; lng: number }
}

const DEFAULT_ZOOM = 5
const REFETCH_DEBOUNCE_MS = 400
const BRAND_GOLD = '#D4AF37'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatPrice(p: MapEventPoint): string {
  if (p.is_free) return 'Free'
  if (p.starting_from_cents === null) return 'Free'
  const dollars = p.starting_from_cents / 100
  const amount = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `From ${p.currency} ${amount}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildInfoWindowHTML(p: MapEventPoint): string {
  const city = p.venue_city ? ` · ${escapeHtml(p.venue_city)}` : ''
  return `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; min-width: 200px; max-width: 240px;">
      <p style="margin:0; font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#B8860B;">${escapeHtml(formatDate(p.start_date))}${city}</p>
      <h3 style="margin:4px 0 0; font-size:14px; font-weight:700; line-height:1.3; color:#0F172A;">${escapeHtml(p.title)}</h3>
      <p style="margin:4px 0 0; font-size:12px; font-weight:600; color:#0F172A;">${escapeHtml(formatPrice(p))}</p>
      <a href="/events/${encodeURIComponent(p.slug)}" style="display:inline-block; margin-top:8px; font-size:12px; font-weight:600; color:#B8860B; text-decoration:none;">View event →</a>
    </div>
  `
}

function MapUnavailable({ reason }: { reason: string }) {
  return (
    <div
      role="status"
      className="mx-auto flex max-w-7xl flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <MapPinOff aria-hidden="true" className="h-7 w-7" />
      </div>
      <h3 className="font-display text-base font-semibold text-ink-900">
        Map view is temporarily unavailable
      </h3>
      <p className="mt-1 max-w-sm text-sm text-ink-400">
        {reason} Use the grid for now.
      </p>
    </div>
  )
}

type ClustererHandle = {
  clearMarkers: () => void
  addMarkers: (markers: google.maps.Marker[]) => void
}

export function EventsMap({ params, initialCenter }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const clustererRef = useRef<ClustererHandle | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null)
  const paramsRef = useRef<EventsSearchParams>(params)
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null)

  useEffect(() => {
    paramsRef.current = params
  }, [params])

  const refetchInViewport = useCallback(async () => {
    const map = mapRef.current
    const clusterer = clustererRef.current
    if (!map || !clusterer) return
    const bounds = map.getBounds()
    if (!bounds) return
    const ne = bounds.getNorthEast()
    const sw = bounds.getSouthWest()

    const points = await loadEventsInBbox(paramsRef.current, {
      minLng: sw.lng(),
      minLat: sw.lat(),
      maxLng: ne.lng(),
      maxLat: ne.lat(),
    })

    clusterer.clearMarkers()
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    const infoWindow = infoWindowRef.current
    const newMarkers = points.map(p => {
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: BRAND_GOLD,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        title: p.title,
      })
      marker.addListener('click', () => {
        if (!infoWindow) return
        infoWindow.setContent(buildInfoWindowHTML(p))
        infoWindow.open({ map, anchor: marker })
      })
      return marker
    })

    markersRef.current = newMarkers
    clusterer.addMarkers(newMarkers)
  }, [])

  useEffect(() => {
    const loader = getGoogleMapsLoader()
    if (!loader) {
      setUnavailableReason('Mapping service is not configured.')
      return
    }
    if (!containerRef.current) return

    let cancelled = false

    ;(async () => {
      try {
        const [{ Map, InfoWindow }, { MarkerClusterer }] = await Promise.all([
          loader.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          import('@googlemaps/markerclusterer'),
        ])

        if (cancelled || !containerRef.current) return

        const map = new Map(containerRef.current, {
          center: initialCenter,
          zoom: DEFAULT_ZOOM,
          styles: EVENTLINQS_MAP_STYLE,
          disableDefaultUI: false,
          clickableIcons: false,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          zoomControl: true,
          gestureHandling: 'greedy',
        })
        mapRef.current = map

        const infoWindow = new InfoWindow({ maxWidth: 260, disableAutoPan: false })
        infoWindowRef.current = infoWindow

        const clusterer = new MarkerClusterer({
          map,
          markers: [],
          renderer: {
            render: ({ count, position }) => {
              const scale = count < 10 ? 18 : count < 50 ? 22 : 28
              return new google.maps.Marker({
                position,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale,
                  fillColor: BRAND_GOLD,
                  fillOpacity: 0.95,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                },
                label: {
                  text: String(count),
                  color: '#0F172A',
                  fontSize: '13px',
                  fontWeight: '700',
                },
                zIndex: 1000 + count,
              })
            },
          },
        })
        clustererRef.current = clusterer

        idleListenerRef.current = map.addListener('idle', () => {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            refetchInViewport().catch(err =>
              console.warn('[EventsMap] refetch failed:', err),
            )
          }, REFETCH_DEBOUNCE_MS)
        })

        await refetchInViewport()
      } catch (err) {
        console.warn('[EventsMap] google maps init failed:', err)
        setUnavailableReason('Map failed to load.')
      }
    })()

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (idleListenerRef.current) {
        idleListenerRef.current.remove()
        idleListenerRef.current = null
      }
      infoWindowRef.current?.close()
      infoWindowRef.current = null
      clustererRef.current?.clearMarkers()
      clustererRef.current = null
      markersRef.current.forEach(m => m.setMap(null))
      markersRef.current = []
      mapRef.current = null
    }
  }, [initialCenter, refetchInViewport])

  // Refetch when filters change without tearing down the map.
  useEffect(() => {
    if (mapRef.current && !unavailableReason) {
      refetchInViewport().catch(err =>
        console.warn('[EventsMap] filter refetch failed:', err),
      )
    }
  }, [params, unavailableReason, refetchInViewport])

  if (unavailableReason) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <MapUnavailable reason={unavailableReason} />
      </div>
    )
  }

  return (
    <section aria-label="Events map" className="px-4 py-6 sm:px-6 lg:px-8">
      <div
        ref={containerRef}
        data-testid="events-map"
        className="h-[calc(100vh-14rem)] min-h-[480px] w-full overflow-hidden rounded-xl border border-ink-100 bg-ink-100"
      />
    </section>
  )
}
