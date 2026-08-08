import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_MAX_BYTES,
  SOCIAL_CARD_ORDER,
  isSocialCardFormat,
} from '@/lib/broadcast/social-card-spec'
import {
  STORY_PANEL_MAX_HEIGHT,
  STORY_PANEL_MIN_HEIGHT,
  STORY_PANEL_RATIO_THRESHOLD,
  cardFilename,
  clampWords,
  fitTitle,
  photoBox,
  fitTicketBar,
  storySafeBand,
  storyStrapline,
  ticketBarText,
} from '@/lib/broadcast/social-card-layout'
import { prepareCardCover } from '@/lib/broadcast/social-cards'

/**
 * The card geometry is a set of claims about what each platform publishes.
 * These assert the claims, so a future edit that quietly changes a dimension
 * fails here rather than in an organiser's feed.
 */

describe('social card specifications', () => {
  it('renders each shape at the size the platform publishes for it', () => {
    // Meta: 9:16 recommended for stories; 1080 x 1080 the recommended minimum.
    expect(SOCIAL_CARD_FORMATS.story.width).toBe(1080)
    expect(SOCIAL_CARD_FORMATS.story.height).toBe(1920)
    expect(SOCIAL_CARD_FORMATS.story.height / SOCIAL_CARD_FORMATS.story.width).toBeCloseTo(16 / 9, 5)

    // Meta: 1:1 recommended for the Instagram feed, 1080 x 1080 minimum.
    expect(SOCIAL_CARD_FORMATS.square.width).toBe(1080)
    expect(SOCIAL_CARD_FORMATS.square.height).toBe(1080)

    // Meta: 4:5 recommended for the Facebook feed, published minimum for that
    // exact ratio is 1440 x 1800, which is what this renders.
    expect(SOCIAL_CARD_FORMATS.feed.width).toBe(1440)
    expect(SOCIAL_CARD_FORMATS.feed.height).toBe(1800)
    expect(SOCIAL_CARD_FORMATS.feed.width / SOCIAL_CARD_FORMATS.feed.height).toBeCloseTo(4 / 5, 5)
  })

  it('keeps every shape inside the aspect band Instagram supports', () => {
    // Instagram keeps an upload untouched between 1.91:1 and 3:4 and crops
    // anything outside. 3:4 is 0.75 as width over height.
    for (const format of SOCIAL_CARD_ORDER) {
      const spec = SOCIAL_CARD_FORMATS[format]
      const ratio = spec.width / spec.height
      if (format === 'story') continue // stories are a different placement
      expect(ratio).toBeGreaterThanOrEqual(0.75)
      expect(ratio).toBeLessThanOrEqual(1.91)
    }
  })

  it('leaves the published 250 pixel story safe area clear', () => {
    expect(SOCIAL_CARD_FORMATS.story.safeTop).toBe(250)
    expect(SOCIAL_CARD_FORMATS.story.safeBottom).toBe(250)
    // Meta describes the safe area as roughly 14 per cent of the frame.
    expect(250 / SOCIAL_CARD_FORMATS.story.height).toBeCloseTo(0.13, 2)
    const band = storySafeBand()
    expect(band).toEqual({ top: 250, bottom: 1670, height: 1420 })
  })

  it('leaves room for the type under a whole photograph', () => {
    // The panel may take at most this much, so the composition below it always
    // has the balance of the safe band plus the bottom safe strip.
    expect(STORY_PANEL_MAX_HEIGHT).toBeLessThan(storySafeBand().height)
    expect(SOCIAL_CARD_FORMATS.story.height - STORY_PANEL_MAX_HEIGHT).toBeGreaterThan(1000)
  })

  it('accepts only the three known formats', () => {
    expect(isSocialCardFormat('story')).toBe(true)
    expect(isSocialCardFormat('square')).toBe(true)
    expect(isSocialCardFormat('feed')).toBe(true)
    expect(isSocialCardFormat('reel')).toBe(false)
    expect(isSocialCardFormat('')).toBe(false)
  })

  it('crops the banded formats to their photo region and the story to the frame', () => {
    expect(photoBox('square')).toEqual({ width: 1080, height: 600 })
    expect(photoBox('feed')).toEqual({ width: 1440, height: 1150 })
    expect(photoBox('story')).toEqual({ width: 1080, height: 1920 })
  })

  it('caps a card under the 5 MB both LinkedIn and X publish', () => {
    expect(SOCIAL_CARD_MAX_BYTES).toBe(5 * 1024 * 1024)
  })
})

