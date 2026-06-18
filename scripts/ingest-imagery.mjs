/**
 * Imagery ingestion pipeline (photo day).
 *
 * The founder drops licensed photos into one flat folder (design-assets/incoming/),
 * names each by the convention below, and runs ONE command. The script validates
 * each source against a dimension + quality floor, converts to responsive AVIF at
 * the platform's locked sizes, uploads the renditions to the Supabase storage
 * bucket, and writes a manifest mapping each image to its category / scene / city
 * slot so seed data and fixtures can reference them.
 *
 * Founder runbook: docs/PHOTO-DAY.md (drop files, run one command, done).
 *
 * STORAGE ONLY - the production double-guard. This script never reads or writes a
 * database table. The Supabase client is wrapped so only `.storage` is reachable;
 * any attempt to call `.from(table)`, `.rpc(...)`, `.auth`, `.schema(...)` throws.
 * It cannot touch a seed row. Seeding rows is the seed-events skill's job, run
 * separately and applied by the founder. The output is a manifest, nothing else.
 *
 * ── Naming convention (flat folder, the photo-day way) ──────────────────────
 *   <role>__<key>__<city>__<descriptor>.<ext>
 *   fields are split on the DOUBLE underscore "__" so kebab slugs (hip-hop-rnb,
 *   inner-west) stay intact; use the literal word "none" for an absent field.
 *
 *   role        one of: hero | category | scene | city | venue
 *   key         the category slug (role=category) or scene slug (role=scene),
 *               else "none"   (city/venue/hero carry their slot in <city> or none)
 *   city        the city slug (sydney, melbourne, ...) or "none"
 *   descriptor  free kebab text for humans + uniqueness within the slot
 *
 *   Examples:
 *     hero__none__none__summer-festival-night.jpg
 *     category__music__sydney__harbour-rooftop.jpg
 *     category__hip-hop-rnb__melbourne__laneway-set.jpg
 *     scene__afrobeats-amapiano__none__crowd-hands-up.jpg
 *     city__none__sydney__harbour-dusk.jpg
 *     venue__none__sydney__the-forum-interior.jpg
 *
 *   Valid slugs are the platform taxonomy, not invented: category slugs are the
 *   real `event_categories` set, scene slugs are the locked Scene layer in
 *   CLAUDE.md, city slugs are the launch cities. The script validates FORMAT
 *   (kebab + the role set), not membership, so the taxonomy stays a single source
 *   of truth and never drifts into this file (Law 3).
 *
 * ── Back-compat (the folder-tree library the seed-events skill documents) ────
 *   A nested tree under <src> is also read, so an existing library still works:
 *     <src>/hero/<name>.jpg
 *     <src>/categories/<category>/<name>.jpg
 *     <src>/scenes/<scene>/<name>.jpg
 *     <src>/cities/<name>.jpg
 *     <src>/venues/<name>.jpg
 *
 * Usage:
 *   node scripts/ingest-imagery.mjs --dry-run                 # validate + map, no network
 *   node scripts/ingest-imagery.mjs                           # validate + convert + upload + map
 *   node scripts/ingest-imagery.mjs --src ./other --out map.json
 *
 * Flags:
 *   --src <dir>       library root (default: env STOCK_LIBRARY_DIR or design-assets/incoming)
 *   --bucket <name>   storage bucket (default: event-images)
 *   --prefix <path>   key prefix inside the bucket (default: stock)
 *   --out <file>      manifest output (default: supabase/seed/imagery-map.json)
 *   --dry-run         convert + validate + map only; no network, no upload, creds optional
 *   --quality <n>     AVIF quality 1-100 (default: 62)
 *   --force           process despite validation failures (logged as warnings, exit 0)
 *
 * Idempotent: stable deterministic object paths + upsert, so re-runs overwrite in
 * place rather than duplicating. A run that finds any rejected source exits 1
 * (unless --force) so photo day fails loudly and the founder fixes the file.
 */

import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname, basename, dirname } from 'node:path'

// ── CLI ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { dryRun: false, force: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--dry-run') a.dryRun = true
    else if (t === '--force') a.force = true
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
const SRC = args.src || process.env.STOCK_LIBRARY_DIR || 'design-assets/incoming'
const BUCKET = args.bucket || 'event-images'
const PREFIX = (args.prefix || 'stock').replace(/^\/+|\/+$/g, '')
const OUT = args.out || 'supabase/seed/imagery-map.json'
const QUALITY = Number.isFinite(args.quality) ? args.quality : 62
const DRY = args.dryRun
const FORCE = args.force

