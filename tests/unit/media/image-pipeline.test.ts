import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { processEventImage } from '@/lib/media/image-pipeline'

// Helpers build REAL encoded buffers so the magic-byte path is exercised, not a
// mock. sharp generates and re-reads the bytes exactly as the server does.
async function jpegBuffer(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 80, b: 40 } } })
    .jpeg()
    .toBuffer()
}
async function pngBuffer(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
    .png()
    .toBuffer()
}

describe('processEventImage - acceptance', () => {
  it('accepts a valid landscape JPEG cover and returns dims + blur', async () => {
    const r = await processEventImage(await jpegBuffer(1920, 1080), { role: 'cover' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.image.width).toBe(1920)
      expect(r.image.height).toBe(1080)
      expect(r.image.contentType).toBe('image/jpeg')
      expect(r.image.blurDataURL.startsWith('data:image/webp;base64,')).toBe(true)
    }
  })

  it('accepts a 1000px-wide image as a cover (the market minimum, exactly)', async () => {
    const r = await processEventImage(await jpegBuffer(1000, 500), { role: 'cover' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.image.width).toBe(1000)
      expect(r.image.height).toBe(500)
    }
  })

  it('rejects 999px as a cover (the floor is 1000, not lower)', async () => {
    const r = await processEventImage(await jpegBuffer(999, 500), { role: 'cover' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/1000/)
  })

  it('normalises PNG to JPEG on ingest', async () => {
    const r = await processEventImage(await pngBuffer(1600, 900), { role: 'gallery' })
    expect(r.ok && r.image.contentType).toBe('image/jpeg')
    expect(r.ok && r.image.ext).toBe('jpg')
  })
})

describe('processEventImage - rejections', () => {
  it('rejects SVG / active content (magic-byte, not extension)', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const r = await processEventImage(svg, { role: 'cover' })
    expect(r.ok).toBe(false)
  })

  it('rejects a non-image file', async () => {
    const r = await processEventImage(Buffer.from('this is plain text, not an image'), { role: 'gallery' })
    expect(r.ok).toBe(false)
  })

  it('rejects an over-size image (> 4000px)', async () => {
    const r = await processEventImage(await jpegBuffer(4200, 1000), { role: 'gallery' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/4000/)
  })

  it('rejects an under-size cover but accepts the same image as gallery', async () => {
    const small = await jpegBuffer(800, 450)
    const asCover = await processEventImage(small, { role: 'cover' })
    expect(asCover.ok).toBe(false)
    const asGallery = await processEventImage(small, { role: 'gallery' })
    expect(asGallery.ok).toBe(true)
  })
})

describe('processEventImage - EXIF strip', () => {
  it('strips all metadata from the output buffer', async () => {
    const withMeta = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .withMetadata({ exif: { IFD0: { Copyright: 'EventLinqs Test', Software: 'vitest' } } })
      .jpeg()
      .toBuffer()
    const before = await sharp(withMeta).metadata()
    expect(before.exif).toBeTruthy()

    const r = await processEventImage(withMeta, { role: 'gallery' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const after = await sharp(r.image.buffer).metadata()
      expect(after.exif).toBeFalsy()
    }
  })
})
