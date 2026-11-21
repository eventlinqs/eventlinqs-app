// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/**
 * THE MARKETPLACE HOME (law 46; the design engine, sections 1 and 2; Lawal's site.html; the PM's 13:04 of 21 November
 * 2026), from fixture rows: the one line that picks the home agrees with the flag; the grid's cards are built by the
 * guide's own rules (the night's photograph, else the labelled illustrative one, else the brand panel); the tabs filter
 * on the server's order; See more pages, then opens the city's whole guide; Don't miss takes only a night with its own
 * photograph; the banner paints slide 0 alone until rotation arms.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/' }))
vi.mock('@/lib/analytics/plausible', () => ({ trackSaveEvent: vi.fn(), trackEvent: vi.fn() }))

afterEach(() => cleanup())

const DAYS = { todayKey: '2026-11-21', weekendKeys: ['2026-11-21', '2026-11-22'], weekKeys: ['2026-11-21', '2026-11-22', '2026-11-23'] }

function row(over: Partial<DirectoryRow> & { id: string }): DirectoryRow {
  return {
    href: `/events/${over.id}`,
    title: `Night ${over.id}`,
    venue: 'Federation Square',
    city: 'Melbourne',
    category: 'Music',
    categorySlug: 'music',
    price: 'From $20',
    time: '7:30 pm',
    free: false,
    source: 'Tickets on EventLinqs',
    format: 'ticketed',
    cityKey: 'melbourne',
    dayKey: '2026-11-21',
    dayLabel: 'Saturday 21 November',
    ts: Date.parse('2026-11-21T08:30:00Z'),
    thumb: null,
    suburb: 'Melbourne',
    lat: null,
    lng: null,
    ...over,
  }
}

describe('the one line that picks the home', () => {
  it('agrees with SITE_LOOK.marketplaceHome, and the guide home is kept whole beside it (law 13)', async () => {
    const { SITE_LOOK } = await import('@/lib/home/site-look')
    const { ChosenHome } = await import('@/components/features/home-market/chosen-home')
    const { MarketplaceHome } = await import('@/components/features/home-market/marketplace-home')
    expect(ChosenHome === MarketplaceHome).toBe(SITE_LOOK.marketplaceHome)
    expect(existsSync(join(process.cwd(), 'src/components/features/home-market/city-guide-home.tsx'))).toBe(true)
  })
})

describe('the grid, shaped on the server', () => {
  it("each card by the guide's own rules: its own photograph, else the labelled one of its kind, else the brand panel", async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    const { marketGrid } = await import('@/lib/home/market-cards')
    const rows = [
      row({ id: 'own-photo', thumb: 'https://example.supabase.co/storage/v1/object/public/event-images/a.jpg', thumbAlt: 'The stage' }),
      row({ id: 'theatre', categorySlug: 'theatre', category: 'Theatre' }),
      row({ id: 'other', categorySlug: 'other', category: 'Other', free: true, price: 'Free' }),
    ]
    const grid = marketGrid(rows, DAYS)
    expect(grid.cards['own-photo'].photo).toEqual({ src: 'https://example.supabase.co/storage/v1/object/public/event-images/a.jpg', alt: 'The stage', credit: null, illustrative: false })
    expect(grid.cards.theatre.photo?.illustrative).toBe(true)
    expect(grid.cards.theatre.photo?.src).toBe('/images/library/illustrative-theatre.jpg')
    expect(grid.cards.other.photo).toBeNull()
    expect(grid.cards.other.price).toBe('Free')
    expect(grid.cards['own-photo'].tonight).toBe(true)
    expect(grid.cards['own-photo'].date).toBe('Sat 21 Nov · 7:30 pm')
    expect(grid.initial).toBe('weekend')
    expect(grid.tabs.free).toEqual(['other'])
    vi.unstubAllEnvs()
  })

  it('caps every tab, so See more ends at the city guide', async () => {
    const { marketGrid } = await import('@/lib/home/market-cards')
    const rows = Array.from({ length: 60 }, (_, i) => row({ id: `n${i}`, title: `Night ${i}`, venue: `Venue ${i}`, ts: Date.parse('2026-11-21T08:30:00Z') + i * 60_000 }))
    expect(marketGrid(rows, DAYS, 48).tabs.all).toHaveLength(48)
  })
})

describe("Don't miss", () => {
  it("only a night with its own photograph; an organiser's own first, then the soonest", async () => {
    const { pickDontMiss } = await import('@/components/features/home-market/marketplace-home')
    const photo = 'https://example.supabase.co/x.jpg'
    expect(pickDontMiss([row({ id: 'a' }), row({ id: 'b' })])).toBeNull()
    expect(pickDontMiss([row({ id: 'late', thumb: photo, ts: 2 }), row({ id: 'soon', thumb: photo, ts: 1 })])?.id).toBe('soon')
    expect(pickDontMiss([row({ id: 'soon', thumb: photo, ts: 1 }), row({ id: 'own', thumb: photo, ts: 3, own: true })])?.id).toBe('own')
  })
})

