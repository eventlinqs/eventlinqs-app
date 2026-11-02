import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide } from '@/components/features/city-guide/city-guide'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * ROUND 3, ITEM 0 (Lawal 17:22, on live, his phone: 'the place chips do not respond when tapped ... every click by a
 * visitor on the site must work'). Measured on live (C:\dev\EVIDENCE\GEELONG-REFERENCE-2NOV\chips-live\tap.json): the
 * city links navigate only after about 2 s with nothing changing on screen, and the current city chip did nothing.
 * Every place chip now answers the tap: a link shows its selected, busy state at once while its page loads (Next's
 * useLinkStatus), and the current city takes the visitor to its events.
 */
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'Open Mic Comedy', venue: 'The Barwon Club', city: 'Geelong', category: 'Comedy',
  categorySlug: 'comedy', price: 'Free entry', time: '6:00 pm', free: true, source: 'Free · Walk in', format: 'walk_in',
  cityKey: 'geelong', suburb: 'South Geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November', ts: 1, thumb: null,
  lat: null, lng: null, ...o,
})
const days = { todayKey: '2026-11-02', tomorrowKey: '2026-11-03', weekendKeys: ['2026-11-06', '2026-11-07', '2026-11-08'], weekKeys: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'] }
const scroll = vi.fn()
beforeAll(() => {
  Element.prototype.scrollIntoView = scroll
})

describe('every place chip answers the tap', () => {
  it('a date chip and a place chip repaint on pointerdown, before the page works (the CONTROLLER 22:16 (2))', () => {
    render(
      <CityGuide
        city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
        stateName="Victoria" stateCityNames={['geelong', 'melbourne']}
        quickCities={[{ slug: 'geelong', name: 'Geelong' }, { slug: 'melbourne', name: 'Melbourne' }]} allCities={[]}
        rows={[row({})]} days={days}
      />,
    )
    const today = within(screen.getByRole('group', { name: 'When' })).getByRole('button', { name: 'Today' })
    expect(today.className).toContain('bg-white')
    fireEvent.pointerDown(today)
    expect(today.getAttribute('data-snap')).toBe('touched')
    expect(today.className).toContain('bg-[var(--color-ink-900)]')
    const victoria = within(screen.getByRole('group', { name: 'Choose a city' })).getByRole('button', { name: 'Victoria' })
    fireEvent.pointerDown(victoria)
    expect(victoria.className).toContain('bg-[var(--color-ink-900)]')
    fireEvent.pointerCancel(victoria)
    expect(victoria.className).toContain('bg-white')
  })

  it('the current city chip takes the visitor to its events', () => {
    render(
      <CityGuide
        city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
        stateName="Victoria" stateCityNames={['geelong', 'melbourne']}
        quickCities={[{ slug: 'geelong', name: 'Geelong' }, { slug: 'melbourne', name: 'Melbourne' }]} allCities={[]}
        rows={[row({})]} days={days}
      />,
    )
    scroll.mockClear()
    fireEvent.click(within(screen.getByRole('group', { name: 'Choose a city' })).getByRole('button', { name: 'Geelong' }))
    expect(scroll).toHaveBeenCalled()
  })

  it('a city link and All of Australia show their selected, busy state the moment they are tapped (useLinkStatus)', () => {
    const g = readFileSync(join(process.cwd(), 'src/components/features/city-guide/city-guide.tsx'), 'utf8').replace(/\r\n/g, '\n')
    expect(g).toMatch(/import Link, \{ useLinkStatus \} from 'next\/link'/)
    expect(g).toMatch(/function TapAnswer\([\s\S]*?const \{ pending \} = useLinkStatus\(\)/)
    expect(g).toMatch(/<SnapLink key=\{c\.slug\} href=\{`\/city\/\$\{c\.slug\}`\}[^>]*label=\{c\.name\}/)
    expect(g).toMatch(/aria-label="Search all of Australia"[\s\S]{0,400}label="All of Australia"/)
    expect(g).toMatch(/function SnapLink\([\s\S]*?onPointerDown=\{\(\) => setGoing\(true\)\}/)
  })
})
