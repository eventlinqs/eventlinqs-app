/**
 * THE NEW RASTERISER MUST DRAW THE SAME CARD AS THE OLD ONE.
 *
 * Founder condition, 29 August 2026: "The output must be visually identical to
 * what the renderer produces today. Same fonts, same layout, same composition."
 *
 * So this renders EVERY format through BOTH paths and compares them pixel by
 * pixel:
 *
 *   OLD  next/og's ImageResponse, which rasterises satori's SVG with sharp
 *   NEW  satori directly, rasterised with resvg-wasm
 *
 * The old path can only be exercised HERE, not against the server, because that
 * is the whole defect: inside the Next server runtime sharp cannot decode SVG,
 * so ImageResponse fails there. Under vitest it works, which is what makes this
 * comparison possible at all and is why the parity check lives in the test
 * suite rather than in a drive script.
 *
 * WHY IT SHOULD BE IDENTICAL RATHER THAN MERELY SIMILAR. satori produces the
 * SVG in both paths, at the same pinned version (0.25.0, the version
 * @vercel/og 0.11.1 depends on), from the same element and the same fonts. Only
 * the SVG-to-pixels step differs, and @vercel/og's own fallback for that step is
 * resvg at 2.4.0, which is the version installed here. The port reproduces its
 * call including `fitTo: { mode: 'width' }`.
 *
 * A TOLERANCE IS ALLOWED. Two rasterisers rounding subpixel coverage
 * differently disagree by a shade on antialiased edges without anything being
 * visually different, and the exact gate and its measured basis are documented
 * at assertSameRasterisation below, along with what this check deliberately
 * does NOT cover.
 */
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { ImageResponse } from 'next/og'
import { renderCardPng } from '@/lib/broadcast/card-raster'
import { loadCardFonts } from '@/lib/broadcast/card-fonts'
import { renderSocialCard, prepareCardCover } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_FORMATS, type SocialCardFormat } from '@/lib/broadcast/social-card-spec'

const FORMATS: SocialCardFormat[] = ['story', 'square', 'feed']

/** The same shape the route builds, with everything a real card carries. */
function input() {
  return {
    title: 'Kit Inspection Night',
    dateLabel: 'Saturday 11 October 2026',
    timeLabel: '8:00 pm',
    placeLabel: 'The Corner Hotel, Melbourne',
    priceLabel: 'From AUD 45.00',
    shortUrl: 'https://www.eventlinqs.com.au/e/abc123',
    eyebrow: 'Live music - Melbourne',
    organiserName: 'Kit Presents',
    organiserLogo: null,
    cover: null,
    qr: null,
    summary: 'Every artefact in the kit, opened and looked at.',
  }
}

/** A deterministic photograph, so the comparison never depends on a network. */
async function photograph(): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: 1600, height: 1067, channels: 3, background: { r: 30, g: 60, b: 120 } },
  })
    .composite([
      {
        input: { create: { width: 800, height: 500, channels: 3, background: { r: 220, g: 180, b: 60 } } },
        top: 200,
        left: 300,
      },
    ])
    .jpeg()
    .toBuffer()
  return new Uint8Array(buf)
}

/** The OLD path, reproduced exactly as social-cards.tsx used to call it. */
async function oldPathPng(
  element: React.ReactNode,
  spec: { width: number; height: number },
): Promise<Buffer> {
  const fonts = await loadCardFonts()
  const response = new ImageResponse(element as React.ReactElement, {
    width: spec.width,
    height: spec.height,
    fonts: fonts.map(f => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  } as ConstructorParameters<typeof ImageResponse>[1])
  return Buffer.from(await response.arrayBuffer())
}

interface Stats {
  maxDelta: number
  meanDeltaWhereDiffering: number
  /** Fraction of pixels differing by MORE THAN A SHADE. This is the gate. */
  heavyFraction: number
  differingFraction: number
}

async function compare(a: Buffer, b: Buffer): Promise<Stats> {
  const [ra, rb] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ])
  expect(ra.info.width).toBe(rb.info.width)
  expect(ra.info.height).toBe(rb.info.height)

  let maxDelta = 0
  let differing = 0
  let heavy = 0
  let sum = 0
  const total = ra.data.length / 4
  for (let i = 0; i < ra.data.length; i += 4) {
    let worst = 0
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs(ra.data[i + c] - rb.data[i + c])
      if (d > worst) worst = d
    }
    if (worst > maxDelta) maxDelta = worst
    if (worst > 0) {
      differing += 1
      sum += worst
    }
    if (worst > HEAVY) heavy += 1
  }
  return {
    maxDelta,
    meanDeltaWhereDiffering: differing ? sum / differing : 0,
    heavyFraction: heavy / total,
    differingFraction: differing / total,
  }
}

/**
 * A pixel differing by more than this is more than a shade on an edge.
 *
 * Chosen from the measurement, not from taste: across all six comparisons the
 * commonest difference is 1 (405,244 pixels of it on the tall post), the mean
 * where differing is 1.6 to 4.0, and the outliers reach the low fifties on hard
 * gold-on-navy edges. 32 sits well above the antialiasing band and well below a
 * moved glyph, which flips whole letter bodies between white and navy, a
 * difference of well over 200.
 */
