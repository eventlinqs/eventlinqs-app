import type { EventMediaInput } from '@/lib/images/event-media'

/**
 * Category highlight slides — used to pad the hero carousel when fewer than
 * three qualifying events exist. Each slide routes to a category or curated
 * filter and uses Pexels-backed category media via getFeaturedHeroBackground.
 *
 * Order is meaningful: Afrobeats anchors, Free-weekend converts, Trending
 * captures FOMO — covers the three primary intents.
 */

export interface CategoryHighlightSlide {
  key: string
  eyebrow: string
  cardEyebrow: string
  cardTitle: string
  cardCopy: string
  ctaLabel: string
  ctaHref: string
  /** Shape compatible with EventMediaInput so it can pipe through getFeaturedHeroBackground */
  media: EventMediaInput
}

export const CATEGORY_HIGHLIGHT_SLIDES: CategoryHighlightSlide[] = [
  {
    key: 'afrobeats',
    eyebrow: 'Made for the diaspora',
    cardEyebrow: 'Cultural picks',
    cardTitle: 'This week in Afrobeats',
    cardCopy:
      'Naija nights, culture sessions, and the beats that never sleep. Fresh drops every weekend.',
    ctaLabel: 'Explore Afrobeats',
    ctaHref: '/categories/afrobeats',
    media: { title: 'Afrobeats', category: { slug: 'afrobeats', name: 'Afrobeats' } },
  },
  {
    key: 'free-weekend',
    eyebrow: 'This weekend',
    cardEyebrow: 'Zero platform fees',
    cardTitle: 'Free this weekend',
    cardCopy:
      'Discover events that cost nothing but your Saturday. No platform fees, no catch.',
    ctaLabel: 'Browse free events',
    ctaHref: '/events?price=free',
    media: { title: 'Free events', category: { slug: 'festival', name: 'Festival' } },
  },
  {
    key: 'trending',
    eyebrow: 'Trending now',
    cardEyebrow: 'Selling fast',
    cardTitle: 'What the culture is buying',
    cardCopy:
      'The events the diaspora is booking right now. Move before the tickets do.',
    ctaLabel: 'See what is trending',
    ctaHref: '/events?sort=trending',
    media: { title: 'Trending events', category: { slug: 'music', name: 'Music' } },
  },
]
