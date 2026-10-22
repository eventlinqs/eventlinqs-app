import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/events',
}))

import { EventCard } from '@/components/features/events/event-card'
import { projectToCardData } from '@/lib/events/event-card-projection'
import type { PublicEventRow } from '@/lib/events/types'

/**
 * WI1: THE /events PROJECTION CARRIES THE ENTRY MODE TO THE CARD.
 *
 * walk-in-card-says-free-entry.test.tsx proves the card says "Free entry" when it
 * is GIVEN the mode. This proves the mode reaches it. On 21 October 2026 the
 * fetcher selected entry_mode and the projection then dropped it, so every
 * /events card for a walk-in event would have said "Free": the component test was
 * green and the page was wrong. The row goes through the real projection into the
 * real card here, so dropping the field again fails this file.
 */
function row(over: Partial<PublicEventRow>): PublicEventRow {
  return {
    id: 'evt_walk',
    slug: 'amcf-2026',
    title: 'African Music and Cultural Festival 2026',
    summary: null,
    description: null,
    timezone: 'Australia/Melbourne',
    cover_image_url: 'https://cdn.example.com/amcf.avif',
    thumbnail_url: null,
    gallery_urls: null,
    start_date: '2026-11-19T23:00:00Z',
    end_date: '2026-11-22T11:00:00Z',
    venue_name: 'Fed Square',
    venue_city: 'Melbourne',
    venue_country: 'Australia',
    venue_latitude: null,
    venue_longitude: null,
    created_at: '2026-10-21T00:00:00Z',
    is_free: true,
    entry_mode: 'walk_in',
    category: { id: 'cat-festival', name: 'Festival', slug: 'festival' },
    organisation: { id: 'org-amcf', name: 'AMCF', slug: 'amcf' },
    ticket_tiers: [],
    badge: null,
    ...over,
  }
}

describe('the /events projection and the walk-in card', () => {
  it('carries entry_mode from the row to the card data', async () => {
    const [card] = await projectToCardData([row({})])
    expect(card.entry_mode).toBe('walk_in')
  })

  it('a projected walk-in row renders "Free entry", never "Free"', async () => {
    const [card] = await projectToCardData([row({})])
    render(<EventCard event={card} />)
    expect(screen.getByText('Free entry')).toBeInTheDocument()
    expect(screen.queryByText('Free')).toBeNull()
  })

  it('a projected ticketed free row still renders "Free"', async () => {
    const [card] = await projectToCardData([row({ entry_mode: 'tickets' })])
    render(<EventCard event={card} />)
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.queryByText('Free entry')).toBeNull()
  })
})
