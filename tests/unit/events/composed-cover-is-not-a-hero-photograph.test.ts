// A night whose only image is our own typographic cover gets a typographic hero, never that cover as a photograph
// (window 2's public site audit on production, 29 October 2026: after the 358 cover re-mints the event page drew the
// composed cover full bleed behind its own title, cropped to 'Escape at the' / 'Old Melbourne' / 'Gaol', so the title
// showed twice, overlapping, with a ghost chip and a ghost URL).
//
// A composed cover is a CARD: its artwork is the title, laid out for a card's frame. On the event page the title is
// already set in type over the hero, so the hero keeps the brand's navy surface and the title once. The walk-in page
// shows its cover as a contained card with the title below it, so it keeps the cover and its preload.

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { getFeaturedHeroBackground, heroIsTypographic } from '@/lib/images/event-media'

const COMPOSED =
  'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-covers/generated-covers/9f1c/1793270000000.jpg'
const ORGANISER = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-covers/poster.jpg'

describe('which hero is typographic', () => {
  test('our composed cover, with no video: typographic', async () => {
    const media = await getFeaturedHeroBackground({ title: 'A Spooky Escape', cover_image_url: COMPOSED, category: { slug: 'family', name: 'Family' } })
    expect(heroIsTypographic(media)).toBe(true)
  })

  test("an organiser's own cover, and a composed cover that poses a video: a photograph", async () => {
    const own = await getFeaturedHeroBackground({ title: 'Afro Fusion', cover_image_url: ORGANISER, category: { slug: 'music', name: 'Music' } })
    expect(heroIsTypographic(own)).toBe(false)
    expect(heroIsTypographic({ image: COMPOSED, videoSrc: 'https://example.com/v.mp4' })).toBe(false)
  })
})

describe('the event page and its preload ask it', () => {
  test('the event page draws no hero raster for a typographic hero', () => {
    const page = readFileSync('src/app/events/[slug]/page.tsx', 'utf8')
    expect(page).toMatch(/const typographicHero = heroIsTypographic\(media\)/)
    expect(page).toMatch(/\{typographicHero \? null : \(\s*<HeroMedia/)
  })

  test('the layout skips the preload for a typographic hero, but not for a walk-in night', () => {
    const layout = readFileSync('src/app/events/[slug]/layout.tsx', 'utf8')
    expect(layout).toMatch(/eventHeroPreloadLink\(event, \{ typographicHasNoRaster: !isWalkIn\(event\) \}\)/)
  })
})
