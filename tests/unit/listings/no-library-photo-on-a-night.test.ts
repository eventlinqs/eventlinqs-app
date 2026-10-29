import { describe, expect, it } from 'vitest'
import { hasRealCover as rankedReal } from '@/lib/events/fetchers'
import { hasRealCover as publishReal } from '@/lib/events/publish-gate'
import { isOwnPhoto } from '@/lib/images/event-media'

/*
 * NO LIBRARY PHOTOGRAPH STANDS FOR A NIGHT (the project manager's 18:38 of 29 October 2026, under Lawal's 19:52 directive
 * of 28 October: authorised photographs, else premium typography; contextual photography only for brand pieces that
 * name no night). On production all 334 public nights still to come wore a library photograph as their cover
 * (C:\dev\EVIDENCE\LIBRARY-PHOTOS-29OCT\production-count.txt). A library photograph is never a night's own cover, so
 * the typographic cover replaces it, and the home hero leads only with a night's own photograph.
 */
const LIBRARY = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/stock/categories/arts/gallery-day-1440.avif'
const COMPOSED = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/generated-covers/e1.png'
const OWN = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/org/e1/cover.avif'

describe('a library photograph is never a night\u2019s own cover', () => {
  it('the ranking does not count it as a real cover', () => {
    expect(rankedReal(LIBRARY)).toBe(false)
    expect(rankedReal(COMPOSED)).toBe(true)
    expect(rankedReal(OWN)).toBe(true)
  })

  it('the publish gate does not count it as a real cover, so the typographic cover is made in its place', () => {
    expect(publishReal(LIBRARY)).toBe(false)
    expect(publishReal(COMPOSED)).toBe(true)
    expect(publishReal(OWN)).toBe(true)
  })

  it('only an organiser\u2019s own or an authorised photograph is a night\u2019s own photo (the home hero\u2019s rule)', () => {
    expect(isOwnPhoto(OWN)).toBe(true)
    expect(isOwnPhoto(LIBRARY)).toBe(false)
    expect(isOwnPhoto(COMPOSED)).toBe(false)
    expect(isOwnPhoto('https://picsum.photos/400')).toBe(false)
    expect(isOwnPhoto(null)).toBe(false)
  })
})

describe('a night with no photograph of its own is never given a stock photograph by the media resolver', () => {
  it('getEventMedia and getFeaturedEventMedia draw the branded ground, not a category or library photograph', async () => {
    const { getEventMedia, getFeaturedEventMedia } = await import('@/lib/images/event-media')
    for (const cover of [LIBRARY, null]) {
      for (const resolve of [getEventMedia, getFeaturedEventMedia]) {
        const media = await resolve({ title: 'Bavarian Sunset Market', cover_image_url: cover, category: { slug: 'arts-community', name: 'Arts' } })
        expect(media.kind, `${resolve.name} ${String(cover)}`).toBe('branded-placeholder')
      }
    }
  })

  it('a night with its own photograph keeps it', async () => {
    const { getEventMedia } = await import('@/lib/images/event-media')
    expect(await getEventMedia({ title: 'x', cover_image_url: OWN })).toMatchObject({ kind: 'still-kenburns', src: OWN })
  })
})