// Responsive widths per role. Sources smaller than a target are not upscaled.
// Aligned to docs/MEDIA-ARCHITECTURE.md (full-bleed hero ~1920, card/tile, rail).
const WIDTHS = {
  hero: [1280, 1920, 2560],
  categories: [480, 960, 1440],
  scenes: [480, 960, 1440],
  cities: [400, 800, 1200],
  venues: [400, 800, 1200],
}
const ROLES = Object.keys(WIDTHS)
const GROUPED = new Set(['categories', 'scenes']) // these roles nest one folder deep in tree mode
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'])

// Map the founder-facing singular role word to the internal (plural) role key.
const ROLE_ALIAS = {
  hero: 'hero',
  category: 'categories', categories: 'categories',
  scene: 'scenes', scenes: 'scenes',
  city: 'cities', cities: 'cities',
  venue: 'venues', venues: 'venues',
}

// ── validation floor (dimension + quality) ──────────────────────────────────
// The largest responsive target per role is the dimension floor: a source below
// it would have to be upscaled (a soft hero / blurry tile is a Law 1 defect).
const MIN_WIDTH = { hero: 1920, categories: 1440, scenes: 1440, cities: 1200, venues: 1200 }
const MIN_HEIGHT = 600 // a too-short source is unusable as a hero or a landscape tile
const MIN_BYTES = 40 * 1024 // crude "not a thumbnail / not garbage" floor; the real quality gate is dimensions

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const isSlugOrNone = (s) => s === 'none' || SLUG_RE.test(s)

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
 * Storage-only client. Returns an object exposing ONLY `.storage`; touching any
 * data surface throws. This is the structural "hard-refuses data tables" guard,
 * not just a comment - the production double-guard.
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
    auth: deny('auth'),
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

/**
 * Parse a flat-folder filename by the photo-day convention.
 * Returns { rec } on success or { error } describing the fix.
 */
function parseConventionName(file) {
  const base = basename(file, extname(file))
  const parts = base.split('__')
  if (parts.length !== 4) {
    return { error: `name must be role__key__city__descriptor (4 fields split on "__"), got "${base}"` }
  }
  const [roleWord, key, city, descriptor] = parts.map((p) => p.trim().toLowerCase())
  const role = ROLE_ALIAS[roleWord]
  if (!role) return { error: `unknown role "${roleWord}" (use hero | category | scene | city | venue)` }
  if (!isSlugOrNone(key)) return { error: `key "${key}" must be a kebab slug or "none"` }
  if (!isSlugOrNone(city)) return { error: `city "${city}" must be a kebab slug or "none"` }
  if (!descriptor || !SLUG_RE.test(descriptor)) return { error: `descriptor "${descriptor}" must be kebab text` }
  return {
    rec: {
      mode: 'flat',
      role,
      key: key === 'none' ? null : key,
      city: city === 'none' ? null : city,
      descriptor,
      file,
    },
  }
}

/** Build the work list from BOTH the flat convention files and the folder tree. */
function collectSources() {
  const work = []
  const nameErrors = []

  // (1) Flat convention files at the library root (the photo-day default).
  for (const file of listImages(SRC)) {
    const parsed = parseConventionName(file)
    if (parsed.error) nameErrors.push({ file: file.replace(/\\/g, '/'), error: parsed.error })
    else work.push(parsed.rec)
  }

  // (2) Back-compat folder tree (hero/, categories/<cat>/, cities/, scenes/<scene>/, venues/).
  for (const role of ROLES) {
    const roleDir = join(SRC, role)
    if (GROUPED.has(role)) {
      for (const group of listSubdirs(roleDir)) {
        for (const file of listImages(join(roleDir, group))) {
          work.push({ mode: 'tree', role, key: group, city: null, descriptor: slugify(file), file })
        }
      }
    } else {
      for (const file of listImages(roleDir)) {
        work.push({ mode: 'tree', role, key: null, city: null, descriptor: slugify(file), file })
      }
    }
  }

  return { work, nameErrors }
}

