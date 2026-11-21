import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { EventCardFeature, EventCardLandscape, EventCardSquare, type HomeCardEvent } from '@/components/features/home/cards'

/*
 * ONE CHIP, EVERY CARD (law 46 (f); the PM's 10:15 of 21 November 2026, ruling 2): a homepage rail card standing on the
 * licensed photograph of its night's kind carries 'Illustrative photo' top left on the photograph; a card on the
 * night's own photograph never does. The words come from the one component every card uses.
 */
const card: HomeCardEvent = {
  href: '/events/late-laughs',
  imageSrc: '/images/library/illustrative-comedy.jpg',
  alt: 'Comedy, an illustrative photo',
  label: 'Comedy',
  title: 'Late Laughs',
  venue: 'The Barwon Club',
  city: 'Geelong',
  dateLabel: 'Sat 21 Nov',
  priceLabel: 'Free',
}

describe('the homepage cards', () => {
  it('each card shape carries the chip on a stand in, top left, from the one component', () => {
    for (const Card of [EventCardLandscape, EventCardSquare, EventCardFeature]) {
      const { container, unmount } = render(<Card event={{ ...card, illustrative: true }} />)
      const chip = container.querySelector('[data-illustrative]')
      expect(chip?.textContent).toBe('Illustrative photo')
      expect(chip?.className).toMatch(/left-2/)
      expect(chip?.className).toMatch(/top-2/)
      unmount()
    }
  })

  it("a card on the night's own photograph carries no chip", () => {
    for (const Card of [EventCardLandscape, EventCardSquare, EventCardFeature]) {
      const { container, unmount } = render(<Card event={{ ...card, imageSrc: '/images/test/own.jpg', illustrative: false }} />)
      expect(container.querySelector('[data-illustrative]')).toBeNull()
      unmount()
    }
  })

  it("the rail card stands a night with no photograph of its own on ITS OWN stand in before the brand panel (the image lock)", () => {
    const src = readFileSync('src/components/features/events/this-week-card.tsx', 'utf8')
    expect(src).not.toContain('illustrativePhoto')
    const stand = src.indexOf('imageSrc = event.stand_in_url')
    expect(stand).toBeGreaterThan(0)
    expect(stand).toBeLessThan(src.indexOf('imageSrc = BRANDED_FALLBACK_PHOTO.src'))
  })

  it('every surface draws the one chip component, never its own copy of the words', () => {
    for (const f of [
      'src/components/features/home/cards.tsx',
      'src/components/features/events/event-card.tsx',
      'src/components/features/city-guide/city-guide.tsx',
      'src/components/features/weekend/weekend-guide.tsx',
    ]) {
      const s = readFileSync(f, 'utf8')
      expect(s, f).toContain("from '@/components/media/illustrative-chip'")
      expect(s.replace(/\/\/.*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, ''), f).not.toMatch(/>\s*Illustrative photo\s*</)
    }
  })
})
