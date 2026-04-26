'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { LocationPicker } from '@/components/ui/location-picker'
import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'
import { NavSearch } from './nav-search'
import type { DetectedLocation } from '@/lib/geo/detect'
import type { PickerCityGroups } from '@/lib/locations/picker-cities'

const NAV_LINKS = [
  { label: 'Browse Events', href: '/events' },
  { label: 'For Organisers', href: '/organisers' },
]

interface SiteHeaderClientProps {
  location: DetectedLocation
  cities: PickerCityGroups
}

/**
 * SiteHeaderClient - sticky top navigation bar client inner.
 *
 * Desktop (md+):
 *   Logo left · Nav centre · LocationPicker + Sign in + Get Started right
 *
 * Mobile (<md):
 *   Logo left · Get Started (compact) · Hamburger button right
 *   Hamburger opens a full-screen sheet nav with:
 *     - All nav links (44px touch targets)
 *     - LocationPicker row
 *     - Sign in + Get Started CTAs
 *     - Focus trap (Tab cycles within sheet)
 *     - Closes on: Esc key, route change, backdrop click
 *
 * Hover: nav links use gold hover to match the logo and overall brand accent.
 */
export function SiteHeaderClient({ location, cities }: SiteHeaderClientProps) {
  const [isOpen, setIsOpen] = useState(false)

  const hamburgerRef  = useRef<HTMLButtonElement>(null)
  const sheetRef      = useRef<HTMLDivElement>(null)

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
      <header className="sticky top-0 z-50 w-full border-b border-ink-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">

          {/* Logo */}
          <EventlinqsLogo asLink size="md" />


          {/* Desktop nav links (hidden below md) */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 shrink-0">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink-600 hover:text-gold-600 transition-colors whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop search - Ticketmaster pill, centred */}
          <NavSearch variant="desktop" />

          {/* Right side - desktop CTAs + mobile hamburger */}
          <div className="flex items-center gap-3 shrink-0 ml-auto md:ml-0">
            {/* Desktop location picker */}
            <div className="hidden md:block">
              <LocationPicker currentLocation={location} cities={cities} />
            </div>

            <Link
              href="/login"
              className="hidden md:inline-flex items-center h-9 px-3 text-sm font-medium text-ink-700 hover:text-gold-600 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
            <Button href="/signup" variant="primary" size="sm" className="hidden md:inline-flex">
              Get Started
            </Button>

            {/* Mobile hamburger (hidden on md+) */}
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setIsOpen(prev => !prev)}
              aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isOpen}
              aria-controls="mobile-nav-sheet"
              className={[
                'md:hidden flex h-11 w-11 items-center justify-center rounded-lg',
                'text-ink-700 hover:bg-ink-100 hover:text-gold-600 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
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

        {/* Mobile search - full-width second row below the nav */}
        <div className="md:hidden border-t border-ink-100 bg-white/95 px-4 py-2.5">
          <NavSearch variant="mobile" />
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
            <LocationPicker currentLocation={location} cities={cities} variant="inline" onChange={closeSheet} />
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
          <Button href="/signup" variant="primary" size="lg" className="w-full" onClick={closeSheet}>
            Get Started
          </Button>
          <Button href="/login" variant="ghost" size="lg" className="w-full" onClick={closeSheet}>
            Sign in
          </Button>
        </div>
      </div>
    </>
  )
}
