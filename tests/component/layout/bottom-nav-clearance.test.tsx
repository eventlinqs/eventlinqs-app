// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MainContentFrame } from '@/components/layout/main-content-frame'
import { BOTTOM_NAV_HIDDEN_PREFIXES, bottomNavHiddenOn } from '@/components/layout/mobile-bottom-nav'

/**
 * THE MOBILE BAR'S CLEARANCE (close-out UX5).
 *
 * The root layout reserved 64px at the bottom of EVERY page for
 * `MobileBottomNav`, and that bar returns null on ten route prefixes, none of
 * which renders SiteFooter - the component that paints the reserved strip
 * everywhere else. Measured on /admin/enrol-2fa at 390: the console's dark
 * shell ended at 1217 and the document was 1281 tall, so 64px of pale canvas
 * sat under a dark surface.
 *
 * These tests hold the two halves that can silently invert:
 *   - the strip is STILL reserved where the bar is drawn (losing that would
 *     put the tab bar on top of the last row of the footer, which is worse
 *     than the band);
 *   - it is NOT reserved on any prefix where the bar is hidden.
 *
 * The list is read from the source rather than retyped, so a prefix added to
 * the bar's own list is covered here the moment it is added.
 */
let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

afterEach(cleanup)

function reservationAt(path: string): string {
  pathname = path
  const { container } = render(<MainContentFrame><p>content</p></MainContentFrame>)
  const wrapper = container.querySelector('#main-content')
  expect(wrapper, 'the frame renders #main-content').not.toBeNull()
  return wrapper!.className
}

describe('the mobile bottom bar reserves its height only where it renders', () => {
  test.each([...BOTTOM_NAV_HIDDEN_PREFIXES])('no reservation on %s, where the bar is hidden', (prefix) => {
    expect(bottomNavHiddenOn(prefix)).toBe(true)
    expect(reservationAt(prefix)).not.toContain('pb-16')
  })

  test.each([...BOTTOM_NAV_HIDDEN_PREFIXES])('no reservation on a child route of %s', (prefix) => {
    expect(reservationAt(`${prefix}/something/deeper`)).not.toContain('pb-16')
  })

  test.each(['/', '/events', '/events/some-event-slug', '/community/african', '/cities'])(
    'the strip is still reserved on %s, where the bar is drawn',
    (path) => {
      expect(bottomNavHiddenOn(path)).toBe(false)
      expect(reservationAt(path)).toContain('pb-16')
    },
  )

  test('a path that merely starts with the same letters is not treated as the prefix', () => {
    // `/loginbook` is not `/login`. Matching on a bare startsWith would reserve
    // nothing here and the bar would sit on the content.
    expect(bottomNavHiddenOn('/loginbook')).toBe(false)
    expect(bottomNavHiddenOn('/admins')).toBe(false)
    expect(bottomNavHiddenOn('/orders-and-refunds')).toBe(false)
  })

  test('the reservation is mobile-only, so desktop is untouched', () => {
    expect(reservationAt('/')).toContain('md:pb-0')
  })
})
