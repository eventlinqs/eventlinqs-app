// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SiteHeaderClient } from '@/components/layout/site-header-client'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * THE CLOSED MENU IS OUT OF THE KEYBOARD'S REACH (window 2, 28 October 2026, the accessibility pass of the project
 * manager's 11:30). Found on production at 390 and 768: after "Open menu", Tab walked into the navigation sheet,
 * which is closed and only translated off the screen, and then cycled inside it, so a keyboard user never reached
 * the page (WCAG 2.1.2 and 2.4.3; axe cannot see it, C:\dev\EVIDENCE\A11Y-28OCT\baseline-main).
 *
 * jsdom has no Tab and no layout, so the test reads what the browser obeys: while closed the sheet is inert (out of
 * the focus order and away from a screen reader) and hidden from assistive technology; open, it is neither.
 */

vi.mock('@/app/actions/auth', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/analytics/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}))

const LOCATION: DetectedLocation = {
  city: 'Melbourne',
  country: 'Australia',
  countryCode: 'AU',
  latitude: -37.81,
  longitude: 144.96,
  source: 'cookie',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ australia: [], internationalByCountry: [] }) }) as unknown as Response))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const sheet = () => document.getElementById('mobile-nav-sheet') as HTMLElement

describe('the navigation sheet', () => {
  test('closed: inert and hidden from assistive technology, so Tab passes it by', () => {
    render(<SiteHeaderClient location={LOCATION} user={null} />)
    expect(sheet().hasAttribute('inert')).toBe(true)
    expect(sheet().getAttribute('aria-hidden')).toBe('true')
  })

  test('open: reachable; closed again: out of reach again', async () => {
    render(<SiteHeaderClient location={LOCATION} user={null} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    })
    expect(sheet().hasAttribute('inert')).toBe(false)
    expect(sheet().hasAttribute('aria-hidden')).toBe(false)
    await act(async () => {
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Close navigation menu' }))
    })
    expect(sheet().hasAttribute('inert')).toBe(true)
    expect(sheet().getAttribute('aria-hidden')).toBe('true')
  })
})
