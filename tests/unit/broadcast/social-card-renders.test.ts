/**
 * EVERY SOCIAL CARD FORMAT ACTUALLY RENDERS, AND RENDERS A REAL IMAGE.
 *
 * WHY THIS EXISTS, 29 August 2026. Driving the Launch Kit, every one of the
 * eighteen card downloads (three formats across six channels) answered HTTP 500
 * with a ZERO-BYTE body, and the server log said only:
 *
 *   Error: Input buffer contains unsupported image format
 *
 * That message comes from sharp, and in renderSocialCard sharp is handed the
 * PNG that ImageResponse produced. So the message names the second-to-last step
 * and says nothing about the one that actually failed, which is the render.
 *
 * The machine this was found on has a demonstrably corrupted build directory
 * (OneDrive left a conflict copy, "CURRENT-Lawal", inside the Turbopack cache
 * and broke a build outright), so "the cards are broken" could not honestly be
 * separated from "this build is damaged" by driving the server alone.
 *
 * These tests run the REAL renderer, with the REAL fonts, OUTSIDE the built
 * server, and assert the OUTPUT: a decodable JPEG at the published pixel size.
 * If they pass while the route 500s, the artefact is sound and the build is
 * not. If they fail, the renderer is genuinely broken and it is pinned here
 * rather than being rediscovered from a 500 with an empty body.
 *
 * The no-cover case is tested too, because it is not an edge: Law 6 says an
 * organiser who supplies no artwork gets a typographic composition built from
 * their own event details, so that path is a product feature and not a
 * fallback.
 */
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { renderSocialCard, prepareCardCover } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_FORMATS, SOCIAL_CARD_MAX_BYTES, type SocialCardFormat } from '@/lib/broadcast/social-card-spec'

const FORMATS: SocialCardFormat[] = ['story', 'square', 'feed']

/** A minimal but realistic card input: the shape the route builds. */
function input() {
  return {
    title: 'Kit Inspection Night',
    dateLabel: 'Saturday 11 October 2026',
    locality: 'The Corner Hotel, Melbourne',
    priceLabel: 'From AUD 45.00',
    organiserName: 'Kit Presents',
    shortUrl: 'https://www.eventlinqs.com.au/s/abc123',
    organiserLogo: null,
    cover: null,
    qr: null,
    summary: 'Every artefact in the kit, opened and looked at.',
  } as unknown as Parameters<typeof renderSocialCard>[1]
}

describe('the social card renderer', () => {
  for (const format of FORMATS) {
    const spec = SOCIAL_CARD_FORMATS[format]

    it(`renders ${format} (${spec.label}) as a decodable JPEG at ${spec.width} x ${spec.height}`, async () => {
      const bytes = await renderSocialCard(format, input())

      expect(bytes.byteLength, 'a zero-byte card is the 500 this test exists for').toBeGreaterThan(0)
      expect(bytes.byteLength).toBeLessThanOrEqual(SOCIAL_CARD_MAX_BYTES)

      // Decoded, not trusted. A buffer of the right length that sharp cannot
      // read is exactly what the route was handing back.
      const meta = await sharp(Buffer.from(bytes)).metadata()
      expect(meta.format).toBe('jpeg')
      expect(meta.width).toBe(spec.width)
      expect(meta.height).toBe(spec.height)

      // And it must carry ink. A correctly sized flat rectangle is still a
      // broken artefact, and it is the shape a font failure produces.
      const stats = await sharp(Buffer.from(bytes)).stats()
      const stdev = Math.max(...stats.channels.map(c => c.stdev))
      expect(stdev, 'a flat card has no type on it').toBeGreaterThan(6)
    }, 60000)

    /*
     * THE PATH THE ROUTE ACTUALLY TAKES. Every card an organiser downloads for
     * a published event carries their cover photograph, and that is a
     * different composition from the typographic one above: StoryCard and
     * BandedCard rather than TypographicCard, with the photograph prepared by
     * prepareCardCover and embedded as a data URI.
     *
     * Testing only the no-cover path would have left the entire photographic
     * branch unproven, which is the branch every real organiser hits.
     *
     * The photograph is SYNTHESISED rather than fetched. A test that reaches
     * the network is a test that fails when the network does, and this one
     * exists to distinguish a broken artefact from a broken environment.
     */
    it(`renders ${format} with a real photograph, which is what an organiser downloads`, async () => {
      const photo = await sharp({
        create: { width: 1600, height: 1067, channels: 3, background: { r: 30, g: 60, b: 120 } },
      })
        .composite([
          {
            input: {
              create: { width: 800, height: 500, channels: 3, background: { r: 220, g: 180, b: 60 } },
            },
            top: 200,
            left: 300,
          },
        ])
        .jpeg()
        .toBuffer()

      const cover = await prepareCardCover(new Uint8Array(photo), format)
      expect(cover, 'prepareCardCover returned nothing for a perfectly ordinary JPEG').toBeTruthy()

      const bytes = await renderSocialCard(format, { ...input(), cover })
      expect(bytes.byteLength).toBeGreaterThan(0)

      const meta = await sharp(Buffer.from(bytes)).metadata()
      expect(meta.format).toBe('jpeg')
      expect(meta.width).toBe(spec.width)
      expect(meta.height).toBe(spec.height)
    }, 60000)
  }
})
