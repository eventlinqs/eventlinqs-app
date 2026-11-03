import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide } from '@/components/features/city-guide/city-guide'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * ROUND 5 on the guide itself: (1) the 11:42 sentinel, 'Ended nights shown' on /city/geelong (three library sessions that
 * ended 11:15 to 11:30) because the edge cached page is served from a render made before they ended; the browser now
 * drops every night past its end. (2) fault 5: a row photograph says what it shows, from the cover's own alt.
 */
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'Open Mic Comedy', venue: 'The Barwon Club', city: 'Geelong', category: 'Comedy',
  categorySlug: 'comedy', price: 'Free entry', time: '6:00 pm', free: true, source: 'Free · Walk in',
  format: 'walk_in', cityKey: 'geelong', suburb: 'South Geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November',
  ts: 1, thumb: null, lat: null, lng: null, ...o,
})
const days = {
  todayKey: '2026-11-03', tomorrowKey: '2026-11-04', weekendKeys: ['2026-11-06', '2026-11-07', '2026-11-08'],
  weekKeys: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'],
}
const guide = (rows: DirectoryRow[], renderedAt: number) =>
  render(
    <CityGuide
      city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
      stateName="Victoria" stateCityNames={['geelong']} quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
      rows={rows} days={days} renderedAt={renderedAt}
    />,
  )

describe('round 5: the guide drops a night at its end, even from a stale render', () => {
  it('a night that ended after the render is gone once the page runs; a night still on stays', async () => {
    const now = Date.now()
    guide(
      [
        row({ id: 'ended', href: '/events/preschool-story-time', title: 'Preschool Story Time', until: now - 10 * 60_000 }),
        row({ id: 'on', href: '/events/open-mic', title: 'Open Mic Comedy', until: now + 6 * 3_600_000 }),
      ],
      now - 30 * 60_000, // the cached render was made half an hour ago, before the story time ended
    )
    // The first paint matches the server's (the render's own instant), so hydration changes nothing...
    expect(screen.queryAllByRole('link', { name: /Preschool Story Time/ }).length).toBeGreaterThan(0)
    // ...then the browser's clock drops the night that has ended.
    await waitFor(() => expect(screen.queryAllByRole('link', { name: /Preschool Story Time/ })).toHaveLength(0))
    expect(screen.getAllByRole('link', { name: /Open Mic Comedy/ }).length).toBeGreaterThan(0)
  })
})

describe('round 5 fault 5: a row photograph says what it shows', () => {
  it("the row photo's alt is the cover's own alt", () => {
    guide([row({ id: 'p1', href: '/events/amcf-2026', title: 'African Music and Cultural Festival 2026', thumb: '/p.jpg', thumbAlt: 'A big crowd at the festival in Fed Square, Melbourne' })], Date.now())
    const link = screen.getAllByRole('link', { name: /African Music and Cultural Festival 2026/ })[0]
    const shown = link.querySelector('[data-row-thumb] > img') as HTMLImageElement
    expect(shown.getAttribute('alt')).toBe('A big crowd at the festival in Fed Square, Melbourne')
  })
})
