import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { processEventImage } from '@/lib/media/image-pipeline'
import { IMAGE_DOWNSCALE_LONG_EDGE } from '@/lib/media/limits'

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

  // THE FOUNDER'S REPORTED CASE. A 3625 x 4961 photo is ordinary camera output
  // and used to be refused outright with "The maximum is 4000 x 4000". The
  // market resizes where we refused, so this must now SUCCEED and come back at
  // or under the long edge.
  it('accepts the founder\'s 3625 x 4961 photo and downscales it instead of refusing', async () => {
    const r = await processEventImage(await jpegBuffer(3625, 4961), { role: 'cover' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Math.max(r.image.width, r.image.height)).toBe(IMAGE_DOWNSCALE_LONG_EDGE)
      // The aspect ratio survives the downscale; it is a resize, never a crop.
      expect(r.image.width / r.image.height).toBeCloseTo(3625 / 4961, 2)
    }
  })

  it('downscales an over-size landscape image rather than rejecting it', async () => {
    const r = await processEventImage(await jpegBuffer(4200, 1000), { role: 'gallery' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.image.width).toBe(IMAGE_DOWNSCALE_LONG_EDGE)
      expect(r.image.height).toBe(Math.round((1000 / 4200) * IMAGE_DOWNSCALE_LONG_EDGE))
    }
  })

  it('leaves an image already under the ceiling exactly as it is, never upscaling', async () => {
    const r = await processEventImage(await jpegBuffer(1920, 1080), { role: 'cover' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.image.width).toBe(1920)
      expect(r.image.height).toBe(1080)
    }
  })

  // THE CHILD-SAFETY CLAIM, PROVEN RATHER THAN ASSERTED. The public composer's
  // typical event is a small community one, and a phone photo of a birthday at
  // somebody's house carries the home address as GPS EXIF. The re-encode is
  // what removes it, so it needs a test rather than a comment.
  it('strips EXIF, including GPS, from an uploaded photo', async () => {
    const carryingGps = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 9, g: 20, b: 40 } },
    })
      .jpeg()
      // IFD3 is the GPS directory (libvips exif-ifd3), which is where a phone
      // writes the coordinates of the house the photo was taken at.
      .withExif({
        IFD0: { Copyright: 'A Real Person' },
        IFD3: { GPSLatitudeRef: 'S', GPSLongitudeRef: 'E' },
      })
      .toBuffer()

    // The input genuinely carries it, otherwise the assertion below proves
    // nothing at all.
    expect((await sharp(carryingGps).metadata()).exif).toBeTruthy()

    const r = await processEventImage(carryingGps, { role: 'cover' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const out = await sharp(r.image.buffer).metadata()
      expect(out.exif).toBeFalsy()
    }
  })

  it('still refuses a decompression bomb', async () => {
    // A bomb is tiny on disk and enormous in memory, so it is simulated the way
    // the attack actually works: a real JPEG whose SOF0 header DECLARES huge
    // dimensions. Generating 65535 x 65535 pixels for real would allocate about
    // 12TB, which is the whole point of the guard. sharp reads dimensions from
    // the header, so the guard fires before anything is decoded.
    const bomb = await jpegBuffer(64, 64)
    const sof = bomb.indexOf(Buffer.from([0xff, 0xc0]))
    expect(sof).toBeGreaterThan(-1)
    bomb.writeUInt16BE(65535, sof + 5) // height
    bomb.writeUInt16BE(65535, sof + 7) // width

    const r = await processEventImage(bomb, { role: 'gallery' })
    expect(r.ok).toBe(false)
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
