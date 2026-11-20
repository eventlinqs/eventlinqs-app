import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { composeNewsletterImage, fadesSvg, isNewsletterImageSource, NL_IMAGE_KINDS } from '@/lib/newsletter/compose-image'

/*
 * NL-1's composed images (law 46, design A; compose.py ported): the sizes are the reference's, the source is ours or a
 * licensed library's only, and a real sharp draw returns a JPEG of the kind's size, with a photograph or without one.
 */
const OPTS = { storageOrigin: 'https://gndnldyfudbytbboxesk.supabase.co', siteHosts: ['www.eventlinqs.com.au', 'eventlinqs.com.au'] }

describe('the newsletter draws only from our own or a licensed photograph', () => {
  it('our storage, our site images and Unsplash pass; anything else, or plain http, is refused', () => {
    expect(isNewsletterImageSource('https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/a.jpg', OPTS)).toBe(true)
    expect(isNewsletterImageSource('https://www.eventlinqs.com.au/images/hero/music.avif', OPTS)).toBe(true)
    expect(isNewsletterImageSource('https://images.unsplash.com/photo-1766766829410-36cf2f0bdce7?w=1600', OPTS)).toBe(true)
    expect(isNewsletterImageSource('https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/sign/private/a.jpg', OPTS)).toBe(false)
    expect(isNewsletterImageSource('https://www.eventlinqs.com.au/api/admin/x', OPTS)).toBe(false)
    expect(isNewsletterImageSource('https://evil.example/a.jpg', OPTS)).toBe(false)
    expect(isNewsletterImageSource('http://images.unsplash.com/a.jpg', OPTS)).toBe(false)
    expect(isNewsletterImageSource('not a url', OPTS)).toBe(false)
  })
})

describe("the kinds are the reference's", () => {
  it('the hero, featured and card sizes of compose.py, the gold corner on the heroes only', () => {
    expect([NL_IMAGE_KINDS['hero-d'].w, NL_IMAGE_KINDS['hero-d'].h, NL_IMAGE_KINDS['hero-d'].corner]).toEqual([1200, 560, 150])
    expect([NL_IMAGE_KINDS['hero-m'].w, NL_IMAGE_KINDS['hero-m'].h, NL_IMAGE_KINDS['hero-m'].corner]).toEqual([780, 1040, 120])
    expect([NL_IMAGE_KINDS['feat-d'].w, NL_IMAGE_KINDS['feat-d'].h]).toEqual([1184, 920])
    expect([NL_IMAGE_KINDS.card.w, NL_IMAGE_KINDS.card.h, NL_IMAGE_KINDS.card.corner]).toEqual([600, 380, 0])
    expect(fadesSvg(NL_IMAGE_KINDS['hero-d'])).toContain('fill="#E8B738"')
    expect(fadesSvg(NL_IMAGE_KINDS.card)).not.toContain('#E8B738')
  })
})

describe('a real draw with the installed sharp', () => {
  it('a photograph comes back as a JPEG of the kind, and none as the navy canvas', async () => {
    const photo = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#88aacc' } }).jpeg().toBuffer()
    for (const kind of ['card', 'hero-d', 'feat-m'] as const) {
      const out = await composeNewsletterImage(kind, new Uint8Array(photo))
      const meta = await sharp(out).metadata()
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', NL_IMAGE_KINDS[kind].w, NL_IMAGE_KINDS[kind].h])
    }
    const navy = await sharp(await composeNewsletterImage('card', null)).stats()
    // The navy canvas: a dark blue, red and green under blue.
    expect(navy.channels[2].mean).toBeGreaterThan(navy.channels[0].mean)
  })
})
