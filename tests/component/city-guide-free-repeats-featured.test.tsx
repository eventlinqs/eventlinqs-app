import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide } from '@/components/features/city-guide/city-guide'
import type { EventCardData } from '@/components/features/events/event-card'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * WHAT THE LEADERS DO THAT WE TAKE (the CONTROLLER's Eventbrite walk of 1 November 2026, 17:38;
 * C:\dev\EVIDENCE\CITY-FIRST-1NOV\design\leaders-city-guide.md): a Free filter, so 'find a free event' is one tap; a
 * repeat night says '+N more dates'; and the approved Featured + Directory direction
 * (C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md s6): exactly two rights photographed nights are a Featured
 * row (three or more are the slider above the page, under two nothing).
 */
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'Trivia Night', venue: 'The Wool Exchange', city: 'Geelong', category: 'Community',
  categorySlug: 'community', price: 'From AUD $10', time: '7:00 pm', free: false, source: 'Tickets on EventLinqs',
  format: 'ticketed', cityKey: 'geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November', ts: 1, thumb: null,
  lat: null, lng: null, ...o,
})
const days = { todayKey: '2026-11-01', tomorrowKey: '2026-11-02', weekendKeys: ['2026-11-01'], weekKeys: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'] }
const rows = [
  row({}),
  row({ id: 'r2', href: '/events/r2', dayKey: '2026-11-10', dayLabel: 'Tuesday 10 November', ts: 2 }),
  row({ id: 'r3', href: '/events/r3', dayKey: '2026-11-17', dayLabel: 'Tuesday 17 November', ts: 3 }),
  row({ id: 'r4', href: '/events/r4', title: 'Library Storytime', venue: 'Geelong Library', price: 'Free entry', free: true, source: 'Walk in, no ticket needed', categorySlug: 'family', category: 'Family', ts: 4 }),
]
const card = (i: number): EventCardData => ({
  id: `e${i}`, slug: `night-${i}`, title: `Featured night ${i}`, cover_image_url: `/images/test/${i}.jpg`, thumbnail_url: null,
  start_date: '2026-11-06T08:30:00Z', timezone: 'Australia/Melbourne', venue_name: 'Costa Hall', venue_city: 'Geelong',
  venue_country: 'Australia', created_at: '2026-11-01T00:00:00Z', category: null, ticket_tiers: [], cover_rights_recorded: true,
})
const guide = (featured: EventCardData[] = []) =>
  render(
    <CityGuide
      city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
      stateName="Victoria" stateCityNames={['geelong']} quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
      rows={rows} days={days} featured={featured}
    />,
  )

describe('what we take from the leaders', () => {
  it('Free shows the free nights only, in one tap, and Clear brings everything back', () => {
    guide()
    fireEvent.click(screen.getByRole('button', { name: 'Free' }))
    expect(screen.getByText('Library Storytime')).toBeInTheDocument()
    expect(screen.queryByText('Trivia Night')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }))
    expect(screen.getAllByText('Trivia Night').length).toBe(3)
  })

  it('a weekly night says how many more dates it has: the first +2, the next +1, the last none', () => {
    const { container } = guide()
    const lines = [...container.querySelectorAll('a[href^="/events/r"]')].map((a) => a.textContent ?? '')
    expect(lines.find((t) => t.includes('Trivia Night') && t.includes('+2 more dates'))).toBeTruthy()
    expect(lines.find((t) => t.includes('Trivia Night') && t.includes('+1 more date'))).toBeTruthy()
    expect(lines.filter((t) => t.includes('Trivia Night') && t.includes('more date')).length).toBe(2)
  })

  it('exactly two rights photographed nights are a Featured row; none and one draw no Featured', () => {
    guide([card(1), card(2)])
    expect(screen.getByRole('region', { name: 'Featured in Geelong' })).toBeInTheDocument()
    expect(screen.getByText('Featured night 2')).toBeInTheDocument()
  })

  it('one rights photographed night draws no Featured row', () => {
    guide([card(1)])
    expect(screen.queryByRole('region', { name: 'Featured in Geelong' })).toBeNull()
  })
})