/** Dimension + quality floor. Returns { ok } or { ok:false, reason }. */
function validateSource(rec, meta, bytes) {
  const w = meta.width || 0
  const h = meta.height || 0
  const floor = MIN_WIDTH[rec.role]
  if (!w || !h) return { ok: false, reason: 'unreadable image (no dimensions)' }
  if (w < floor) return { ok: false, reason: `width ${w}px below the ${rec.role} floor ${floor}px (would upscale)` }
  if (h < MIN_HEIGHT) return { ok: false, reason: `height ${h}px below the ${MIN_HEIGHT}px floor` }
  if (bytes < MIN_BYTES) return { ok: false, reason: `file ${(bytes / 1024).toFixed(0)}KB below the ${MIN_BYTES / 1024}KB quality floor` }
  return { ok: true }
}

function slotPath(rec) {
  // stock/<role>/<key?>/<city?>/<descriptor>
  return [PREFIX, rec.role, rec.key, rec.city, rec.descriptor].filter(Boolean).join('/')
}
function slotLabel(rec) {
  return [rec.role, rec.key, rec.city, rec.descriptor].filter(Boolean).join('/')
}

// ── convert + (optionally) upload ───────────────────────────────────────────
async function processOne(rec, client) {
  const input = readFileSync(rec.file)
  const srcMeta = await sharp(input).metadata()

  const v = validateSource(rec, srcMeta, input.length)
  if (!v.ok && !FORCE) {
    return { rejected: { slot: slotLabel(rec), source: rec.file.replace(/\\/g, '/'), reason: v.reason } }
  }
  if (!v.ok && FORCE) {
    console.warn(`  ! [--force] ${slotLabel(rec)}: ${v.reason}`)
  }

  const srcWidth = srcMeta.width || 0
  const srcHeight = srcMeta.height || 0
  const targets = WIDTHS[rec.role]
  const keyBase = slotPath(rec)

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
              'Add it to the bucket allowed MIME types (see docs/PHOTO-DAY.md, prerequisites) before ingesting the real library.',
          )
        }
        throw new Error(`upload failed for ${path}: ${error.message}`)
      }
      url = `${client.publicUrlBase}/${path}`
    }
    sizes.push({ width: actualWidth, path, url, bytes: buf.length })
  }

  return {
    entry: {
      role: rec.role,
      key: rec.key,
      city: rec.city,
      descriptor: rec.descriptor,
      slot: slotLabel(rec),
      source: rec.file.replace(/\\/g, '/'),
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
      sizes,
      default: sizes.length ? sizes[sizes.length - 1].url : null,
    },
  }
}

async function main() {
  loadEnvLocal() // read .env.local for the public URL base (no network in dry-run)
  const client = DRY ? null : storageOnlyClient()

  const { work, nameErrors } = collectSources()
  for (const ne of nameErrors) console.error(`  x SKIP (bad name) ${ne.file}: ${ne.error}`)

  if (work.length === 0) {
    console.error(
      `No nameable images under ${SRC}. Drop files named role__key__city__descriptor.jpg ` +
        `(or use the hero/ categories/<cat>/ cities/ scenes/<scene>/ venues/ tree). See docs/PHOTO-DAY.md.`,
    )
  }

  const images = []
  const rejected = []
  let renditions = 0
  for (const rec of work) {
    const res = await processOne(rec, client)
    if (res.rejected) {
      rejected.push(res.rejected)
      console.error(`  x REJECT ${res.rejected.slot}: ${res.rejected.reason}`)
      continue
    }
    renditions += res.entry.sizes.length
    images.push(res.entry)
    console.log(`  ${DRY ? '[dry] ' : ''}${res.entry.slot}: ${res.entry.sizes.length} sizes`)
  }

  const nameErrorList = nameErrors.map((n) => ({ source: n.file, reason: n.error }))
  const map = {
    bucket: BUCKET,
    prefix: PREFIX,
    dryRun: DRY,
    generatedAt: new Date().toISOString(),
    counts: { sources: images.length, renditions, rejected: rejected.length + nameErrorList.length },
    rejected: [...nameErrorList, ...rejected],
    images,
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(map, null, 2) + '\n')

  const badCount = rejected.length + nameErrorList.length
  console.log(
    `\n${DRY ? 'DRY-RUN: ' : ''}wrote ${images.length} sources / ${renditions} renditions to ${OUT}` +
      (badCount ? ` (${badCount} rejected)` : ''),
  )
  if (badCount && !FORCE) {
    console.error(
      `\n${badCount} file(s) failed validation and were NOT processed. Fix or rename them and re-run, ` +
        `or pass --force to process anyway. Nothing was written to any database table.`,
    )
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('ingest-imagery failed:', e.message)
  // Set the code and let the event loop drain; calling process.exit() here can
  // abort mid-teardown of the HTTP client on Windows.
  process.exitCode = 1
})
