'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Read the live query string at call time. We deliberately avoid
 * `useSearchParams()` so this component does not push the consuming
 * route into Next.js's CSR-only mode. The hook reads from the router's
 * search-params snapshot, which is only available at request time;
 * having it on a client island that ships in a static-rendered route
 * triggers `missing-suspense-with-csr-bailout` at build time. Reading
 * `window.location.search` inside an event handler runs strictly after
 * hydration, so this is always defined and always current.
 */
function readCurrentQueryString(): string {
  if (typeof window === 'undefined') return ''
  return window.location.search.replace(/^\?/, '')
}
import type { DetectedLocation } from '@/lib/geo/detect'
import type { PickerCity, PickerCityGroups } from '@/lib/locations/picker-cities'

function MapPinIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <circle cx="12" cy="11" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function CloseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CrosshairIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </svg>
  )
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

function nearestPickerCity(lat: number, lng: number, cities: PickerCity[]): PickerCity | null {
  let best: PickerCity | null = null
  let bestDist = Infinity
  for (const c of cities) {
    if (c.latitude === null || c.longitude === null) continue
    const d = haversineKm(lat, lng, c.latitude, c.longitude)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
}

interface LocationPickerProps {
  currentLocation: DetectedLocation
  /** Curated + dynamic picker cities. Fetched server-side and passed in. */
  cities: PickerCityGroups
  /** Visual variant. `pill` = main bar button. `inline` = full-width row in mobile sheet. */
  variant?: 'pill' | 'inline'
  /** Optional callback fired after selection closes (e.g. to close mobile sheet). */
  onChange?: () => void
}

function CityList({
  cities,
  current,
  onPick,
}: {
  cities: PickerCity[]
  current: DetectedLocation
  onPick: (c: PickerCity) => void
}) {
  return (
    <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {cities.map(c => {
        const isCurrent =
          c.city === current.city &&
          (c.countryCode === null || c.countryCode === current.countryCode)
        return (
          <li key={`${c.country}-${c.slug}`}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className={[
                'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left',
                'text-sm transition-colors',
                isCurrent
                  ? 'bg-gold-100 text-ink-900 font-semibold'
                  : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]',
              ].join(' ')}
              aria-current={isCurrent || undefined}
            >
              <span className="truncate">
                <span className="font-medium text-ink-900">{c.city}</span>
                <span className="ml-2 text-xs text-ink-400">{c.country}</span>
              </span>
              {isCurrent && <span className="text-xs text-gold-600">Current</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function LocationPicker({
  currentLocation,
  cities,
  variant = 'pill',
  onChange,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showDiaspora, setShowDiaspora] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allCities = useMemo<PickerCity[]>(
    () => [
      ...cities.australia,
      ...cities.internationalByCountry.flatMap(g => g.cities),
    ],
    [cities],
  )

  const isSearching = query.trim().length > 0

  const filteredMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCities
    return allCities.filter(c =>
      c.city.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    )
  }, [allCities, query])

  const closeDialog = useCallback(() => {
    setOpen(false)
    setQuery('')
    setShowDiaspora(false)
    setGeoError(null)
    setTimeout(() => triggerRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeDialog])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const applyCity = useCallback(async (city: PickerCity) => {
    try {
      await fetch('/api/location/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          city: city.city,
          country: city.country,
          countryCode: city.countryCode ?? '',
          latitude: city.latitude,
          longitude: city.longitude,
        }),
      })
    } catch {
      // Network error swallowed; router.refresh() will no-op gracefully.
    }
    closeDialog()
    onChange?.()

    // Anywhere under /events (browse or root): route to /events/browse/{slug}
    // preserving existing filters (preset, category, price, etc.). `page`
    // is dropped so the user sees page 1 of the new city's results.
    if (pathname && pathname.startsWith('/events')) {
      const next = new URLSearchParams(readCurrentQueryString())
      next.delete('page')
      next.delete('country')
      next.delete('city')
      const qs = next.toString()
      router.push(`/events/browse/${city.slug}${qs ? `?${qs}` : ''}`, { scroll: false })
    } else {
      router.refresh()
    }
  }, [closeDialog, onChange, pathname, router])

  const clearCity = useCallback(() => {
    closeDialog()
    onChange?.()
    if (pathname && pathname.startsWith('/events')) {
      const next = new URLSearchParams(readCurrentQueryString())
      next.delete('page')
      next.delete('country')
      next.delete('city')
      const qs = next.toString()
      router.push(`/events${qs ? `?${qs}` : ''}`, { scroll: false })
    } else {
      router.refresh()
    }
  }, [closeDialog, onChange, pathname, router])

  const useMyLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocation is not available in this browser.')
      return
    }
    setGeoBusy(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const match = nearestPickerCity(pos.coords.latitude, pos.coords.longitude, allCities)
        setGeoBusy(false)
        if (match) {
          void applyCity(match)
        } else {
          setGeoError('Could not match your location to a supported city.')
        }
      },
      (err) => {
        setGeoBusy(false)
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Pick a city below instead.'
            : 'Could not detect location. Pick a city below instead.',
        )
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 8000 },
    )
  }, [allCities, applyCity])

  const triggerClasses = variant === 'pill'
    ? [
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-full',
        'text-sm font-medium text-ink-700 bg-transparent',
        'border border-ink-200',
        'hover:border-gold-500 hover:text-gold-600 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
      ].join(' ')
    : [
        'flex w-full min-h-[44px] items-center gap-2 rounded-lg px-4 py-3',
        'text-base font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900',
        'border border-ink-100 bg-white',
        'transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset',
      ].join(' ')

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Change location. Current: ${currentLocation.city}`}
        className={triggerClasses}
      >
        <MapPinIcon className="h-4 w-4 text-gold-500" />
        <span className="truncate max-w-[140px]">{currentLocation.city}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-900/60 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) closeDialog() }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-picker-title"
            className="flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-ink-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-5 w-5 text-gold-500" />
                <h2 id="location-picker-title" className="font-display text-base font-bold text-ink-900">
                  Choose your city
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Close location picker"
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  'text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]',
                ].join(' ')}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="shrink-0 px-5 pt-4">
              <label htmlFor="location-search" className="sr-only">Search for a city</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  ref={inputRef}
                  id="location-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for a city"
                  className={[
                    'w-full h-11 rounded-lg border border-ink-200 bg-white pl-10 pr-3',
                    'text-sm text-ink-900 placeholder:text-ink-400',
                    'focus-visible:outline-none focus-visible:border-gold-500 focus-visible:ring-2',
                    'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-0',
                  ].join(' ')}
                  autoComplete="off"
                />
              </div>

              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoBusy}
                className={[
                  'mt-3 flex w-full items-center justify-center gap-2 h-11 rounded-lg',
                  'border border-ink-200 bg-white text-sm font-medium text-ink-900',
                  'hover:border-gold-500 hover:text-gold-600 transition-colors',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]',
                ].join(' ')}
              >
                <CrosshairIcon className="h-4 w-4 text-gold-500" />
                {geoBusy ? 'Detecting location…' : 'Use my current location'}
              </button>

              {geoError && (
                <p className="mt-2 text-xs text-error" role="alert">{geoError}</p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
              {filteredMatches.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-600">
                  No cities match &ldquo;{query}&rdquo;. Try another search.
                </p>
              ) : isSearching ? (
                <>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">
                    Matches
                  </p>
                  <CityList
                    cities={filteredMatches}
                    current={currentLocation}
                    onPick={applyCity}
                  />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={clearCity}
                    className={[
                      'mb-4 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2',
                      'text-left text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-900',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]',
                    ].join(' ')}
                  >
                    <span className="font-medium text-ink-900">All events</span>
                    <span className="text-xs text-ink-400">No city filter</span>
                  </button>

                  {cities.australia.length > 0 && (
                    <>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">
                        Australia
                      </p>
                      <CityList
                        cities={cities.australia}
                        current={currentLocation}
                        onPick={applyCity}
                      />
                    </>
                  )}

                  {cities.internationalByCountry.length > 0 && (
                    !showDiaspora ? (
                      <button
                        type="button"
                        onClick={() => setShowDiaspora(true)}
                        aria-expanded={false}
                        className={[
                          'mt-4 flex w-full items-center justify-center gap-2 h-10 rounded-lg',
                          'border border-dashed border-ink-200 bg-white text-xs font-semibold',
                          'text-ink-700 hover:border-gold-500 hover:text-gold-600 transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]',
                        ].join(' ')}
                      >
                        Global diaspora cities
                      </button>
                    ) : (
                      <div className="mt-5 space-y-4">
                        {cities.internationalByCountry.map(group => (
                          <div key={group.country}>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">
                              {group.country}
                            </p>
                            <CityList
                              cities={group.cities}
                              current={currentLocation}
                              onPick={applyCity}
                            />
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
