import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/bendigo',
}))

import { CityGuide } from '@/components/features/city-guide/city-guide'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * A TILE'S NUMBER IS WHAT ITS TAP SHOWS (6 November 2026; the CONTROLLER's 18:30 (1)). Explore's tiles count every date
 * ('All events 88 events', 'Music 40 events': eventCount and eventsByCategory over the place's rows), but a tap only set the
 * category and scrolled to the list, which opens on the next 3 months. So the tile promised more than it showed, and 'All
 * events', with nothing to clear, only scrolled: the settled every-tap read it 'SCROLL ONLY' on /city/bendigo at 390 (the old
 * read's 'the page changes' was rows still rendering). A tile now shows all dates, so the list holds exactly what it counts.
 */
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'A November Gig', venue: 'The Capital', city: 'Bendigo', category: 'Music',
  categorySlug: 'music', price: 'From $30', time: '8:00 pm', free: false, source: 'Tickets', format: 'ticketed',
  cityKey: 'bendigo', suburb: 'Bendigo', dayKey: '2026-11-20', dayLabel: 'Friday 20 November', ts: 1, thumb: null,
  lat: null, lng: null, ...o,
})
const days = { todayKey: '2026-11-06', tomorrowKey: '2026-11-07', weekendKeys: ['2026-11-07', '2026-11-08'], weekKeys: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'] }
const rows = [
  row({}),
  row({ id: 'r2', href: '/events/r2', title: 'A March Gig', dayKey: '2027-03-12', dayLabel: 'Friday 12 March', ts: 2 }),
]
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
const guide = () =>
  render(
    <CityGuide
      city={{ slug: 'bendigo', name: 'Bendigo', state: 'VIC', lat: -36.76, lng: 144.28 }}
      stateName="Victoria" stateCityNames={['bendigo']}
      quickCities={[{ slug: 'bendigo', name: 'Bendigo' }]} allCities={[]}
      rows={rows} days={days}
    />,
  )
const listed = (title: string) => screen.queryAllByText(title).some((n) => n.closest('#city-calendar'))

describe("Explore's tiles show what they count", () => {
  it('the list opens on the next 3 months, so the March night is not in it before a tap', () => {
    guide()
    expect(listed('A November Gig')).toBe(true)
    expect(listed('A March Gig')).toBe(false)
  })

  it("'All events' shows every date it counts, the March night included", () => {
    guide()
    fireEvent.click(screen.getByRole('button', { name: /^All events/ }))
    expect(listed('A March Gig')).toBe(true)
  })

  it('a category tile shows every date of that category it counts', () => {
    guide()
    fireEvent.click(screen.getByRole('button', { name: /^Music/ }))
    expect(listed('A March Gig')).toBe(true)
  })
})
