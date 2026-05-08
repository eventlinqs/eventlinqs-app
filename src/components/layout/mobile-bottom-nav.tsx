'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Home, LayoutGrid, Search, Heart, User } from 'lucide-react'

/**
 * MobileBottomNav - global persistent bottom navigation for <= 768px
 * (Batch 9 V2).
 *
 * Five-item bar: Home / Browse / Search / Saved / Account. Active
 * state shows a gold underline + filled icon. Glassmorphism background
 * (frosted navy via backdrop-blur). Hides on scroll-down, reveals on
 * scroll-up. Safe-area-inset-bottom padding handles the iPhone X+
 * notch.
 *
 * Hidden on a small set of in-flow pages where it would interfere with
 * UX:
 *   - /checkout/* (checkout flow has its own sticky purchase rail)
 *   - /dashboard/* (organiser dashboard has its own navigation)
 *   - /admin/* (admin panel has its own navigation)
 *   - /login, /signup, /forgot-password (auth flow is full-screen)
 *
 * Sits BELOW the global event-detail StickyActionBar (which is
 * bottom-0 z-40) - this nav is bottom-0 z-40 too, so on event detail
 * pages we hide one or the other (event detail uses
 * StickyActionBar, every other page uses this MobileBottomNav).
 *
 * Hidden on the existing per-page MobileStickyBar pages too: those
 * stickies sit at bottom-16 z-50 and assume this bar fills bottom-0.
 */

const HIDDEN_PREFIXES = [
  '/checkout',
  '/dashboard',
  '/admin',
  '/login',
  '/signup',
  '/forgot-password',
  '/queue',
  '/squad',
  '/orders',
  '/verify-email-sent',
]

const ITEMS = [
  { href: '/',         label: 'Home',    Icon: Home,       matchExact: true },
  { href: '/events',   label: 'Browse',  Icon: LayoutGrid, matchExact: false },
  { href: '/search',   label: 'Search',  Icon: Search,     matchExact: false },
  { href: '/saved',    label: 'Saved',   Icon: Heart,      matchExact: false },
  { href: '/account',  label: 'Account', Icon: User,       matchExact: false },
] as const

export function MobileBottomNav() {
  const pathname = usePathname() ?? '/'
  const [hidden, setHidden] = useState(false)
  const [lastY, setLastY] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      // Show within 100px of top regardless.
      if (y < 100) {
        setHidden(false)
      } else if (y > lastY + 6) {
        setHidden(true)
      } else if (y < lastY - 6) {
        setHidden(false)
      }
      setLastY(y)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [lastY])

  const isHidden = HIDDEN_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (isHidden) return null

  return (
    <nav
      aria-label="Primary"
      className={[
        'fixed inset-x-0 bottom-0 z-40 md:hidden',
        'border-t border-white/10 bg-[var(--color-navy-950)]/85 backdrop-blur-xl',
        'transition-transform duration-300 ease-out',
        hidden ? 'translate-y-full' : 'translate-y-0',
      ].join(' ')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul role="list" className="flex h-16 items-stretch">
        {ITEMS.map(({ href, label, Icon, matchExact }) => {
          const active = matchExact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex h-full flex-col items-center justify-center gap-1 transition-colors',
                  active
                    ? 'text-[var(--brand-accent)]'
                    : 'text-white/65 hover:text-white',
                ].join(' ')}
              >
                <Icon
                  className={[
                    'h-5 w-5 transition-transform',
                    active ? 'scale-110' : 'scale-100',
                  ].join(' ')}
                  fill={active ? 'currentColor' : 'none'}
                  strokeWidth={active ? 0 : 2}
                  aria-hidden
                />
                <span className="text-[10px] font-semibold tracking-tight">
                  {label}
                </span>
                {active ? (
                  <span
                    aria-hidden
                    className="absolute bottom-0 h-[2px] w-10 rounded-full bg-[var(--brand-accent)]"
                  />
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
