'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePortalReady } from '@/lib/hooks/use-portal-ready'
import { usePathname, useRouter } from 'next/navigation'
import { reportClientError } from '@/lib/observability/client-error-report'
import { MapPinIcon } from './location-picker-icons'
import type { DetectedLocation } from '@/lib/geo/detect'
import type { PickerCity } from '@/lib/locations/picker-cities'
import type { PickerCatalogue } from '@/lib/locations/picker-cities-client'

/**
 * THE CITY DIALOG, SPLIT OUT SO IT IS NOT IN THE PLATFORM-WIDE CLIENT SHELL.
 *
 * `LocationPicker` renders in the site header, the site header renders in the
 * root layout, and the root layout renders on every route. Everything in this
 * file is reachable only after a visitor presses "Change location": the city
 * search, the whole city list, the geolocation match and the routing that
 * follows a pick. None of it was reachable on /offline, /careers or
 * /unsubscribe/[token], and all of it shipped there.
 *
 * WHAT MOVED AND WHAT DID NOT. The trigger button stays in `location-picker.tsx`
 * because it paints on first render; this is everything behind it. The dialog's
 * own state (the query, the global-cities disclosure, the geolocation busy and
 * error flags) moved here with it, which is why the parent's close handler no
 * longer resets four pieces of state: unmounting this component resets them,
 * and unmounting is what closing now does.
 *
 * THE PORTAL STAYS WITH THE DIALOG. `scripts/guards/overlays-are-portalled.mjs`
 * fails the build when a `role="dialog"` positioned `fixed inset-0` does not
 * reach `createPortal`, and the reason is recorded in that guard: a dialog
 * inside an ancestor with a transform paints correctly and cannot be clicked at
 * all. The dialog and its `createPortal` therefore moved together, as one piece.
 *
 * `ssr` IS LEFT AT ITS DEFAULT by the importing side and this component simply
 * never renders on the server, because it is mounted only while the dialog is
 * open and the dialog is never open on a server render.
 */

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

/**
 * The skeleton rows shown while the catalogue is in flight. Six, because six
 * 44px rows plus their gaps fill the list area of this dialog at 390 without
 * overflowing it, so the settle into the real list moves nothing.
 */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5]

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

export interface LocationPickerPanelProps {
  currentLocation: DetectedLocation
  /**
   * The catalogue, or null while it is still on its way.
   *
   * IT IS NULLABLE BECAUSE IT IS NO LONGER IN THE DOCUMENT. Until 19 September
   * 2026 the whole list was a prop handed down from the server, which meant it
   * was serialised into the RSC payload of every page on the platform whether
   * this dialog opened or not. It is fetched on the same arming signal as this
   * component's own chunk now (see `location-picker.tsx`), so by the time a
   * visitor clicks it has usually landed, and when it has not this component
   * says so rather than rendering an empty list.
   */
  cities: PickerCatalogue | null
  /** The catalogue request failed. Renders the retry, never an empty list. */
  citiesFailed?: boolean
  /** Ask the parent for the catalogue again. */
  onRetryCities?: () => void
  /** Close the dialog. The parent owns `open` and returns focus to the trigger. */
  onClose: () => void
  /** Optional callback fired after a selection closes (e.g. to close a mobile sheet). */
  onChange?: () => void
}

