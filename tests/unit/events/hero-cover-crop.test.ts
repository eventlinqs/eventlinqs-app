// The hero crop must not cut the top off an organiser's poster (close-out UX1.4).
//
// Reported on production, 9 September 2026: the homepage hero cropped the top
// of the first real outside organiser's cover, where the event name sits.
// HeroMedia's default anchor is `50% 30%`, which is correct for the crowd
// PHOTOGRAPHS it was tuned on and wrong for a POSTER, because any anchor above
// 0% eats the title first.
//
// This pins the seam: an organiser-supplied cover anchors to the top, a curated
// platform raster does not, and the two are decided in one resolver so every
// hero surface on the platform inherits the same answer.

import { describe, expect, test } from 'vitest'
import {
  ORGANISER_COVER_OBJECT_POSITION,
  getFeaturedHeroBackground,
  isComposedCover,
} from '@/lib/images/event-media'

const ORGANISER_COVER =
  'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-covers/poster.jpg'

describe('an organiser-supplied cover', () => {
  test('anchors to the top, so the poster title survives the crop', async () => {
    const media = await getFeaturedHeroBackground({
      title: 'Afro Fusion Music Showcase',
      cover_image_url: ORGANISER_COVER,
      category: { slug: 'music', name: 'Music' },
    })
    expect(media.image).toBe(ORGANISER_COVER)
    expect(media.objectPosition).toBe(ORGANISER_COVER_OBJECT_POSITION)
  })

  test('and the anchor is top-flush, which is the only value that guarantees it', () => {
    // Any vertical percentage above 0 crops from the top first. This is a
    // guarantee, not a tuned preference, so it is asserted literally.
    expect(ORGANISER_COVER_OBJECT_POSITION).toBe('50% 0%')
    const vertical = Number(ORGANISER_COVER_OBJECT_POSITION.split(' ')[1].replace('%', ''))
    expect(vertical).toBe(0)
  })

  test('holds when the organiser also supplied a video', async () => {
    const media = await getFeaturedHeroBackground({
      title: 'Afro Fusion Music Showcase',
      cover_image_url: ORGANISER_COVER,
      video_url: 'https://example.com/clip.mp4',
      category: { slug: 'music', name: 'Music' },
    })
    expect(media.objectPosition).toBe(ORGANISER_COVER_OBJECT_POSITION)
    expect(media.videoSrc).toBe('https://example.com/clip.mp4')
  })
})

describe('a curated platform raster', () => {
  test('leaves the anchor unset, keeping the crowd-tuned HeroMedia default', async () => {
    const media = await getFeaturedHeroBackground({
      title: 'A night with no cover uploaded',
      cover_image_url: null,
      category: { slug: 'music', name: 'Music' },
    })
    // Not the organiser branch: HeroMedia's own 50% 30% is the right crop for
    // the licensed photography, and this must not quietly take it over.
    expect(media.objectPosition).toBeUndefined()
    expect(media.image).toMatch(/^\/images\/hero\//)
  })
})

describe('a platform-composed cover is not organiser artwork', () => {
  // Caught by LOOKING at the 390 capture during the UX1 driven proof, while the
  // assertion beside it was green: a composed cover carries the event title as
  // its own artwork, so anchoring it to the top pushes that title up behind the
  // page headline. FeaturedHero already knew this and kept it private; the
  // event page never had it.
  const COMPOSED =
    'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/generated-covers/laneway.png'

  test('keeps the HeroMedia default rather than the top anchor', async () => {
    const media = await getFeaturedHeroBackground({
      title: 'Laneway Sessions',
      cover_image_url: COMPOSED,
      category: { slug: 'music', name: 'Music' },
    })
    expect(media.image).toBe(COMPOSED)
    expect(media.objectPosition).toBeUndefined()
  })

  test('and the discriminator has ONE definition', () => {
    expect(isComposedCover(COMPOSED)).toBe(true)
    expect(isComposedCover(ORGANISER_COVER)).toBe(false)
    expect(isComposedCover(null)).toBe(false)
  })
})
