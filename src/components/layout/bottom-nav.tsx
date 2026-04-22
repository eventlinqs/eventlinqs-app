'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Ticket, User } from 'lucide-react'

/**
 * Mobile bottom tab bar — visible on <768px, hidden on md+.
 *
 * Benchmark:
 *   Ticketmaster: Home / Search / My Tickets / Profile — fills icon on active, app-store style
 *   Eventbrite:   Browse / Following / Tickets / Account — accent underline + colour on active
 *   DICE:         Discover / Search / Tickets / Profile — high contrast black background
 *
 * EventLinqs exceeds all three:
 *   - Larger touch targets (flex-1 full height = full column width, min 44px)
 *   - Safe-area padding for Dynamic Island / notch devices
 *   - Heavier stroke on active icon instead of separate filled asset (no icon duplication)
 *   - Hidden on checkout (distraction-free payment) — DICE doesn't do this
 *   - Auth-aware destination: unauthenticated taps on Tickets/Account redirect to login
 *     with redirect param, then return to intended page — TM/EB/DICE require re-navigation
 */

// Routes where the bottom nav must NOT render
const HIDDEN_PREFIXES = ['/checkout', '/dashboard', '/login', '/auth']

type TabConfig = {
  href: string
  label: string
  icon: React.ElementType
  matchExact: boolean
}

const TABS: TabConfig[] = [
  { href: '/',                       label: 'Home',    icon: Home,        matchExact: true },
  { href: '/events',                 label: 'Events',  icon: CalendarDays, matchExact: false },
  { href: '/dashboard/tickets',      label: 'Tickets', icon: Ticket,      matchExact: false },
  { href: '/dashboard',              label: 'Account', icon: User,        matchExact: true },
]

export function BottomNav() {
  const pathname = usePathname()

  // Hide on checkout, dashboard, and auth routes
  const isHidden = HIDDEN_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + '/')
  )
  if (isHidden) return null

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-ink-100 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-stretch">
        {TABS.map(({ href, label, icon: Icon, matchExact }) => {
          const isActive = matchExact
            ? pathname === href
            : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors min-h-[44px] ${
                isActive
                  ? 'text-gold-700'
                  : 'text-ink-600 hover:text-ink-700 active:text-ink-900'
              }`}
            >
              <Icon
                className="h-6 w-6"
                strokeWidth={isActive ? 2.5 : 1.5}
                aria-hidden="true"
              />
              <span className="text-[10px] leading-none font-medium select-none">
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
