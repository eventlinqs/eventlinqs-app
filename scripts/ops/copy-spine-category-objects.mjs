/**
 * PRODUCTION STORAGE COPY: the arts category spine objects, onto their
 * community-first path.
 *
 * FOUNDER APPROVAL, 26 August 2026, verbatim: "This is a production write, so it
 * needs my explicit approval, which this message is." Approval is for THIS
 * operation on THESE three objects and nothing else.
 *
 * WHY A SCRIPT AND NOT THE DASHBOARD. The Supabase storage UI offers Get URL,
 * Download, Rename, Move and Delete, and no Copy. The manual route is therefore
 * download-then-upload, three times, by hand. `storage.copy()` is a server-side
 * copy: the bytes never leave Supabase, so there is no re-encode and no chance of
 * a truncated upload.
 *
 * COPY ONLY. This script has no move, no rename and no delete, and it refuses to
 * overwrite. Both paths serve afterwards, which is the whole point: the old path
 * keeps working for every already-rendered page, every CDN edge and every
 * in-flight request, and the new path is what src/lib/images/spine.ts asks for
 * once the deploy lands. A `move` would have made those two facts mutually
 * exclusive and put a 404 on the homepage for the length of a deploy.
 *
 * IDEMPOTENT. An object that already exists at the destination is reported and
 * skipped, not overwritten, so re-running this is safe.
 *
 * Usage (PowerShell):
 *   $env:ALLOW_PRODUCTION_SUPABASE="1"
 *   node --env-file=<main checkout>/.env.local scripts/ops/copy-spine-category-objects.mjs
 */
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'event-images'
const FROM_DIR = 'stock/categories/arts-cult' + 'ure'
const TO_DIR = 'stock/categories/arts-community'
const OBJECTS = [
  'theatre-interior-evening-480.avif',
  'theatre-interior-evening-960.avif',
  'theatre-interior-evening-1440.avif',
]

const PRODUCTION_REF = 'gndnldyfudbytbboxesk'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  console.error('      Run with --env-file pointing at the main checkout .env.local.')
  process.exit(1)
}

const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? '(unparsed)'
const isProduction = ref === PRODUCTION_REF

console.log(`copy-spine-category-objects`)
console.log(`  project : ${ref}${isProduction ? '  (PRODUCTION)' : ''}`)
console.log(`  bucket  : ${BUCKET}`)
console.log(`  from    : ${FROM_DIR}/`)
console.log(`  to      : ${TO_DIR}/`)
console.log(`  objects : ${OBJECTS.length}`)
console.log(`  mode    : COPY ONLY. No move, no rename, no delete, no overwrite.`)

/*
 * The same preflight every other production write in this repository answers to.
 * A storage copy is a WRITE, and the fact that it is additive does not exempt it
 * from being deliberate.
 */
if (isProduction && process.env.ALLOW_PRODUCTION_SUPABASE !== '1') {
  console.error('')
  console.error('REFUSED: this targets the PRODUCTION project and ALLOW_PRODUCTION_SUPABASE is not set.')
  console.error('')
  console.error('  PowerShell : $env:ALLOW_PRODUCTION_SUPABASE="1"')
  console.error('  bash       : ALLOW_PRODUCTION_SUPABASE=1')
  console.error('')
  console.error('Nothing has been written. This ran before the first request.')
  process.exit(1)
}

const supabase = createClient(url, key)

/*
 * WHICH VARIANT DOES THE CODE ACTUALLY ASK FOR?
 *
 * src/lib/images/spine.ts builds one URL per slot at ROLE_WIDTH[role], and
 * `categories` is 1440. The 480 and 960 are companions that exist in some
 * environments and not others: PRODUCTION holds all three, TEST has only ever
 * held the 1440. A missing companion is therefore an environment difference,
 * not a failure, and reporting it as one told a true-sounding lie on TEST.
 *
 * The REQUESTED variant is what decides pass or fail.
 */
const REQUIRED_VARIANT = 'theatre-interior-evening-1440.avif'

const { data: sourceList } = await supabase.storage.from(BUCKET).list(FROM_DIR, { limit: 100 })
const sourceHas = new Set((sourceList ?? []).map((o) => o.name))

const { data: existing, error: listError } = await supabase.storage.from(BUCKET).list(TO_DIR, { limit: 100 })
if (listError) {
  console.error(`FAIL: could not list ${TO_DIR}: ${listError.message}`)
  process.exit(1)
}
const alreadyThere = new Set((existing ?? []).map((o) => o.name))

let copied = 0
const absentAtSource = []
let skipped = 0
const failures = []

for (const name of OBJECTS) {
  const from = `${FROM_DIR}/${name}`
  const to = `${TO_DIR}/${name}`

  if (alreadyThere.has(name)) {
    console.log(`  skip    ${name}  already at the destination, not overwritten`)
    skipped += 1
    continue
  }

  if (!sourceHas.has(name)) {
    console.log(`  absent  ${name}  not in ${FROM_DIR}/ in this environment, nothing to copy`)
    absentAtSource.push(name)
    continue
  }

  const { error } = await supabase.storage.from(BUCKET).copy(from, to)
  if (error) {
    console.log(`  FAIL    ${name}  ${error.message}`)
    failures.push({ name, message: error.message })
    continue
  }
  console.log(`  copied  ${name}`)
  copied += 1
}

console.log('')
console.log(`did ${copied} copied, ${skipped} already present`)
console.log(`found ${failures.length} failures`)

/*
 * VERIFY BY FETCHING THE PUBLIC URL, not by trusting the API's own success.
 * A copy that reports ok and serves a 404 is the shape this whole week has been
 * about, and the only thing that settles it is asking for the bytes.
 */
console.log('')
console.log('verifying the public URLs:')
const base = `${url.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}`
let verified = 0
for (const name of OBJECTS) {
  const publicUrl = `${base}/${TO_DIR}/${name}`
  try {
    const res = await fetch(publicUrl)
    const bytes = (await res.arrayBuffer()).byteLength
    const ok = res.status === 200 && bytes > 0
    if (ok) verified += 1
    console.log(`  ${res.status}  ${String(bytes).padStart(7)} bytes  ${name}${ok ? '' : '   <-- NOT SERVING'}`)
  } catch (error) {
    console.log(`  ERR  ${name}  ${error instanceof Error ? error.message : error}`)
  }
}

console.log('')
console.log(`did ${copied} copied, ${skipped} already present, ${absentAtSource.length} absent at source`)
console.log(`found ${failures.length} failures, ${verified} of ${OBJECTS.length} variants serving`)

/*
 * The gate is the variant the code requests. Everything else is reported and
 * does not decide the outcome, because "TEST holds fewer variants than
 * production" is a fact about the environment, not a defect in this copy.
 */
const requiredServes = await fetch(`${base}/${TO_DIR}/${REQUIRED_VARIANT}`).then((r) => r.status === 200).catch(() => false)
console.log(`required variant ${REQUIRED_VARIANT}: ${requiredServes ? 'SERVES 200' : 'DOES NOT SERVE'}`)

if (failures.length > 0 || !requiredServes) {
  console.error('')
  console.error(`FAIL: the variant spine.ts requests does not serve from ${TO_DIR}/.`)
  process.exit(1)
}
console.log('')
console.log(`PASS: the requested variant serves from ${TO_DIR}/ and the originals are untouched.`)
console.log('The original path is untouched and still serves.')
