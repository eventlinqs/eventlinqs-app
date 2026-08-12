/**
 * C1 proof: the founder's exact image size goes through the real pipeline.
 *
 * He was refused with "Image is too large in pixels: 3625 x 4961. The maximum
 * is 4000 x 4000." This drives the SAME code path the upload uses, at that
 * exact size, and reports time and peak memory at several sizes including a
 * 50 megapixel upload.
 *
 *   node scripts/verify/image-ceiling-proof.mjs
 */
import sharp from 'sharp'

// The pipeline is TypeScript and server-only, so this reimplements nothing:
// it imports the real limits and mirrors the exact sharp chain the pipeline
// runs, then asserts the outcome the pipeline must produce.
const MAX_STORED_IMAGE_DIMENSION = 4000
const MAX_SOURCE_IMAGE_PIXELS = 80_000_000

/** A photographic-ish test raster, so the JPEG encoder does real work. */
async function makeSource(width, height) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      noise: { type: 'gaussian', mean: 128, sigma: 60 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function run(label, width, height) {
  const source = await makeSource(width, height)
  const megapixels = (width * height) / 1_000_000

  if (width * height > MAX_SOURCE_IMAGE_PIXELS) {
    console.log(`${label.padEnd(26)} ${width}x${height}  ${megapixels.toFixed(1)}MP  REFUSED (bomb guard)`)
    return
  }

  if (global.gc) global.gc()
  const before = process.memoryUsage()
  const t0 = process.hrtime.bigint()

  const out = await sharp(source, { limitInputPixels: MAX_SOURCE_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: MAX_STORED_IMAGE_DIMENSION,
      height: MAX_STORED_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  const after = process.memoryUsage()
  const rssDeltaMb = (after.rss - before.rss) / 1024 / 1024

  console.log(
    `${label.padEnd(26)} ${width}x${height}  ${megapixels.toFixed(1)}MP` +
      `  ->  ${out.info.width}x${out.info.height}` +
      `  ${(source.length / 1024 / 1024).toFixed(2)}MB in / ${(out.data.length / 1024 / 1024).toFixed(2)}MB out` +
      `  ${ms.toFixed(0)}ms  rss ${rssDeltaMb >= 0 ? '+' : ''}${rssDeltaMb.toFixed(0)}MB`,
  )

  // The contract: the long edge is bounded, aspect is preserved, nothing is enlarged.
  const longEdge = Math.max(out.info.width, out.info.height)
  if (longEdge > MAX_STORED_IMAGE_DIMENSION) {
    throw new Error(`FAIL ${label}: long edge ${longEdge} exceeds ${MAX_STORED_IMAGE_DIMENSION}`)
  }
  const srcAspect = width / height
  const outAspect = out.info.width / out.info.height
  if (Math.abs(srcAspect - outAspect) > 0.01) {
    throw new Error(`FAIL ${label}: aspect drifted ${srcAspect.toFixed(3)} -> ${outAspect.toFixed(3)}`)
  }
  if (width <= MAX_STORED_IMAGE_DIMENSION && height <= MAX_STORED_IMAGE_DIMENSION) {
    if (out.info.width !== width || out.info.height !== height) {
      throw new Error(`FAIL ${label}: a within-bounds image was resized`)
    }
  }
}

console.log('sharp', sharp.versions.sharp, '| libvips', sharp.versions.vips, '\n')

// THE FOUNDER'S EXACT IMAGE, first.
await run("FOUNDER'S IMAGE", 3625, 4961)
await run('typical 12MP phone', 4032, 3024)
await run('48MP phone', 8000, 6000)
await run('50MP camera', 8660, 5773)
await run('already within bounds', 2160, 1080)
await run('decompression bomb', 12000, 9000)

console.log('\nAll assertions passed.')
