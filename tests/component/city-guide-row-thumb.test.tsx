import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { CityGuide } from '@/components/features/city-guide/city-guide'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * ROUND 3 (1), ROW THUMBNAILS (Lawal, 2 November 2026, 15:27, 'option A yes'; the CONTROLLER's 15:28 (1)): a directory row
 * draws its photograph ONLY where discovery-data.ts gave it one (a permitted photograph: rights recorded, or a credited
 * venue photo), on the RIGHT, WHOLE (law 15: contained over its own blurred copy, never cropped or zoomed), in a box whose
 * width and height are reserved; the whole row stays one link; a row with no permitted photograph draws no image at all.
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
const PHOTO = '/images/test/amcf-2024-0980-whole.jpg'
const guide = (rows: DirectoryRow[]) =>
  render(
    <CityGuide
      city={{ slug: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lng: 144.36 }}
      stateName="Victoria" stateCityNames={['geelong']} quickCities={[{ slug: 'geelong', name: 'Geelong' }]} allCities={[]}
      rows={rows} days={days}
    />,
  )

describe('round 3 (1): a photograph on a row only where one is permitted', () => {
  it('a row with a permitted photograph draws it whole, on the right, in a reserved box, inside the one link', () => {
    guide([row({ id: 'p1', href: '/events/p1', title: 'African Music and Cultural Festival', thumb: PHOTO })])
    const link = screen.getByRole('link', { name: /African Music and Cultural Festival/ })
    const box = link.querySelector('[data-row-thumb]') as HTMLElement
    expect(box, 'the photo box sits inside the row link').not.toBeNull()
    expect(box.className).toMatch(/\bw-28\b/)
    expect(box.className).toMatch(/aspect-\[4\/3\]/)
    expect(box.className).toMatch(/md:w-40/)
    expect(link.lastElementChild).toBe(box)
    // The title on the row already says what the photograph shows, so both images are decorative (the CONTROLLER's 15:28).
    const shown = box.querySelector(':scope > img') as HTMLImageElement
    expect(shown.getAttribute('alt')).toBe('')
    expect(box.querySelector(':scope > .ledger-blur img'), 'its own blurred copy behind it').not.toBeNull()
    expect(shown.className).toMatch(/object-contain/)
    expect(shown.className).not.toMatch(/object-cover|scale-1\d\d/)
    expect(shown.getAttribute('loading')).toBe('lazy')
    expect(link.querySelectorAll('a').length).toBe(0)
  })

  it('a row with no permitted photograph draws no image, no placeholder and no empty box, and keeps its width for text', () => {
    guide([row({ id: 'n1', href: '/events/n1', title: 'Storytime', thumb: null })])
    const link = screen.getByRole('link', { name: /Storytime/ })
    expect(link.querySelector('[data-row-thumb]')).toBeNull()
    expect(link.querySelectorAll('img').length).toBe(0)
    expect(link.className).not.toMatch(/_7rem\]/)
  })

  it('the photo box has its own size hint, never a larger cell\'s', () => {
    const sizes = readFileSync(join(process.cwd(), 'src/components/media/sizes.ts'), 'utf8')
    expect(sizes).toMatch(/rowThumb: '\(min-width: 768px\) 160px, 112px'/)
    const media = readFileSync(join(process.cwd(), 'src/components/media/EventCardMedia.tsx'), 'utf8')
    expect(media).toMatch(/'row-thumb': MEDIA_SIZES\.rowThumb/)
  })
})
