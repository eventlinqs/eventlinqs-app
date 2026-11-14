/**
 * ONE NAVIGATION ITEM IS THE CURRENT PAGE, NEVER TWO (the PM's score of 14 November 2026, fix 12; the class, law 4 of
 * C:/dev/CLAUDE.md: every navigation list with a current page).
 *
 * The second look car's screens showed "My events" and "Create event" both filled on /dashboard/events/create at 1440:
 * each item asked on its own whether the path began with its address. The phone's bottom bar had the same fault on
 * /account/saved ("Saved" and "Account"). Both lists now draw through activeNavHref
 * (src/lib/navigation/active-nav-item.ts). This renders each list on every one of its own addresses, and on a path
 * beneath each, and asks for exactly one aria-current="page", the right one.
 */
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { activeNavHref, navItemMatches } from '@/lib/navigation/active-nav-item'

let currentPath = '/'
vi.mock('next/navigation', () => ({ usePathname: () => currentPath }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'

function currentLinks(container: HTMLElement): string[] {
  return [...container.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute('href') ?? '')
}

beforeEach(() => cleanup())

describe('activeNavHref', () => {
  const items = [
    { href: '/dashboard', match: (p: string) => p === '/dashboard' },
    { href: '/dashboard/events' },
    { href: '/dashboard/events/create' },
    { href: '/dashboard/payouts' },
  ]

  it('gives the longest address that holds the path', () => {
    expect(activeNavHref(items, '/dashboard/events/create')).toBe('/dashboard/events/create')
    expect(activeNavHref(items, '/dashboard/events/abc/edit')).toBe('/dashboard/events')
    expect(activeNavHref(items, '/dashboard/events')).toBe('/dashboard/events')
    expect(activeNavHref(items, '/dashboard')).toBe('/dashboard')
  })

  it('never takes a sibling whose name only starts the same', () => {
    expect(navItemMatches({ href: '/dashboard/events' }, '/dashboard/events-archive')).toBe(false)
    expect(activeNavHref(items, '/dashboard/payouts-history')).toBeNull()
  })

  it('answers null for a path that is none of the list', () => {
    expect(activeNavHref(items, '/account')).toBeNull()
  })

  it('keeps an exact item to its own address', () => {
    expect(navItemMatches({ href: '/', matchExact: true }, '/events')).toBe(false)
    expect(navItemMatches({ href: '/', matchExact: true }, '/')).toBe(true)
  })
})

describe('the dashboard sidebar draws one current item', () => {
  const cases: Array<[string, string]> = [
    ['/dashboard', '/dashboard'],
    ['/dashboard/events', '/dashboard/events'],
    ['/dashboard/events/create', '/dashboard/events/create'],
    ['/dashboard/events/0f6c/edit', '/dashboard/events'],
    ['/dashboard/tickets', '/dashboard/tickets'],
    ['/dashboard/payouts', '/dashboard/payouts'],
    ['/dashboard/organisation', '/dashboard/organisation'],
    ['/dashboard/api-keys', '/dashboard/api-keys'],
  ]
  for (const [path, expected] of cases) {
    it(`on ${path}: ${expected} alone`, () => {
      currentPath = path
      const { container } = render(<DashboardSidebar profile={{ role: 'organiser' }} />)
      expect(currentLinks(container)).toEqual([expected])
    })
  }

  it('leaves "Create event" without a fill when it is not the page', () => {
    currentPath = '/dashboard/events'
    const { container } = render(<DashboardSidebar profile={{ role: 'organiser' }} />)
    const create = container.querySelector('a[href="/dashboard/events/create"]')
    expect(create?.getAttribute('aria-current')).toBeNull()
    expect(create?.className).not.toMatch(/\bbg-ink-100\b/)
  })
})

describe('the phone bottom bar draws one current item', () => {
  const cases: Array<[string, string]> = [
    ['/', '/'],
    ['/events', '/events'],
    ['/account', '/account'],
    ['/account/saved', '/account/saved'],
    ['/account/settings', '/account'],
  ]
  for (const [path, expected] of cases) {
    it(`on ${path}: ${expected} alone`, () => {
      currentPath = path
      const { container } = render(<MobileBottomNav />)
      expect(currentLinks(container)).toEqual([expected])
    })
  }
})
