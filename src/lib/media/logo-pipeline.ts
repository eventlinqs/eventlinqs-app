import 'server-only'
import sharp from 'sharp'
import {
  ACCEPTED_IMAGE_FORMATS,
  MAX_IMAGE_DIMENSION,
  MAX_LOGO_ASPECT,
  MIN_LOGO_ASPECT,
  MIN_LOGO_LONG_EDGE,
  RECOMMENDED_LOGO_LONG_EDGE,
  type AcceptedImageFormat,
} from './limits'

/**
 * THE ORGANISER LOGO PIPELINE.
 *
 * Separate from the photograph pipeline because a logo is a different object
 * and the photograph rules actively damage it:
 *
 * - processEventImage converts PNG to JPEG. A logo is very often a PNG with a
 *   transparent background, and JPEG has no alpha channel, so that conversion
 *   flattens the transparency to solid black. The organiser uploads their mark
 *   and gets a black box.
 * - A photograph has a minimum WIDTH because it is a full-bleed hero. A logo
 *   has a minimum LONG EDGE, because a tall wordmark and a square badge are
 *   both legitimate and neither should be judged on width alone.
 *
 * The security posture is inherited unchanged: sharp reads the real format
 * from the magic bytes, never the declared MIME or the extension; SVG and
 * anything else outside the raster allowlist is rejected because SVG can carry
 * script; EXIF is dropped; oversized rasters are refused.
 */

export type LogoPlacement =
  /** Sits straight on the navy: it has transparency and reads light enough. */
  | 'on-navy'
  /** Needs a light tile behind it, or it would vanish into the navy. */
  | 'on-tile'

export type ProcessedLogo = {
  buffer: Buffer
  contentType: string
  ext: string
  width: number
  height: number
  /** True when the file carries real transparency. */
  hasAlpha: boolean
  /** How this logo should be placed on a dark artefact. */
  placement: LogoPlacement
  /** Mean luminance, 0 to 255, of the logo composited over the brand navy. */
  luminanceOverNavy: number
}

export type LogoProcessResult = { ok: true; logo: ProcessedLogo } | { ok: false; error: string }

const REJECT_NOT_IMAGE =
  'That file is not a supported image. Upload your logo as a PNG (best, it keeps a transparent background), or JPEG, WebP or AVIF. Vector files such as SVG are not accepted.'

/** ink-900, the ground every artefact is drawn on. */
const NAVY = { r: 10, g: 22, b: 40 }

/**
 * Luminance below which a logo composited over the navy is treated as too dark
 * to sit on it. The navy itself measures about 20 on this scale, so a mark that
 * only lifts the average into the low tens is, in practice, invisible. 70 is
 * comfortably above that and below any mark with real light in it.
 */
const NAVY_CONTRAST_FLOOR = 70

function isAccepted(format: string | undefined): format is AcceptedImageFormat {
  return !!format && (ACCEPTED_IMAGE_FORMATS as readonly string[]).includes(format)
}

/**
 * Decide how a logo should be placed on a dark artefact, by measuring rather
 * than by asking.
 *
 * Humanitix publishes the honest version of this problem and hands it back to
 * the organiser: "We recommend checking if your logo matches both light and
 * dark modes. Your logo's colours will not automatically change." That is a
 * real defect for the promoter, because the failure is silent: a black
 * wordmark on a transparent background uploads fine, previews fine on a white
 * settings page, and then disappears completely on a navy poster.
 *
 * So the logo is actually composited over the brand navy and the result is
 * measured. A mark that stays dark gets a light tile; a mark with light in it
 * sits straight on the navy, which is the better-looking of the two and is
 * what most white or gold wordmarks will get.
 */
