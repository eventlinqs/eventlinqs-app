// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/events/amcf-2026',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/event-reminder', () => ({ requestEventReminder: vi.fn() }))

import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { WalkInBottomBar } from '@/components/events/walk-in/walk-in-bottom-bar'

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ links: null }), { status: 200 })) as never
})
afterEach(cleanup)

/**
 * WI1: ONE BAR AT THE FOOT OF A PHONE.
 *
 * The site's bottom nav and the walk-in bar are both fixed to the foot of the
 * window at z-40, and the nav comes later in the document, so at 390 it covered
 * Remind me and Share until the visitor scrolled. Locked design A draws the
 * walk-in bar alone there. The fix is three parts that only work together: the
 * nav carries data-bottom-nav, the walk-in bar carries data-walk-in-bar, and
 * globals.css hides the first on any page that has the second. Losing any one
 * part puts the two bars back on top of each other, so all three are held here.
 * The drive proves the result on a real page at 390.
 */
describe('one bar at the foot of a walk-in page', () => {
  it('the site nav carries the attribute the stylesheet hides it by', () => {
    const { container } = render(<MobileBottomNav />)
    expect(container.querySelector('nav[data-bottom-nav]')).not.toBeNull()
  })

  it('the walk-in bar carries the attribute the stylesheet looks for', () => {
    const { container } = render(
      <WalkInBottomBar
        eventId="7f3a2c1e-0b4d-4e5f-9a6b-1c2d3e4f5a6b"
        eventSlug="amcf-2026"
        eventTitle="African Music and Cultural Festival 2026"
        eventUrl="https://www.eventlinqs.com.au/events/amcf-2026"
        remindMeOn
        programPublished={false}
        heading="Get the program when it lands"
        purpose="We send the full timetable when AMCF releases it, and one reminder the day before. Nothing else."
      />,
    )
    expect(container.querySelector('[data-walk-in-bar]')).not.toBeNull()
  })

  it('the stylesheet hides the nav on a page that carries a walk-in bar', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toMatch(/body:has\(\[data-walk-in-bar\]\)\s+\[data-bottom-nav\]\s*\{\s*display:\s*none;\s*\}/)
  })
})