describe('title fitting', () => {
  it('never breaks a word in half', () => {
    const out = clampWords('Basement 45 Warehouse Session with a very long support lineup', 30)
    expect(out.endsWith('...')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(33)
    const stem = out.slice(0, -3)
    expect('Basement 45 Warehouse Session with a very long support lineup').toContain(stem)
  })

  it('leaves a short title alone', () => {
    expect(clampWords('  Sharp   Tongue ', 60)).toBe('Sharp Tongue')
  })

  it('steps the display scale down as the title grows', () => {
    const short = fitTitle('Sharp Tongue', 'story')
    const medium = fitTitle('Sharp Tongue: Geelong Comedy Showcase', 'story')
    const long = fitTitle(
      'Sharp Tongue: The Geelong Comedy Showcase and Late Night Variety Hour',
      'story',
    )
    expect(short.fontSize).toBeGreaterThan(medium.fontSize)
    expect(medium.fontSize).toBeGreaterThan(long.fontSize)
  })

  it('scales the type with the card width', () => {
    const square = fitTitle('Pakington Street Makers Market', 'square')
    const feed = fitTitle('Pakington Street Makers Market', 'feed')
    expect(feed.fontSize).toBeGreaterThan(square.fontSize)
    expect(feed.fontSize / square.fontSize).toBeCloseTo(1440 / 1080, 1)
  })

  it('caps a runaway title rather than letting it fill the card', () => {
    const fit = fitTitle('word '.repeat(80), 'square')
    expect(fit.text.length).toBeLessThanOrEqual(119)
  })
})

describe('the ticket bar', () => {
  it('carries the price and the link with the protocol stripped', () => {
    expect(ticketBarText('From AUD $28', 'https://eventlinqs.com/s/abc123')).toBe(
      'From AUD $28 · eventlinqs.com/s/abc123',
    )
  })

  it('still carries the link when an event is free', () => {
    expect(ticketBarText('Free entry', 'https://eventlinqs.com/s/abc123')).toContain(
      'eventlinqs.com/s/abc123',
    )
  })
})

describe('download filenames', () => {
  it('are readable and never carry a path', () => {
    expect(cardFilename('sharp-tongue-geelong', 'story', 'jpg')).toBe(
      'sharp-tongue-geelong-story.jpg',
    )
    expect(cardFilename('../../etc/passwd', 'square', 'jpg')).toBe('etc-passwd-square.jpg')
    expect(cardFilename('', 'feed', 'jpg')).toBe('event-feed.jpg')
  })
})

describe('the panel rule', () => {
  async function solid(width: number, height: number): Promise<Uint8Array> {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 40, g: 80, b: 160 } },
    })
      .jpeg()
      .toBuffer()
    return new Uint8Array(buffer)
  }

  it('shows a landscape photograph as a panel rather than cropping it to a story', async () => {
    const cover = await prepareCardCover(await solid(1920, 1080), 'story')
    expect(cover?.kind).toBe('panel')
    if (cover?.kind === 'panel') {
      // 1080 wide at 16:9 is 608 tall. That left a third of the story frame
      // visibly empty, so the panel is grown to the floor by trimming width,
      // which keeps 87 per cent of a 16:9 frame rather than the 33 per cent a
      // full 9:16 crop would keep.
      expect(cover.panelHeight).toBe(STORY_PANEL_MIN_HEIGHT)
      expect(cover.backdrop.startsWith('data:image/jpeg;base64,')).toBe(true)
    }
  })

  it('keeps most of a landscape frame even at the panel floor', () => {
    // A 16:9 source scaled to 760 tall is 1351 wide; the panel keeps 1080 of it.
    const widthAtFloor = Math.round((16 / 9) * STORY_PANEL_MIN_HEIGHT)
    expect(1080 / widthAtFloor).toBeGreaterThan(0.79)
  })

  it('bleeds a photograph that is already close to the story shape', async () => {
    const cover = await prepareCardCover(await solid(1080, 1920), 'story')
    expect(cover?.kind).toBe('bleed')
    expect(1080 / 1920).toBeLessThanOrEqual(STORY_PANEL_RATIO_THRESHOLD)
  })

  it('treats a square photograph as one to show whole, within the cap', async () => {
    const cover = await prepareCardCover(await solid(1200, 1200), 'story')
    expect(cover?.kind).toBe('panel')
    if (cover?.kind === 'panel') expect(cover.panelHeight).toBe(STORY_PANEL_MAX_HEIGHT)
  })

  it('crops the banded formats to their shallow region', async () => {
    const cover = await prepareCardCover(await solid(1920, 1080), 'square')
    expect(cover?.kind).toBe('bleed')
  })

  it('returns nothing for an unreadable upload so the card falls back to type', async () => {
    const cover = await prepareCardCover(new Uint8Array([1, 2, 3, 4]), 'story')
    expect(cover).toBeNull()
  })
})

