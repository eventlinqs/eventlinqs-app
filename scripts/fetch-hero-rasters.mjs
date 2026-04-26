/**
 * fetch-hero-rasters.mjs
 *
 * One-shot helper that pulls a 1920x1080 raster hero fallback per category
 * from the Pexels API and saves it to public/images/hero/{slug}.{jpg,avif}.
 *
 * These are the canonical above-fold raster fallbacks that HeroMedia and the
 * event-media resolver use when an organiser hasn't supplied a cover. They
 * exist on disk (not fetched at runtime) because the LCP path must not block
 * on a Pexels round-trip.
 *
 * Run:
 *   node scripts/fetch-hero-rasters.mjs
 *
 * Requires PEXELS_API_KEY in .env.local. Idempotent — skips files that
 * already exist unless --force is passed.
 *
 * Each category is encoded as both a 1920x1080 JPEG (quality 80, mozjpeg)
 * and a 1920x1080 AVIF (quality 60, effort 4). Browsers without AVIF
 * support fall back to JPEG via next/image format negotiation.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const ENV_PATH = resolve(PROJECT_ROOT, '.env.local')
const OUT_DIR = resolve(PROJECT_ROOT, 'public/images/hero')

const FORCE = process.argv.includes('--force')

// Load .env.local
const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    }),
)

const PEXELS_API_KEY = env.PEXELS_API_KEY
if (!PEXELS_API_KEY) {
  console.error('PEXELS_API_KEY missing from .env.local — cannot fetch.')
  process.exit(1)
}

// Category slug -> Pexels search query. Queries bias multicultural / diverse
// crowds, matching docs/MEDIA-ARCHITECTURE.md tone.
const CATEGORIES = {
  afrobeats: 'multicultural music festival diverse crowd',
  gospel: 'community gospel worship together',
  amapiano: 'african diaspora dance floor celebration',
  owambe: 'african wedding celebration diverse families',
  comedy: 'diverse audience laughing comedy show',
  'caribbean-carnival': 'caribbean carnival diverse crowd dance',
  bollywood: 'bollywood dance celebration crowd',
  latin: 'latin music dance celebration crowd',
  filipino: 'filipino fiesta celebration crowd',
  lunar: 'lunar new year lantern festival crowd',
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

function simpleHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

async function searchPexels(query) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
    { headers: { Authorization: PEXELS_API_KEY } },
  )
  if (!res.ok) throw new Error(`Pexels search failed: ${res.status} ${res.statusText}`)
  const data = await res.json()
  if (!data.photos || data.photos.length === 0) throw new Error(`No photos for "${query}"`)
  return data.photos[simpleHash(query) % data.photos.length]
}

async function downloadOriginal(photo) {
  const res = await fetch(photo.src.original)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return buf
}

async function fetchOne(slug, query) {
  const jpgPath = resolve(OUT_DIR, `${slug}.jpg`)
  const avifPath = resolve(OUT_DIR, `${slug}.avif`)

  if (!FORCE && existsSync(jpgPath) && existsSync(avifPath)) {
    console.log(`[skip] ${slug} (jpg + avif already on disk)`)
    return { slug, skipped: true }
  }

  const photo = await searchPexels(query)
  const buf = await downloadOriginal(photo)

  // Resize+crop to 1920x1080 with smart attention crop.
  const pipeline = sharp(buf).resize({
    width: 1920,
    height: 1080,
    fit: 'cover',
    position: sharp.strategy.attention,
  })

  const jpgBuf = await pipeline.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer()
  writeFileSync(jpgPath, jpgBuf)

  const avifBuf = await pipeline.clone().avif({ quality: 60, effort: 4 }).toBuffer()
  writeFileSync(avifPath, avifBuf)

  return {
    slug,
    photographer: photo.photographer,
    photographer_url: photo.photographer_url,
    pexels_id: photo.id,
    pexels_url: photo.url,
    alt: photo.alt,
    jpg_bytes: jpgBuf.length,
    avif_bytes: avifBuf.length,
  }
}

async function main() {
  console.log(`Fetching hero rasters to ${OUT_DIR}\n`)
  const results = []
  for (const [slug, query] of Object.entries(CATEGORIES)) {
    try {
      console.log(`[fetch] ${slug.padEnd(22)} <- "${query}"`)
      const r = await fetchOne(slug, query)
      if (!r.skipped) {
        console.log(
          `   ok  ${r.slug.padEnd(22)}  ${(r.avif_bytes / 1024).toFixed(0)} KB AVIF / ${(r.jpg_bytes / 1024).toFixed(0)} KB JPG  | photo by ${r.photographer}`,
        )
      }
      results.push(r)
    } catch (e) {
      console.error(`   FAIL ${slug}: ${e.message}`)
      results.push({ slug, error: e.message })
    }
  }

  // Write attribution manifest — Pexels licence requires photographer credit.
  const manifest = {
    generated_at: new Date().toISOString(),
    note: 'Photos sourced from Pexels (https://www.pexels.com). Free to use under the Pexels licence; attribution appreciated. Regenerate with: node scripts/fetch-hero-rasters.mjs --force',
    categories: results.filter(r => !r.error && !r.skipped),
  }
  writeFileSync(resolve(OUT_DIR, 'attribution.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nWrote ${OUT_DIR}/attribution.json`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
