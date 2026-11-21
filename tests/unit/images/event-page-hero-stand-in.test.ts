import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eventPageHero } from '@/lib/images/event-media'

/*
 * THE EVENT PAGE'S HERO, RESOLVED ONCE (law 46 (f), Lawal, 21 November 2026, 09:16; the PM's 10:15, ruling 2): the
 * night's own photograph, or its venue's, when it has one; else ITS OWN licensed stand in (the image lock, Lawal's
 * ruling of 21 November 2026: assigned once, never shared, never a picture by category) with the chip 'Illustrative
 * photo' top left; else the hero as before. The layout's preload and the page's raster ask the same
 * function, so the preloaded image is the painted one.
 */
const composed = 'https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/evt_1.png'
const own = 'https://x.supabase.co/storage/v1/object/public/event-images/organiser/evt_1/cover.jpg'

describe('eventPageHero', () => {
  const stand = 'https://x.supabase.co/storage/v1/object/public/event-images/stand-ins/late-laughs.jpg'
  it('a night with our composed cover stands on its OWN stand in, labelled', async () => {
    const out = await eventPageHero({ title: 'Late Laughs', cover_image_url: composed, category: { slug: 'comedy', name: 'Comedy' }, stand_in_url: stand, stand_in_alt: 'A microphone under a spotlight' })
    expect(out.illustrative).toBe(true)
    expect(out.media.image).toBe(stand)
    expect(out.media.alt).toBe('A microphone under a spotlight')
  })

  it('a night with no cover at all does the same', async () => {
    const out = await eventPageHero({ title: 'Storytime', cover_image_url: null, category: { slug: 'family', name: 'Family' }, stand_in_url: stand })
    expect(out).toMatchObject({ illustrative: true, media: { image: stand, alt: 'Storytime, an illustrative photo' } })
  })

  it('never a picture by category: a night with no stand in of its own keeps the hero as before', async () => {
    const out = await eventPageHero({ title: 'Late Laughs', cover_image_url: composed, category: { slug: 'comedy', name: 'Comedy' } })
    expect(out.illustrative).toBe(false)
    expect(out.media.image).toBe(composed)
  })

  it("the night's own photograph is never replaced and never labelled", async () => {
    const out = await eventPageHero({ title: 'Late Laughs', cover_image_url: own, category: { slug: 'comedy', name: 'Comedy' } })
    expect(out.illustrative).toBe(false)
    expect(out.media.image).toBe(own)
  })

  it('a night of any kind with no stand in keeps the hero as before (the composed cover keeps the typographic band)', async () => {
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
    expect(page).toContain('eventPageHero({ ...event, cover_image_url: heroCover.cover_image_url, stand_in_url: heroCover.stand_in_url, stand_in_alt: heroCover.stand_in_alt })')
    expect(page).not.toContain('getFeaturedHeroBackground(')
    expect(page).toContain('{heroIllustrative ? <IllustrativeChip /> : null}')
  })

  it("the layout's preload asks the same resolver for the event page", () => {
    expect(layout).toContain('eventPage: !isWalkIn(event)')
    expect(preload).toContain('opts.eventPage ? (await eventPageHero(event)).media')
  })
})
