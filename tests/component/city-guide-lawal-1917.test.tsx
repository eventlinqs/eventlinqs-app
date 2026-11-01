import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide, EXPLORE_ORDER } from '@/components/features/city-guide/city-guide'
import { AFTER_THE_GUIDE } from '@/lib/home/after-the-guide'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * LAWAL'S DESIGN NOTES OF 1 NOVEMBER 2026, 19:17 (relayed by the CONTROLLER at 19:19; governing
 * C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md): (1) the home reads as a What's On guide; (2) the community
 * thread sits at the bottom, never dominating, and any section after the guide is a flag, never deleted; (3) the
 * Explore tiles run in the order a visitor looks: music, sport, comedy, nightlife, markets, food and drink, family,
 * arts, then the rest; sport is never buried under a bigger count.
 */
const row = (id: string, slug: string, label: string): DirectoryRow => ({
  id, href: `/events/${id}`, title: `Night ${id}`, venue: 'Somewhere', city: 'Geelong', category: label, categorySlug: slug,
  price: 'Free entry', time: '7:00 pm', free: true, source: 'Walk in, no ticket needed', format: 'walk_in',
  cityKey: 'geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November', ts: Number(id.replace(/\D/g, '')) || 0,
  thumb: null, lat: null, lng: null, suburb: null,
})
const days = { todayKey: '2026-11-01', tomorrowKey: '2026-11-02', weekendKeys: ['2026-11-01'], weekKeys: ['2026-11-01', '2026-11-02', '2026-11-03'] }

describe('Lawal\u2019s 19:17 notes', () => {
  it('the Explore tiles run music, sport, comedy, nightlife, markets, food and drink, family, arts, then the rest by count', () => {
    expect(EXPLORE_ORDER).toEqual(['music', 'sports', 'comedy', 'nightlife', 'markets', 'food-drink', 'family', 'arts-community'])
    const rows = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => row(id, 'community', 'Community')),
      ...['b1', 'b2', 'b3', 'b4'].map((id) => row(id, 'nightlife', 'Nightlife')),
      row('c1', 'sports', 'Sports'),
      row('d1', 'music', 'Music'),
      ...['e1', 'e2'].map((id) => row(id, 'education', 'Education')),
    ]
    render(
      <CityGuide
        city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
        stateName="Victoria" stateCityNames={['geelong']} quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
        rows={rows} days={days}
      />,
    )
    const names = within(screen.getByRole('region', { name: 'Explore Geelong' }))
      .getAllByRole('button')
      .map((b) => b.querySelectorAll('span')[1]?.textContent)
    // Community last since the Geelong reference directive of 2 November 2026, section 2.
    expect(names).toEqual(['Music', 'Sports', 'Nightlife', 'Education', 'Community', 'All events'])
  })

  it('after the guide: the Featured slots, every city, then the communities LAST, each a flag that is on', () => {
    const home = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')
    const featured = home.indexOf('AFTER_THE_GUIDE.featuredSlots')
    const cities = home.indexOf('AFTER_THE_GUIDE.everyCity')
    const communities = home.indexOf('AFTER_THE_GUIDE.communities')
    expect(featured).toBeGreaterThan(0)
    expect(cities).toBeGreaterThan(featured)
    expect(communities).toBeGreaterThan(cities)
    expect(AFTER_THE_GUIDE).toEqual({ featuredSlots: true, everyCity: true, communities: true })
  })

  it('the home names itself a What\u2019s On guide and keeps the brand line\u2019s source untouched', () => {
    const home = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')
    expect(home).toMatch(/title: 'What\u2019s on in Geelong: /)
    expect(home).not.toContain('Every community. Every event. One platform.')
    expect(home).toContain('where events get made')
  })
})