describe('the story strapline', () => {
  it('carries the organiser words through unchanged', () => {
    // This exists because a mangled regex once replaced every lowercase s with
    // a space, and shipped "Four hour of hou e and break acro two room" onto a
    // rendered card. No test caught it; looking at the render did.
    const summary =
      'Four hours of house and breaks across two rooms, with a local B2B opening and a Naarm headliner from midnight.'
    const line = storyStrapline(summary)
    expect(line).toBe(
      'Four hours of house and breaks across two rooms, with a local B2B opening and a Naarm...',
    )
    expect(line).toContain('hours')
    expect(line).toContain('house')
    expect(line).toContain('across')
    expect(line).toContain('rooms')
    // Every word it does keep is the organiser's, letter for letter.
    expect(summary.startsWith(line!.replace(/\.\.\.$/, ''))).toBe(true)
  })

  it('stops at the first full stop rather than running on', () => {
    expect(storyStrapline('Doors at seven. Support from eight. Headline at nine.')).toBe(
      'Doors at seven',
    )
  })

  it('says nothing when there is nothing to say', () => {
    expect(storyStrapline(null)).toBeNull()
    expect(storyStrapline('   ')).toBeNull()
    expect(storyStrapline('Short')).toBeNull()
  })
})

describe('the ticket bar never wraps and never leaves its bar', () => {
  // Measured with the SAME font file the cards and the poster draw with. The
  // previous version of these tests asserted "never returns a size below the
  // floor", which is exactly the behaviour that let a long line be drawn
  // straight out of the bar, across the QR and off the edge of the card. A
  // test that asserts the bug cannot catch the bug.
  const font = fontkit.create(
    readFileSync(join(process.cwd(), 'src/assets/fonts/HankenGrotesk-SemiBold.ttf')),
  ) as unknown as { unitsPerEm: number; layout: (t: string) => { advanceWidth: number } }
  const measure = (text: string, size: number) =>
    (font.layout(text).advanceWidth / font.unitsPerEm) * size

  // The real geometry of each bar, derived the way social-cards.tsx derives it.
  const STORY_BAR = 1080 - 76 * 2 - (140 + 20 + 30) - 42 * 2
  const SQUARE_BAR = 1080 - 60 * 2 - (126 + 20 + 30) - 32 * 2

  const hosts = [
    'www.eventlinqs.com.au',
    'eventlinqs.com.au',
    // A Vercel preview host. Every artefact minted from a preview carries one,
    // and it is three times the length of the production host.
    'eventlinqs-app-git-feat-launch-ef8ee0-lawals-projects-c20c0be8.vercel.app',
  ]
  const prices = ['', 'Free entry', 'From $35', 'From $189.50']
  const codes = [
    'abc',
    'marketplace-gate-ig',
    'twilight-sessions-fest-ig',
    'basement-45-26sep-ig',
    'a'.repeat(48), // the longest code isValidReadableCode permits
  ]

  it('fits inside the bar for every host, price and code the platform can mint', () => {
    const bars: [string, number, number, number][] = [
      ['story', STORY_BAR, 38, 24],
      ['square', SQUARE_BAR, 30, 20],
    ]
    const failures: string[] = []
    for (const [name, available, max, min] of bars) {
      for (const host of hosts) {
        for (const price of prices) {
          for (const code of codes) {
            const line = ticketBarText(price, `https://${host}/e/${code}`)
            const fit = fitTicketBar(line, available, max, min, measure)
            const drawn = measure(fit.text, fit.fontSize)
            if (drawn > available) {
              failures.push(
                `${name}: "${fit.text}" at ${fit.fontSize}px is ${Math.round(drawn)}px in a ${available}px bar`,
              )
            }
            expect(fit.fontSize).toBeLessThanOrEqual(max)
            expect(fit.fontSize).toBeGreaterThanOrEqual(min)
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('steps the type down before it shortens the line', () => {
    const short = fitTicketBar(
      ticketBarText('From $28', 'https://www.eventlinqs.com.au/e/abc'),
      STORY_BAR,
      38,
      24,
      measure,
    )
    const long = fitTicketBar(
      ticketBarText('From $28', 'https://www.eventlinqs.com.au/e/twilight-sessions-fest-ig'),
      STORY_BAR,
      38,
      24,
      measure,
    )
    expect(short.fontSize).toBeGreaterThan(long.fontSize)
    // Neither of these needs shortening: the type had somewhere to go.
    expect(short.text).not.toContain('...')
    expect(long.text).not.toContain('...')
  })

  it('shortens visibly, rather than drawing past the bar, when no size fits', () => {
    const line = ticketBarText('From $189.50', `https://${hosts[2]}/e/${'a'.repeat(48)}`)
    const fit = fitTicketBar(line, STORY_BAR, 38, 24, measure)
    expect(fit.text).toContain('...')
    expect(fit.text.length).toBeLessThan(line.length)
    expect(measure(fit.text, fit.fontSize)).toBeLessThanOrEqual(STORY_BAR)
  })

  it('drops the www, because those four characters are the whole margin', () => {
    expect(ticketBarText('Free entry', 'https://www.eventlinqs.com.au/e/abc')).toBe(
      'Free entry · eventlinqs.com.au/e/abc',
    )
  })
})
