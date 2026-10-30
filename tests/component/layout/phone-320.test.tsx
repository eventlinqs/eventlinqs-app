// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SiteHeaderClient } from '@/components/layout/site-header-client'
import { ConsentBannerShell } from '@/components/analytics/consent-banner-shell'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * THE PHONE TEST's TWO FAULTS AT 320 x 568 (window 5, live, 31 October 2026; the CONTROLLER's 06:16 (1) and (2)).
 *
 * (1) Measured on live: the header bar needs 382 px (16 padding, the logo 125, a 20 gap, then search 44, 'Get Started'
 * 101 and the menu 44 with their two 8 gaps, 16 padding), so below that the menu button, the LAST item, is pushed off
 * the right edge: at 320 and 340 it cannot be tapped at all, at 360 it is clipped. Without 'Get Started' the bar needs
 * 273 px. So the bar shows 'Get Started' from 390 up, and below 390 it lives where it already is, in the menu sheet.
 * jsdom lays nothing out, so this pins the classes; the 320 tap test on the preview proves the layout.
 *
 * (2) At 568 tall the open cookie banner plus the bottom bar covered more than half the screen. The banner's words are
 * consent wording and only change by a dated new version, so its LAYOUT is what tightens, on screens 600 px tall or
 * less only (568 failed; 667, the next height tested, passed): less padding, a smaller gap, the 12 px size the
 * platform already uses. The bar stays above the banner (AN1).
 */

vi.mock('@/app/actions/auth', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/analytics/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}))

const LOCATION: DetectedLocation = { city: 'Melbourne', country: 'Australia', countryCode: 'AU', latitude: -37.81, longitude: 144.96, source: 'cookie' }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ australia: [], internationalByCountry: [] }) }) as unknown as Response))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the header at 320', () => {
  test("the bar's 'Get Started' is shown from 390 up only, so the menu button always fits", () => {
    const { container } = render(<SiteHeaderClient location={LOCATION} user={null} />)
    const sheet = container.ownerDocument.getElementById('mobile-nav-sheet') as HTMLElement
    const inBar = [...container.querySelectorAll('a[href="/signup"]')].filter((a) => !sheet.contains(a))
    expect(inBar).toHaveLength(1)
    const holder = inBar[0].parentElement as HTMLElement
    expect(holder.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'min-[390px]:block']))
  })

  test("below 390 'Get Started' is still one tap away, in the menu sheet", () => {
    render(<SiteHeaderClient location={LOCATION} user={null} />)
    const sheet = document.getElementById('mobile-nav-sheet') as HTMLElement
    expect([...sheet.querySelectorAll('a[href="/signup"]')].some((a) => /Get Started/.test(a.textContent ?? ''))).toBe(true)
  })
})

describe('the cookie banner on a short screen', () => {
  test('tightens its layout at 600 px tall or less, its words unchanged', () => {
    const { container } = render(<ConsentBannerShell />)
    const shell = container.firstElementChild as HTMLElement
    const short = '[@media(max-height:600px)]:'
    expect(shell.className).toContain(`${short}pt-3`)
    expect((shell.querySelector('div') as HTMLElement).className).toContain(`${short}gap-3`)
    const words = shell.querySelector('p') as HTMLElement
    expect(words.className).toContain(`${short}text-xs`)
    expect(words.textContent).toMatch(/None of it runs until you say yes/)
  })
})
