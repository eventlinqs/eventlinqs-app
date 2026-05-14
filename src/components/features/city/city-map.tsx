'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export interface MapEventPin {
  id: string
  slug: string
  title: string
  date: string
  suburb: string | null
  price: string | null
  cover: string | null
  latitude: number
  longitude: number
}

export interface MapSuburbPolygon {
  slug: string
  name: string
  href: string
  latitude: number
  longitude: number
  /** Approximate radius in degrees (~0.05 = 5km). Used to draw a soft
   *  circular polygon overlay around the suburb centre. We don't ship
   *  real cadastral boundaries; this is a brand-friendly approximation. */
  radiusDeg?: number
}

interface Props {
  centerLng: number
  centerLat: number
  zoom: number
  pins: MapEventPin[]
  suburbs?: MapSuburbPolygon[]
  /** Public Mapbox token - read from NEXT_PUBLIC_MAPBOX_TOKEN at the page level. */
  accessToken: string
}

const BRAND_COLORS = {
  land: '#FAF7F0',
  water: '#E8F1F2',
  road_minor: '#E5E0D5',
  road_major: '#D4CDB8',
  parks: '#C8D4B8',
  buildings: '#E8E0D0',
  city_label: '#0A1628',
  suburb_label: '#2A3548',
  navy: '#0A1628',
  gold: '#D4A437',
} as const

/**
 * Generate a simple circular polygon (Polygon GeoJSON) of N points
 * around a centre lng/lat with a degree radius. Used to render the
 * suburb overlay without sourcing official cadastral data.
 */
function circlePolygon(lng: number, lat: number, radiusDeg: number, points = 48): GeoJSON.Polygon {
  const ring: [number, number][] = []
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    ring.push([lng + Math.cos(a) * radiusDeg, lat + (Math.sin(a) * radiusDeg) / Math.cos((lat * Math.PI) / 180)])
  }
  ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

/**
 * CityMap - Mapbox GL JS map for /city/[slug].
 *
 * Loads the Mapbox light style then recolors the key layers to the
 * brand palette (navy/gold + cream land + pale-teal water). Custom gold
 * drop-pin markers for up to 100 events. Suburb polygon overlays for
 * Tier 1 cities (subtle navy fill, hover lifts opacity, click routes
 * to the suburb page). Branded popup card on marker click. Loading
 * skeleton with cream background and pulsing gold spinner. Falls back
 * to a static event list when the token is missing or load fails.
 */
