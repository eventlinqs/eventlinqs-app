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

export type OutputEncoding = {
  kind: 'jpeg' | 'webp' | 'avif'
  contentType: string
  ext: string
}

/**
 * Which format a decoded upload should be stored as.
 *
 * Extracted as a PURE function so the decision can be tested exhaustively,
 * including for HEIC, which cannot be encoded here (libvips ships no HEVC
 * encoder) and therefore cannot be covered by a real-file test.
 *
 * WHY THIS IS NOT INLINE ANY MORE. sharp 0.34 reported an AVIF upload as
 * `format: 'avif'`. sharp 0.35 removed 'avif' from FormatEnum entirely and
 * reports AVIF as `format: 'heif'`, which is strictly more accurate (AVIF is a
 * HEIF-family container that libvips decodes through the heif loader). The
 * inline branch tested `format === 'avif'`, so after the bump it was dead code:
 * AVIF fell through to the JPEG branch and every AVIF cover an organiser
 * uploaded would have been silently transcoded to JPEG, on a platform that
 * deliberately serves AVIF for LCP. npm audit cannot see that, a lockfile diff
 * cannot see it, and no mock of sharp can see it, because the change was in what
 * sharp actually reports.
 *
 * The discriminator inside the HEIF family is the CODEC, not the container:
 *   heif + av1   -> AVIF, keep it, it is the efficient format we want
 *   heif + hevc  -> HEIC from an iPhone, normalise to JPEG for compatibility
 *   heif + none  -> unknown HEIF variant, normalise to JPEG (fail safe)
 */
export function decideOutputEncoding(
  format: AcceptedImageFormat,
  compression: 'av1' | 'hevc' | undefined,
): OutputEncoding {
  if (format === 'webp') return { kind: 'webp', contentType: 'image/webp', ext: 'webp' }
  // 'avif' is retained for older sharp releases that still report it directly.
  if (format === 'avif' || (format === 'heif' && compression === 'av1')) {
    return { kind: 'avif', contentType: 'image/avif', ext: 'avif' }
  }
  // jpeg, png, and every non-AV1 HEIF variant are stored as JPEG.
  return { kind: 'jpeg', contentType: 'image/jpeg', ext: 'jpg' }
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

  // .rotate() bakes EXIF orientation into pixels; sharp drops ALL metadata by
  // default (no .withMetadata()), so EXIF/GPS never reach storage.
  const encoding = decideOutputEncoding(format, meta.compression)
  const pipeline = sharp(inputBuffer).rotate()

  let buffer: Buffer
  if (encoding.kind === 'webp') {
    buffer = await pipeline.webp({ quality: 82 }).toBuffer()
  } else if (encoding.kind === 'avif') {
    buffer = await pipeline.avif({ quality: 60 }).toBuffer()
  } else {
    buffer = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
  }
  const { contentType, ext } = encoding

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
