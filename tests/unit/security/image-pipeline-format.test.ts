/**
 * The upload pipeline keeps the format it should, on the sharp version installed.
 *
 * WHY THIS EXISTS. `sharp` was bumped 0.34.5 -> 0.35.3 to clear libvips CVEs
 * (GHSA-f88m-g3jw-g9cj) that are genuinely reachable: src/lib/upload.ts takes a
 * user-supplied File, calls arrayBuffer(), and hands the bytes straight to
 * processEventImage. Attacker-controlled bytes reaching a native decoder is the
 * one dependency finding in this pass that was not merely theoretical.
 *
 * The bump carried a behavioural change that a lockfile diff cannot show and a
 * type check only half-revealed. sharp 0.34 reported an AVIF upload as
 * `format: 'avif'`. sharp 0.35 removed 'avif' from FormatEnum and reports AVIF as
 * `format: 'heif'`, because AVIF is a HEIF-family container decoded through the
 * heif loader. The pipeline branched on `format === 'avif'`, so after the bump
 * that branch was dead, `toJpeg` was true for AVIF, and every AVIF cover an
 * organiser uploaded would have been silently transcoded to JPEG. On a platform
 * that deliberately serves AVIF for LCP, that is a real regression that would
 * have shipped quietly.
 *
 * These tests run the REAL pipeline against REAL encoded images produced by the
 * REAL installed sharp. No mock could have caught the defect they pin, because
 * the defect lived in what sharp actually reports.
 */
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { processEventImage } from '@/lib/media/image-pipeline'

/** A plain coloured raster, encoded to the requested format. */
async function makeImage(
  encode: 'avif' | 'webp' | 'png' | 'jpeg',
  width = 1400,
  height = 900,
): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 40, b: 90 } },
  })
  if (encode === 'avif') return base.avif({ quality: 50 }).toBuffer()
  if (encode === 'webp') return base.webp({ quality: 80 }).toBuffer()
  if (encode === 'png') return base.png().toBuffer()
  return base.jpeg({ quality: 85 }).toBuffer()
}

describe('sharp reports what this pipeline now assumes', () => {
  it('reports a real AVIF as heif + av1, not as avif', async () => {
    // The premise of the fix, asserted rather than trusted. If a future sharp
    // reverts to format 'avif', this fails and points at the branch to revisit.
    const meta = await sharp(await makeImage('avif')).metadata()
    expect(meta.format).toBe('heif')
    expect(meta.compression).toBe('av1')
  })
})

describe('formats survive the pipeline', () => {
  it('keeps a real AVIF as AVIF', async () => {
    // THE REGRESSION TEST. Before the fix this returned image/jpeg.
    const res = await processEventImage(await makeImage('avif'), { role: 'gallery' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.image.contentType, 'an AVIF upload must not be transcoded to JPEG').toBe('image/avif')
    expect(res.image.ext).toBe('avif')
  })

  it('keeps a real WebP as WebP', async () => {
    const res = await processEventImage(await makeImage('webp'), { role: 'gallery' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.image.contentType).toBe('image/webp')
    expect(res.image.ext).toBe('webp')
  })

  it('normalises PNG to JPEG, as designed', async () => {
    const res = await processEventImage(await makeImage('png'), { role: 'gallery' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.image.contentType).toBe('image/jpeg')
    expect(res.image.ext).toBe('jpg')
  })

  it('keeps JPEG as JPEG', async () => {
    const res = await processEventImage(await makeImage('jpeg'), { role: 'gallery' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.image.contentType).toBe('image/jpeg')
    expect(res.image.ext).toBe('jpg')
  })

  it('the AVIF output is really AVIF bytes, not a mislabelled JPEG', async () => {
    // contentType is our own string; this checks the actual encoded output, so a
    // future edit cannot satisfy the test by relabelling.
    const res = await processEventImage(await makeImage('avif'), { role: 'gallery' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const out = await sharp(res.image.buffer).metadata()
    expect(out.format).toBe('heif')
    expect(out.compression).toBe('av1')
  })
})

describe('the hardening the pipeline already had still holds', () => {
  it('refuses something that is not a raster image at all', async () => {
    const res = await processEventImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
      role: 'gallery',
    })
    expect(res.ok).toBe(false)
  })

  it('strips EXIF, so GPS from a phone photo never reaches storage', async () => {
    // The pipeline relies on sharp dropping metadata by default. That is a
    // privacy control, so it is asserted rather than assumed.
    const withExif = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'test' } } })
      .jpeg()
      .toBuffer()

    expect((await sharp(withExif).metadata()).exif, 'fixture should carry EXIF').toBeDefined()

    const res = await processEventImage(withExif, { role: 'gallery' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((await sharp(res.image.buffer).metadata()).exif).toBeUndefined()
  })
})
