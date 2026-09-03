/**
 * DIAGNOSTIC: write both rasterisations and a difference map, so a person can
 * LOOK at what differs rather than argue about a number.
 *
 * Not a gate. It asserts nothing about the difference; it measures it and writes
 * the images to docs/verification/card-raster/. The gate is
 * card-raster-parity.test.ts.
 *
 * Founder condition, 29 August 2026: "If resvg renders anything differently,
 * screenshot both and show me before shipping it."
 */
import { describe, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { writeProofArtefact, WRITE_ARTEFACTS } from '../../helpers/proof-artefact'
import { join } from 'node:path'
import sharp from 'sharp'
import { ImageResponse } from 'next/og'
import { renderCardPng } from '@/lib/broadcast/card-raster'
import { loadCardFonts } from '@/lib/broadcast/card-fonts'
import { buildCardElement, prepareCardCover } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_FORMATS, type SocialCardFormat } from '@/lib/broadcast/social-card-spec'

const OUT = join(process.cwd(), 'docs', 'verification', 'card-raster')

const FORMATS: SocialCardFormat[] = ['story', 'square', 'feed']

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

describe('what the two rasterisers actually differ on', () => {
  it('writes old, new and a difference map for every format', async () => {
    const fonts = (await loadCardFonts()).map(f => ({
      name: f.name,
      data: f.data,
      weight: f.weight,
      style: f.style,
    }))
    const lines: string[] = []

    for (const format of FORMATS) {
      const spec = SOCIAL_CARD_FORMATS[format]
      for (const withCover of [false, true]) {
        const cover = withCover ? await prepareCardCover(await photograph(), format) : null
        const element = await buildCardElement(format, { ...input(), cover } as never)
        const tag = `${format}${withCover ? '-cover' : '-typographic'}`

        const response = new ImageResponse(element as React.ReactElement, {
          width: spec.width,
          height: spec.height,
          fonts,
        } as ConstructorParameters<typeof ImageResponse>[1])
        const oldPng = Buffer.from(await response.arrayBuffer())
        const newPng = Buffer.from(
          await renderCardPng(element, { width: spec.width, height: spec.height, fonts }),
        )

        writeProofArtefact(join(OUT, `${tag}-A-imageresponse.png`), oldPng)
        writeProofArtefact(join(OUT, `${tag}-B-resvg.png`), newPng)

        const [a, b] = await Promise.all([
          sharp(oldPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
          sharp(newPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
        ])

        const diff = Buffer.alloc(a.data.length)
        let maxDelta = 0
        let differing = 0
        let sumDelta = 0
        const hist = new Map<number, number>()
        for (let i = 0; i < a.data.length; i += 4) {
          let worst = 0
          for (let c = 0; c < 3; c += 1) {
            const d = Math.abs(a.data[i + c] - b.data[i + c])
            if (d > worst) worst = d
          }
          if (worst > maxDelta) maxDelta = worst
          if (worst > 0) {
            differing += 1
            sumDelta += worst
            hist.set(worst, (hist.get(worst) ?? 0) + 1)
          }
          // Amplified so a one-shade difference is visible to a human eye.
          const shown = Math.min(255, worst * 8)
          diff[i] = shown
          diff[i + 1] = shown
          diff[i + 2] = shown
          diff[i + 3] = 255
        }

        /* The amplified difference map is for a human to LOOK at, so it is
         * written only when artefacts are explicitly requested. sharp writes
         * straight to disk and cannot go through writeProofArtefact, so the
         * directory is created here rather than on import. */
        if (WRITE_ARTEFACTS) {
          mkdirSync(OUT, { recursive: true })
          await sharp(diff, { raw: { width: a.info.width, height: a.info.height, channels: 4 } })
            .png()
            .toFile(join(OUT, `${tag}-C-difference.png`))
        }

        const total = a.data.length / 4
        const top = [...hist.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5)
        lines.push(
          `${tag.padEnd(22)} maxDelta=${String(maxDelta).padStart(3)}  ` +
            `differing=${((differing / total) * 100).toFixed(3)}%  ` +
            `meanDeltaWhereDiffering=${differing ? (sumDelta / differing).toFixed(1) : '0'}  ` +
            `commonest=[${top.map(([d, n]) => `${d}x${n}`).join(' ')}]`,
        )
      }
    }

    console.log('\n=== RASTERISER DIFFERENCE ===')
    for (const l of lines) console.log('  ' + l)
    console.log(`\n  images: docs/verification/card-raster/`)
  }, 300000)
})
