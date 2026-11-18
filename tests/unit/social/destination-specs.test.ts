import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESTINATION_SPECS, destinationOf, imageFacts, misfitOf } from '@/lib/social/destination-specs'
import { slidesMisfit } from '@/lib/social/destination-check'
import { SOCIAL_CARD_FORMATS } from '@/lib/broadcast/social-card-spec'
import { APPROVED_FILE_PREFIX, type Slide } from '@/lib/social/campaign'

/*
 * EVERY IMAGE AGAINST ITS DESTINATION (the PM's 13:42 of 18 November 2026, P0, law 4). The approved feed files were
 * 1440x1920 (3:4), which Instagram's publishing API refuses ("Aspect ratio: Must be within a 4:5 to 1.91:1 range",
 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media). These run on
 * the real files in public/social/approved, so a new design that does not fit its destination fails here.
 */
const root = process.cwd()
const dir = join(root, 'public', 'social', 'approved')
const bytesOf = (name: string) => new Uint8Array(readFileSync(join(dir, name)))
const facts = (name: string) => {
  const f = imageFacts(bytesOf(name))
  if (!f) throw new Error(`${name} is not read`)
  return f
}
const file = (name: string, format: 'feed' | 'story' = 'feed'): Slide => ({ t: 'file', composition: 'close', url: `${APPROVED_FILE_PREFIX}${name}`, format, eventId: null, startDate: null })
const serve = async (url: string) => {
  const name = url.slice(APPROVED_FILE_PREFIX.length)
  try {
    return new Response(bytesOf(name), { status: 200 })
  } catch {
    return new Response('missing', { status: 404 })
  }
}

describe('the destination table', () => {
  it('reads each approved file\'s own size from its bytes', () => {
    expect(facts('11-lany-feed.jpg')).toMatchObject({ kind: 'jpeg', width: 1440, height: 1920 })
    expect(facts('lany-feed-ig45.jpg')).toMatchObject({ kind: 'jpeg', width: 1440, height: 1800 })
    expect(facts('16-lany-story.jpg')).toMatchObject({ kind: 'jpeg', width: 1080, height: 1920 })
    expect(facts('21-amcf-square.jpg')).toMatchObject({ kind: 'jpeg', width: 1080, height: 1080 })
  })

  it('refuses a 3:4 file for both feeds (Lawal, 20:08 on 18 November: Facebook as professional as Instagram), and takes the 4:5 files, the stories and the squares where they go', () => {
    for (const f of ['11-lany-feed.jpg', '13-organisers-feed.jpg', '17-groovytown-feed.jpg', '20-amcf-feed.jpg']) {
      expect(misfitOf('instagram_feed', facts(f)), f).toMatch(/ratio 0\.750, outside instagram feed's 0\.800 to 1\.910/)
      expect(misfitOf('facebook_feed', facts(f)), f).toMatch(/ratio 0\.750, outside facebook feed's 0\.800 to 1\.910 \(Lawal's ruling of 18 November 2026, 20:08/)
    }
    for (const f of ['lany-feed-ig45.jpg', 'organisers-feed-ig45.jpg', 'groovytown-feed-ig45.jpg', 'amcf-feed-ig45.jpg']) {
      expect(misfitOf('instagram_feed', facts(f)), f).toBeNull()
      expect(misfitOf('facebook_feed', facts(f)), f).toBeNull()
    }
    for (const f of ['14-organisers-story.jpg', '16-lany-story.jpg', '18-groovytown-story.jpg', '22-amcf-story.jpg']) expect(misfitOf('instagram_story', facts(f)), f).toBeNull()
    for (const f of ['15-organisers-square.jpg', '21-amcf-square.jpg']) expect(misfitOf('facebook_feed', facts(f)), f).toBeNull()
    expect(misfitOf('instagram_story', facts('21-amcf-square.jpg'))).toMatch(/outside instagram story/)
  })

  it('holds the width, the file kind and the size limits Meta states', () => {
    expect(misfitOf('instagram_feed', { width: 1500, height: 1500, bytes: 1000, kind: 'jpeg' })).toMatch(/1500 wide, outside instagram feed's 320 to 1440/)
    expect(misfitOf('instagram_feed', { width: 1080, height: 1080, bytes: 1000, kind: 'png' })).toMatch(/PNG file/)
    expect(misfitOf('instagram_feed', { width: 1080, height: 1080, bytes: 8_000_000, kind: 'jpeg' })).toMatch(/over what/)
    expect(misfitOf('facebook_feed', { width: 1080, height: 1080, bytes: 9_999_999, kind: 'png' })).toBeNull()
    expect(DESTINATION_SPECS.instagram_feed.quoted).toContain('Aspect ratio: Must be within a 4:5 to 1.91:1 range')
  })

  it('every size the renderer draws fits its own destination (renderCampaignSlide through rasteriseCard, always JPEG)', () => {
    expect([SOCIAL_CARD_FORMATS.feed.width, SOCIAL_CARD_FORMATS.feed.height]).toEqual([1440, 1800])
    expect([SOCIAL_CARD_FORMATS.story.width, SOCIAL_CARD_FORMATS.story.height]).toEqual([1080, 1920])
    for (const platform of ['instagram', 'facebook'] as const) {
      for (const format of ['feed', 'story'] as const) {
        const s = SOCIAL_CARD_FORMATS[format]
        expect(misfitOf(destinationOf(platform, format), { width: s.width, height: s.height, bytes: 0, kind: 'jpeg' }), `${platform} ${format}`).toBeNull()
      }
    }
  })
})

describe('the check the publish run makes before any publisher is called', () => {
  it('holds a feed post on a 3:4 file on Instagram and on Facebook alike, and lets the 4:5 file go to both', async () => {
    expect(await slidesMisfit([file('11-lany-feed.jpg')], 'instagram', serve)).toMatch(/slide 1 does not fit instagram: it is 1440x1920, ratio 0\.750/)
    expect(await slidesMisfit([file('11-lany-feed.jpg')], 'facebook', serve)).toMatch(/slide 1 does not fit facebook: it is 1440x1920, ratio 0\.750/)
    expect(await slidesMisfit([file('lany-feed-ig45.jpg')], 'facebook', serve)).toBeNull()
    expect(await slidesMisfit([file('lany-feed-ig45.jpg')], 'instagram', serve)).toBeNull()
    expect(await slidesMisfit([file('16-lany-story.jpg', 'story')], 'instagram', serve)).toBeNull()
  })

  it('holds a post whose file cannot be read, never guessing its size', async () => {
    expect(await slidesMisfit([file('not-there.jpg')], 'instagram', serve)).toMatch(/answers 404/)
  })

  it('runs in the publish run after the piece\'s checks and before the publisher', () => {
    const store = readFileSync(join(root, 'src', 'lib', 'social', 'store.ts'), 'utf8')
    const start = store.indexOf('export async function publishDuePieces(')
    const body = store.slice(start, store.indexOf('\nexport ', start + 10))
    expect(body).toMatch(/slidesMisfit\(/)
    expect(body.indexOf('slidesMisfit(')).toBeGreaterThan(body.indexOf('pieceDependencies('))
    expect(body.indexOf('slidesMisfit(')).toBeLessThan(body.indexOf('opts.publisher({'))
  })
})
