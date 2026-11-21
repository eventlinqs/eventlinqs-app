'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ArrowRight, Search } from 'lucide-react'
import { LocationPicker } from '@/components/ui/location-picker'
import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'
import { HeaderSearchTrigger } from './header-search-trigger'
import { SiteHeaderAccountButton, type AccountUser } from './site-header-account-button'
import { SiteHeaderAccountDropdown } from './site-header-account-dropdown'
import { useSignedInAccount } from './use-signed-in-account'
import { useHeaderCity } from './header-city'
import type { DetectedLocation } from '@/lib/geo/detect'
import { useChosenEventsHref } from '@/lib/hooks/use-chosen-events-href'

/**
 * THE WHITE HEADER (law 46 and the design engine, C:\dev\START-16OCT\DESIGN-ENGINE-LOCKED-21NOV.md section 1: "white
 * header, search and location in the header, Find events, Sell tickets, Help, Log in, Sign up"; Lawal's site.html,
 * C:\dev\EVIDENCE\EL-21NOV\nl-design\whats-on; the PM's 13:04 of 21 November 2026). Every page takes it from the one
 * server wrapper (site-header.tsx) while SITE_LOOK.whiteHeader is on; the navy dual state bar stays in
 * site-header-client.tsx behind the flag (law 13).
 *
 * From lg: the logo; a search form, the words and the city beside them, submitting to /events with q and the city
 * (the /events search, which matches the city's NAME, any detected town included, against its venues; /events sends a
 * city to its guide only when nothing else is asked, src/lib/seo/query-redirects.ts guideForEventsQuery, since Vercel's
 * edge matched 'Melbourne' in any case and /city/Melbourne was a 404 on 21 November 2026; /city/<any case> now answers
 * 308 to its slug); Find events
 * (the visitor's chosen city's guide, else every event), Sell tickets,
 * Help, Log in and Sign up, or the account menu. Below lg: the logo and the menu in the bar, and under it, scrolling
 * away with the page, one search tap target opening the search and the city beside it.
 *
 * Solid white, no blur (no glassmorphism); brand tokens only (navy text, gold accents, the gold text tier on white).
 * No image and nothing heavy: the overlay and the city list are fetched on intent by their own components.
 */

const NAV = [
  { label: 'Find events', href: '/events' },
  { label: 'Sell tickets', href: '/organisers' },
  { label: 'Help', href: '/help' },
] as const

const NAV_LINK =
  'inline-flex min-h-11 items-center rounded-lg px-1 font-display text-sm font-bold text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2'
const SIGN_UP =
  'inline-flex min-h-11 items-center rounded-full bg-ink-900 px-5 font-display text-sm font-bold text-white transition-colors hover:bg-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2'
const DRAWER_LINK =
  'flex min-h-12 items-center rounded-lg px-3 font-display text-base font-bold text-ink-900 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset'

interface Props {
  location: DetectedLocation
  user: AccountUser | null
  userEmail?: string | null
  isAdmin?: boolean
  /** The city a city page is about: the header names it before any remembered one. */
  pageCity?: DetectedLocation | null
}

