import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { Slide } from '@/lib/social/campaign'
import { APPROVED_FILE_PREFIX } from '@/lib/social/campaign'
import { EARLIER_FAMILIES_ON, law37Refusal, photoDrawnSize } from '@/lib/social/law37'
import { pieceQuality } from '@/lib/social/piece-quality'

/*
 * LAW 37, IMAGE FIRST, ORGANIC, NEVER AN ADVERT (Lawal, 20 November 2026, 11:21, locked 11:24; the PM's 11:28, train AI).
 * The photograph IS the post: whole, at its own shape, nothing printed on it; every earlier family off and refused by the
 * one validation pipeline. The drill is TODAY'S LIVE AMCF CARD, the boxed card that posted at 07:00 and drew nothing.
 */

// The source photograph for the drawing tests: one flat colour, so anything drawn over it shows.
const RED = { r: 200, g: 30, b: 40 }
const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: RED } }).jpeg({ quality: 95 }).toBuffer()
let source: Buffer = Buffer.alloc(0)
vi.mock('@/lib/media/fetch-image', () => ({ fetchImageBytes: async () => ({ bytes: new Uint8Array(source), contentType: 'image/jpeg' }) }))

const amcfLiveCard = { t: 'file', composition: 'close', url: `${APPROVED_FILE_PREFIX}amcf-feed-ig45-clean.jpg`, format: 'feed', eventId: null, startDate: null } as unknown as Slide
const photo = (line: string | null = null): Extract<Slide, { t: 'photo' }> => ({
  t: 'photo',
  composition: 'photo_whole',
  eventId: '5d664060-a175-4b07-9c07-5e3c4a934c69',
  photo: 'https://example.supabase.co/storage/v1/object/public/event-images/amcf.jpg',
  credit: null,
  width: 1100,
  height: 733,
  line,
})

