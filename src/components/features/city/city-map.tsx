'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getGoogleMapsLoader } from '@/lib/maps/google-maps-loader'
import { EVENTLINQS_MAP_STYLE } from '@/lib/maps/google-maps-style'

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
  radiusDeg?: number
}

interface Props {
  centerLng: number
  centerLat: number
  zoom: number
  pins: MapEventPin[]
  suburbs?: MapSuburbPolygon[]
  /**
   * Legacy Mapbox token prop. Maps are now consolidated onto Google Maps (one
   * provider, one key, one thing to keep working), so this is IGNORED and kept
   * only so existing call sites compile during the migration. Remove after all
   * call sites drop it.
   */
  accessToken?: string
}

const BRAND_GOLD = '#D4A017' // --color-gold-500 (JS map config cannot read CSS vars)

/**
 * CityMap - Google Maps event map for /city/[slug], /community/[community]/[city].
 *
 * Consolidated from Mapbox to Google Maps so the whole platform uses ONE map
 * provider (the founder-configured, referrer-restricted Google key). Drops gold
 * pins for each event on the brand-styled map, opens a branded InfoWindow with a
 * link to the event on click, and lazy-loads the Maps JS on scroll-in for
 * performance. When the Google key is missing it degrades to the same static
 * event list, so a missing key never shows a broken map. Suburb polygon overlays
 * from the Mapbox version were dropped in the consolidation (the suburb tiles
 * on the page already cover that navigation).
 */
export function CityMap({ centerLng, centerLat, zoom, pins }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle')
  const [inView, setInView] = useState(false)

  // Env-only check (NEXT_PUBLIC, inlined at build) - never call
  // getGoogleMapsLoader() in the component body: its setOptions() touches
  // `window`, which crashes during SSR/prerender. The loader is used only
  // inside the effect below (client-side).
  const configured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())

  // Lazy-load on scroll-in (map sits below the fold). Skip in headless audits.
  useEffect(() => {
    // No key: the render below already shows the static fallback for !configured,
    // so we do not setState here (avoids a synchronous set-state-in-effect).
    if (!configured) return
    if (typeof document !== 'undefined' && document.body.dataset.headless === '1') return
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setInView(true), 0)
      return () => clearTimeout(t)
    }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { setInView(true); io.disconnect(); break }
      }
    }, { rootMargin: '200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [configured])

  useEffect(() => {
    if (!configured || !inView) return
    const loader = getGoogleMapsLoader()
    if (!loader || !containerRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const { Map, InfoWindow } = (await loader.importLibrary('maps')) as google.maps.MapsLibrary
        if (cancelled || !containerRef.current) return
        const map = new Map(containerRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom,
          styles: EVENTLINQS_MAP_STYLE,
          disableDefaultUI: true,
          clickableIcons: false,
          zoomControl: true,
          gestureHandling: 'cooperative',
          keyboardShortcuts: false,
        })
        mapRef.current = map
        const info = new InfoWindow()

        for (const p of pins) {
          if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue
          const marker = new google.maps.Marker({
            position: { lat: p.latitude, lng: p.longitude },
            map,
            title: p.title,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: BRAND_GOLD,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2.5,
            },
          })
          marker.addListener('click', () => {
            const meta = [p.suburb, p.date, p.price].filter(Boolean).join(' · ')
            info.setContent(
              `<div style="font-family:Arial,sans-serif;max-width:220px">` +
                `<div style="font-weight:700;color:#0A1628;font-size:14px;line-height:1.25">${escapeHtml(p.title)}</div>` +
                (meta ? `<div style="color:#555;font-size:12px;margin-top:2px">${escapeHtml(meta)}</div>` : '') +
                `<a href="/events/${encodeURIComponent(p.slug)}" style="display:inline-block;margin-top:8px;color:#8A6D1E;font-weight:700;font-size:12px;text-decoration:none">View event &rsaquo;</a>` +
                `</div>`,
            )
            info.open({ map, anchor: marker })
          })
          markersRef.current.push(marker)
        }
        setStatus('ready')
      } catch (err) {
        console.warn('[CityMap] google maps init failed:', err)
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      for (const m of markersRef.current) m.setMap(null)
      markersRef.current = []
      mapRef.current = null
    }
  }, [configured, inView, centerLat, centerLng, zoom, pins])

  // Missing key or load failure: the static event list, never a broken map.
  if (status === 'error' || !configured) {
    return (
      <div className="rounded-2xl border border-ink-200 bg-white p-6">
        <p className="font-display text-sm font-bold text-ink-900">Events on the map</p>
        <p className="mt-1 text-xs text-ink-600">Map preview unavailable. Browse the events below.</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {pins.slice(0, 6).map(p => (
            <li key={p.id}>
              <Link href={`/events/${p.slug}`} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-800 transition-colors hover:border-gold-400">
                <span className="line-clamp-1">{p.title}</span>
                <span className="shrink-0 text-xs text-ink-500">{p.suburb ?? ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-ink-100">
      <div className="relative aspect-[16/9] w-full sm:aspect-[2/1]">
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(212,160,23,0.14), transparent 70%), linear-gradient(180deg, #f5f4ef 0%, #e8e6df 100%)' }}>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-500/30 border-t-gold-600" aria-hidden />
          </div>
        )}
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
