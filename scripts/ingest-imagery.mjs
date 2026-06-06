/**
 * Imagery ingestion pipeline.
 *
 * Reads a local stock-image library, converts every image to responsive AVIF
 * with sharp, uploads the renditions to the Supabase storage bucket, and emits
 * a mapping JSON that the `seed-events` skill consumes to set event covers.
 *
 * STORAGE ONLY. This script never reads or writes a database table. The
 * Supabase client is wrapped so only `.storage` is reachable; any attempt to
 * call `.from(table)`, `.rpc(...)`, `.auth`, etc. throws. Seeding rows is the
 * seed-events skill's job, run separately and applied by the founder.
 *
 * Expected library tree (roles):
 *   <src>/hero/<name>.jpg
 *   <src>/categories/<category>/<name>.jpg
 *   <src>/cities/<name>.jpg
 *   <src>/scenes/<scene>/<name>.jpg
 *   <src>/venues/<name>.jpg
 *
 * Usage:
 *   node scripts/ingest-imagery.mjs --src ./stock-library --dry-run
 *   node scripts/ingest-imagery.mjs --src ./stock-library --out supabase/seed/imagery-map.json
 *
 * Flags:
 *   --src <dir>       library root (default: env STOCK_LIBRARY_DIR or ./stock-library)
 *   --bucket <name>   storage bucket (default: event-images)
 *   --prefix <path>   key prefix inside the bucket (default: stock)
 *   --out <file>      mapping JSON output (default: supabase/seed/imagery-map.json)
 *   --dry-run         convert + map only; no network, no upload, creds optional
 *   --quality <n>     AVIF quality 1-100 (default: 62)
 *
 * Idempotent: stable deterministic object paths + upsert, so re-runs overwrite
 * in place rather than duplicating.
 */

import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname, basename, dirname } from 'node:path'

// ── CLI ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--dry-run') a.dryRun = true
    else if (t === '--src') a.src = argv[++i]
    else if (t === '--bucket') a.bucket = argv[++i]
    else if (t === '--prefix') a.prefix = argv[++i]
    else if (t === '--out') a.out = argv[++i]
    else if (t === '--quality') a.quality = Number(argv[++i])
    else if (t.startsWith('--')) throw new Error(`Unknown flag: ${t} (this script is storage-only; there are no table flags)`)
  }
  return a
}

const args = parseArgs(process.argv.slice(2))
const SRC = args.src || process.env.STOCK_LIBRARY_DIR || './stock-library'
const BUCKET = args.bucket || 'event-images'
const PREFIX = (args.prefix || 'stock').replace(/^\/+|\/+$/g, '')
const OUT = args.out || 'supabase/seed/imagery-map.json'
const QUALITY = Number.isFinite(args.quality) ? args.quality : 62
const DRY = args.dryRun

// Responsive widths per role. Sources smaller than a target are not upscaled.
const WIDTHS = {
  hero: [1280, 1920, 2560],
  categories: [480, 960, 1440],
  scenes: [480, 960, 1440],
  cities: [400, 800, 1200],
  venues: [400, 800, 1200],
}
const ROLES = Object.keys(WIDTHS)
const GROUPED = new Set(['categories', 'scenes']) // these roles nest one folder deep
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'])

// ── env (only needed when actually uploading) ───────────────────────────────
function loadEnvLocal() {
  if (!existsSync('.env.local')) return
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

/**
 * Storage-only client. Returns an object exposing ONLY `.storage`; touching
 * any data surface throws. This is the structural "hard-refuses data tables"
 * guard, not just a comment.
 */
function storageOnlyClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for upload (use --dry-run to skip the network)')
  }
  const raw = createClient(url, key, { auth: { persistSession: false } })
  const deny = (name) => () => {
    throw new Error(`ingest-imagery is storage-only: refusing ${name}() (data tables are off-limits)`)
  }
  return {
    publicUrlBase: `${url.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}`,
    storage: raw.storage,
    from: deny('from'),
    rpc: deny('rpc'),
    schema: deny('schema'),
  }
}