export function LocationPickerPanel({
  currentLocation,
  cities,
  citiesFailed = false,
  onRetryCities,
  onClose,
  onChange,
}: LocationPickerPanelProps) {
  const [query, setQuery] = useState('')
  const [showGlobalCities, setShowGlobalCities] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allCities = useMemo<PickerCity[]>(
    () =>
      cities === null
        ? []
        : [...cities.australia, ...cities.internationalByCountry.flatMap(g => g.cities)],
    [cities],
  )

  const isSearching = query.trim().length > 0

  const filteredMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCities
    // Normalised form strips spaces and hyphens so a user typing
    // "goldcoast" or "gold-coast" matches the "Gold Coast" entry, and
    // "newsouthwales" would match a city slugged that way. Defends
    // against Geelong-class "I typed it and got nothing" reports
    // (Batch 11.1 D1 lesson: any single missed search input is a
    // launch blocker).
    const qNorm = q.replace(/[\s-]+/g, '')
    return allCities.filter(c => {
      const city = c.city.toLowerCase()
      const country = c.country.toLowerCase()
      const slug = c.slug.toLowerCase()
      if (city.includes(q) || country.includes(q) || slug.includes(q)) return true
      const cityNorm = city.replace(/[\s-]+/g, '')
      const slugNorm = slug.replace(/[\s-]+/g, '')
      return cityNorm.includes(qNorm) || slugNorm.includes(qNorm)
    })
  }, [allCities, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

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
      // Notify SiteHeaderClient (and any other in-app listener) that
      // the el_city cookie just changed. Cookies have no native change
      // event the browser fires, so we dispatch a synthetic one. See
      // EL_CITY_UPDATED_EVENT in site-header-client.tsx for context
      // (PR #34 follow-up: replaces a useSyncExternalStore misuse).
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('el_city_updated'))
      }
    } catch (error) {
      reportClientError(error, { where: 'components/ui/location-picker:239' })
      // Network error swallowed; router.refresh() will no-op gracefully.
    }
    onClose()
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
  }, [onClose, onChange, pathname, router])

  const clearCity = useCallback(() => {
    // "All events" / no city filter. We do not write a cleared cookie
    // here (server route owns el_city lifecycle), but we still dispatch
    // the change event so the header re-reads whatever the server-set
    // state ends up being after router.refresh().
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('el_city_updated'))
    }
    onClose()
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
  }, [onClose, onChange, pathname, router])

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

  // `document` does not exist while this renders on the server; the portal below
  // needs it, and this is the one definition of that question.
  const portalReady = usePortalReady()
  if (!portalReady) return null

  /*
   * PORTALLED TO THE BODY (close-out D2, 11 September 2026). A full-page dialog
   * rendered where it sits is trapped in the stacking context of any ancestor
   * carrying a transform, and then it PAINTS correctly and cannot be clicked at
   * all. Found on the waiting-list dialog by asking the browser what was
   * actually at the centre of its own submit button: the hero section, not the
   * button. `overlays-are-portalled` fails the build if it comes back.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-900/60 p-4 sm:items-center"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-picker-title"
        className="relative flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
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
            onClick={onClose}
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
            /*
             * DISABLED UNTIL THE CATALOGUE IS HERE, because the match is made
             * against it. With an empty list the haversine search finds nothing
             * and the visitor is told "Could not match your location to a
             * supported city", which is a false statement about their city
             * rather than a true one about our timing.
             */
            disabled={geoBusy || cities === null}
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
          {citiesFailed ? (
            /*
             * THE FAILURE IS NAMED, NEVER RENDERED AS AN EMPTY LIST. A visitor
             * shown no cities concludes the platform has none, which is the
             * exact shape of the Geelong report the search matcher above was
             * hardened for: "I typed a city that exists and got nothing".
             */
            <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
              <p className="text-sm text-ink-700">
                The city list did not load. Your current city is unchanged.
              </p>
              {onRetryCities && (
                <button
                  type="button"
                  onClick={onRetryCities}
                  /*
                   * `bg-navy-950`, NOT `bg-navy`. There is no `navy` colour in
                   * this Tailwind build: globals.css defines `--color-navy-950`
                   * and nothing else in that family, so `bg-navy` compiles to no
                   * rule at all and the button paints white text on the white
                   * dialog. It was written `bg-navy` here first, the jsdom test
                   * found the button by its accessible name and passed, the
                   * driven assertion found the failure message and passed, and
                   * the SCREENSHOT is what showed a button nobody could see.
                   */
                  className={[
                    'min-h-[44px] rounded-full bg-navy-950 px-6 text-sm font-medium text-white',
                    'transition-colors duration-200 hover:bg-navy-950/90',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]',
                  ].join(' ')}
                >
                  Try again
                </button>
              )}
            </div>
          ) : cities === null ? (
            /*
             * A DESIGNED SKELETON, NOT A SPINNER, and `role="status"` rather
             * than a bare div with an aria-label: a generic role is PROHIBITED
             * from carrying an accessible name, and the identical mistake on the
             * seat chart cost the accessibility floor 0.97 against 1.00 on the
             * very run that proved its performance fix.
             *
             * The rows are the height of the real ones (44px plus the 4px gap),
             * so the settle is zero-shift.
             */
            <div role="status" aria-live="polite" className="space-y-1">
              <span className="sr-only">Loading the city list</span>
              <div className="mb-2 h-3 w-20 rounded bg-ink-100" />
              {SKELETON_ROWS.map(row => (
                <div key={row} className="h-11 rounded-lg bg-ink-100" />
              ))}
            </div>
          ) : filteredMatches.length === 0 ? (
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
                !showGlobalCities ? (
                  <button
                    type="button"
                    onClick={() => setShowGlobalCities(true)}
                    aria-expanded={false}
                    className={[
                      'mt-4 flex w-full items-center justify-center gap-2 h-10 rounded-lg',
                      'border border-dashed border-ink-200 bg-white text-xs font-semibold',
                      'text-ink-700 hover:border-gold-500 hover:text-gold-600 transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]',
                    ].join(' ')}
                  >
                    Global cities
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
    </div>,
    document.body,
  )
}
