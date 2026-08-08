import 'server-only'
import sharp from 'sharp'
import {
  ACCEPTED_IMAGE_FORMATS,
  MAX_SOURCE_IMAGE_PIXELS,
  MAX_STORED_IMAGE_DIMENSION,
  MIN_COVER_WIDTH,
  RECOMMENDED_COVER_WIDTH,
  type AcceptedImageFormat,
} from './limits'

// Server image pipeline. The single place every organiser image is validated and
// normalised before it touches storage. SPEC 1.5:
//   - magic-byte validation (sharp reads the real format from the bytes, not the
//     extension or the client-declared MIME)
//   - reject SVG and any non-raster / active content (XSS)
//   - DOWNSCALE anything over 4000px on the long edge; refuse only a
//     decompression bomb (see MAX_SOURCE_IMAGE_PIXELS). Ordinary phone and
//     camera output is accepted and resized, never turned away.
//   - HEIC/HEIF (iPhone) converted to JPEG on ingest
//   - strip EXIF + all metadata (privacy: removes GPS/device; also shrinks files)
//   - generate a blur placeholder (blurDataURL) per image
// Server re-encode to AVIF/WebP for DELIVERY is delegated to /_next/image (the
// existing pipeline, MEDIA-ARCHITECTURE.md §4.1); this step produces a clean,
// metadata-free, correctly-oriented raster origin object.

export type ProcessedImage = {
  buffer: Buffer
  /** Storage content-type, e.g. 'image/jpeg' | 'image/webp'. */
  contentType: string
  /** File extension without a dot, e.g. 'jpg' | 'webp'. */
  ext: string
  width: number
  height: number
  /** Tiny base64 data URL for next/image placeholder="blur". */
  blurDataURL: string
}

export type ImageProcessResult =
  | { ok: true; image: ProcessedImage }
  | { ok: false; error: string }

const REJECT_NOT_IMAGE =
  'That file is not a supported image. Upload a photo in JPEG, PNG, WebP, AVIF, or HEIC.'

function isAccepted(format: string | undefined): format is AcceptedImageFormat {
  return !!format && (ACCEPTED_IMAGE_FORMATS as readonly string[]).includes(format)
}

/**
 * Validate and normalise one uploaded image.
 *
 * @param input raw upload bytes (the untrusted file)
 * @param opts.role 'cover' enforces the minimum cover width; 'gallery' does not
 */
export async function processEventImage(
  input: ArrayBuffer | Uint8Array | Buffer,
  opts: { role: 'cover' | 'gallery' },
): Promise<ImageProcessResult> {
  const inputBuffer = Buffer.isBuffer(input) ? input : Buffer.from(input as ArrayBuffer)

  let meta: sharp.Metadata
  try {
    meta = await sharp(inputBuffer, { failOn: 'error' }).metadata()
  } catch {
    // sharp could not decode it as a raster image at all (covers SVG, which sharp
    // treats as vector and which we forbid, plus corrupt/active content).
    return { ok: false, error: REJECT_NOT_IMAGE }
  }

  const format = meta.format
  // Explicitly reject SVG and anything outside the raster allowlist by its REAL
  // magic bytes, never the declared extension/MIME.
  if (format === 'svg' || !isAccepted(format)) {
    return { ok: false, error: REJECT_NOT_IMAGE }
  }

  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width < 1 || height < 1) {
    return { ok: false, error: REJECT_NOT_IMAGE }
  }
  // A big photo is DOWNSCALED below, never refused. The only pixel count that
  // still refuses is the decompression-bomb guard, which no camera reaches.
  if (width * height > MAX_SOURCE_IMAGE_PIXELS) {
    const mp = Math.round((width * height) / 1_000_000)
    return {
      ok: false,
      error: `That image is ${mp} megapixels (${width} x ${height}), which is larger than we can process. Export it at a smaller size, or save it as a JPEG from your photo app, and upload it again.`,
    }
  }
  // Checked against the SOURCE width on purpose. Downscaling only ever shrinks
  // the long edge, so for any normal cover aspect the stored width stays above
  // this floor, and checking the source keeps the message about the photo the
  // organiser actually chose.
  if (opts.role === 'cover' && width < MIN_COVER_WIDTH) {
    return {
      ok: false,
      error: `This image is too small for a cover (${width}px wide). Use at least ${MIN_COVER_WIDTH}px wide; ${RECOMMENDED_COVER_WIDTH}px is recommended.`,
    }
  }

  // HEIC/HEIF and PNG are normalised to JPEG; WebP/AVIF keep their efficient
  // format. .rotate() bakes EXIF orientation into pixels; sharp drops ALL
  // metadata by default (no .withMetadata()), so EXIF/GPS never reach storage.
  const toJpeg = format === 'heif' || format === 'png'
  // limitInputPixels enforces the bomb guard inside sharp itself, so the check
  // above is the friendly message and this is the one that cannot be talked
  // past. sharp's own default is 268MP, too generous for a serverless function.
  const pipeline = sharp(inputBuffer, { limitInputPixels: MAX_SOURCE_IMAGE_PIXELS })
    .rotate()
    // DOWNSCALE, never refuse. `fit: 'inside'` preserves aspect and bounds the
    // LONG edge; `withoutEnlargement` means a small image is passed through
    // untouched rather than blown up. This is what turns the founder's
    // 3625 x 4961 from a rejection into a 2924 x 4000 cover.
    .resize({
      width: MAX_STORED_IMAGE_DIMENSION,
      height: MAX_STORED_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })

  let out: { data: Buffer; info: sharp.OutputInfo }
  let contentType: string
  let ext: string
  if (toJpeg) {
    out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true })
    contentType = 'image/jpeg'
    ext = 'jpg'
  } else if (format === 'webp') {
    out = await pipeline.webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    contentType = 'image/webp'
    ext = 'webp'
  } else if (format === 'avif') {
    out = await pipeline.avif({ quality: 60 }).toBuffer({ resolveWithObject: true })
    contentType = 'image/avif'
    ext = 'avif'
  } else {
    // jpeg
    out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true })
    contentType = 'image/jpeg'
    ext = 'jpg'
  }

  const blurDataURL = await makeBlurDataURL(inputBuffer)

  return {
    ok: true,
    image: {
      buffer: out.data,
      contentType,
      ext,
      // The dimensions we actually STORED, read back off the encoder rather
      // than the source metadata. Returning the source size here would record a
      // 4961px height for a 4000px file and every consumer of these numbers
      // (aspect ratios, srcset hints, the media components) would be wrong.
      width: out.info.width,
      height: out.info.height,
      blurDataURL,
    },
  }
}

/** A ~16px wide blurred WebP, base64-encoded for next/image placeholder="blur". */
async function makeBlurDataURL(input: Buffer): Promise<string> {
  try {
    const tiny = await sharp(input)
      .rotate()
      .resize(16, 16, { fit: 'inside' })
      .webp({ quality: 30 })
      .toBuffer()
    return `data:image/webp;base64,${tiny.toString('base64')}`
  } catch {
    // A blur placeholder is a nicety, never a reason to fail an upload.
    return ''
  }
}
