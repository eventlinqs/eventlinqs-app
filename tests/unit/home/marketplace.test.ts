import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_CIRCLES,
  MARKET_TABS,
  defaultTab,
  isTonight,
  marketEntries,
  promoSlides,
  rowsForTab,
} from '@/lib/home/marketplace'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/**
 * THE MARKETPLACE HOME'S RULES (law 46; the design engine, section 2; site.html): the date tabs filter the guide's own
 * rows, the grid orders by law 18, Tonight is a true badge, every circle and tab is a real route, and the banner draws
 * only slides whose licensed photograph is held.
 */

const DAYS = { todayKey: '2026-11-21', weekendKeys: ['2026-11-21', '2026-11-22'], weekKeys: ['2026-11-21', '2026-11-22', '2026-11-23'] }

function row(over: Partial<DirectoryRow> & { id: string }): DirectoryRow {
  return {
    href: `/events/${over.id}`,
    title: over.id,
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

const ROWS: DirectoryRow[] = [
  row({ id: 'sat-gig' }),
  row({ id: 'sun-market', categorySlug: 'markets', category: 'Markets', free: true, price: 'Free', dayKey: '2026-11-22', ts: Date.parse('2026-11-21T22:00:00Z'), time: '9:00 am' }),
  row({ id: 'mon-comedy', categorySlug: 'comedy', category: 'Comedy', dayKey: '2026-11-23', ts: Date.parse('2026-11-23T09:00:00Z') }),
  row({ id: 'sat-family', categorySlug: 'family', category: 'Family', free: true, price: 'Free', ts: Date.parse('2026-11-21T00:00:00Z'), time: '11:00 am' }),
]

describe('the date and category tabs', () => {
  it('Today is the platform day, This weekend its weekend, Free the free nights, a category its slug', () => {
    expect(rowsForTab(ROWS, 'all', DAYS).map((r) => r.id)).toEqual(['sat-gig', 'sun-market', 'mon-comedy', 'sat-family'])
    expect(rowsForTab(ROWS, 'today', DAYS).map((r) => r.id)).toEqual(['sat-gig', 'sat-family'])
    expect(rowsForTab(ROWS, 'weekend', DAYS).map((r) => r.id)).toEqual(['sat-gig', 'sun-market', 'sat-family'])
    expect(rowsForTab(ROWS, 'free', DAYS).map((r) => r.id)).toEqual(['sun-market', 'sat-family'])
    expect(rowsForTab(ROWS, 'comedy', DAYS).map((r) => r.id)).toEqual(['mon-comedy'])
    expect(rowsForTab(ROWS, 'sports', DAYS)).toEqual([])
  })

  it('opens on This weekend while the weekend holds a night, else All', () => {
    expect(defaultTab(ROWS, DAYS)).toBe('weekend')
    expect(defaultTab([ROWS[2]], DAYS)).toBe('all')
  })

  it('one card per listing: a night on two days is one card with its later date counted', () => {
    const twice = [row({ id: 'fest-1', title: 'Festival', venue: 'Park' }), row({ id: 'fest-2', title: 'Festival', venue: 'Park', dayKey: '2026-11-22', ts: Date.parse('2026-11-22T00:00:00Z') })]
    const entries = marketEntries(twice, 'all', DAYS)
    expect(entries).toHaveLength(1)
    expect(entries[0].row.id).toBe('fest-1')
    expect(entries[0].more).toBe(1)
  })

  it("an organiser's own night leads the grid (law 18's order)", () => {
    const own = row({ id: 'own-night', own: true, dayKey: '2026-11-22', ts: Date.parse('2026-11-22T09:00:00Z') })
    expect(marketEntries([...ROWS, own], 'all', DAYS)[0].row.id).toBe('own-night')
  })

  it('every tab is a filter, except For you, which opens the per person feed, a real route', () => {
    const keys = MARKET_TABS.map((t) => t.key)
    expect(keys).toEqual(['all', 'for-you', 'today', 'weekend', 'free', 'music', 'comedy', 'sports', 'family'])
    const forYou = MARKET_TABS.find((t) => t.key === 'for-you') as { href: string }
    expect(forYou.href).toBe('/feed')
    expect(existsSync(join(process.cwd(), 'src/app/feed/page.tsx'))).toBe(true)
  })
})

describe('Tonight, a true badge', () => {
  it('only a night starting today at five in the evening or later', () => {
    expect(isTonight(row({ id: 'a' }), DAYS.todayKey)).toBe(true) // 7:30 pm Melbourne
    expect(isTonight(row({ id: 'b', ts: Date.parse('2026-11-21T00:00:00Z'), time: '11:00 am' }), DAYS.todayKey)).toBe(false)
    expect(isTonight(row({ id: 'c', dayKey: '2026-11-22' }), DAYS.todayKey)).toBe(false)
    expect(isTonight(row({ id: 'd', time: null }), DAYS.todayKey)).toBe(false)
  })
})

describe('the category circles', () => {
  it("site.html's nine, each to a real landing", () => {
    expect(CATEGORY_CIRCLES.map((c) => c.label)).toEqual(['Music', 'Nightlife', 'Comedy', 'Festivals', 'Sport', 'Theatre', 'Family', 'Food & Drink', 'Free'])
    for (const c of CATEGORY_CIRCLES) {
      if (c.href.startsWith('/categories/')) expect(existsSync(join(process.cwd(), 'src/app/categories/[slug]/page.tsx'))).toBe(true)
      else expect(c.href).toBe('/events?free=1')
    }
  })
})

describe('the promo banner', () => {
  it('draws only the slides whose licensed photograph is held, each to a real page', () => {
    const all = promoSlides({ weekend: { src: '/w.jpg' }, free: { src: '/f.jpg' }, sell: { src: '/s.jpg' } }, 'Melbourne')
    expect(all.map((s) => [s.id, s.href])).toEqual([
      ['weekend', '/weekend'],
      ['free', '/events?free=1'],
      ['sell', '/organisers'],
    ])
    expect(promoSlides({ weekend: null, free: { src: '/f.jpg' }, sell: null }, 'Geelong').map((s) => s.kicker)).toEqual(['Free in Geelong'])
    for (const route of ['weekend', 'organisers', 'events']) expect(existsSync(join(process.cwd(), 'src/app', route, 'page.tsx'))).toBe(true)
  })
})
