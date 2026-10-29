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

const OWN_PHOTO = 'https://x.supabase.co/storage/v1/object/public/event-images/org/e1/cover.avif'

const night = (over: Partial<BentoEvent>): BentoEvent =>
  ({
    id: 'e1',
    slug: 'old-school-trivia-with-old-school-prizes-aunty-jacks-2026-10-28',
    title: 'Old School Trivia with Old School Prizes',
    start_date: '2026-10-28T08:30:00Z',
    timezone: 'Australia/Melbourne',
    venue_name: 'Aunty Jacks',
    venue_city: 'Ballarat',
    // The night's own photograph: the hero leads only with one (no-library-photo-on-a-night).
    cover_image_url: OWN_PHOTO,
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

/*
 * THE HERO LEADS ONLY WITH A NIGHT'S OWN PHOTOGRAPH (the project manager's 18:38 of 29 October 2026, under Lawal's 19:52
 * directive: authorised photographs, else premium typography; contextual photography only for pieces that name no
 * night). Production's hero led 'Bavarian Sunset Market' with an art-gallery library photograph. A night wearing a
 * library photograph or our typographic cover is never a slide; with none of its own, the hero is the curated
 * homepage hero, which names no night.
 */
describe('the home hero leads only with a night\u2019s own photograph', () => {
  const LIBRARY = 'https://x.supabase.co/storage/v1/object/public/event-images/stock/categories/arts/gallery-day-1440.avif'
  const COMPOSED = 'https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/e1.png'

  test('a night on a library photograph or our typographic cover is never a hero slide', async () => {
    for (const cover of [LIBRARY, COMPOSED, null]) {
      cleanup()
      render(await FeaturedHero({ events: [night({ title: 'Bavarian Sunset Market', cover_image_url: cover, entry_mode: 'walk_in', is_free: true })] }))
      expect(screen.queryByText('Bavarian Sunset Market'), String(cover)).toBeNull()
    }
  })

  test('a night with its own photograph leads', async () => {
    render(await FeaturedHero({ events: [night({ title: 'Bavarian Sunset Market', cover_image_url: OWN_PHOTO, entry_mode: 'walk_in', is_free: true })] }))
    expect(screen.getAllByText('Bavarian Sunset Market').length).toBeGreaterThan(0)
  })
})
/*
 * THE CURATED HERO SAYS WHAT IS TRUE OF THE CATALOGUE (found by eye at 390, 29 October 2026, C:\dev\EVIDENCE\
 * LIBRARY-PHOTOS-29OCT\hero-390): it was written for an empty site, 'The first organisers are getting set up', and now
 * shows whenever no night has its own photograph, which on production is every night of 334.
 */
describe('the curated hero line', () => {
  test('with nights on but none with its own photograph, it never says the site is empty', async () => {
    render(await FeaturedHero({ events: [night({ cover_image_url: null })] }))
    expect(screen.queryByText(/first organisers are getting set up/i)).toBeNull()
    expect(screen.getByText('Gigs, markets, festivals and free nights, all in one place.')).toBeTruthy()
  })

  test('with no nights at all, it still says the first organisers are getting set up', async () => {
    render(await FeaturedHero({ events: [] }))
    expect(screen.getByText(/first organisers are getting set up/i)).toBeTruthy()
  })
})
