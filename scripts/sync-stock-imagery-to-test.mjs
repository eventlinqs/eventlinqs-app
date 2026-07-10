/**
 * One-way sync of the licensed stock imagery spine from PRODUCTION storage
 * (public bucket, anonymous READ-ONLY fetch of public URLs; production is
 * never written) into the TEST project's storage, so TEST-pointed
 * environments (local dev, staging after the env flip) render the same
 * marketing imagery instead of 404ing every spine slot.
 *
 * The object list is derived from the slot tables in src/lib/images/spine.ts
 * (the exact URLs the app builds), so the sync covers precisely what the app
 * requests: nothing more, nothing less.
 *
 * Usage: node scripts/sync-stock-imagery-to-test.mjs
 * Reads TEST credentials from .env.test. Refuses to run if the target is the
 * production project.
 */
import fs from 'node:fs'

const PROD_REF = 'gndnldyfudbytbboxesk'
const SOURCE_BASE = `https://${PROD_REF}.supabase.co/storage/v1/object/public/event-images/stock`
const BUCKET_PATH = 'event-images'

// ── Load TEST env ────────────────────────────────────────────────────────────
const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const targetUrl = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!targetUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.test')
  process.exit(1)
}
if (targetUrl.includes(PROD_REF)) {
  console.error('SAFETY STOP: target is the PRODUCTION project. Refusing to write.')
  process.exit(1)
}

// ── Derive the object list from spine.ts ─────────────────────────────────────
const ROLE_WIDTH = { hero: 1920, categories: 1440, scenes: 1440, cities: 1200 }
const spine = fs.readFileSync('src/lib/images/spine.ts', 'utf8')
const slotRe =
  /\{\s*role:\s*'(hero|categories|scenes|cities)'\s*,\s*key:\s*(null|'[^']*')\s*,\s*city:\s*(null|'[^']*')\s*,\s*descriptor:\s*'([^']*)'/g
const objects = new Set()
let m
while ((m = slotRe.exec(spine)) !== null) {
  const [, role, keyRaw, cityRaw, descriptor] = m
  const key = keyRaw === 'null' ? null : keyRaw.slice(1, -1)
  const city = cityRaw === 'null' ? null : cityRaw.slice(1, -1)
  const path = [role, key, city, descriptor].filter(Boolean).join('/')
  objects.add(`${path}-${ROLE_WIDTH[role]}.avif`)
}
console.log(`Derived ${objects.size} spine objects from spine.ts`)

// ── Sync ─────────────────────────────────────────────────────────────────────
let copied = 0
let skipped = 0
const missing = []
const failed = []
for (const obj of objects) {
  const targetPublic = `${targetUrl}/storage/v1/object/public/${BUCKET_PATH}/stock/${obj}`
  const head = await fetch(targetPublic, { method: 'HEAD' })
  if (head.ok) {
    skipped++
    continue
  }
  const source = await fetch(`${SOURCE_BASE}/${obj}`)
  if (!source.ok) {
    missing.push(obj)
    continue
  }
  const body = Buffer.from(await source.arrayBuffer())
  const upload = await fetch(
    `${targetUrl}/storage/v1/object/${BUCKET_PATH}/stock/${obj}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'content-type': 'image/avif',
        'x-upsert': 'true',
      },
      body,
    },
  )
  if (upload.ok) {
    copied++
    console.log(`copied ${obj} (${Math.round(body.length / 1024)} KB)`)
  } else {
    failed.push(`${obj}: ${upload.status} ${await upload.text().then(t => t.slice(0, 120))}`)
  }
}

console.log(`\nDone. copied=${copied} already-present=${skipped} source-missing=${missing.length} failed=${failed.length}`)
if (missing.length) console.log('Source-missing (absent on production too):\n  ' + missing.join('\n  '))
if (failed.length) {
  console.log('FAILED uploads:\n  ' + failed.join('\n  '))
  process.exit(1)
}
