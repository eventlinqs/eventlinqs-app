'use client'

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { LocationPicker } from '@/components/ui/location-picker'
import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'
import { HeaderSearchTrigger } from './header-search-trigger'
import { SiteHeaderAccountButton, type AccountUser } from './site-header-account-button'
import { SiteHeaderAccountDropdown } from './site-header-account-dropdown'
import { useHeaderScrollState } from '@/hooks/use-header-scroll-state'
import { useHeroPresence } from '@/contexts/hero-presence-context'
import type { DetectedLocation } from '@/lib/geo/detect'
import type { PickerCityGroups } from '@/lib/locations/picker-cities'

const NAV_LINKS = [
  { label: 'Browse Events',  href: '/events' },
  { label: 'Cultures',       href: '/cultures' },
  { label: 'Cities',         href: '/cities' },
  { label: 'For Organisers', href: '/organisers' },
]

interface SiteHeaderClientProps {
  location: DetectedLocation
  cities: PickerCityGroups
  /** Resolved Supabase user (minimal identity) or null when anonymous. */
  user: AccountUser | null
  /** Authenticated user's email; surfaces in the avatar dropdown header. */
  userEmail?: string | null
}

// Stable snapshot cache for the el_city cookie reader.
//
// useSyncExternalStore's getSnapshot contract requires referentially
// identical returns when the underlying data has not changed - React
// calls getSnapshot on every render and uses Object.is to detect store
// changes. The previous implementation returned a fresh object literal
// (`{ ...parsed, source: 'cookie' as const }`) on every call when the
// cookie was set, which fails Object.is, causing React to schedule
// another render to "catch up" indefinitely - triggering React #185
// (Maximum update depth exceeded) the moment a second render fired
// (HeroPresenceProvider update after HeroMedia mounts, scroll-sentinel
// flip, mobile menu toggle, etc). 2026-05-24 production incident.
//
// Cache keyed on the raw cookie segment so identical cookie values
// resolve to identical references; any change in the segment yields a
// new reference, which is exactly the change signal
// useSyncExternalStore is designed to detect.
let cachedCookieSegment: string | null = null
let cachedSnapshot: DetectedLocation | null = null

export function readCityCookie(): DetectedLocation | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)el_city=([^;]+)/)
  const raw = match ? match[1] : null
  if (raw === cachedCookieSegment) return cachedSnapshot
  cachedCookieSegment = raw
  if (!raw) {
    cachedSnapshot = null
    return null
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    if (parsed && typeof parsed.city === 'string') {
      cachedSnapshot = { ...parsed, source: 'cookie' as const }
      return cachedSnapshot
    }
  } catch {
    // ignore malformed cookie
  }
  cachedSnapshot = null
  return null
}

const subscribeCookie = () => () => {}
const getServerCookieSnapshot = (): DetectedLocation | null => null

/**
 * SiteHeaderClient - dual-state glassmorphism navigation (Batch 9.1).
 *
 * State A (top of page on hero-bearing routes):
 *   - Fully transparent background, no border, no backdrop filter
 *   - White wordmark, white nav links, gold dot in EventLinqs logo
 *   - Sits above the hero raster painted by HeroMedia
 *   - Inline search hidden (the hero contains its own primary search)
 *
 * State B (scrolled past 80px, OR no-hero route):
 *   - Background: rgba(10, 22, 40, 0.72)
 *   - backdrop-filter: blur(20px) saturate(180%) (with -webkit prefix)
 *   - 1px solid rgba(212, 164, 55, 0.30) gold border-bottom
 *   - Compact 360px desktop search pill becomes visible
 *   - Mobile retains an icon-only search trigger always
 *
 * Transition: 300ms cubic-bezier(0.22, 1, 0.36, 1). Reduced-motion users
 * get instant transitions via the prefers-reduced-motion media query
 * which is enforced globally in globals.css.
 *
 * Implementation notes:
 *   - Scroll state is sentinel-based (IntersectionObserver), not a scroll
 *     listener. See use-header-scroll-state.ts. Sentinel is mounted in
 *     app/layout.tsx as a 1px / h-20 element.
 *   - State is exposed via `data-scrolled` and `data-no-hero` attributes
 *     so styling is CSS-driven; React does not re-render per scroll
 *     frame (state only flips when sentinel crosses the viewport edge).
 *   - On no-hero routes (HeroPresence.hasHero === false) State B is
 *     forced from initial paint to avoid SSR transparent flash.
 *   - HeroMedia itself is NOT mutated; only a thin tracker wrapper
 *     registers with the HeroPresenceProvider.
 *   - Glassmorphism degrades to rgba(10, 22, 40, 0.95) on browsers
 *     without backdrop-filter via the @supports rule in globals.css.
 */
