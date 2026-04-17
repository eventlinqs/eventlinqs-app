'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/Button'

const NAV_LINKS = [
  { label: 'Browse Events', href: '/events' },
  { label: 'For Organisers', href: '/organisers' },
]

/**
 * SiteHeader — sticky top navigation bar, present on all public pages.
 *
 * Desktop (md+):
 *   Logo left · Nav centre · Sign in + Get Started right
 *
 * Mobile (<md):
 *   Logo left · Get Started (compact) · Hamburger button right
 *   Hamburger opens a full-screen sheet nav with:
 *     - All nav links (44px touch targets)
 *     - Sign in + Get Started CTAs
 *     - Focus trap (Tab cycles within sheet)
 *     - Closes on: Esc key, route change, backdrop click
 *
 * Accessibility:
 *   - aria-label on hamburger button
 *   - aria-expanded reflects sheet state
 *   - aria-controls links button to the sheet
 *   - Focus returns to hamburger on close
 *   - Sheet announces role="dialog" with aria-modal
 */
export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const hamburgerRef  = useRef<HTMLButtonElement>(null)
  const sheetRef      = useRef<HTMLDivElement>(null)

  // ── Close on route change ────────────────────────────────────────────
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // ── Esc key listener ─────────────────────────────────────────────────
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

  // ── Prevent body scroll when sheet is open ───────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // ── Focus trap ───────────────────────────────────────────────────────
  // Move focus into the sheet when it opens.
  useEffect(() => {
    if (!isOpen) return
    // Small delay so the element is rendered before focus
    const timer = setTimeout(() => {
      const firstFocusable = sheetRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [isOpen])

  // Tab key cycling within the sheet
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
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

          {/* Logo */}
          <Link
            href="/"
            className="font-display text-lg font-extrabold tracking-tight text-ink-900 hover:text-gold-500 transition-colors"
            aria-label="EventLinqs — home"
          >
            EVENTLINQS
          </Link>

          {/* Desktop nav links (hidden below md) */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side — desktop CTAs + mobile hamburger */}
          <div className="flex items-center gap-3">
            {/* Desktop auth buttons (hidden below sm) */}
            <Button href="/login" variant="ghost" size="sm" className="hidden md:inline-flex">
              Sign in
            </Button>
            <Button href="/login?tab=signup" variant="primary" size="sm" className="hidden md:inline-flex">
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
                'text-ink-700 hover:bg-ink-100 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
              ].join(' ')}
            >
              {/* Animated hamburger → X icon */}
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
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </>
                ) : (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18M3 18h18" />
                  </>
                )}
              </svg>
            </button>
          </div>

        </div>
      </header>

      {/* ── Mobile full-screen sheet nav ──────────────────────────────────── */}
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/60 md:hidden"
          aria-hidden="true"
          onClick={closeSheet}
        />
      )}

      {/* Sheet */}
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
        {/* Sheet header */}
        <div className="flex h-16 items-center justify-between border-b border-ink-100 px-4">
          <Link
            href="/"
            className="font-display text-lg font-extrabold tracking-tight text-ink-900"
            onClick={closeSheet}
          >
            EVENTLINQS
          </Link>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close navigation menu"
            className={[
              'flex h-11 w-11 items-center justify-center rounded-lg',
              'text-ink-600 hover:bg-ink-100 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
            ].join(' ')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav links — 44px minimum touch targets */}
        <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Mobile navigation">
          <ul className="space-y-1">
            {NAV_LINKS.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={[
                    'flex min-h-[44px] items-center rounded-lg px-4 py-3',
                    'text-base font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900',
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

        {/* Auth CTAs pinned to bottom — safe-area aware */}
        <div className="border-t border-ink-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
          <Button href="/login?tab=signup" variant="primary" size="lg" className="w-full" onClick={closeSheet}>
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