describe('Browsing events in <city>', () => {
  async function renderBrowse() {
    const { marketGrid } = await import('@/lib/home/market-cards')
    const { MarketBrowse } = await import('@/components/features/home-market/market-browse')
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ id: `w${i}`, title: `Weekend ${i}`, venue: `Hall ${i}`, ts: Date.parse('2026-11-21T08:30:00Z') + i * 60_000 })),
      row({ id: 'mon', title: 'Monday night', venue: 'Club', dayKey: '2026-11-23', ts: Date.parse('2026-11-23T09:00:00Z') }),
    ]
    render(<MarketBrowse grid={marketGrid(rows, DAYS)} city={{ slug: 'melbourne', name: 'Melbourne' }} guideHref="/city/melbourne" />)
  }
  const cardLinks = () => screen.getAllByRole('link').filter((a) => (a.getAttribute('href') ?? '').startsWith('/events/'))

  it('opens on This weekend, eight cards, each one whole link to its event page, with save and share beside it', async () => {
    await renderBrowse()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Browsing events in Melbourne')
    expect(screen.getByRole('button', { name: 'This weekend' }).getAttribute('aria-pressed')).toBe('true')
    expect(cardLinks()).toHaveLength(8)
    expect(screen.getAllByRole('button', { name: /^Save event$/ })).toHaveLength(8)
    expect(screen.getAllByRole('button', { name: /^Share Weekend / })).toHaveLength(8)
    expect(screen.getAllByText('Tonight').length).toBeGreaterThan(0)
  })

  it('See more adds eight, then, with nothing left, opens the city guide', async () => {
    await renderBrowse()
    fireEvent.click(screen.getByRole('button', { name: 'See more events' }))
    expect(cardLinks()).toHaveLength(10)
    expect(screen.getByRole('link', { name: 'See more events' }).getAttribute('href')).toBe('/city/melbourne')
  })

  it('a tab filters in place; For you opens the per person feed; Sort and Map open the city in /events', async () => {
    await renderBrowse()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.click(screen.getByRole('button', { name: 'See more events' }))
    expect(cardLinks().map((a) => a.getAttribute('href'))).toContain('/events/mon')
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(cardLinks().map((a) => a.getAttribute('href'))).not.toContain('/events/mon')
    expect(screen.getByRole('link', { name: 'For you' }).getAttribute('href')).toBe('/feed')
    expect(screen.getByRole('link', { name: 'Map' }).getAttribute('href')).toBe('/events?city=Melbourne&view=map')
    fireEvent.click(screen.getByRole('button', { name: /Sort: Best match/ }))
    const sorts = within(document.getElementById('market-sort') as HTMLElement).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(sorts).toEqual(['/events?city=Melbourne&sort=relevance', '/events?city=Melbourne&sort=date_asc', '/events?city=Melbourne&sort=price_asc'])
  })

  it('the city switch offers the four guides, each a real page, and every city', async () => {
    await renderBrowse()
    fireEvent.click(screen.getByRole('button', { name: 'Change city. Current: Melbourne' }))
    const hrefs = within(document.getElementById('market-city-switch') as HTMLElement).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/', '/city/geelong', '/city/ballarat', '/city/bendigo', '/cities'])
    expect(existsSync(join(process.cwd(), 'src/app/city/[slug]/page.tsx'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'src/app/cities/page.tsx'))).toBe(true)
  })
})

describe('the promo banner', () => {
  it('paints slide 0 alone, its raster the one priority image, until rotation arms', async () => {
    const { PromoBanner } = await import('@/components/features/home-market/promo-banner')
    const { promoSlides } = await import('@/lib/home/marketplace')
    const slides = promoSlides({ weekend: { src: '/images/a.jpg' }, free: { src: '/images/b.jpg' }, sell: { src: '/images/c.jpg' } }, 'Melbourne')
    const { container } = render(<PromoBanner slides={slides} />)
    const panes = [...container.querySelectorAll('[aria-roledescription="carousel"] > div')].filter((d) => d.querySelector('h2'))
    expect(panes.map((p) => p.hasAttribute('hidden'))).toEqual([false, true, true])
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('link', { name: /Explore this weekend/ }).getAttribute('href')).toBe('/weekend')
    expect(container.querySelectorAll('img[fetchpriority="high"]').length).toBeLessThanOrEqual(1)
  })
})
