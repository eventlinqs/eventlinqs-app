import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eventPageHero } from '@/lib/images/event-media'

/*
 * THE EVENT PAGE'S HERO, RESOLVED ONCE (law 46 (f), Lawal, 21 November 2026, 09:16; the PM's 10:15, ruling 2): the
 * night's own photograph, or its venue's, when it has one; else the licensed photograph of its kind with the chip
 * 'Illustrative photo' top left; else the hero as before. The layout's preload and the page's raster ask the same
 * function, so the preloaded image is the painted one.
 */
const composed = 'https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/evt_1.png'
const own = 'https://x.supabase.co/storage/v1/object/public/event-images/organiser/evt_1/cover.jpg'

describe('eventPageHero', () => {
  it("a night with our composed cover stands on its kind's looked-at photograph, labelled", async () => {
    const out = await eventPageHero({ title: 'Late Laughs', cover_image_url: composed, category: { slug: 'comedy', name: 'Comedy' } })
    expect(out.illustrative).toBe(true)
    expect(out.media.image).toBe('/images/library/illustrative-comedy.jpg')
    expect(out.media.alt).toBe('Comedy, an illustrative photo')
  })

  it('a night with no cover at all does the same', async () => {
    const out = await eventPageHero({ title: 'Storytime', cover_image_url: null, category: { slug: 'family', name: 'Family' } })
    expect(out).toMatchObject({ illustrative: true, media: { image: '/images/library/illustrative-family.jpg' } })
  })

  it("the night's own photograph is never replaced and never labelled", async () => {
    const out = await eventPageHero({ title: 'Late Laughs', cover_image_url: own, category: { slug: 'comedy', name: 'Comedy' } })
    expect(out.illustrative).toBe(false)
    expect(out.media.image).toBe(own)
  })

  it('a kind with no looked-at photograph keeps the hero as before (the composed cover keeps the typographic band)', async () => {
    const out = await eventPageHero({ title: 'A night', cover_image_url: composed, category: { slug: 'other', name: 'Other' } })
    expect(out.illustrative).toBe(false)
    expect(out.media.image).toBe(composed)
  })
})

describe('one resolver for the preload and the page, and the chip on the hero', () => {
  const page = readFileSync('src/app/events/[slug]/page.tsx', 'utf8')
  const layout = readFileSync('src/app/events/[slug]/layout.tsx', 'utf8')
  const preload = readFileSync('src/lib/images/hero-preload.tsx', 'utf8')

  it('the page paints what eventPageHero answers, and labels a stand in top left', () => {
    expect(page).toContain('eventPageHero({ ...event, cover_image_url: heroCover.cover_image_url })')
    expect(page).not.toContain('getFeaturedHeroBackground(')
    expect(page).toContain('{heroIllustrative ? <IllustrativeChip /> : null}')
  })

  it("the layout's preload asks the same resolver for the event page", () => {
    expect(layout).toContain('eventPage: !isWalkIn(event)')
    expect(preload).toContain('opts.eventPage ? (await eventPageHero(event)).media')
  })
})
