// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FeaturedHero } from '@/components/features/home/FeaturedHero'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'

/**
 * THE HOME HERO'S BUTTON ASKS THE ONE CALL TO ACTION (the project manager's 22:02 of 28 October 2026).
 *
 * On production after #195 the hero led with "Old School Trivia with Old School Prizes", Aunty Jacks, Ballarat, a free
 * walk-in night whose own page says "Free entry, no ticket needed", under a gold "Get tickets"
 * (C:\dev\EVIDENCE\LIVE-28OCT\home-390.png). FeaturedHeroClient wrote those words for every slide. Each slide now
 * carries ctaFor's action: details for a free or unknown night, "Get tickets" only for our own paid tickets.
 */

afterEach(() => cleanup())

const night = (over: Partial<BentoEvent>): BentoEvent =>
  ({
    id: 'e1',
    slug: 'old-school-trivia-with-old-school-prizes-aunty-jacks-2026-10-28',
    title: 'Old School Trivia with Old School Prizes',
    start_date: '2026-10-28T08:30:00Z',
    timezone: 'Australia/Melbourne',
    venue_name: 'Aunty Jacks',
    venue_city: 'Ballarat',
    cover_image_url: null,
    category: { name: 'Nightlife', slug: 'nightlife' },
    ...over,
  }) as BentoEvent

async function heroButton(event: BentoEvent): Promise<HTMLElement> {
  render(await FeaturedHero({ events: [event] }))
  return screen.getByRole('link', { name: /tickets|details|register/i })
}

describe('the home hero button', () => {
  test('a free walk-in night (Old School Trivia) offers details, never a ticket', async () => {
    const button = await heroButton(night({ entry_mode: 'walk_in', is_free: true, ticket_tiers: [] }))
    expect(button.textContent).toBe('View event details')
    expect(button.getAttribute('href')).toBe('/events/old-school-trivia-with-old-school-prizes-aunty-jacks-2026-10-28')
  })

  test('a night with no price anyone checked offers details', async () => {
    const button = await heroButton(night({ entry_mode: null, is_free: null, ticket_tiers: [] }))
    expect(button.textContent).toBe('View event details')
  })

  test('our own paid tickets still say "Get tickets"', async () => {
    const button = await heroButton(night({ entry_mode: null, is_free: false, ticket_tiers: [{ price: 2500, currency: 'AUD' }] }))
    expect(button.textContent).toBe('Get tickets')
  })
})