const HEAVY = 32

/**
 * THE GATE, and why it is shaped this way rather than "no pixel may differ".
 *
 * Two rasterisers will never agree bit for bit on an antialiased edge: they
 * round subpixel coverage differently, and that is not a visual difference. The
 * first version of this test demanded maxDelta <= 8 and failed all six
 * comparisons at 38 to 54, which said nothing about whether the CARD had
 * changed.
 *
 * What actually distinguishes "same card, different antialiasing" from "the
 * layout moved" is WHERE the difference is and HOW MUCH OF IT there is:
 *
 *   ANTIALIASING  a thin outline around each glyph, almost all of it one shade.
 *                 Confirmed by looking: the difference map is hollow letter
 *                 outlines with black interiors, written to
 *                 docs/verification/card-raster/ by card-raster-diff.test.ts.
 *   MOVED TYPE    filled or doubled glyph bodies, thousands of pixels flipping
 *                 between foreground and background.
 *
 * So the gate is on the HEAVY fraction: pixels differing by more than a shade
 * must stay under half a percent, and the mean difference must stay in the
 * antialiasing band.
 *
 * WHAT THIS CHECK CANNOT DO, established by drilling it rather than assumed.
 *
 * It compares two rasterisers of the SAME element tree, so a change to the
 * COMPOSITION moves both sides in lockstep and parity still holds. Three drills
 * confirmed it: a 4px gap, a 3px title size and a shifted GOLD constant all left
 * the test green. An earlier version of this comment claimed the opposite
 * ("nudge any element by a pixel and the heavy fraction jumps"), and that was
 * simply wrong.
 *
 * That is not a hole in this test, it is its scope. The question it answers is
 * "does resvg draw what ImageResponse drew", which is the only question the
 * rasteriser swap raises. Composition regressions are caught elsewhere:
 * social-card-renders.test.ts pins size and ink, card-raster-diff.test.ts
 * writes the images for a person to look at, and the Launch Kit inspection
 * publishes a contact sheet of every artefact.
 */
function assertSameRasterisation(label: string, s: Stats) {
  expect(
    s.heavyFraction,
    `${label}: fraction of pixels differing by more than ${HEAVY}/255. ` +
      `A layout, font or size change moves whole glyph bodies and pushes this far above the ` +
      `antialiasing floor. maxDelta=${s.maxDelta} mean=${s.meanDeltaWhereDiffering.toFixed(2)} ` +
      `anyDiff=${(s.differingFraction * 100).toFixed(2)}%`,
  ).toBeLessThan(0.005)

  expect(
    s.meanDeltaWhereDiffering,
    `${label}: mean difference across differing pixels. Antialiasing sits near 1 to 4; ` +
      `a composition change does not.`,
  ).toBeLessThan(8)
}

describe('the resvg rasteriser draws the same pixels as ImageResponse', () => {
  for (const format of FORMATS) {
    const spec = SOCIAL_CARD_FORMATS[format]

    it(`${format} (${spec.label}) matches, typographic composition`, async () => {
      const { buildCardElement } = await import('@/lib/broadcast/social-cards')
      const element = await buildCardElement(format, input() as never)

      const [oldPng, newPng] = await Promise.all([
        oldPathPng(element, spec),
        renderCardPng(element, {
          width: spec.width,
          height: spec.height,
          fonts: (await loadCardFonts()).map(f => ({
            name: f.name,
            data: f.data,
            weight: f.weight,
            style: f.style,
          })),
        }).then(u => Buffer.from(u)),
      ])

      const stats = await compare(oldPng, newPng)
      assertSameRasterisation(format, stats)
    }, 120000)

    it(`${format} matches with a photograph, which is what an organiser gets`, async () => {
      const { buildCardElement } = await import('@/lib/broadcast/social-cards')
      const cover = await prepareCardCover(await photograph(), format)
      expect(cover).toBeTruthy()
      const element = await buildCardElement(format, { ...input(), cover } as never)

      const [oldPng, newPng] = await Promise.all([
        oldPathPng(element, spec),
        renderCardPng(element, {
          width: spec.width,
          height: spec.height,
          fonts: (await loadCardFonts()).map(f => ({
            name: f.name,
            data: f.data,
            weight: f.weight,
            style: f.style,
          })),
        }).then(u => Buffer.from(u)),
      ])

      const stats = await compare(oldPng, newPng)
      assertSameRasterisation(`${format} with a cover`, stats)
    }, 120000)
  }

  it('the shipped renderer still produces a decodable JPEG at every size', async () => {
    for (const format of FORMATS) {
      const spec = SOCIAL_CARD_FORMATS[format]
      const bytes = await renderSocialCard(format, input() as never)
      const meta = await sharp(Buffer.from(bytes)).metadata()
      expect(meta.format).toBe('jpeg')
      expect(meta.width).toBe(spec.width)
      expect(meta.height).toBe(spec.height)
    }
  }, 180000)
})
