'use client'

import { useEffect, useState } from 'react'
import { EL_CITY_UPDATED } from '@/lib/events/chosen-city'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * Read the el_city cookie and parse it to a DetectedLocation. Returns null when the cookie is absent, malformed, or the
 * parsed payload has no city string. Safe on SSR (returns null when document is undefined).
 *
 * Moved here, unchanged, from site-header-client.tsx (which re-exports it) so the white header (site-header-white.tsx)
 * reads the city the same way without importing the navy header into its bundle. Regression test:
 * tests/unit/site-header-cookie-snapshot.test.ts (PR #34 / React #185: a fresh object each call is fine here because the
 * consumer uses useState, never useSyncExternalStore).
 */
export function readCityCookie(): DetectedLocation | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)el_city=([^;]+)/)
  if (!match) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]))
    if (parsed && typeof parsed.city === 'string') {
      return { ...parsed, source: 'cookie' as const }
    }
  } catch {
    // ignore malformed cookie
  }
  return null
}

/**
 * The city the header names: the page's own city (a city page), else the visitor's chosen one (el_city, read after
 * mount so the server render and the first client render agree), else the fallback. Follows the picker's writes through
 * the el_city_updated event, the one the location picker dispatches.
 */
export function useHeaderCity(fallback: DetectedLocation, pageCity: DetectedLocation | null): DetectedLocation {
  const [cookieLocation, setCookieLocation] = useState<DetectedLocation | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: the cookie is read after hydration so the server render and the first client render agree (the static rendering contract).
    setCookieLocation(readCityCookie())
    const onUpdate = (): void => setCookieLocation(readCityCookie())
    window.addEventListener(EL_CITY_UPDATED, onUpdate)
    return () => window.removeEventListener(EL_CITY_UPDATED, onUpdate)
  }, [])
  return pageCity ?? cookieLocation ?? fallback
}
