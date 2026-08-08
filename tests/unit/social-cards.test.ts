import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  SOCIAL_CARD_FORMATS,
  SOCIAL_CARD_MAX_BYTES,
  SOCIAL_CARD_ORDER,
  isSocialCardFormat,
} from '@/lib/broadcast/social-card-spec'
import {
  STORY_PANEL_MAX_HEIGHT,
  STORY_PANEL_RATIO_THRESHOLD,
  cardFilename,
  clampWords,
  fitTitle,
  photoBox,
  storySafeBand,
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

  it('shows a landscape photograph whole rather than cropping it to a story', async () => {
    const cover = await prepareCardCover(await solid(1920, 1080), 'story')
    expect(cover?.kind).toBe('panel')
    if (cover?.kind === 'panel') {
      // 1080 wide at 16:9 is 608 tall, which is under the cap, so it is
      // reproduced at its own shape and nothing is thrown away.
      expect(cover.panelHeight).toBe(608)
    }
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