export function SiteHeaderClient({ location, cities, user, userEmail }: SiteHeaderClientProps) {
  const dropdownUser = user && userEmail ? { ...user, email: userEmail } : null
  const [isOpen, setIsOpen] = useState(false)

  const cookieLocation = useSyncExternalStore(
    subscribeCookie,
    readCityCookie,
    getServerCookieSnapshot,
  )
  const displayLocation = cookieLocation ?? location

  const scrolled = useHeaderScrollState('header-scroll-sentinel')
  const { hasHero } = useHeroPresence()

  // State B is active when scrolled past sentinel OR there is no hero on
  // the page at all. Both lock the header into the navy frosted state.
  const stateB = scrolled || !hasHero

  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const sheetRef     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        hamburgerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      const firstFocusable = sheetRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [isOpen])

  const handleSheetKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const focusable = Array.from(
      sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => el.offsetParent !== null)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last  = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  const closeSheet = useCallback(() => {
    setIsOpen(false)
    hamburgerRef.current?.focus()
  }, [])

  return (
    <>
      <header
        data-scrolled={stateB ? '1' : '0'}
        data-no-hero={!hasHero ? '1' : '0'}
        className={[
          'site-header-glass',
          'sticky top-0 z-50 w-full',
          'transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300',
          'motion-reduce:transition-none',
        ].join(' ')}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">

          <EventlinqsLogo asLink size="md" variant="inverted" />

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 shrink-0">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/85 hover:text-[var(--brand-accent)] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] rounded-sm"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop search pill - State B only. `inert` removes the
           *  trigger from the focus order entirely while State A is
           *  active; `aria-hidden` mirrors it for AT. This pair is the
           *  axe-recommended remedy for aria-hidden-focus violations. */}
          <div
            className={[
              'hidden md:flex flex-1 justify-center',
              'transition-opacity duration-300 motion-reduce:transition-none',
              stateB ? 'opacity-100' : 'pointer-events-none opacity-0',
            ].join(' ')}
            aria-hidden={stateB ? undefined : true}
            inert={!stateB}
            style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
          >
            <HeaderSearchTrigger variant="desktop-pill" />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto md:ml-0">
            {/* Mobile search icon - always visible */}
            <div className="md:hidden">
              <HeaderSearchTrigger variant="mobile-icon" />
            </div>

            <div className="hidden md:block">
              <LocationPicker currentLocation={displayLocation} cities={cities} variant="onDark" />
            </div>

            {dropdownUser ? (
              <div className="hidden md:flex items-center">
                <SiteHeaderAccountDropdown user={dropdownUser} size="header" />
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  prefetch={false}
                  className="hidden md:inline-flex items-center h-9 px-3 text-sm font-medium text-white/85 hover:text-[var(--brand-accent)] transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]"
                >
                  Sign in
                </Link>
                <Button href="/signup" prefetch={false} variant="primary" size="sm" className="hidden md:inline-flex">
                  Get Started
                </Button>
              </>
            )}

            {/* Mobile avatar (authenticated only) - sits left of the hamburger so the nav drawer remains the canonical mobile-nav surface. */}
            {dropdownUser ? (
              <div className="md:hidden">
                <SiteHeaderAccountDropdown user={dropdownUser} size="header" />
              </div>
            ) : null}

            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setIsOpen(prev => !prev)}
              aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isOpen}
              aria-controls="mobile-nav-sheet"
              className={[
                'md:hidden flex h-11 w-11 items-center justify-center rounded-lg',
                'text-white/90 hover:bg-white/10 hover:text-[var(--brand-accent)] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]',
              ].join(' ')}
            >
              <span className="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18M3 18h18" />
                )}
              </svg>
            </button>
          </div>

        </div>
      </header>

      {/* Mobile sheet backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/60 md:hidden"
          aria-hidden="true"
          onClick={closeSheet}
        />
      )}

      {/* Mobile sheet */}
      <div
        id="mobile-nav-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onKeyDown={handleSheetKeyDown}
        className={[
          'fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl md:hidden',
          'flex flex-col transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-16 items-center justify-between border-b border-ink-100 px-4">
          <Link
            href="/"
            aria-label="EventLinqs home"
            className="inline-flex items-baseline rounded-sm transition-colors hover:text-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
            onClick={closeSheet}
          >
            <EventlinqsLogo size="md" />
          </Link>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close navigation menu"
            className={[
              'flex h-11 w-11 items-center justify-center rounded-lg',
              'text-ink-600 hover:bg-ink-100 hover:text-gold-600 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
            ].join(' ')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Mobile navigation">
          <div className="mb-4">
            <LocationPicker currentLocation={displayLocation} cities={cities} variant="inline" onChange={closeSheet} />
          </div>
          <ul className="space-y-1">
            {NAV_LINKS.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={[
                    'flex min-h-[44px] items-center rounded-lg px-4 py-3',
                    'text-base font-medium text-ink-700 hover:bg-ink-100 hover:text-gold-600',
                    'transition-colors focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset',
                  ].join(' ')}
                  onClick={closeSheet}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-ink-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
          {user ? (
            <>
              <div className="flex items-center justify-start py-2">
                <SiteHeaderAccountButton user={user} size="drawer" />
              </div>
              <Button href="/account" prefetch={false} variant="primary" size="lg" className="w-full" onClick={closeSheet}>
                View account
              </Button>
            </>
          ) : (
            <>
              <Button href="/signup" prefetch={false} variant="primary" size="lg" className="w-full" onClick={closeSheet}>
                Get Started
              </Button>
              <Button href="/login" prefetch={false} variant="ghost" size="lg" className="w-full" onClick={closeSheet}>
                Sign in
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
