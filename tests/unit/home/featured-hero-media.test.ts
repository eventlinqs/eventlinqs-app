import { describe, it, expect } from 'vitest'
import { getFeaturedHeroBackground } from '@/lib/images/event-media'

/**
 * HOME-PAGE GATE (hero wiring invariant, 2026-07-12): every featured hero
 * slide must carry its OWN event's image - image and text travel together.
 * The 2026-07-12 audit found five fixture slides all wearing the single
 * default raster because coverless events with unmapped category slugs all
 * fell through to one file. These pins make that regression impossible to
 * ship silently. The live half of the gate is
 * scripts/verify/hero-slide-integrity.mjs (docs/verification/HOME-GATES.md).
 */
describe('featured hero slide media invariant', () => {
  it('an event with a real cover renders THAT cover', async () => {
    const media = await getFeaturedHeroBackground({
      title: 'Ballet Gala Evening',
      cover_image_url: 'https://images.pexels.com/photos/20471000/pexels-photo-20471000.jpeg?fit=crop',
      category: { slug: 'arts-community', name: 'Arts' },
    })
    expect(media.image).toContain('pexels-photo-20471000')
  })

  it('coverless sibling events NEVER share one identical fallback', async () => {
    const titles = [
      'Late Night Jazz at the Metro',
      'Chocolate and Dessert Fair',
      'Ballet Gala Evening',
      'New Music Friday Live',
      'Folk and Roots Night',
    ]
    const images = await Promise.all(
      titles.map(title =>
        getFeaturedHeroBackground({
          title,
          cover_image_url: null,
          category: { slug: 'music', name: 'Music' }, // unmapped general slug
        }).then(m => m.image),
      ),
    )
    // Deterministic across runs...
    const again = await getFeaturedHeroBackground({
      title: titles[0],
      cover_image_url: null,
      category: { slug: 'music', name: 'Music' },
    })
    expect(again.image).toBe(images[0])
    // ...and varied across siblings: a five-slide carousel must show more
    // than one photo.
    expect(new Set(images).size).toBeGreaterThan(1)
  })

  it('a mapped community slug keeps its exact curated raster', async () => {
    const media = await getFeaturedHeroBackground({
      title: 'Gospel Sunday',
      cover_image_url: null,
      category: { slug: 'gospel', name: 'Gospel' },
    })
    expect(media.image).toBe('/images/hero/gospel.jpg')
  })
})
