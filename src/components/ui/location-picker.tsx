'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { DetectedLocation } from '@/lib/geo/detect'

interface City {
  city: string
  country: string
  countryCode: string
  latitude: number
  longitude: number
}

const CITIES: City[] = [
  { city: 'Melbourne',  country: 'Australia',      countryCode: 'AU', latitude: -37.8136, longitude: 144.9631 },
  { city: 'Sydney',     country: 'Australia',      countryCode: 'AU', latitude: -33.8688, longitude: 151.2093 },
  { city: 'Brisbane',   country: 'Australia',      countryCode: 'AU', latitude: -27.4698, longitude: 153.0251 },
  { city: 'Perth',      country: 'Australia',      countryCode: 'AU', latitude: -31.9523, longitude: 115.8613 },
  { city: 'Adelaide',   country: 'Australia',      countryCode: 'AU', latitude: -34.9285, longitude: 138.6007 },
  { city: 'Auckland',   country: 'New Zealand',    countryCode: 'NZ', latitude: -36.8485, longitude: 174.7633 },
  { city: 'London',     country: 'United Kingdom', countryCode: 'GB', latitude: 51.5074, longitude:  -0.1278 },
  { city: 'Manchester', country: 'United Kingdom', countryCode: 'GB', latitude: 53.4808, longitude:  -2.2426 },
  { city: 'Toronto',    country: 'Canada',         countryCode: 'CA', latitude: 43.6532, longitude: -79.3832 },
  { city: 'New York',   country: 'United States',  countryCode: 'US', latitude: 40.7128, longitude: -74.0060 },
  { city: 'Houston',    country: 'United States',  countryCode: 'US', latitude: 29.7604, longitude: -95.3698 },
  { city: 'Atlanta',    country: 'United States',  countryCode: 'US', latitude: 33.7490, longitude: -84.3880 },
  { city: 'Lagos',      country: 'Nigeria',        countryCode: 'NG', latitude:  6.5244, longitude:   3.3792 },
  { city: 'Accra',      country: 'Ghana',          countryCode: 'GH', latitude:  5.6037, longitude:  -0.1870 },
]

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

function nearestCity(lat: number, lng: number): City {
  let best = CITIES[0]
  let bestDist = Infinity
  for (const c of CITIES) {
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
  cities: City[]
  current: DetectedLocation
  onPick: (c: City) => void
}) {
  return (
    <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {cities.map(c => {
        const isCurrent =
          c.city === current.city && c.countryCode === current.countryCode
        return (
          <li key={`${c.countryCode}-${c.city}`}>
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
  variant = 'pill',
  onChange,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showOtherCountries, setShowOtherCountries] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isSearching = query.trim().length > 0

  const filteredCities = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CITIES
    return CITIES.filter(c =>
      c.city.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    )
  }, [query])

  const auCities = useMemo(
    () => filteredCities.filter(c => c.countryCode === 'AU'),
    [filteredCities],
  )
  const otherCities = useMemo(
    () => filteredCities.filter(c => c.countryCode !== 'AU'),
    [filteredCities],
  )

  const closeDialog = useCallback(() => {
    setOpen(false)
    setQuery('')
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

  const applyCity = useCallback(async (city: City) => {
    try {
      await fetch('/api/location/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          city: city.city,
          country: city.country,
          countryCode: city.countryCode,
          latitude: city.latitude,
          longitude: city.longitude,
        }),
      })
    } catch {
      // Network error swallowed; router.refresh() will no-op gracefully.
    }
    closeDialog()
    onChange?.()

    // On /events, persist the picked country to the URL so it's shareable
    // and survives refresh without relying solely on the cookie.
    if (pathname && pathname.startsWith('/events')) {
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      next.set('country', city.country)
      next.delete('page')
      router.push(`/events${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false })
    } else {
      router.refresh()
    }
  }, [closeDialog, onChange, pathname, router, searchParams])

  const useMyLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocation is not available in this browser.')
      return
    }
    setGeoBusy(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const match = nearestCity(pos.coords.latitude, pos.coords.longitude)
        setGeoBusy(false)
        void applyCity(match)
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
  }, [applyCity])

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
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
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

            <div className="px-5 pt-4">
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

            <div className="px-5 pb-5 pt-4">
              {filteredCities.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-600">
                  No cities match &ldquo;{query}&rdquo;. Try another search.
                </p>
              ) : isSearching ? (
                <>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">
                    Matches
                  </p>
                  <CityList
                    cities={filteredCities}
                    current={currentLocation}
                    onPick={applyCity}
                  />
                </>
              ) : (
                <>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">
                    Australia
                  </p>
                  <CityList
                    cities={auCities}
                    current={currentLocation}
                    onPick={applyCity}
                  />

                  {!showOtherCountries ? (
                    <button
                      type="button"
                      onClick={() => setShowOtherCountries(true)}
                      aria-expanded={false}
                      className={[
                        'mt-4 flex w-full items-center justify-center gap-2 h-10 rounded-lg',
                        'border border-dashed border-ink-200 bg-white text-xs font-semibold',
                        'text-ink-700 hover:border-gold-500 hover:text-gold-600 transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]',
                      ].join(' ')}
                    >
                      Browse other countries
                    </button>
                  ) : (
                    <>
                      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-ink-400">
                        Other countries
                      </p>
                      <CityList
                        cities={otherCities}
                        current={currentLocation}
                        onPick={applyCity}
                      />
                    </>
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