describe('law 37: only a permitted photograph shown whole', () => {
  it('the earlier families are off', () => {
    expect(EARLIER_FAMILIES_ON).toBe(false)
  })

  it("refuses today's live AMCF card, and every earlier slide", () => {
    expect(law37Refusal([amcfLiveCard])).toBe(
      "It is not in law 37's format: slide 1 is an earlier design (file), never posted again; only a permitted photograph shown whole posts.",
    )
    expect(law37Refusal([photo(), { t: 'ask', composition: 'close', count: 3, three: [] } as Slide, amcfLiveCard])).toMatch(/^It is not in law 37's format: slides 2, 3 are an earlier design \(ask, file\)/)
    expect(law37Refusal([])).toMatch(/no slide/)
  })

  it('passes a piece of whole photographs', () => {
    expect(law37Refusal([photo()])).toBeNull()
    expect(law37Refusal([photo(), photo()])).toBeNull()
  })

  it('the one validation pipeline holds the live AMCF card with the [law37] class', () => {
    const issues = pieceQuality({ slides: [amcfLiveCard], caption: 'AMCF is on at Fed Square.', madeAt: '2026-11-20T00:00:00.000Z', nights: new Map(), now: new Date('2026-11-20T03:00:00Z') })
    expect(issues.some((i) => i.startsWith("[law37] It is not in law 37's format"))).toBe(true)
  })
})

describe("each platform's link names its own source (the PM's 14:00 of 20 November 2026)", () => {
  it("refuses a Facebook version whose link names Instagram, and the reverse", async () => {
    const { creativeRefusals } = await import('@/lib/social/campaign')
    const version = (caption: string, cta: string) => ({ caption, cta, hook: 'x', crop: '9:16' })
    const ig = 'https://www.eventlinqs.com.au/events/amcf-2026?utm_source=instagram&utm_medium=story'
    const fb = 'https://www.eventlinqs.com.au/events/amcf-2026?utm_source=facebook&utm_medium=story'
    const good = creativeRefusals({ slides: [], versions: { instagram: version('On now. Link in our bio.', 'Link in our bio.'), facebook: version(`On now. ${fb}`, fb) } as never }, new Map())
    expect(good.filter((i) => i.includes('utm_source'))).toEqual([])
    const crossed = creativeRefusals({ slides: [], versions: { instagram: version('On now.', fb), facebook: version(`On now. ${ig}`, ig) } as never }, new Map())
    expect(crossed).toContain('The Facebook words carry utm_source=instagram; its link names facebook as its source.')
    expect(crossed).toContain('The Instagram words carry utm_source=facebook; its link names instagram as its source.')
  })
})

describe("law 37's drawing sizes", () => {
  it("a feed photograph inside Instagram's bounds is drawn at its own shape and pixels", () => {
    expect(photoDrawnSize('feed', { width: 1100, height: 733 })).toEqual({ width: 1100, height: 733, photo: { x: 0, y: 0, width: 1100, height: 733 } })
  })

  it('a photograph taller than 4:5 takes the 4:5 bound, whole, never cropped', () => {
    const d = photoDrawnSize('feed', { width: 1200, height: 2000 })
    expect(d).toEqual({ width: 1440, height: 1800, photo: { x: 180, y: 0, width: 1080, height: 1800 } })
  })

  it('a photograph wider than 1.91:1 takes the 1.91:1 bound, whole', () => {
    const d = photoDrawnSize('feed', { width: 2500, height: 1000 })
    expect(d.width).toBe(1440)
    expect(d.photo.width).toBe(1440)
    expect(d.photo.height).toBe(576)
    expect(d.width / d.height).toBeCloseTo(1.91, 2)
  })

  it('a story is 1080 by 1920, the photograph whole across it, room beneath', () => {
    const d = photoDrawnSize('story', { width: 1100, height: 733 })
    expect(d).toEqual({ width: 1080, height: 1920, photo: { x: 0, y: 504, width: 1080, height: 720 } })
  })
})

describe('law 37 drawn: the photograph whole, nothing over it', () => {
  const at = async (bytes: Uint8Array, x: number, y: number) => {
    const { data, info } = await sharp(Buffer.from(bytes)).raw().toBuffer({ resolveWithObject: true })
    const i = (y * info.width + x) * info.channels
    return { r: data[i], g: data[i + 1], b: data[i + 2], width: info.width, height: info.height }
  }
  const near = (p: { r: number; g: number; b: number }, c: { r: number; g: number; b: number }) => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) < 30

  it('a feed image is the photograph itself, every corner its own colour', async () => {
    source = await solid(600, 400)
    const { drawLaw37Photo } = await import('@/lib/broadcast/law37-photo')
    const out = await drawLaw37Photo('feed', { ...photo(), width: 600, height: 400 }, { url: photo().photo })
    for (const [x, y] of [[2, 2], [597, 2], [2, 397], [597, 397], [300, 200]] as const) {
      const p = await at(out, x, y)
      expect(p.width).toBe(600)
      expect(p.height).toBe(400)
      expect(near(p, RED), `pixel ${x},${y}`).toBe(true)
    }
  })

  it('a story is the photograph whole on the plain ground, its middle untouched, its line beneath it', async () => {
    source = await solid(1100, 733)
    const { drawLaw37Photo } = await import('@/lib/broadcast/law37-photo')
    const out = await drawLaw37Photo('story', photo('On now at Fed Square, free'), { url: photo().photo })
    const mid = await at(out, 540, 864)
    expect(mid.width).toBe(1080)
    expect(mid.height).toBe(1920)
    expect(near(mid, RED)).toBe(true)
    // The photograph's own top and bottom rows are its own colour: nothing is printed over it.
    for (const [x, y] of [[20, 510], [1060, 510], [20, 1218], [1060, 1218]] as const) expect(near(await at(out, x, y), RED), `pixel ${x},${y}`).toBe(true)
    // Above it, the same photograph blurred to fill the frame (the PM's 14:00 of 20 November 2026), never a navy block.
    expect(near(await at(out, 540, 100), RED)).toBe(true)
    expect(near(await at(out, 540, 1880), RED)).toBe(true)
  })

  it('a photograph whose permission has gone is never drawn', async () => {
    source = await solid(600, 400)
    const { drawLaw37Photo } = await import('@/lib/broadcast/law37-photo')
    await expect(drawLaw37Photo('feed', photo(), null)).rejects.toThrow(/not permitted now/)
    await expect(drawLaw37Photo('feed', photo(), { url: 'https://example.com/other.jpg' })).rejects.toThrow(/not permitted now/)
  })
})
