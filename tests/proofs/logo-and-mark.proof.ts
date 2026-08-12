import { describe, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { prepareCardCover, prepareLogo, renderSocialCard } from '@/lib/broadcast/social-cards'
import { buildEventPosterPdf } from '@/lib/broadcast/poster'
import { resolveLogoPlacement } from '@/lib/media/logo-pipeline'

/**
 * B1's two questions, rendered rather than described.
 *
 * ONE: does the organiser's mark actually land on the artefacts, at its own
 * shape, with a light tile when it needs one and none when it does not?
 *
 * TWO: should the EventLinqs mark stay? Both versions render, subordinate and
 * absent, so the founder rules from renders.
 *
 *   npx vitest run --config vitest.proof.config.ts tests/proofs/logo-and-mark.proof.ts
 */

const OUT = join(process.cwd(), 'docs', 'design', 'launch-kit-artefacts', 'logo')
const HERO = join(process.cwd(), 'public', 'images', 'hero')
const FIXTURES = join(process.cwd(), 'docs', 'design', 'launch-kit-artefacts', 'logo-fixtures')

const SHORT = 'https://www.eventlinqs.com.au/e/basement-45-ig'

describe('the organiser mark on the artefacts', () => {
  it('renders both mark treatments across a card and a poster', async () => {
    await mkdir(OUT, { recursive: true })

    const cover = new Uint8Array(await readFile(join(HERO, 'homepage-festival-night.jpg')))
    const qr = await QRCode.toDataURL(SHORT, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 480,
      color: { dark: '#0A1628', light: '#FFFFFF' },
    })

    const marks = [
      { key: 'light-on-navy', file: 'light-wordmark.png' },
      { key: 'dark-on-tile', file: 'dark-wordmark.png' },
    ]

    const notes: string[] = []

    for (const mark of marks) {
      const raw = new Uint8Array(await readFile(join(FIXTURES, mark.file)))
      const measured = await resolveLogoPlacement(Buffer.from(raw))
      const logo = await prepareLogo(raw)
      notes.push(
        `${mark.key}: measured placement ${measured.placement}, ` +
          `luminance over navy ${measured.luminanceOverNavy}, alpha ${measured.hasAlpha}`,
      )

      for (const format of ['story', 'square'] as const) {
        const prepared = await prepareCardCover(cover, format)
        const bytes = await renderSocialCard(format, {
          title: 'Basement 45: Warehouse Session',
          dateLabel: 'Saturday 26 September',
          timeLabel: '10:00 pm',
          placeLabel: 'Sub Rosa, Melbourne',
          priceLabel: 'From $35',
          shortUrl: SHORT,
          eyebrow: 'Nightlife · Melbourne',
          organiserName: 'Basement 45',
          summary: 'Four hours of house and breaks across two rooms.',
          organiserLogo: logo,
          cover: prepared,
          qr,
        })
        await writeFile(join(OUT, `card-${format}-${mark.key}.jpg`), bytes)
      }

      // The poster, with our mark subordinate and then absent.
      const qrPng = await QRCode.toBuffer(SHORT, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 600,
      })
      const coverJpeg = { bytes: cover, format: 'jpg' as const }
      for (const showPlatformMark of [true, false]) {
        const pdf = await buildEventPosterPdf({
          title: 'Basement 45: Warehouse Session',
          dateLabel: 'Saturday 26 September 2026',
          locality: 'Sub Rosa, Melbourne',
          priceLabel: 'From AUD $35',
          shortUrl: SHORT,
          qrPng: new Uint8Array(qrPng),
          coverImage: coverJpeg,
          organiserName: 'Basement 45',
          organiserLogo: { bytes: raw, format: 'png' },
          logoPlacement: measured.placement,
          showPlatformMark,
        })
        const suffix = showPlatformMark ? 'ours-subordinate' : 'ours-absent'
        await writeFile(join(OUT, `poster-${mark.key}-${suffix}.pdf`), pdf)
      }
    }

    await writeFile(join(OUT, 'measurements.txt'), notes.join('\n'), 'utf8')
  })
})
