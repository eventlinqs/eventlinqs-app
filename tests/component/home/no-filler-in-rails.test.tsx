// @vitest-environment jsdom
import type { ReactElement, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import type { RawRow } from '@/lib/events/home-queries'
import type { PublicEventRow } from '@/lib/events/types'

/**
 * A PUBLIC COLLECTION DRAWS REAL EVENTS ONLY (Lawal's emergency correction of 31 October 2026, 17:44; the CONTROLLER's
 * 17:55 order 1). Each rail that used to top a thin track up with 'Open slot' invitation cards is rendered here with one
 * real record and with none: one record draws one card and nothing else, and none hides the rail. Every link a rail
 * draws is its own record's or its header's View all; the guard no-filler-in-event-collections judges the source.
 */

vi.mock('@/lib/images/category-photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/images/category-photo')>()),
  getCategoryPhoto: async () => ({ src: '/img/venue.jpg', alt: 'A venue' }),
}))
vi.mock('@/components/features/events/this-week-card', () => ({
  ThisWeekCard: ({ event }: { event: { slug: string; title: string } }): ReactNode => <a href={`/events/${event.slug}`}>{event.title}</a>,
}))
vi.mock('@/lib/events/event-card-projection', () => ({ projectToCardData: async (rows: unknown[]) => rows }))
vi.mock('@/components/features/events/event-card', () => ({
  EventCard: ({ event }: { event: { slug: string; title: string } }): ReactNode => <a href={`/events/${event.slug}`}>{event.title}</a>,
}))

// jsdom has no ResizeObserver; the shared rail watches its track's width with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const { EventRailSection } = await import('@/components/features/home/event-rail-section')
const { ThisWeekSection } = await import('@/components/features/home/this-week-section')
const { FeaturedVenuesSection } = await import('@/components/features/home/featured-venues-section')
const { RecommendedRail } = await import('@/components/features/events/m5-recommended-rail')

afterEach(() => cleanup())

const NIGHT = {
  id: 'e1',
  slug: 'live-music-garden-session',
  title: 'Live Music Garden Session with Ben Dew',
  start_date: '2026-11-06T06:00:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'Where You Meet',
  venue_city: 'Melbourne',
  cover_image_url: 'https://x.supabase.co/storage/v1/object/public/event-images/org/e1/cover.avif',
  category: { name: 'Music', slug: 'music' },
} as BentoEvent

const FILLER = /Open slot|is yours|this stage is open|Invite an organiser|Know someone who runs|Post your event/

function links(container: HTMLElement): string[] {
  return [...new Set([...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? ''))]
}

function expectOnlyReal(container: HTMLElement, record: string, viewAll: string) {
  expect(container.textContent ?? '').not.toMatch(FILLER)
  const hrefs = links(container)
  expect(hrefs).toContain(viewAll)
  expect(hrefs.filter((h) => h !== viewAll)).toEqual([record])
}

describe('EventRailSection, the home lineup rails (this weekend, every category, free, trending, just added)', () => {
  const rail = (events: BentoEvent[]) =>
    EventRailSection({ eyebrow: 'Music', title: 'Live music', ariaLabel: 'Music', railLabel: 'Music events', events, viewAllHref: '/events?category=music' })

  it('one real event draws one card and nothing else', async () => {
    const { container } = render(await rail([NIGHT]))
    expectOnlyReal(container, `/events/${NIGHT.slug}`, '/events?category=music')
  })

  it('no event hides the rail, heading and all', async () => {
    expect(await rail([])).toBeNull()
  })
})

describe("ThisWeekSection, 'What's happening near you'", () => {
  /** It hands its events to the shared rail; the rail it hands them to is rendered as the server would. */
  async function drawn(events: BentoEvent[]) {
    const el = (await ThisWeekSection({ events })) as ReactElement<Parameters<typeof EventRailSection>[0]>
    expect(el.type).toBe(EventRailSection)
    return EventRailSection(el.props)
  }

  it('one real event draws one card and nothing else', async () => {
    const { container } = render(await drawn([NIGHT]))
    expectOnlyReal(container, `/events/${NIGHT.slug}`, '/events?date=week')
  })

  it('no event hides the rail', async () => {
    expect(await drawn([])).toBeNull()
  })
})

describe('FeaturedVenuesSection, the venues rail', () => {
  const row = { venue_name: 'Where You Meet', venue_city: 'Melbourne', category: { slug: 'music' } } as unknown as RawRow

  it('one real venue draws one tile and nothing else', async () => {
    const { container } = render(await FeaturedVenuesSection({ upcoming: [row] }))
    expectOnlyReal(container, `/events?venue=${encodeURIComponent('Where You Meet')}`, '/events')
  })

  it('no venue hides the rail', async () => {
    expect(await FeaturedVenuesSection({ upcoming: [] })).toBeNull()
  })
})

describe('RecommendedRail, the /events and browse popular and recommended rails', () => {
  const row = NIGHT as unknown as PublicEventRow

  it('one real event draws one card and nothing else', async () => {
    const { container } = render(await RecommendedRail({ events: [row], headline: 'popular' }))
    expectOnlyReal(container, `/events/${NIGHT.slug}`, '/events?sort=popular')
  })

  it('no event hides the rail, which used to draw three invitation cards under its heading', async () => {
    expect(await RecommendedRail({ events: [], headline: 'popular' })).toBeNull()
  })
})
