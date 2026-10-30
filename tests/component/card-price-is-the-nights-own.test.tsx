import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { EventCard, type EventCardData } from '@/components/features/events/event-card'

/**
 * A CARD NEVER SAYS 'FREE' FOR A NIGHT NOT STORED AS FREE (rules E6 and E7; the project manager's 12:40 of
 * 30 October 2026, found at 390 x 844 on production).
 *
 * /city/geelong's card for Kate Ceberano read 'Free'. Production holds, read only: is_free false, entry_mode tickets,
 * external_ticket_url https://geelongartscentre.org.au/whats-on/all-events/kate-ceberano/, and no ticket types of ours.
 * The card answered 'Free' for any night with no tiers. Each night here is that shape or one of the other states, on
 * the real component.
 */
const ceberano: EventCardData = {
  id: 'evt_ceberano',
  slug: 'kate-ceberano-australian-made-tour-2026-geelong-arts-centre-2026-10-31',
  title: 'Kate Ceberano, Australian Made Tour 2026',
  cover_image_url: null,
  thumbnail_url: null,
  start_date: '2026-10-31T08:00:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'Costa Hall',
  venue_city: 'Geelong',
  venue_country: 'Australia',
  created_at: '2026-10-21T00:00:00Z',
  category: { name: 'Music', slug: 'music' },
  ticket_tiers: [],
  is_free: false,
  entry_mode: 'tickets',
  external_ticket_url: 'https://geelongartscentre.org.au/whats-on/all-events/kate-ceberano/',
}
const tier = (id: string, price: number) => ({ id, price, currency: 'AUD', sold_count: 0, reserved_count: 0, total_capacity: 100 })
/**
 * The card's own price element. Read on its own because the card's text runs on from the city into the price
 * ('GeelongFree'), where a word-boundary match on the whole card misses 'Free': the first version of this test passed
 * on the old card for that reason, and was caught by running it there.
 */
const priceOf = (c: HTMLElement) => c.querySelector('.event-card-price')?.textContent?.trim() ?? ''

describe('the card price line is the night\'s own call to action', () => {
  it('a paid night sold on another site names that site, never "Free" (Kate Ceberano at Costa Hall)', () => {
    const { container } = render(<EventCard event={ceberano} />)
    expect(screen.getByText('Tickets on geelongartscentre.org.au')).toBeInTheDocument()
    expect(priceOf(container)).toBe('Tickets on geelongartscentre.org.au')
  })

  it('a night whose price nobody has checked says no price at all, never "Free"', () => {
    const { container } = render(<EventCard event={{ ...ceberano, external_ticket_url: null }} />)
    expect(priceOf(container)).toBe('')
  })

  it('a $0 ticket beside paid ones is a paid night: it shows the lowest paid price', () => {
    render(<EventCard event={{ ...ceberano, external_ticket_url: null, ticket_tiers: [tier('t0', 0), tier('t1', 1500)] }} />)
    expect(screen.getByText('From AUD $15')).toBeInTheDocument()
    expect(screen.queryByText(/\bFree\b/)).toBeNull()
  })

  it('a night whose tickets are all $0 on EventLinqs says the one free wording with registration', () => {
    render(<EventCard event={{ ...ceberano, external_ticket_url: null, ticket_tiers: [tier('t0', 0)] }} />)
    expect(screen.getByText('Free, registration required')).toBeInTheDocument()
  })

  it('a night stored as free with no tickets says "Free entry"', () => {
    render(<EventCard event={{ ...ceberano, external_ticket_url: null, is_free: true }} />)
    expect(screen.getByText('Free entry')).toBeInTheDocument()
  })
})
