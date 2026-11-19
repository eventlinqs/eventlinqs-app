import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { activeHref, ADMIN_NAV, ADMIN_NAV_GROUPS, filterNav, filterNavGroups } from '@/components/admin/admin-nav'

/*
 * ONE NAVIGATION BY WORKFLOW (Lawal, 15 November 2026, 20:52, item 2: "a workflow-organized admin page ... Today, Events,
 * Organisers, Outreach, Social, Automation, Money, Settings"). Every admin page sits in exactly one group, every link
 * answers a page that exists, and the page you are on is marked.
 */

describe("the admin navigation in Lawal's eight groups", () => {
  it('holds the eight groups in his order', () => {
    expect(ADMIN_NAV_GROUPS.map((g) => g.label)).toEqual(['Today', 'Events', 'Organisers', 'Outreach', 'Social', 'Automation', 'Money', 'Settings'])
  })

  it('places every page once: the 37 the flat list held on 15 November, the Communications centre (Law 24, 18 November) and the engine page (A4, 19 November 2026)', () => {
    const hrefs = ADMIN_NAV.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs.length).toBe(39)
    for (const h of ['/admin/automation', '/admin/engine', '/admin/today', '/admin', '/admin/submissions', '/admin/social', '/admin/acquisition', '/admin/payouts', '/admin/audit', '/admin/comms']) {
      expect(hrefs).toContain(h)
    }
  })

  it('every link answers a page in the app', () => {
    for (const { href } of ADMIN_NAV) {
      const rel = href === '/admin' ? '' : href.replace(/^\/admin\//, '')
      const page = join(process.cwd(), 'src/app/admin/(authed)', rel, 'page.tsx')
      expect(existsSync(page), href).toBe(true)
    }
  })

  it('shows a viewer only what they may open, and leaves an empty group out', () => {
    const groups = filterNavGroups(['admin.dashboard.view'])
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Automation'])
    expect(groups.flatMap((g) => g.items).map((i) => i.href)).toEqual(['/admin/today', '/admin', '/admin/health', '/admin/automation', '/admin/engine'])
    expect(filterNav(['admin.dashboard.view']).length).toBe(5)
  })

  it('marks the page you are on, the deepest match winning', () => {
    const links = ADMIN_NAV.map(({ label, href }) => ({ label, href }))
    expect(activeHref('/admin/orders/unfulfilled', links)).toBe('/admin/orders/unfulfilled')
    expect(activeHref('/admin/orders/123', links)).toBe('/admin/orders')
    expect(activeHref('/admin', links)).toBe('/admin')
    expect(activeHref('/admin/automation', links)).toBe('/admin/automation')
    expect(activeHref('/admin/venues/photos', links)).toBe('/admin/venues/photos')
  })
})
