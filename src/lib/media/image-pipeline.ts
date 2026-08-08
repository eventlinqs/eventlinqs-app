import 'server-only'
// sharp 0.35 ships real ESM types (dist/index.d.mts) with NAMED type exports,
// replacing the 0.34 `export = sharp` form where types were reached as
// `sharp.Metadata`. That namespace no longer exists, so the qualified form is a
// compile error on 0.35. Importing the type by name is the shape the package now
// documents, and it is what the security bump to 0.35.3 required
// (libvips CVE-2026-33327 and friends, reachable from organiser uploads).
import sharp, { type Metadata } from 'sharp'
import {
  ACCEPTED_IMAGE_FORMATS,
  MAX_IMAGE_DIMENSION,
  MIN_COVER_WIDTH,
  RECOMMENDED_COVER_WIDTH,
  type AcceptedImageFormat,
} from './limits'

// Server image pipeline. The single place every organiser image is validated and
// normalised before it touches storage. SPEC 1.5:
//   - magic-byte validation (sharp reads the real format from the bytes, not the
//     extension or the client-declared MIME)
//   - reject SVG and any non-raster / active content (XSS)
//   - reject > 4000 x 4000
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

  let meta: Metadata
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
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      ok: false,
      error: `Image is too large in pixels: ${width} x ${height}. The maximum is ${MAX_IMAGE_DIMENSION} x ${MAX_IMAGE_DIMENSION}.`,
    }
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
  // AVIF DETECTION CHANGED IN SHARP 0.35, and it is not merely a type change.
  // 0.34 reported an AVIF upload as format 'avif'. 0.35 removed 'avif' from
  // FormatEnum entirely and reports it as 'heif', which is strictly more
  // accurate (AVIF is a HEIF-family container and libvips decodes it through the
  // heif loader) and which silently broke the branch below: `format === 'avif'`
  // became unreachable, `toJpeg` became TRUE for AVIF, and every AVIF cover an
  // organiser uploaded would have been transcoded to JPEG. Bigger files, and a
  // quiet regression on the format this platform deliberately serves for LCP.
  //
  // The discriminator within the HEIF family is the codec: 'av1' is AVIF,
  // 'hevc' is HEIC (an iPhone photo), and only the latter should become JPEG.
  const isAvif = format === 'heif' && meta.compression === 'av1'
  const toJpeg = (format === 'heif' && !isAvif) || format === 'png'
  const pipeline = sharp(inputBuffer).rotate()

  let buffer: Buffer
  let contentType: string
  let ext: string
  if (toJpeg) {
    buffer = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    contentType = 'image/jpeg'
    ext = 'jpg'
  } else if (format === 'webp') {
    buffer = await pipeline.webp({ quality: 82 }).toBuffer()
    contentType = 'image/webp'
    ext = 'webp'
  } else if (isAvif) {
    buffer = await pipeline.avif({ quality: 60 }).toBuffer()
    contentType = 'image/avif'
    ext = 'avif'
  } else {
    // jpeg
    buffer = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    contentType = 'image/jpeg'
    ext = 'jpg'
  }

  const blurDataURL = await makeBlurDataURL(inputBuffer)

  return {
    ok: true,
    image: { buffer, contentType, ext, width, height, blurDataURL },
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
