import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide } from '@/components/features/city-guide/city-guide'
import { moreDatesLine } from '@/lib/events/guide-sections'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * A LISTING WITH MORE NIGHTS SAYS SO ON EVERY SURFACE (the CONTROLLER's 20:28 of 6 November 2026, case 1). Round 3, locked by
 * Lawal on 2 November: 'A RECURRING LISTING IS ONE ENTRY: its first night, with "Every <day>" where its nights are weekly, else
 * "+N more dates"'. The browse rows carried '+N more dates'; the section cards (This weekend, Just announced, Big nights) printed
 * only the first night, so on www.eventlinqs.com.au/city/geelong The Little Mermaid read 'Fri 6 Nov · 7:00 pm' and nothing
 * more, though production lists five more shows and Geelong Arts Centre states eight.
 */
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'm1', href: '/events/m1', title: 'The Little Mermaid', venue: 'The Story House', city: 'Geelong', category: 'Family',
  categorySlug: 'family', price: 'From $40', time: '7:00 pm', free: false, source: 'From $40 at Geelong Arts Centre', format: 'ticketed',
  cityKey: 'geelong', suburb: 'Geelong', dayKey: '2026-11-07', dayLabel: 'Saturday 7 November', ts: 10, thumb: null,
  lat: null, lng: null, ...o,
})
const days = { todayKey: '2026-11-06', tomorrowKey: '2026-11-07', weekendKeys: ['2026-11-07', '2026-11-08'], weekKeys: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'] }
const guide = (rows: DirectoryRow[]) =>
  render(
    <CityGuide
      city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
      stateName="Victoria" stateCityNames={['geelong']}
      quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
      rows={rows} days={days}
    />,
  )
const card = (title: string) => screen.getAllByText(title).map((n) => n.closest('a')).find((a) => a && !a.closest('#city-calendar'))

describe('the note of further nights', () => {
  it("is '+N more dates', one wording for the row and the cards", () => {
    expect(moreDatesLine({ more: 2, every: null })).toBe('+2 more dates')
    expect(moreDatesLine({ more: 1, every: null })).toBe('+1 more date')
    expect(moreDatesLine({ more: 0, every: null })).toBeNull()
  })

  it('a section card of a listing with further nights carries it (This weekend)', () => {
    guide([
      row({}),
      row({ id: 'm2', href: '/events/m2', dayKey: '2026-11-12', dayLabel: 'Thursday 12 November', ts: 20 }),
      row({ id: 'm3', href: '/events/m3', dayKey: '2026-11-14', dayLabel: 'Saturday 14 November', time: '1:30 pm', ts: 30 }),
    ])
    const a = card('The Little Mermaid')
    expect(a, 'the listing is shown in a section card').toBeTruthy()
    expect(within(a as HTMLElement).getByText(/\+2 more dates/)).toBeTruthy()
  })

  it('a Big nights card carries it too', () => {
    const big = { venue: 'Costa Hall', title: 'A Headline Show', thumb: 'https://example.com/a.jpg', thumbAlt: 'The band on stage' }
    guide([
      row({ ...big, id: 'b1', href: '/events/b1', dayKey: '2026-11-20', ts: 40 }),
      row({ ...big, id: 'b2', href: '/events/b2', dayKey: '2026-11-21', ts: 50 }),
    ])
    const a = card('A Headline Show')
    expect(a, 'the listing is shown in a section card').toBeTruthy()
    expect(within(a as HTMLElement).getByText(/\+1 more date\b/)).toBeTruthy()
  })
})