// ── walk ────────────────────────────────────────────────────────────────────
function listImages(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => IMG_EXT.has(extname(n).toLowerCase()))
    .map((n) => join(dir, n))
    .filter((f) => statSync(f).isFile())
}
function listSubdirs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory())
}
function slugify(name) {
  return basename(name, extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Build the work list: one record per (role, group, source file). */
function collectSources() {
  const work = []
  for (const role of ROLES) {
    const roleDir = join(SRC, role)
    if (GROUPED.has(role)) {
      for (const group of listSubdirs(roleDir)) {
        for (const file of listImages(join(roleDir, group))) {
          work.push({ role, group, slug: slugify(file), file })
        }
      }
    } else {
      for (const file of listImages(roleDir)) {
        work.push({ role, group: null, slug: slugify(file), file })
      }
    }
  }
  return work
}

// ── convert + (optionally) upload ───────────────────────────────────────────
async function processOne(rec, client) {
  const input = readFileSync(rec.file)
  const srcMeta = await sharp(input).metadata()
  const srcWidth = srcMeta.width || 0
  const targets = WIDTHS[rec.role]
  const keyBase = [PREFIX, rec.role, rec.group, rec.slug].filter(Boolean).join('/')

  const seenWidth = new Set()
  const sizes = []
  for (const target of targets) {
    const buf = await sharp(input)
      .resize({ width: target, withoutEnlargement: true })
      .avif({ quality: QUALITY })
      .toBuffer()
    const actualWidth = (await sharp(buf).metadata()).width || target
    if (seenWidth.has(actualWidth)) continue // small source collapsed two targets
    seenWidth.add(actualWidth)

    const path = `${keyBase}-${actualWidth}.avif`
    let url
    if (DRY) {
      const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '')
      url = base ? `${base}/storage/v1/object/public/${BUCKET}/${path}` : null
    } else {
      const { error } = await client.storage
        .from(BUCKET)
        .upload(path, buf, { contentType: 'image/avif', cacheControl: '31536000', upsert: true })
      if (error) {
        if (/mime type .*avif.* not supported/i.test(error.message)) {
          throw new Error(
            `upload failed for ${path}: ${error.message}. The "${BUCKET}" bucket must allow image/avif. ` +
              'Add it to the bucket allowed MIME types (see docs/LAUNCH-RUNBOOK.md, storage section) before ingesting the real library.',
          )
        }
        throw new Error(`upload failed for ${path}: ${error.message}`)
      }
      url = `${client.publicUrlBase}/${path}`
    }
    sizes.push({ width: actualWidth, path, url, bytes: buf.length })
  }

  return {
    role: rec.role,
    group: rec.group,
    slug: rec.slug,
    source: rec.file.replace(/\\/g, '/'),
    sourceWidth: srcWidth,
    sizes,
    default: sizes.length ? sizes[sizes.length - 1].url : null,
  }
}

async function main() {
  loadEnvLocal() // read .env.local for the public URL base (no network in dry-run)
  const client = DRY ? null : storageOnlyClient()

  const sources = collectSources()
  if (sources.length === 0) {
    console.error(`No images found under ${SRC}/{hero,categories/*,cities,scenes/*,venues}. Nothing to do.`)
  }

  const images = []
  let renditions = 0
  for (const rec of sources) {
    const entry = await processOne(rec, client)
    renditions += entry.sizes.length
    images.push(entry)
    console.log(`${DRY ? '[dry] ' : ''}${entry.role}${entry.group ? '/' + entry.group : ''}/${entry.slug}: ${entry.sizes.length} sizes`)
  }

  const map = {
    bucket: BUCKET,
    prefix: PREFIX,
    dryRun: DRY,
    generatedAt: new Date().toISOString(),
    counts: { sources: images.length, renditions },
    images,
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(map, null, 2) + '\n')
  console.log(`\n${DRY ? 'DRY-RUN: ' : ''}wrote ${images.length} sources / ${renditions} renditions to ${OUT}`)
}

main().catch((e) => {
  console.error('ingest-imagery failed:', e.message)
  // Set the code and let the event loop drain; calling process.exit() here can
  // abort mid-teardown of the HTTP client on Windows.
  process.exitCode = 1
})