export function SiteHeaderWhite({ location, user: serverUser, userEmail: serverEmail, isAdmin: serverAdmin = false, pageCity = null }: Props) {
  // On a page cached for everyone the server sends the anonymous header; a browser holding a session asks who is signed
  // in after the paint (use-signed-in-account.ts; the PM's 12:28 of 21 November 2026, item 4).
  const { user, email: userEmail, isAdmin } = useSignedInAccount(serverUser, serverEmail ?? null, serverAdmin)
  const dropdownUser = user && userEmail ? { ...user, email: userEmail } : null
  const city = useHeaderCity(location, pageCity)
  const eventsHref = useChosenEventsHref()
  const hrefOf = (href: string) => (href === '/events' ? eventsHref : href)

  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const closeSheet = useCallback(() => {
    setIsOpen(false)
    menuRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const timer = setTimeout(() => {
      sheetRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus()
    }, 50)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      clearTimeout(timer)
    }
  }, [isOpen, closeSheet])

  // Tab stays inside the open sheet (a dialog), wrapping at both ends.
  const onSheetKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input')).filter(
      (el) => el.offsetParent !== null,
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  return (
    <>
      <header data-header-look="white" className="sticky top-0 z-50 w-full border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:h-[72px] lg:gap-5 lg:px-8">
          <EventlinqsLogo asLink size="md" />

          {/* The search, from lg: the words and the city, one form, the gold button sends it. */}
          <form
            role="search"
            action="/events"
            method="get"
            className="hidden h-12 min-w-0 max-w-[620px] flex-1 items-center gap-2 rounded-full border border-ink-200 bg-white pl-4 pr-1.5 focus-within:border-ink-400 lg:flex"
          >
            <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            <label htmlFor="site-search-q" className="sr-only">
              Search events, artists or venues
            </label>
            <input
              id="site-search-q"
              name="q"
              type="search"
              autoComplete="off"
              placeholder="Search events, artists or venues"
              className="h-11 min-w-0 flex-1 bg-transparent font-display text-[15px] font-semibold text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            <input type="hidden" name="city" value={city.city} />
            <LocationPicker currentLocation={city} variant="field" />
            <button
              type="submit"
              aria-label={`Search events in ${city.city}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)] text-[var(--color-navy-950)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-navy-950)] focus-visible:ring-offset-2"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </form>

          <nav aria-label="Primary navigation" className="ml-auto hidden shrink-0 items-center gap-4 lg:flex">
            {NAV.map((l) => (
              <Link key={l.href} href={hrefOf(l.href)} prefetch={false} className={NAV_LINK}>
                {l.label}
              </Link>
            ))}
            {dropdownUser ? (
              <SiteHeaderAccountDropdown user={dropdownUser} size="header" isAdmin={isAdmin} />
            ) : (
              <>
                <Link href="/login" prefetch={false} className={NAV_LINK}>
                  Log in
                </Link>
                <Link href="/signup" prefetch={false} className={SIGN_UP}>
                  Sign up
                </Link>
              </>
            )}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:hidden">
            {dropdownUser ? <SiteHeaderAccountDropdown user={dropdownUser} size="header" isAdmin={isAdmin} /> : null}
            <button
              ref={menuRef}
              type="button"
              onClick={() => setIsOpen((o) => !o)}
              aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isOpen}
              aria-controls="site-menu-sheet"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-900 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Below lg: the search and the city under the bar, scrolling away with the page (site.html at 390). */}
      <div data-phone-search className="border-b border-ink-100 bg-white px-4 py-2.5 sm:px-6 lg:hidden">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-1 rounded-full border border-ink-200 bg-white pl-3 pr-1">
          <HeaderSearchTrigger variant="light-pill" />
          <LocationPicker currentLocation={city} variant="field" />
        </div>
      </div>

      {/* The menu sheet, rendered into the body only while open (overlays-are-portalled: no ancestor's stacking context can
          trap it), so a closed sheet is nowhere for Tab or a screen reader to reach. */}
      {isOpen
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[60] bg-ink-900/60 lg:hidden" aria-hidden="true" onClick={closeSheet} />
              <div
                id="site-menu-sheet"
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                onKeyDown={onSheetKeyDown}
                className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-sm flex-col bg-white shadow-[var(--shadow-modal)] lg:hidden"
              >
          <div className="flex h-16 items-center justify-between border-b border-ink-100 px-4">
            <EventlinqsLogo size="md" />
            <button
              type="button"
              onClick={closeSheet}
              aria-label="Close navigation menu"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-4 py-5">
            <div className="mb-4">
              <LocationPicker currentLocation={city} variant="inline" onChange={closeSheet} />
            </div>
            <ul className="space-y-1">
              {NAV.map((l) => (
                <li key={l.href}>
                  <Link href={hrefOf(l.href)} prefetch={false} className={DRAWER_LINK} onClick={closeSheet}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-3 border-t border-ink-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {user ? (
              <>
                <div className="flex items-center py-2">
                  <SiteHeaderAccountButton user={user} size="drawer" />
                </div>
                <Link href="/account" prefetch={false} className={`${SIGN_UP} w-full justify-center`} onClick={closeSheet}>
                  View account
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup" prefetch={false} className={`${SIGN_UP} w-full justify-center`} onClick={closeSheet}>
                  Sign up
                </Link>
                <Link
                  href="/login"
                  prefetch={false}
                  className="flex min-h-11 w-full items-center justify-center rounded-full border border-ink-200 font-display text-sm font-bold text-ink-900 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
                  onClick={closeSheet}
                >
                  Log in
                </Link>
              </>
            )}
          </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  )
}
