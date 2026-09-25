import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { BRANDED_FALLBACK_PHOTO, isBrandedFallbackPhoto } from '@/lib/images/category-photo'

/**
 * A CATEGORY HERO IS A PHOTOGRAPH OR IT IS NOTHING. NEVER THE PLACEHOLDER.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, found by scripts/link-integrity-crawl.mjs on 19 September 2026.
 *
 *     500  /categories/technology  (linked from: /categories/music)
 *     [HeroMedia] image must be a raster URL (got SVG):
 *     /images/event-fallback-hero.svg
 *
 * `getCategoryPhoto` says "I have no photograph" by returning the branded
 * fallback, whose `src` is an SVG. The page passed that `src` into the hero, and
 * the hero's chain is `spine ?? bundled ?? fallbackImage ?? HERO_RASTER_DEFAULT`:
 * a non-empty string wins `??`, so the hero's own last resort never ran.
 *
 * IN PRODUCTION THERE IS NO 500. `assertRaster` is wrapped in
 * `process.env.NODE_ENV !== 'production'`, so production renders the SVG as the
 * hero: a page whose LCP element cannot be the LCP, silently, on twenty-two
 * landings that exist to be found in Google. That is why the last case below
 * asserts the rendered `src` rather than the absence of a throw.
 *
 * ---------------------------------------------------------------------------
 * The shared chrome is not what this file is about; the same mock and the same
 * reason as tests/component/weekend-landing-page.test.tsx.
 */
vi.mock('@/components/layout/PageShell', () => ({
  PageShell: ({ children }: { children: unknown }) => children,
}))

const { PhotographicCategoryHero } = await import('@/components/templates/PhotographicCategoryHero')

const RASTER = /\.(jpg|jpeg|png|avif|webp)(\?|$)/i

function heroSrc(ui: React.ReactElement): string {
  const { container } = render(ui)
  const img = container.querySelector('img')
  expect(img, 'the hero rendered no image at all').not.toBeNull()
  // next/image rewrites the src through the optimiser, so the original path is
  // read out of the query string where it is present.
  const raw = img!.getAttribute('src') ?? ''
  const match = /[?&]url=([^&]+)/.exec(raw)
  return match ? decodeURIComponent(match[1]) : raw
}

const base = {
  eyebrow: 'Category',
  title: 'Technology events in Australia',
  subtitle: 'What is on, and when.',
}

describe('the branded fallback is a sentinel and says so', () => {
  it('is an SVG, which is the whole hazard', () => {
    expect(BRANDED_FALLBACK_PHOTO.src).toMatch(/\.svg$/)
  })

  it('is recognised by the exported test rather than by a copied literal', () => {
    expect(isBrandedFallbackPhoto(BRANDED_FALLBACK_PHOTO)).toBe(true)
    expect(isBrandedFallbackPhoto({ src: 'https://images.pexels.com/photos/1/x.jpeg' })).toBe(false)
  })
})

describe('PhotographicCategoryHero always renders a raster', () => {
  it('falls back to a bundled raster when the page has no photograph for the slug', () => {
    const src = heroSrc(<PhotographicCategoryHero slug="technology" {...base} fallbackImage={null} />)
    expect(src).toMatch(RASTER)
    expect(src).not.toMatch(/\.svg/)
  })

  it('uses the photograph the page resolved when there is one', () => {
    const photo = 'https://images.pexels.com/photos/1/tech-conference.jpeg'
    const src = heroSrc(<PhotographicCategoryHero slug="technology" {...base} fallbackImage={photo} />)
    expect(src).toBe(photo)
  })

  /*
   * THE LAST RESORT IS CATEGORY-NEUTRAL, which is a behaviour rather than a
   * preference: it used to be the Afrobeats community raster, and the component's
   * own note called opening /categories/technology on "a photograph of a
   * community dance floor" a worse failure than a missing image. It was
   * unreachable while it was wrong, so nothing ever tested it.
   */
  it('does not open a technology landing on a community photograph', () => {
    const src = heroSrc(<PhotographicCategoryHero slug="technology" {...base} fallbackImage={null} />)
    for (const community of ['afrobeats', 'amapiano', 'bollywood', 'caribbean', 'filipino', 'gospel', 'latin', 'lunar', 'owambe']) {
      expect(src, `the neutral default must not be the ${community} raster`).not.toContain(community)
    }
  })

  it('is never handed the placeholder by any slug, with or without a photograph', () => {
    for (const slug of ['technology', 'religion', 'fashion', 'health-wellness', 'film', 'pride', 'pacific', 'other']) {
      const src = heroSrc(<PhotographicCategoryHero slug={slug} {...base} fallbackImage={null} />)
      expect(src, `${slug} rendered ${src}`).not.toMatch(/\.svg/)
    }
  })

  /*
   * THE SHAPE THIS REPLACES, written out so the file says what it defends
   * against: the placeholder IS a non-empty string, so it wins the chain.
   */
  it('the placeholder really does win the chain when a caller passes it', () => {
    expect(BRANDED_FALLBACK_PHOTO.src ?? '/images/hero/homepage-day-festival.jpg').toBe(
      BRANDED_FALLBACK_PHOTO.src,
    )
  })
})
