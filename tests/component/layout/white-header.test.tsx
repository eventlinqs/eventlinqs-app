// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SiteHeaderWhite } from '@/components/layout/site-header-white'
import { SiteHeaderChosen } from '@/components/layout/site-header-chosen'
import { SITE_LOOK } from '@/lib/home/site-look'
import type { DetectedLocation } from '@/lib/geo/detect'

/**
 * THE WHITE HEADER (law 46; the design engine, DESIGN-ENGINE-LOCKED-21NOV.md section 1; Lawal's site.html; the PM's 13:04
 * of 21 November 2026). Its markup at both breakpoints: from lg a search form with the words and the city, sent to /events
 * with q and the city, and Find events, Sell tickets, Help, Log in and Sign up; below lg one search tap target with the
 * city beside it, and the menu. jsdom has no layout, so the breakpoints are read from the classes the browser obeys.
 */

vi.mock('@/app/actions/auth', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/analytics/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}))

const MELBOURNE: DetectedLocation = { city: 'Melbourne', country: 'Australia', countryCode: 'AU', latitude: -37.81, longitude: 144.96, source: 'cookie' }
const GEELONG: DetectedLocation = { ...MELBOURNE, city: 'Geelong', latitude: -38.15, longitude: 144.36 }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ australia: [], internationalByCountry: [] }) }) as unknown as Response))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.cookie = 'el_city=; max-age=0; path=/'
})

const sheet = () => document.getElementById('site-menu-sheet') as HTMLElement
/** A route answers when the app directory holds its page (route groups in brackets are transparent). */
const routeExists = (href: string): boolean => {
  const path = href.split('?')[0].replace(/^\//, '')
  const app = join(process.cwd(), 'src', 'app')
  return [join(app, path, 'page.tsx'), join(app, '(auth)', path, 'page.tsx'), join(app, '(dashboard)', path, 'page.tsx')].some((p) => existsSync(p))
}

describe('the white header', () => {
  test('is the look every page takes while SITE_LOOK.whiteHeader is on (one line picks it, and agrees with the flag)', () => {
    expect(SiteHeaderChosen === SiteHeaderWhite).toBe(SITE_LOOK.whiteHeader)
  })

  test('from lg: a search form sends the words and the city to /events', () => {
    const { container } = render(<SiteHeaderWhite location={MELBOURNE} user={null} />)
    const form = container.querySelector('form[role="search"]') as HTMLFormElement
    expect(form.getAttribute('action')).toBe('/events')
    expect(form.getAttribute('method')).toBe('get')
    expect(form.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'lg:flex']))
    expect((form.querySelector('input[name="q"]') as HTMLInputElement).type).toBe('search')
    expect(screen.getByLabelText('Search events, artists or venues')).toBeTruthy()
    expect((form.querySelector('input[name="city"]') as HTMLInputElement).value).toBe('Melbourne')
    expect(within(form).getByRole('button', { name: 'Change location. Current: Melbourne' })).toBeTruthy()
    expect(within(form).getByRole('button', { name: 'Search events in Melbourne' }).getAttribute('type')).toBe('submit')
  })

  test('a city page names its own city, and the search carries it', () => {
    const { container } = render(<SiteHeaderWhite location={MELBOURNE} pageCity={GEELONG} user={null} />)
    expect((container.querySelector('form[role="search"] input[name="city"]') as HTMLInputElement).value).toBe('Geelong')
  })

  test('from lg: Find events, Sell tickets, Help, Log in and Sign up, each a real route', () => {
    render(<SiteHeaderWhite location={MELBOURNE} user={null} />)
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(nav.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'lg:flex']))
    const links = within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Find events', '/events'],
      ['Sell tickets', '/organisers'],
      ['Help', '/help'],
      ['Log in', '/login'],
      ['Sign up', '/signup'],
    ])
    for (const [, href] of links) expect(routeExists(href as string), href as string).toBe(true)
  })

  test('below lg: one search tap target opening the search, the city beside it, and the menu', () => {
    const { container } = render(<SiteHeaderWhite location={MELBOURNE} user={null} />)
    const row = container.querySelector('[data-phone-search]') as HTMLElement
    expect(row.className.split(' ')).toContain('lg:hidden')
    const open = within(row).getByRole('button', { name: 'Open search' })
    expect(open.id).toBe('header-search-trigger-light')
    expect(open.getAttribute('aria-haspopup')).toBe('dialog')
    expect(within(row).getByRole('button', { name: 'Change location. Current: Melbourne' })).toBeTruthy()
    const menu = screen.getByRole('button', { name: 'Open navigation menu' })
    expect(menu.parentElement?.className.split(' ')).toContain('lg:hidden')
  })

  test('the menu sheet: closed it is nowhere to reach; open it is portalled to the body with every link; Escape closes it', async () => {
    const { container } = render(<SiteHeaderWhite location={MELBOURNE} user={null} />)
    expect(sheet()).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    })
    expect(sheet()).not.toBeNull()
    expect(container.contains(sheet())).toBe(false)
    expect(sheet().parentElement).toBe(document.body)
    const hrefs = within(sheet()).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/events', '/organisers', '/help', '/signup', '/login']))
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(sheet()).toBeNull()
  })

  test('solid white, no blur, no navy bar', () => {
    const { container } = render(<SiteHeaderWhite location={MELBOURNE} user={null} />)
    const header = container.querySelector('header') as HTMLElement
    expect(header.getAttribute('data-header-look')).toBe('white')
    expect(header.className).toContain('bg-white')
    expect(container.innerHTML).not.toMatch(/backdrop-blur|backdrop-filter/)
    expect(header.className).not.toContain('site-header-bar')
  })
})
