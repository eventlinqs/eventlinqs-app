import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { pngToJpeg } from '@/lib/social/studio-jpeg'

/*
 * CAR R1 (the PM's 19:15 of 27 November 2026). Red on main, where the bridge stored the studio's PNGs as they came and the
 * creative intake held both pieces at 19:30 ('a PNG file, which instagram feed does not take (jpeg)'): each slide is now
 * re-encoded as a real JPEG at its own size, through the installed sharp, on a real image (the dependency law: the output
 * is read back, never the call).
 */
describe('a studio slide as JPEG', () => {
  it('keeps its size and becomes a JPEG the publisher takes', async () => {
    const png = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#0b0f1a' } }).png().toBuffer()
    const jpg = await pngToJpeg(new Uint8Array(png))
    expect([...jpg.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    const meta = await sharp(Buffer.from(jpg)).metadata()
    expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({ format: 'jpeg', width: 1080, height: 1350 })
  })
  it('flattens a transparent pixel on white, never black', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const raw = await sharp(Buffer.from(await pngToJpeg(new Uint8Array(png)))).raw().toBuffer()
    expect(raw[0]).toBeGreaterThan(240)
  })
})
