// @vitest-environment jsdom
/**
 * THE CACHED HOME'S REACT #418, FOUND AND PINNED (11 November 2026; car 40's open cause).
 *
 * Vercel's cached render of the home was made for the root's page path "/index" (its embedded router state carries
 * the canonical URL ["", "index"]), so `usePathname()` answered "/index" on the server: the mobile bottom bar drew
 * Home as not the current page, the browser at "/" drew it as the current page, and React threw #418. Every component
 * that draws from the path now reads it through `useRoutePathname()`, which reads "/index" as "/". These tests pin
 * the mapping, the bar's Home on a render made for "/index", and that no file reads `usePathname` directly again.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

let pathname: string | null = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const { routePathname } = await import('@/lib/navigation/route-pathname')
const { MobileBottomNav } = await import('@/components/layout/mobile-bottom-nav')

afterEach(cleanup)

describe('routePathname', () => {
  it('reads the root page path "/index" as the root', () => {
    expect(routePathname('/index')).toBe('/')
  })

  it('keeps every real path as it is', () => {
    for (const p of ['/', '/events', '/city/geelong', '/events/a-night', '/indexes', '/index/more']) expect(routePathname(p)).toBe(p)
  })

  it('reads no pathname as the root', () => {
    expect(routePathname(null)).toBe('/')
    expect(routePathname(undefined)).toBe('/')
    expect(routePathname('')).toBe('/')
  })
})

describe('the mobile bottom bar on a render made for "/index"', () => {
  const home = () => screen.getByRole('link', { name: 'Home' })

  it('draws Home as the current page, exactly as the browser at "/" draws it (no hydration mismatch)', () => {
    pathname = '/index'
    render(<MobileBottomNav />)
    const fromIndex = home().outerHTML
    expect(home().getAttribute('aria-current')).toBe('page')
    cleanup()
    pathname = '/'
    render(<MobileBottomNav />)
    expect(home().outerHTML).toBe(fromIndex)
  })

  it('draws Home as not current anywhere else', () => {
    pathname = '/events'
    render(<MobileBottomNav />)
    expect(home().getAttribute('aria-current')).toBeNull()
  })
})

describe('no file reads usePathname directly (the class, guarded)', () => {
  const ROOT = join(__dirname, '..', '..', '..', 'src')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(name)) files.push(p)
    }
  }
  walk(ROOT)

  it('every reader of the path goes through useRoutePathname', () => {
    const direct = files
      .filter((p) => !p.replace(/\\/g, '/').endsWith('src/lib/navigation/route-pathname.ts'))
      .filter((p) => /\busePathname\b/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(ROOT.length + 1).replace(/\\/g, '/'))
    expect(direct).toEqual([])
  })

  it('the sweep reads the tree (drill: the hook itself is found)', () => {
    expect(files.some((p) => p.replace(/\\/g, '/').endsWith('src/lib/navigation/route-pathname.ts'))).toBe(true)
    expect(files.length).toBeGreaterThan(500)
  })
})