export function CityMap({ centerLng, centerLat, zoom, pins, suburbs, accessToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!accessToken) {
      setStatus('error')
      return
    }
    if (!containerRef.current) return

    mapboxgl.accessToken = accessToken
    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [centerLng, centerLat],
        zoom,
        attributionControl: true,
        cooperativeGestures: false,
      })
    } catch {
      setStatus('error')
      return
    }
    mapRef.current = map

    // Desktop only: add zoom controls bottom-right (mobile gets gestures only).
    if (window.matchMedia('(min-width: 768px)').matches) {
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    }

    map.on('load', () => {
      // Recolor the light-v11 layers to the brand palette.
      // mapbox-gl's setPaintProperty/setLayoutProperty types are strict
      // per-layer-type; we operate generically across all matched layer
      // ids so we cast through unknown to a permissive helper.
      const m = map as unknown as {
        setPaintProperty: (id: string, prop: string, value: unknown) => void
        setLayoutProperty: (id: string, prop: string, value: unknown) => void
      }
      try {
        const layers = map.getStyle().layers ?? []
        for (const l of layers) {
          if (!l.id) continue
          if (l.type === 'background' || /^land/.test(l.id)) {
            m.setPaintProperty(l.id, 'background-color', BRAND_COLORS.land)
          }
          if (l.type === 'fill' && /water/.test(l.id)) {
            m.setPaintProperty(l.id, 'fill-color', BRAND_COLORS.water)
          }
          if (l.type === 'fill' && /(park|grass|wood|landuse|natural)/.test(l.id)) {
            m.setPaintProperty(l.id, 'fill-color', BRAND_COLORS.parks)
          }
          if (l.type === 'line' && /(road-(motorway|trunk|primary))/.test(l.id)) {
            m.setPaintProperty(l.id, 'line-color', BRAND_COLORS.road_major)
          }
          if (l.type === 'line' && /road-/.test(l.id) && !/(motorway|trunk|primary)/.test(l.id)) {
            m.setPaintProperty(l.id, 'line-color', BRAND_COLORS.road_minor)
          }
          if (l.type === 'fill' && /building/.test(l.id)) {
            m.setPaintProperty(l.id, 'fill-color', BRAND_COLORS.buildings)
            m.setPaintProperty(l.id, 'fill-opacity', 0.4)
          }
          if (l.type === 'symbol' && /place-(city|town)|settlement-major/.test(l.id)) {
            m.setPaintProperty(l.id, 'text-color', BRAND_COLORS.city_label)
          }
          if (l.type === 'symbol' && /(place-(suburb|neighbourhood|village)|settlement-minor)/.test(l.id)) {
            m.setPaintProperty(l.id, 'text-color', BRAND_COLORS.suburb_label)
          }
          // Hide POI clutter so the brand pins read clean.
          if (l.type === 'symbol' && /poi-/.test(l.id)) {
            m.setLayoutProperty(l.id, 'visibility', 'none')
          }
        }
      } catch {
        // Best-effort recolor; a Mapbox style update could break ids - swallow.
      }

      // Suburb overlays.
      if (suburbs && suburbs.length > 0) {
        const features: GeoJSON.Feature[] = suburbs.map(s => ({
          type: 'Feature',
          properties: { slug: s.slug, name: s.name, href: s.href },
          geometry: circlePolygon(s.longitude, s.latitude, s.radiusDeg ?? 0.04),
        }))
        const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
        map.addSource('suburbs', { type: 'geojson', data: fc })
        map.addLayer({
          id: 'suburbs-fill',
          type: 'fill',
          source: 'suburbs',
          paint: {
            'fill-color': BRAND_COLORS.navy,
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false], 0.20,
              0.08,
            ] as unknown as number,
          },
        })
        map.addLayer({
          id: 'suburbs-outline',
          type: 'line',
          source: 'suburbs',
          paint: { 'line-color': BRAND_COLORS.navy, 'line-width': 1, 'line-opacity': 0.5 },
        })

        let hoverId: string | null = null
        map.on('mousemove', 'suburbs-fill', e => {
          const f = e.features?.[0]
          if (!f) return
          if (hoverId !== null) map.setFeatureState({ source: 'suburbs', id: hoverId }, { hover: false })
          hoverId = (f.id as string) ?? (f.properties?.slug as string)
          if (hoverId) map.setFeatureState({ source: 'suburbs', id: hoverId }, { hover: true })
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'suburbs-fill', () => {
          if (hoverId !== null) map.setFeatureState({ source: 'suburbs', id: hoverId }, { hover: false })
          hoverId = null
          map.getCanvas().style.cursor = ''
        })
        map.on('click', 'suburbs-fill', e => {
          const href = e.features?.[0]?.properties?.href as string | undefined
          if (href) window.location.href = href
        })
      }

      // Event pins - custom drop-pin DOM elements (gold + navy border).
      for (const pin of pins) {
        const el = document.createElement('button')
        el.type = 'button'
        el.setAttribute('aria-label', pin.title)
        el.style.cssText = [
          'width:32px', 'height:40px', 'border:none', 'background:transparent',
          'cursor:pointer', 'transition:transform 200ms ease',
        ].join(';')
        el.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40" aria-hidden="true">
            <path d="M16 1c8.3 0 15 6.7 15 15 0 10-15 23-15 23S1 26 1 16C1 7.7 7.7 1 16 1z"
                  fill="${BRAND_COLORS.gold}" stroke="${BRAND_COLORS.navy}" stroke-width="1"/>
            <circle cx="16" cy="16" r="5" fill="#FFFFFF"/>
          </svg>
        `
        el.onmouseenter = () => { el.style.transform = 'scale(1.15)' }
        el.onmouseleave = () => { el.style.transform = 'scale(1)' }

        // Route the popup cover image through the same-origin
        // /_next/image proxy so the popup pre-render (Mapbox builds
        // popup DOM eagerly even before display) does not fetch
        // directly from third-party origins. This was the source of
        // the /city/[slug] Lighthouse Best Practices 77: Pexels
        // origin returns Cloudflare __cf_bm and _cfuvid bot cookies
        // which Lighthouse third-party-cookies audit flags. Same-
        // origin proxy strips those cookies.
        const proxiedCover = pin.cover
          ? `/_next/image?url=${encodeURIComponent(pin.cover)}&w=384&q=70`
          : null
        const popupHtml = `
          <div class="elinqs-map-popup" style="font-family:system-ui;min-width:240px;max-width:280px;">
            ${proxiedCover ? `<div style="position:relative;width:100%;aspect-ratio:16/10;background:#0A1628;overflow:hidden;border-top-left-radius:8px;border-top-right-radius:8px;"><img src="${proxiedCover}" alt="${pin.title.replace(/"/g, '&quot;')}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/></div>` : ''}
            <div style="padding:12px 14px;">
              <p style="font-weight:700;color:${BRAND_COLORS.navy};font-size:14px;line-height:1.25;margin:0 0 4px 0;">${pin.title.replace(/</g, '&lt;')}</p>
              <p style="color:${BRAND_COLORS.gold};font-size:12px;font-weight:600;margin:0;">${pin.date}</p>
              ${pin.suburb ? `<p style="color:#6B7280;font-size:12px;margin:2px 0 0 0;">${pin.suburb}</p>` : ''}
              ${pin.price ? `<p style="color:#374151;font-size:12px;font-weight:600;margin:6px 0 0 0;">${pin.price}</p>` : ''}
              <a href="/events/${pin.slug}" style="display:inline-flex;margin-top:10px;height:36px;align-items:center;padding:0 14px;border-radius:9999px;background:${BRAND_COLORS.navy};color:#fff;font-weight:600;font-size:12px;text-decoration:none;">View event &rarr;</a>
            </div>
          </div>`

        const popup = new mapboxgl.Popup({
          offset: 28,
          closeButton: true,
          closeOnClick: true,
          maxWidth: '300px',
          className: 'elinqs-popup',
        }).setHTML(popupHtml)

        new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.longitude, pin.latitude])
          .setPopup(popup)
          .addTo(map)
      }

      // Mapbox sometimes lays out before the container has its final
      // dimensions; an explicit resize on the next animation frame
      // guarantees pins render in the right places.
      requestAnimationFrame(() => map.resize())
      setStatus('ready')
    })

    map.on('error', () => setStatus('error'))

    return () => {
      map.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, centerLng, centerLat, zoom])

  if (status === 'error') {
    return (
      <div className="rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-6">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Map preview unavailable</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Browse the events list above. The interactive map is loading.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pins.slice(0, 6).map(p => (
            <li key={p.id} className="rounded-md border border-[var(--surface-2)] p-3">
              <a href={`/events/${p.slug}`} className="block text-sm font-semibold text-[var(--text-primary)] hover:underline">
                {p.title}
              </a>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{p.date}{p.suburb ? ` · ${p.suburb}` : ''}</p>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-[var(--surface-2)]">
      {/* Mapbox container needs concrete dimensions BEFORE the map
       *  initialises. `position: absolute; inset: 0` was collapsing to
       *  0 height in some renders (likely a layout-timing race against
       *  the parent), leaving the map invisible. Giving the container
       *  explicit `h-[400px] sm:h-[500px]` removes the dependency. */}
      <div
        ref={containerRef}
        className="h-[400px] w-full sm:h-[500px]"
        aria-label="Interactive map of upcoming events"
        role="application"
      />
      {status === 'loading' ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ background: BRAND_COLORS.land }}
          aria-hidden
        >
          <div
            className="h-10 w-10 animate-pulse rounded-full"
            style={{ background: BRAND_COLORS.gold, opacity: 0.6 }}
          />
        </div>
      ) : null}
    </div>
  )
}
