import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide } from '@/components/features/city-guide/city-guide'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * ROUND 2, ITEM 2 (Lawal, 2 November 2026, 12:05: 'Verify that category counts, directory counts and filtered results
 * are consistent'; the CONTROLLER's 12:06 (5)(a): 'prove tiles, directory and filters come from ONE read'). An event is
 * one title at one venue (eventKey: trimmed, any case); every number on the page counts it the same way.
 */
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'Open Mic Comedy', venue: 'The Barwon Club', city: 'Geelong', category: 'Comedy',
  categorySlug: 'comedy', price: 'Free entry', time: '6:00 pm', free: true, source: 'Free · Walk in',
  format: 'walk_in', cityKey: 'geelong', suburb: 'South Geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November',
  ts: 1, thumb: null, lat: null, lng: null, ...o,
})
const days = {
  todayKey: '2026-11-02', tomorrowKey: '2026-11-03', weekendKeys: ['2026-11-06', '2026-11-07', '2026-11-08'],
  weekKeys: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
}
// One weekly night stored three times, its title once with a trailing space and once in another case, as sources write it.
const rows = [
  row({ id: 'w1' }),
  row({ id: 'w2', href: '/events/w2', title: 'Open Mic Comedy ', dayKey: '2026-11-10', dayLabel: 'Tuesday 10 November', ts: 2 }),
  row({ id: 'w3', href: '/events/w3', title: 'open mic comedy', venue: 'The Barwon Club ', dayKey: '2026-11-17', dayLabel: 'Tuesday 17 November', ts: 3 }),
  row({ id: 'm1', href: '/events/m1', title: 'Katie Noonan', category: 'Music', categorySlug: 'music', price: 'AUD $45', free: false, source: 'Tickets at Geelong Arts Centre', format: 'ticketed', suburb: 'Geelong', dayKey: '2026-11-06', dayLabel: 'Friday 6 November', ts: 4 }),
  row({ id: 'm2', href: '/events/m2', title: 'Sunday Session', venue: 'The Wool Exchange', category: 'Music', categorySlug: 'music', suburb: 'Geelong', dayKey: '2026-11-08', dayLabel: 'Sunday 8 November', ts: 5 }),
  row({ id: 'k1', href: '/events/k1', title: 'Saturday Market', venue: 'Belmont Common', category: 'Markets', categorySlug: 'markets', suburb: 'Belmont', dayKey: '2026-11-07', dayLabel: 'Saturday 7 November', ts: 6 }),
  row({ id: 'x1', href: '/events/x1', title: 'Comedy Republic', venue: 'Comedy Republic', city: 'Melbourne', cityKey: 'melbourne', suburb: 'Melbourne', ts: 7 }),
]
const guide = () =>
  render(
    <CityGuide
      city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
      stateName="Victoria"
      stateCityNames={['geelong', 'melbourne']}
      quickCities={[{ slug: 'geelong', name: 'Geelong' }, { slug: 'melbourne', name: 'Melbourne' }]}
      allCities={[]}
      rows={rows}
      days={days}
    />,
  )
const tileCounts = () =>
  within(screen.getByRole('region', { name: 'Explore Geelong' }))
    .getAllByRole('button')
    .map((b) => {
      const t = (b.textContent ?? '').replace(/\s+/g, ' ').trim()
      const m = t.match(/^(.*?)(\d+) events?$/)
      return { button: b, label: m?.[1] ?? t, n: Number(m?.[2]) }
    })
const lineEvents = () => {
  const m = screen.getByText(/coming up in Geelong/).textContent?.match(/^(\d+) events?, (\d+) dates?/)
  return { events: Number(m?.[1]), dates: Number(m?.[2]) }
}

describe('round 2, item 2: tiles, the directory and every filter count from one read', () => {
  // Pressing a tile scrolls to the list (toList); jsdom draws no layout and has no scrollIntoView, so it is a no-op here.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })
  it('All events equals the unfiltered line, and a padded or recased title is still one event', () => {
    guide()
    const all = tileCounts().find((t) => t.label === 'All events')
    expect(all?.n).toBe(4)
    expect(lineEvents()).toEqual({ events: 4, dates: 6 })
  })

  it('pressing each tile shows exactly as many events as the tile says', () => {
    guide()
    for (const label of tileCounts().filter((t) => t.label !== 'All events').map((t) => t.label)) {
      const tile = tileCounts().find((t) => t.label === label)!
      fireEvent.click(tile.button)
      expect(lineEvents().events, label).toBe(tile.n)
      fireEvent.click(tileCounts().find((t) => t.label === label)!.button)
    }
  })

  it("'+N more dates' counts the same event as the tiles: of three nights the first says two more, the second one more", () => {
    guide()
    // Round 3 folds a listing to ONE entry (its first night, its later nights counted), wherever on the page it lands.
    const more = screen
      .queryAllByText(/\+\d+ more dates?/)
      .map((n) => n.textContent?.match(/\+\d+ more dates?/)?.[0])
    expect(more).toEqual(['+2 more dates'])
  })
})
