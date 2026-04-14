import Link from 'next/link'

/**
 * SiteHeader — top navigation bar, present on all public pages.
 *
 * Spec §7.1:
 *   - Sticky (top-0 z-50)
 *   - Logo: text "EVENTLINQS" (image swap post-launch)
 *   - Desktop links: Browse, For Organisers
 *   - Right side: Sign in (ghost), Get Started (gold CTA)
 *   - Mobile: logo + hamburger placeholder (full mobile nav is Phase 2)
 *
 * Auth state is not wired here — added in Session 4 when PostHog / auth
 * instrumentation pass happens.
 */
export function SiteHeader() {
  return (
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

        {/* Desktop nav links */}
        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-8">
          <Link
            href="/events"
            className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
          >
            Browse Events
          </Link>
          <Link
            href="/organiser"
            className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
          >
            For Organisers
          </Link>
        </nav>

        {/* Right side CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors px-3 py-2 rounded-lg hover:bg-ink-100"
          >
            Sign in
          </Link>
          <Link
            href="/login?tab=signup"
            className="inline-flex items-center rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
          >
            Get Started
          </Link>
        </div>

      </div>
    </header>
  )
}
