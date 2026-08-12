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
//     refuse only a decompression bomb (MAX_IMAGE_PIXELS). Ordinary phone and
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
  // A big photo is DOWNSCALED below, never refused. The only pixel count that
  // still refuses is the decompression-bomb guard, which no camera reaches. See
  // IMAGE_DOWNSCALE_LONG_EDGE for why the old 4000px reject was the wrong verb.
  //
  // The message is fix/production-sweep's: it names the megapixels and the
  // dimensions, because the generic not-an-image line told an organiser nothing
  // about what to do next.
  if (width * height > MAX_IMAGE_PIXELS) {
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

  // .rotate() bakes EXIF orientation into pixels; sharp drops ALL metadata by
  // default (no .withMetadata()), so EXIF/GPS never reach storage.
  //
  // MERGE NOTE. THREE branches rewrote this block and all three survive here,
  // because they answer three different questions:
  //
  //   .resize(fit: 'inside', withoutEnlargement: true)  decides HOW BIG. The
  //     downscale that replaced the old hard reject: an oversize photo comes
  //     down to the long edge, a small one is left exactly as it is.
  //   decideOutputEncoding(format, meta.compression)    decides WHICH FORMAT.
  //     Replaces the hand-rolled toJpeg boolean, which became dead code when
  //     sharp 0.35 began reporting an AVIF upload as heif.
  //   limitInputPixels                                  decides WHAT DECODES.
  //     From fix/production-sweep. It enforces the bomb guard inside sharp
  //     itself, so the check above is the friendly message and this is the one
  //     that cannot be talked past. sharp's own default is 268MP, too generous
  //     for a serverless function.
  //
  // Taking any one alone drops the others silently: without the resize an
  // oversize upload is stored at full size, without the encoder every AVIF
  // cover is transcoded to JPEG, and without limitInputPixels the decode is
  // bounded only by a check that reads the declared dimensions.
  const encoding = decideOutputEncoding(format, meta.compression)
  const pipeline = sharp(inputBuffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    // `fit: 'inside'` preserves aspect and bounds the LONG edge;
    // `withoutEnlargement` means a small image is passed through untouched
    // rather than blown up. This is what turns the founder's 3625 x 4961 from
    // a rejection into a downscaled cover.
    .resize({
      width: IMAGE_DOWNSCALE_LONG_EDGE,
      height: IMAGE_DOWNSCALE_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })

  // resolveWithObject so the dimensions recorded are read back from sharp, and
  // therefore postdate BOTH the resize and the rotate.
  //
  // fix/production-sweep's branch here still tested `format === 'avif'`, which
  // sharp 0.35 made dead code. It is NOT carried across: keeping it would
  // re-break the transcode defect that decideOutputEncoding exists to fix.
  let out: { data: Buffer; info: sharp.OutputInfo }
  if (encoding.kind === 'webp') {
    out = await pipeline.webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
  } else if (encoding.kind === 'avif') {
    out = await pipeline.avif({ quality: 60 }).toBuffer({ resolveWithObject: true })
  } else {
    out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  }
  const { contentType, ext } = encoding

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
      // The dimensions we actually STORED, read back off the encoder rather
      // than the source metadata. Returning the source size here would record a
      // 4961px height for a downscaled file and every consumer of these numbers
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
