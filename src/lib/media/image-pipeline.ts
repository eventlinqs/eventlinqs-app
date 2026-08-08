import 'server-only'
import sharp from 'sharp'
import {
  ACCEPTED_IMAGE_FORMATS,
  IMAGE_DOWNSCALE_LONG_EDGE,
  MAX_IMAGE_PIXELS,
  MIN_COVER_WIDTH,
  RECOMMENDED_COVER_WIDTH,
  type AcceptedImageFormat,
} from './limits'

// Server image pipeline. The single place every organiser image is validated and
// normalised before it touches storage. SPEC 1.5:
//   - magic-byte validation (sharp reads the real format from the bytes, not the
//     extension or the client-declared MIME)
//   - reject SVG and any non-raster / active content (XSS)
//   - DOWNSCALE oversize photos to IMAGE_DOWNSCALE_LONG_EDGE, never reject them;
//     refuse only a decompression bomb (MAX_IMAGE_PIXELS)
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
  // A decompression bomb is refused; an ordinary big photo is DOWNSCALED below,
  // never refused. See IMAGE_DOWNSCALE_LONG_EDGE for why the old 4000px reject
  // was the wrong verb.
  if (width * height > MAX_IMAGE_PIXELS) {
    return { ok: false, error: REJECT_NOT_IMAGE }
  }
  if (opts.role === 'cover' && width < MIN_COVER_WIDTH) {
    return {
      ok: false,
      error: `This image is too small for a cover (${width}px wide). Use at least ${MIN_COVER_WIDTH}px wide; ${RECOMMENDED_COVER_WIDTH}px is recommended.`,
    }
  }

  // HEIC/HEIF and PNG are normalised to JPEG; WebP/AVIF keep their efficient
  // format. .rotate() bakes EXIF orientation into pixels; sharp drops ALL
  // metadata by default (no .withMetadata()), so EXIF/GPS never reach storage.
  //
  // .resize(fit: 'inside', withoutEnlargement: true) is the downscale that
  // replaced the old hard reject: an oversize photo is brought down to the long
  // edge and a small one is left exactly as it is, never upscaled.
  const toJpeg = format === 'heif' || format === 'png'
  const pipeline = sharp(inputBuffer)
    .rotate()
    .resize({
      width: IMAGE_DOWNSCALE_LONG_EDGE,
      height: IMAGE_DOWNSCALE_LONG_EDGE,
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
    // The dimensions reported are the ones actually written, read back from
    // sharp. Returning the metadata values instead would be wrong twice over
    // now: they predate the downscale, and they predate .rotate(), so a photo
    // shot in portrait on a phone reported its width and height swapped.
    image: {
      buffer: out.data,
      contentType,
      ext,
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