export async function resolveLogoPlacement(
  input: Buffer,
): Promise<{ placement: LogoPlacement; hasAlpha: boolean; luminanceOverNavy: number }> {
  const meta = await sharp(input).metadata()
  const hasAlpha = Boolean(meta.hasAlpha)

  // No transparency means the file already carries its own background, so it
  // always needs a tile: pasting a white rectangle onto navy without one looks
  // like a mistake rather than a choice.
  if (!hasAlpha) {
    const stats = await sharp(input).greyscale().stats()
    return {
      placement: 'on-tile',
      hasAlpha: false,
      luminanceOverNavy: Math.round(stats.channels[0]?.mean ?? 0),
    }
  }

  // MEASURE THE INK, NOT THE CANVAS. The first version of this averaged the
  // whole frame and got the answer backwards: a wordmark on a transparent
  // canvas is mostly canvas, so a bright white mark measured 59 on a scale
  // where the navy itself sits near 4, and was sent to a tile it did not need.
  //
  // The alpha channel says how much of the frame is actually the mark, so the
  // background's contribution can be taken back out and the remainder is the
  // ink. The navy baseline is measured rather than assumed, because sharp
  // greyscales in linear light and the brand navy reads far darker there than
  // the naive formula suggests.
  const [overNavy, alpha, baseline] = await Promise.all([
    sharp(input).flatten({ background: NAVY }).greyscale().stats(),
    sharp(input).extractChannel('alpha').stats(),
    sharp({ create: { width: 8, height: 8, channels: 3, background: NAVY } }).greyscale().stats(),
  ])

  const navyLuminance = baseline.channels[0]?.mean ?? 0
  const coverage = (alpha.channels[0]?.mean ?? 255) / 255
  const blended = overNavy.channels[0]?.mean ?? 0
  const ink =
    coverage > 0.02 ? (blended - (1 - coverage) * navyLuminance) / coverage : navyLuminance
  const luminance = Math.round(Math.max(0, Math.min(255, ink)))

  return {
    placement: luminance >= NAVY_CONTRAST_FLOOR ? 'on-navy' : 'on-tile',
    hasAlpha: true,
    luminanceOverNavy: luminance,
  }
}

/**
 * Validate and normalise one uploaded organiser logo.
 *
 * PNG stays PNG so transparency survives. Everything else is normalised to PNG
 * as well: one stored format for logos means one code path everywhere the logo
 * is drawn, and a logo is small enough that PNG costs nothing.
 */
export async function processOrganisationLogo(
  input: ArrayBuffer | Uint8Array | Buffer,
): Promise<LogoProcessResult> {
  const inputBuffer = Buffer.isBuffer(input) ? input : Buffer.from(input as ArrayBuffer)

  let meta: sharp.Metadata
  try {
    meta = await sharp(inputBuffer, { failOn: 'error' }).metadata()
  } catch {
    return { ok: false, error: REJECT_NOT_IMAGE }
  }

  const format = meta.format
  if (format === 'svg' || !isAccepted(format)) {
    return { ok: false, error: REJECT_NOT_IMAGE }
  }

  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width < 1 || height < 1) return { ok: false, error: REJECT_NOT_IMAGE }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      ok: false,
      error: `That logo is too large in pixels: ${width} x ${height}. The maximum is ${MAX_IMAGE_DIMENSION} x ${MAX_IMAGE_DIMENSION}.`,
    }
  }

  const longEdge = Math.max(width, height)
  if (longEdge < MIN_LOGO_LONG_EDGE) {
    return {
      ok: false,
      error: `That logo is too small to print (${width} x ${height}). Use at least ${MIN_LOGO_LONG_EDGE} pixels on its longest side; ${RECOMMENDED_LOGO_LONG_EDGE} is better, because it goes onto an A4 poster as well as a screen.`,
    }
  }

  const aspect = width / height
  if (aspect > MAX_LOGO_ASPECT || aspect < MIN_LOGO_ASPECT) {
    return {
      ok: false,
      error: `That image is an unusual shape for a logo (${width} x ${height}). Crop it closer to your mark: anything between four times as wide as it is tall, and four times as tall as it is wide, works everywhere.`,
    }
  }

  // .rotate() bakes EXIF orientation in; sharp drops all metadata by default,
  // so EXIF and any GPS in it never reach storage.
  const normalised = await sharp(inputBuffer)
    .rotate()
    .resize(RECOMMENDED_LOGO_LONG_EDGE, RECOMMENDED_LOGO_LONG_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer()

  const outMeta = await sharp(normalised).metadata()
  const placement = await resolveLogoPlacement(normalised)

  return {
    ok: true,
    logo: {
      buffer: normalised,
      contentType: 'image/png',
      ext: 'png',
      width: outMeta.width ?? width,
      height: outMeta.height ?? height,
      hasAlpha: placement.hasAlpha,
      placement: placement.placement,
      luminanceOverNavy: placement.luminanceOverNavy,
    },
  }
}
