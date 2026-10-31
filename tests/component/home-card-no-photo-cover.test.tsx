import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { EventCardLandscape, EventCardSquare, EventCardFeature, type HomeCardEvent } from '@/components/features/home/cards'

/*
 * THE NO-PHOTO COVER IS NEVER THE WORDMARK ALONE (the CONTROLLER's 31 October 13:45; seen on live in 'What's happening
 * near you': a dark card with only 'EVENTLINQS'). A home card whose night has no photo of its own draws our typographic
 * cover with the night's date mark, as every event card does; the title, category, venue and price stay below it, once.
 */
const NIGHT: HomeCardEvent = {
  href: '/events/live-music-garden-session',
  imageSrc: 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/generated-covers/a95f/1.jpg',
  alt: 'Live Music Garden Session',
  label: 'Music',
  title: 'Live Music Garden Session with Ben Dew',
  venue: 'Where You Meet',
  city: 'Melbourne',
  dateLabel: 'Fri 6 Nov',
  priceLabel: 'Free entry',
  startDate: '2026-11-06T06:00:00+00:00',
  timeZone: 'Australia/Melbourne',
}

describe('a home card with no photo of its own', () => {
  for (const [name, Card] of [
    ['landscape', EventCardLandscape],
    ['square', EventCardSquare],
    ['feature', EventCardFeature],
  ] as const) {
    it(`${name}: draws the date mark on its cover, never the wordmark alone`, () => {
      const { container } = render(<Card event={NIGHT} />)
      expect(container.querySelector('[data-date-mark="6 NOV"], [data-date-mark="6 Nov"]')).not.toBeNull()
    })
  }
})
