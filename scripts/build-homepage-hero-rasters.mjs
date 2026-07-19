/**
 * build-homepage-hero-rasters.mjs
 *
 * One-shot helper that encodes the FOUNDER's own licensed homepage hero photos
 * (Adobe Stock / Stocksy source, dropped into design-assets/incoming/ by the
 * photo-day pipeline) into the local above-fold hero raster set at
 * public/images/hero/{slug}.{jpg,avif}.
 *
 * Why local: the homepage featured hero owns the LCP and MUST be a local
 * bundled AVIF for direct CDN delivery (docs/MEDIA-ARCHITECTURE.md; the LCP
 * note in src/lib/images/event-media.ts). Routing the hero through the remote
 * spine URL adds ~1100ms cold-encode on the LCP path, so the founder's curated
 * homepage photography is baked to disk here instead, matching the exact
 * 1920x1080 / jpg-q80 / avif-q60 contract of the existing hero rasters so it
 * drops into getFeaturedHeroBackground unchanged.
 *
 * No-cropped-faces: sharp's attention strategy centres the crop on the highest
 * detail region (the subjects), so a wide landscape festival/rooftop source is
 * cropped to 1920x1080 without slicing heads. The founder sources carry natural
 * headroom (3:2-ish framing) for exactly this reason.
 *
 * Run (Windows PowerShell):  node scripts/build-homepage-hero-rasters.mjs
 * Idempotent: skips files already on disk unless --force is passed.
 */

import { writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SRC_DIR = resolve(PROJECT_ROOT, 'design-assets/incoming')
const OUT_DIR = resolve(PROJECT_ROOT, 'public/images/hero')

const FORCE = process.argv.includes('--force')

// Founder source (in design-assets/incoming, gitignored) -> public raster slug.
const HEROES = [
  { src: 'hero__none__none__homepage-day-festival.jpeg', slug: 'homepage-day-festival', alt: 'A daytime festival crowd under open sky' },
  { src: 'hero__none__none__homepage-festival-night.jpeg', slug: 'homepage-festival-night', alt: 'A festival main stage lit up at night' },
  { src: 'hero__none__none__homepage-rooftop-golden-hour.jpeg', slug: 'homepage-rooftop', alt: 'A rooftop gathering at golden hour' },
]

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

async function buildOne({ src, slug, alt }) {
  const srcPath = resolve(SRC_DIR, src)
  const jpgPath = resolve(OUT_DIR, `${slug}.jpg`)
  const avifPath = resolve(OUT_DIR, `${slug}.avif`)

  if (!existsSync(srcPath)) {
    throw new Error(`source missing: ${srcPath} (founder photo-day drop folder). Cannot build ${slug}.`)
  }
  if (!FORCE && existsSync(jpgPath) && existsSync(avifPath)) {
    console.log(`[skip] ${slug} (jpg + avif already on disk)`)
    return { slug, skipped: true }
  }

  // Same contract as the existing hero rasters: 1920x1080, smart attention crop.
  const pipeline = sharp(srcPath).resize({
    width: 1920,
    height: 1080,
    fit: 'cover',
    position: sharp.strategy.attention,
  })

  const jpgBuf = await pipeline.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer()
  writeFileSync(jpgPath, jpgBuf)

  const avifBuf = await pipeline.clone().avif({ quality: 60, effort: 4 }).toBuffer()
  writeFileSync(avifPath, avifBuf)

  return { slug, alt, jpg_bytes: jpgBuf.length, avif_bytes: avifBuf.length }
}

async function main() {
  console.log(`Building founder homepage hero rasters to ${OUT_DIR}\n`)
  const built = []
  for (const hero of HEROES) {
    const r = await buildOne(hero)
    if (!r.skipped) {
      console.log(
        `   ok  ${r.slug.padEnd(24)}  ${(r.avif_bytes / 1024).toFixed(0)} KB AVIF / ${(r.jpg_bytes / 1024).toFixed(0)} KB JPG`,
      )
    }
    built.push(r)
  }

  // Provenance note kept separate from the Pexels attribution.json (which the
  // Pexels fetcher regenerates), so these licensed credits are not clobbered.
  const manifest = {
    note: 'Founder-supplied licensed homepage hero photography (Adobe Stock / Stocksy source, see docs/IMAGERY-STRATEGY.md). Encoded from design-assets/incoming via scripts/build-homepage-hero-rasters.mjs. Licence held by EventLinqs; not Pexels.',
    heroes: built.filter(b => !b.skipped).map(b => ({ slug: b.slug, alt: b.alt })),
  }
  writeFileSync(resolve(OUT_DIR, 'homepage-hero-attribution.json'), JSON.stringify(manifest, null, 2))
  const sizes = built
    .filter(b => !b.skipped)
    .map(b => `${b.slug}.avif=${Math.round(statSync(resolve(OUT_DIR, `${b.slug}.avif`)).size / 1024)}KB`)
    .join(', ')
  console.log(`\nWrote homepage-hero-attribution.json  (${sizes || 'all skipped'})`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
