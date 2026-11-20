import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/font/google', () => ({ Great_Vibes: () => ({ className: 'font-great-vibes' }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/weekend' }))

import { WeekendGuide, WEEKEND_CHIPS } from '@/components/features/weekend/weekend-guide'
import { weekendDatesLabel, type ReadNight } from '@/lib/newsletter/edition'

/*
 * /weekend, THE WEEKEND GUIDE, VICTORIA (law 46 (b), Lawal's design B of 21 November 2026; the PM's 08:48 item 3): the
 * hero's words, the five chips to this weekend's own filtered views, the feature and the top picks linking to their
 * event pages, Explore more to /state/victoria, and a thin weekend saying so with a working link, never an empty page.
 */
const night = (over: Partial<ReadNight> & { id: string; slug: string; title: string }): ReadNight =>
  ({
    startDate: '2026-11-21T09:00:00Z',
    endDate: null,
    venue: 'A Room',
    categorySlug: 'music',
    categoryName: 'Music',
    isFree: false,
    ticketed: true,
    ticketedHere: false,
    image: 'https://www.eventlinqs.com.au/images/x.jpg',
    ownPhoto: true,
    listedAt: null,
    summary: 'A night in the room.',
    citySlug: 'melbourne',
    pageImage: '/images/test/x.jpg',
    pick: { slug: over.slug, title: over.title, categoryLabel: 'Music', categorySlug: 'music', whenLabel: 'Sat 21 Nov, 7:30pm', venue: 'A Room', priceLabel: 'Tickets on axs.com', image: null, imageAlt: `${over.title}, at A Room` },
    ...over,
  }) as ReadNight

describe('the weekend guide, as design B draws it', () => {
  const featured = night({ id: 'e1', slug: 'colours-of-asia-2026-11-21', title: 'Colours of Asia: Garden of Wonders', categoryName: 'Festival' })
  const picks = [night({ id: 'e2', slug: 'amcf-2026', title: 'African Music and Cultural Festival 2026' }), night({ id: 'e3', slug: 'comedy-republic', title: 'Comedy Republic Main Stage', categoryName: 'Comedy' })]
  // Rendered in each case: Testing Library unmounts after every test.
  const view = () =>
    render(
      <WeekendGuide datesLabel="21 to 22 Nov 2026" featured={featured} picks={picks} hero={{ src: '/images/test/hero.jpg', alt: 'A pier at dusk' }} explore={{ src: '/images/test/explore.jpg', alt: 'A skyline' }} />,
    ).container
  it('names the guide, its dates and Victoria', () => {
    const container = view()
    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toContain('The Weekend')
    expect(h1?.textContent).toContain('Victoria')
    expect(container.textContent).toContain('21 to 22 Nov 2026')
  })
  it("the five chips go to this weekend's own filtered views", () => {
    const container = view()
    const chips = [...container.querySelectorAll('[data-chip]')].map((a) => [a.getAttribute('data-chip'), a.getAttribute('href')])
    expect(chips).toEqual(WEEKEND_CHIPS.map((c) => [c.label, c.href]))
    expect(chips.map((c) => c[0])).toEqual(['Festivals', 'Live Music', 'Comedy', 'Family', 'Free'])
  })
  it('the feature, each pick and Explore more link where they say', () => {
    const container = view()
    expect(container.querySelector('[data-feature]')?.getAttribute('href')).toBe('/events/colours-of-asia-2026-11-21')
    expect([...container.querySelectorAll('[data-pick]')].map((a) => a.getAttribute('href'))).toEqual(['/events/amcf-2026', '/events/comedy-republic'])
    expect(container.querySelector('[data-explore]')?.getAttribute('href')).toBe('/state/victoria')
    expect(container.textContent).toContain('Top Picks in Victoria')
  })
  it('no dash and no exclamation mark in its words', () => {
    const container = view()
    expect(container.textContent ?? '').not.toMatch(/[–—]|\s-\s|!/)
  })
})

describe('a thin weekend says so, never an empty page', () => {
  it('no feature and no picks: one line with a working link to the Victoria guide', () => {
    const { container } = render(<WeekendGuide datesLabel="22 Nov 2026" featured={null} picks={[]} hero={null} explore={null} />)
    expect(container.querySelector('[data-section="weekend-empty"] a')?.getAttribute('href')).toBe('/state/victoria')
  })
})

describe("the guide's dates as design B prints them", () => {
  it('a weekend in one month, across two months, and one day', () => {
    expect(weekendDatesLabel({ start: '2026-11-21', end: '2026-11-22' })).toBe('21 to 22 Nov 2026')
    expect(weekendDatesLabel({ start: '2026-11-27', end: '2026-11-29' })).toBe('27 to 29 Nov 2026')
    expect(weekendDatesLabel({ start: '2026-11-29', end: '2026-12-01' })).toBe('29 Nov to 1 Dec 2026')
    expect(weekendDatesLabel({ start: '2026-11-22', end: '2026-11-22' })).toBe('22 Nov 2026')
  })
})
