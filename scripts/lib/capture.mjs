import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * The one place a harness writes a capture. WebP quality 80, not lossless PNG.
 *
 * ---------------------------------------------------------------------------
 * WHY. Measured 8 August 2026: `docs/` is 2790 image files and 2.44 GB in this
 * worktree, 10.68 GB replicated across nine, with a 1.66 GB `.git` inflated by
 * their history. Single captures run to 26 MB
 * (`docs/benchmark/system-pass/overnight-elevation/pages/home-1440.png`).
 *
 * Lossless PNG is the wrong format for a screenshot of a web page. PNG is
 * designed for exact pixel fidelity, which matters for an icon or a diagram and
 * does not matter for evidence that a hero rendered and a price read correctly.
 * Git compounds it: PNG is already compressed, so git stores every version in
 * full with no delta benefit, forever.
 *
 * WebP at quality 80 is typically a tenth the size and, measured on this repo's
 * own captures, is indistinguishable at the zoom level anybody reviews evidence
 * at. The proof is `scripts/verify/webp-legibility-proof.mjs`, which captures
 * the same surfaces both ways and reports the size and the pixel difference.
 *
 * ON LOSSY EVIDENCE, because it is a fair objection. Quality 80 alters pixels.
 * It does NOT alter what evidence is FOR: whether an element rendered, where it
 * sat, what it said, what colour it was. Where a proof genuinely depends on
 * exact pixels (a contrast-ratio measurement, a colour-token assertion) pass
 * `{ lossless: true }` and say why at the call site. Those cases are rare and
 * should be argued, not defaulted to.
 */

/** The house default. One number, one place. */
export const CAPTURE_QUALITY = 80

/**
 * Screenshot `page` to `path`, written as WebP.
 *
 * `path` may still be given as `.png`; the extension is rewritten to `.webp` so
 * a caller does not have to remember. The returned path is the one written.
 */
export async function capture(page, path, opts = {}) {
  const { lossless = false, quality = CAPTURE_QUALITY, ...shotOpts } = opts
  const target = path.replace(/\.(png|jpe?g)$/i, '.webp')
  mkdirSync(dirname(target), { recursive: true })

  // Playwright writes PNG or JPEG only, so the buffer is converted here.
  const png = await page.screenshot({ ...shotOpts, type: 'png' })
  await sharp(png)
    .webp(lossless ? { lossless: true } : { quality, effort: 4 })
    .toFile(target)
  return target
}

/** Convert an existing PNG/JPEG buffer. For harnesses that already hold one. */
export async function toWebp(buffer, path, opts = {}) {
  const { lossless = false, quality = CAPTURE_QUALITY } = opts
  const target = path.replace(/\.(png|jpe?g)$/i, '.webp')
  mkdirSync(dirname(target), { recursive: true })
  await sharp(buffer)
    .webp(lossless ? { lossless: true } : { quality, effort: 4 })
    .toFile(target)
  return target
}
