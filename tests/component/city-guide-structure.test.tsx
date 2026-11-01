import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide } from '@/components/features/city-guide/city-guide'
import { CityHeroSlider, SLIDER_MINIMUM } from '@/components/features/city-guide/city-hero-slider'
import type { EventCardData } from '@/components/features/events/event-card'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * THE CITY GUIDE TO LAWAL'S STRUCTURE (the CONTROLLER's 16:41 of 1 November 2026, (2) and (3);
 * C:\dev\DESIGN\CITY-FIRST-1NOV\structure-geelong-top.png and -week.png, looked at 16:50): the city switcher with the
 * state first and Change city; search in the city with all of Australia one tap away; Today, Tomorrow, This weekend,
 * Next 7 days and Choose dates, each a visible chip; 'Explore <city>' tiles with real counts, none at 0, 'All events'
 * last; 'Happening this week' then the full calendar; one city only. The slider is drawn only at three or more nights
 * with a rights recorded photograph, and nothing is written on its photograph.
 */
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1',
  href: '/events/r1',
  title: 'Open Mic Comedy',
  venue: 'The Barwon Club',
  city: 'Geelong',
  category: 'Comedy',
  categorySlug: 'comedy',
  price: 'Free entry',
  time: '6:00 pm',
  free: true,
  source: 'Walk in, no ticket needed',
  format: 'walk_in',
  cityKey: 'geelong',
  dayKey: '2026-11-01',
  dayLabel: 'Sunday 1 November',
  ts: 0,
  thumb: null,
  lat: null,
  lng: null,
  ...o,
})
const days = { todayKey: '2026-11-01', tomorrowKey: '2026-11-02', weekendKeys: ['2026-11-01'], weekKeys: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'] }
const rows = [
  row({}),
  row({ id: 'r2', href: '/events/r2', title: 'Katie Noonan', categorySlug: 'music', category: 'Music', price: 'From AUD $59.90', dayKey: '2026-11-06', dayLabel: 'Friday 6 November', time: '7:30 pm', source: 'Tickets on geelongartscentre.org.au' }),
  row({ id: 'r3', href: '/events/r3', title: 'Comedy Republic Main Stage', city: 'Melbourne', cityKey: 'melbourne', categorySlug: 'comedy' }),
  row({ id: 'r4', href: '/events/r4', title: 'A December night', categorySlug: 'music', category: 'Music', dayKey: '2026-12-04', dayLabel: 'Friday 4 December' }),
]
const guide = () =>
  render(
    <CityGuide
      city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
      stateName="Victoria"
      stateCityNames={['geelong', 'melbourne', 'ballarat', 'bendigo']}
      quickCities={[{ slug: 'geelong', name: 'Geelong' }, { slug: 'melbourne', name: 'Melbourne' }, { slug: 'ballarat', name: 'Ballarat' }, { slug: 'bendigo', name: 'Bendigo' }]}
      allCities={[]}
      rows={rows}
      days={days}
    />,
  )

describe('the city guide, to Lawal\u2019s structure', () => {
  it('the switcher reads Victoria, the cities, Change city, in that order', () => {
    guide()
    const group = screen.getByRole('group', { name: 'Choose a city' })
    const names = [...group.querySelectorAll('a, button')].map((e) => e.textContent?.trim())
    expect(names).toEqual(['Victoria', 'Geelong', 'Melbourne', 'Ballarat', 'Bendigo', 'Change city'])
  })

  it('the five date chips are visible words, Choose dates among them', () => {
    guide()
    const when = screen.getByRole('group', { name: 'When' })
    for (const w of ['Today', 'Tomorrow', 'This weekend', 'Next 7 days', 'Choose dates']) expect(within(when).getByText(w)).toBeInTheDocument()
  })

  it('Explore tiles carry real counts, one city only, none at 0, All events last', () => {
    guide()
    const explore = screen.getByRole('region', { name: 'Explore Geelong' })
    const tiles = within(explore).getAllByRole('button').map((b) => b.textContent?.replace(/\s+/g, ' ').trim())
    expect(tiles).toEqual(['Music2 events', 'Comedy1 event', 'All events3 events'])
  })

  it('Happening this week, then the full calendar; a night of another city is not on the Geelong page', () => {
    guide()
    expect(screen.getByRole('heading', { name: 'Happening this week' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The full calendar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View calendar' }).getAttribute('href')).toBe('#city-calendar-full')
    expect(screen.queryByText('Comedy Republic Main Stage')).toBeNull()
  })

  it('Victoria widens on purpose to the state\u2019s listed cities, and says so', () => {
    guide()
    fireEvent.click(screen.getByRole('button', { name: 'Victoria' }))
    expect(screen.getByText('Comedy Republic Main Stage')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Explore Victoria' })).toBeInTheDocument()
  })
})

const card = (i: number): EventCardData => ({
  id: `e${i}`,
  slug: `night-${i}`,
  title: `Night ${i}`,
  cover_image_url: `/images/test/${i}.jpg`,
  thumbnail_url: null,
  start_date: '2026-11-06T08:30:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'Costa Hall',
  venue_city: 'Geelong',
  venue_country: 'Australia',
  created_at: '2026-11-01T00:00:00Z',
  category: null,
  ticket_tiers: [],
  cover_rights_recorded: true,
})

describe('the city slider', () => {
  it(`is not drawn at all under ${SLIDER_MINIMUM} rights recorded photographs`, () => {
    const { container } = render(<CityHeroSlider events={[card(1), card(2)]} cityName="Geelong" />)
    expect(container.innerHTML).toBe('')
  })

  it('is drawn at three, the first slide shown, and nothing is written on its photograph', () => {
    const { container } = render(<CityHeroSlider events={[card(1), card(2), card(3)]} cityName="Geelong" />)
    expect(screen.getByRole('region', { name: 'Featured in Geelong' })).toBeInTheDocument()
    const first = container.querySelector('a[aria-hidden="false"]')
    expect(first?.textContent).toContain('Night 1')
    const photo = first?.querySelector('.aspect-\\[16\\/9\\]')
    expect(photo?.textContent ?? '').toBe('')
    expect(screen.getByText(/Next: Night 2/)).toBeInTheDocument()
  })
})
