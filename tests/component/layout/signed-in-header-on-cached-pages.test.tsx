// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { SiteHeaderClient } from '@/components/layout/site-header-client'
import { holdsSessionCookie } from '@/components/layout/use-signed-in-account'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * THE SIGNED IN HEADER ON A PAGE CACHED FOR EVERYONE (WINDOW 5C's 11:57 and the PM's 12:28 of 21 November 2026, item 4):
 * a signed in buyer saw 'Sign in' on the home page, /events and event pages, whose server header is anonymous by design.
 * After the paint, a browser holding a session cookie asks /api/account/me and the header shows the account menu; a
 * browser with none asks nothing.
 */

vi.mock('@/app/actions/auth', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/analytics/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/events/a-night',
}))

const LOCATION: DetectedLocation = { city: 'Melbourne', country: 'Australia', countryCode: 'AU', latitude: -37.81, longitude: 144.96, source: 'cookie' }
const asked: string[] = []

function stubFetch(me: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(String(url))
      if (String(url).includes('/api/account/me')) return { ok: true, status: 200, json: async () => me } as unknown as Response
      return { ok: true, status: 200, json: async () => ({ australia: [], internationalByCountry: [] }) } as unknown as Response
    }),
  )
}

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  clearCookies()
  asked.length = 0
})

describe('the header on a cached page', () => {
  test('a browser holding a session asks who is signed in and swaps Sign in for the account menu', async () => {
    document.cookie = 'sb-gndnldyfudbytbboxesk-auth-token=base64-abc; path=/'
    stubFetch({ signedIn: true, user: { initials: 'AO', displayName: 'Amara' }, email: 'amara@example.com', isAdmin: false })
    render(<SiteHeaderClient location={LOCATION} user={null} />)
    await waitFor(() => expect(asked.some((u) => u.includes('/api/account/me'))).toBe(true))
    await waitFor(() => expect(screen.queryAllByRole('link', { name: /^Sign in$/ }).length).toBe(0))
  })

  test('a browser with no session asks nothing and keeps Sign in', async () => {
    stubFetch({ signedIn: false })
    render(<SiteHeaderClient location={LOCATION} user={null} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(asked.some((u) => u.includes('/api/account/me'))).toBe(false)
    expect(screen.queryAllByRole('link', { name: /^Sign in$/ }).length).toBeGreaterThan(0)
  })

  test('the session cookie is recognised whole or in chunks, and nothing else is', () => {
    expect(holdsSessionCookie('a=1; sb-abc-auth-token=x')).toBe(true)
    expect(holdsSessionCookie('sb-abc-auth-token.0=x; sb-abc-auth-token.1=y')).toBe(true)
    expect(holdsSessionCookie('el_city=melbourne; el_from=x')).toBe(false)
  })
})
