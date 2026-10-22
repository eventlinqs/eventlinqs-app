import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/events',
}))

import { EventCard, type EventCardData } from '@/components/features/events/event-card'

/**
 * WI1: A WALK-IN CARD SAYS "FREE ENTRY" WHERE THE PRICE GOES.
 *
 * WI1-ITEM.md, point 4: walk-in events appear on every browse surface
 * "labelled 'Free entry'". The grid card is the one /events, the city, category,
 * community, venue, organiser and faith pages all render, so it is proven here on
 * the real component. A walk-in event is also is_free, and the card used to
 * answer "Free" for that before it looked at anything else, which would hide the
 * one thing that matters: nobody needs a ticket at all.
 */
const base: EventCardData = {
  id: 'evt_walk',
  slug: 'amcf-2026',
  title: 'African Music and Cultural Festival 2026',
  cover_image_url: 'https://cdn.example.com/amcf.avif',
  thumbnail_url: null,
  start_date: '2026-11-19T23:00:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'Fed Square',
  venue_city: 'Melbourne',
  venue_country: 'Australia',
  created_at: '2026-10-21T00:00:00Z',
  category: { name: 'Festival', slug: 'festival' },
  ticket_tiers: [],
  is_free: true,
}

describe('the grid card for a walk-in event', () => {
  it('says "Free entry", not "Free", and shows no price', () => {
    const { container } = render(<EventCard event={{ ...base, entry_mode: 'walk_in' }} />)
    expect(screen.getByText('Free entry')).toBeInTheDocument()
    expect(screen.queryByText('Free')).toBeNull()
    expect(container.textContent).not.toMatch(/\$\s?\d/)
  })

  it('a ticketed free event still says "Free", exactly as before', () => {
    render(<EventCard event={{ ...base, entry_mode: 'tickets' }} />)
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.queryByText('Free entry')).toBeNull()
  })

  it('a paid ticketed event still shows its lowest price', () => {
    render(
      <EventCard
        event={{
          ...base,
          is_free: false,
          entry_mode: 'tickets',
          ticket_tiers: [{ id: 't1', price: 2500, currency: 'AUD', sold_count: 0, reserved_count: 0, total_capacity: 100 }],
        }}
      />,
    )
    expect(screen.getByText('From AUD $25')).toBeInTheDocument()
  })
})
