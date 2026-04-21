'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPinOff } from 'lucide-react'
import { loadEventsInBbox } from '@/app/events/actions'
import type { EventsSearchParams } from '@/lib/events/search-params'
import type { MapEventPoint } from './m5-events-map-types'

type Props = {
  params: EventsSearchParams
  initialCenter: { lat: number; lng: number }
}

const MAPBOX_STYLE = 'mapbox://styles/mapbox/light-v11'
const DEFAULT_ZOOM = 5
const REFETCH_DEBOUNCE_MS = 400
const CLUSTER_RADIUS = 50
const CLUSTER_MAX_ZOOM = 14
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

function buildPopupHTML(p: MapEventPoint): string {
  const city = p.venue_city ? ` · ${escapeHtml(p.venue_city)}` : ''
  return `
    <div class="font-sans">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-[#B8860B]">${escapeHtml(formatDate(p.start_date))}${city}</p>
      <h3 class="mt-1 text-sm font-bold leading-snug text-[#0F172A] line-clamp-2">${escapeHtml(p.title)}</h3>
      <p class="mt-1 text-xs font-semibold text-[#0F172A]">${escapeHtml(formatPrice(p))}</p>
      <a href="/events/${encodeURIComponent(p.slug)}" class="mt-2 inline-block text-xs font-semibold text-[#B8860B] hover:underline">View event →</a>
    </div>
  `
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
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

export function EventsMap({ params, initialCenter }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import('mapbox-gl').Map | null>(null)
  const popupRef = useRef<import('mapbox-gl').Popup | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paramsRef = useRef<EventsSearchParams>(params)
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null)

  // Keep the latest params visible to the async refetch callback without
  // needing to re-create the map whenever the URL changes.
  useEffect(() => {
    paramsRef.current = params
  }, [params])

  const refetchInViewport = useCallback(async () => {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    if (!b) return
    const points = await loadEventsInBbox(paramsRef.current, {
      minLng: b.getWest(),
      minLat: b.getSouth(),
      maxLng: b.getEast(),
      maxLat: b.getNorth(),
    })
    const src = map.getSource('events') as import('mapbox-gl').GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: points.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { ...p },
      })),
    })
  }, [])

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()
    if (!token) {
      setUnavailableReason('Mapping service is not configured.')
      return
    }
    if (!containerRef.current) return

    let cancelled = false

    ;(async () => {
      const mapboxgl = (await import('mapbox-gl')).default
      await import('mapbox-gl/dist/mapbox-gl.css')

      if (cancelled || !containerRef.current) return

      mapboxgl.accessToken = token

      let map: import('mapbox-gl').Map
      try {
        map = new mapboxgl.Map({
          container: containerRef.current,
          style: MAPBOX_STYLE,
          center: [initialCenter.lng, initialCenter.lat],
          zoom: DEFAULT_ZOOM,
          attributionControl: true,
        })
      } catch (err) {
        setUnavailableReason("Your browser doesn't support WebGL.")
        console.warn('[EventsMap] mapbox init failed:', err)
        return
      }

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      map.on('load', () => {
        map.addSource('events', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterRadius: CLUSTER_RADIUS,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
        })

        map.addLayer({
          id: 'events-clusters',
          type: 'circle',
          source: 'events',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': BRAND_GOLD,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              18, 10,
              22, 25,
              28, 50,
              34,
            ],
            'circle-opacity': 0.92,
          },
        })

        map.addLayer({
          id: 'events-cluster-count',
          type: 'symbol',
          source: 'events',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 13,
          },
          paint: { 'text-color': '#0F172A' },
        })

        map.addLayer({
          id: 'events-unclustered',
          type: 'circle',
          source: 'events',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': BRAND_GOLD,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-radius': 8,
          },
        })

        map.on('click', 'events-clusters', e => {
          const feature = map.queryRenderedFeatures(e.point, {
            layers: ['events-clusters'],
          })[0]
          if (!feature || feature.geometry.type !== 'Point') return
          const clusterId = feature.properties?.cluster_id
          if (clusterId === undefined) return
          const src = map.getSource('events') as import('mapbox-gl').GeoJSONSource
          src.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom === null || zoom === undefined) return
            const geom = feature.geometry as GeoJSON.Point
            map.easeTo({
              center: [geom.coordinates[0], geom.coordinates[1]],
              zoom,
            })
          })
        })

        map.on('click', 'events-unclustered', e => {
          const feature = e.features?.[0]
          if (!feature || feature.geometry.type !== 'Point') return
          const geom = feature.geometry as GeoJSON.Point
          const props = feature.properties as unknown as MapEventPoint | null
          if (!props) return

          popupRef.current?.remove()
          popupRef.current = new mapboxgl.Popup({ offset: 14, closeButton: true, maxWidth: '260px' })
            .setLngLat([geom.coordinates[0], geom.coordinates[1]])
            .setHTML(buildPopupHTML(props))
            .addTo(map)
        })

        const setPointer = () => (map.getCanvas().style.cursor = 'pointer')
        const clearPointer = () => (map.getCanvas().style.cursor = '')
        map.on('mouseenter', 'events-clusters', setPointer)
        map.on('mouseleave', 'events-clusters', clearPointer)
        map.on('mouseenter', 'events-unclustered', setPointer)
        map.on('mouseleave', 'events-unclustered', clearPointer)

        refetchInViewport().catch(err => console.warn('[EventsMap] initial fetch failed:', err))
      })

      map.on('moveend', () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
          refetchInViewport().catch(err => console.warn('[EventsMap] refetch failed:', err))
        }, REFETCH_DEBOUNCE_MS)
      })
    })()

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      popupRef.current?.remove()
      popupRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [initialCenter.lat, initialCenter.lng, refetchInViewport])

  // Refetch when filters change without tearing down the map.
  useEffect(() => {
    if (mapRef.current && !unavailableReason) {
      refetchInViewport().catch(err => console.warn('[EventsMap] filter refetch failed:', err))
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
