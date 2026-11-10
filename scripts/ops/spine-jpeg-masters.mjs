/**
 * THE SPINE'S JPEG MASTERS (Lawal's law of 10 November 2026, 13:30: one second, internal only; WINDOW 5A).
 *
 * WHY. The licensed spine (supabase/seed/imagery-map.json, 56 slots) is stored only as AVIF renditions, and
 * src/lib/images/spine.ts hands next/image the largest one. Vercel's optimiser serves an AVIF source BYTE FOR BYTE
 * whatever width is asked, measured on www on 10 November: Melbourne's hero at w=640 and w=828 both 200,228 bytes, the
 * source 200,228; while a JPEG source is resized (a 1,015,426 byte JPEG came back at 2,229 bytes for w=128). So every
 * phone downloads the 1,200 to 1,920 pixel originals as the LCP image of the guides, Victoria, the community pages and
 * home (Lighthouse: 'This image file is larger than it needs to be (1200x698) for its displayed dimensions').
 *
 * WHAT. For each slot, the largest guaranteed rendition (ROLE_WIDTH, read from src/lib/images/spine.ts) is read from
 * storage, decoded, and encoded as a JPEG master (mozjpeg, quality 92, full colour resolution: one generation past the
 * AVIF, invisible at the sizes the optimiser then makes), and uploaded BESIDE it as <descriptor>-<width>.jpg. The
 * optimiser then makes each phone's size from it. The original photographs are not on this machine, so the AVIF is
 * the master's source.
 *
 * NEW OBJECTS ONLY. No overwrite, no delete, no move: an object already at the path is read back and skipped, so a
 * rerun is safe, and the AVIF renditions keep serving every page rendered before the code change.
 *
 * THE SCRIPT PROVES ITSELF (law 10): every upload is read back from the public URL (200, image/jpeg, the width).
 *
 * Usage:
 *   TEST, from a checkout whose .env.local is TEST's (dry run, then --apply):
 *     node --env-file=.env.local scripts/ops/spine-jpeg-masters.mjs --project test [--apply]
 *   PRODUCTION, under the token wrapper (the service key is read from the Management API and held in memory only),
 *   and only with Lawal's approval quoted:
 *     powershell -File scripts/ops/with-supabase-token.ps1 node scripts/ops/spine-jpeg-masters.mjs --project production --approved-by-founder "<his words>" [--apply]
 */
import { appendFileSync, readFileSync, readSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BUCKET = 'event-images'
const PRODUCTION = 'gndnldyfudbytbboxesk'
const WRITES_LOG = 'C:\\dev\\PRODUCTION-WRITES.txt'
const QUALITY = 92
const args = process.argv.slice(2)
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const APPLY = args.includes('--apply')
const PROJECT = opt('--project')
const APPROVED = opt('--approved-by-founder')

/** A refusal stops the run before anything is written; the runner prints it and exits 2. */
class Refusal extends Error {}
const fail = (message) => {
  throw new Refusal(message)
}

/** ROLE_WIDTH, read from its one source, so the master is made from the rendition the page names today. */
function roleWidths() {
  const src = readFileSync(resolve(REPO, 'src', 'lib', 'images', 'spine.ts'), 'utf8')
  const block = src.match(/const ROLE_WIDTH: Record<SpineRole, number> = \{([^}]+)\}/)
  if (!block) fail('ROLE_WIDTH is not declared in src/lib/images/spine.ts')
  return Object.fromEntries([...block[1].matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]))
}

function askLine(question) {
  process.stdout.write(question)
  const buf = Buffer.alloc(256)
  let read = 0
  try {
    read = readSync(0, buf, 0, 256, null)
  } catch (error) {
    fail(`could not read the typed answer: ${error instanceof Error ? error.message : String(error)}`)
  }
  return buf.subarray(0, read).toString('utf8')
}

async function connection() {
  if (PROJECT === 'test') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).')
    if (url.includes(PRODUCTION)) fail('--project test was given, but the environment names PRODUCTION.')
    return { url, key, label: 'TEST' }
  }
  if (PROJECT === 'production') {
    if (!APPROVED || APPROVED.trim().length < 10) fail('production needs --approved-by-founder "<Lawal\'s words>": a production storage write is his to approve.')
    const token = process.env.SUPABASE_ACCESS_TOKEN
    if (!token) fail('run under scripts/ops/with-supabase-token.ps1: SUPABASE_ACCESS_TOKEN is not set.')
    const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) fail(`could not read the project's API keys (HTTP ${res.status}).`)
    const keys = await res.json()
    const service = (Array.isArray(keys) ? keys : []).find((k) => k?.name === 'service_role' && typeof k.api_key === 'string' && k.api_key.length > 0)
    if (!service) fail('no service_role key was returned; nothing was written.')
    return { url: `https://${PRODUCTION}.supabase.co`, key: service.api_key, label: 'PRODUCTION' }
  }
  return fail('--project test or --project production is required.')
}

async function readPublic(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'EventLinqs-ops-crawler/1.0 (spine-jpeg-masters)' } })
  if (!res.ok) return { status: res.status, type: res.headers.get('content-type'), bytes: null }
  return { status: res.status, type: res.headers.get('content-type'), bytes: Buffer.from(await res.arrayBuffer()) }
}

async function main() {
  const widths = roleWidths()
  const map = JSON.parse(readFileSync(resolve(REPO, 'supabase', 'seed', 'imagery-map.json'), 'utf8'))
  const slots = (map.images ?? []).map((e) => ({ slot: e.slot, role: e.role, width: widths[e.role], sizes: (e.sizes ?? []).map((s) => s.width) }))
  if (slots.length !== 56) fail(`imagery-map.json lists ${slots.length} slots, not the 56 the spine registry holds.`)
  for (const s of slots) if (!s.width || !s.sizes.includes(s.width)) fail(`${s.slot}: no ${s.width}-wide rendition is recorded.`)

  const { url, key, label } = await connection()
  const base = `${url.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/stock`
  console.log(`spine-jpeg-masters on ${label}: ${slots.length} slots; ${APPLY ? 'APPLY' : 'DRY RUN (nothing uploaded)'}`)

  const plan = []
  for (const s of slots) {
    const master = `${s.slot}-${s.width}.jpg`
    const existing = await readPublic(`${base}/${master}`)
    if (existing.status === 200) {
      plan.push({ ...s, master, skip: 'already there' })
      continue
    }
    const source = await readPublic(`${base}/${s.slot}-${s.width}.avif`)
    if ((source.status !== 200 || !source.bytes) && label === 'TEST') {
      // TEST's bucket has lacked scenes/faith-worship/community-worship-day-1440.avif since before this script (read
      // 10 November); a preview shows that slot's fallback either way. Production holds all 56 and refuses a gap.
      plan.push({ ...s, master, skip: `no AVIF source on TEST (${source.status})` })
      continue
    }
    if (source.status !== 200 || !source.bytes) fail(`${s.slot}-${s.width}.avif answered ${source.status}; nothing was written.`)
    const jpeg = await sharp(source.bytes).jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
    const meta = await sharp(jpeg).metadata()
    if (meta.width !== s.width) fail(`${s.slot}: the master came out ${meta.width} wide, not ${s.width}.`)
    plan.push({ ...s, master, jpeg, avifBytes: source.bytes.length })
  }
  const todo = plan.filter((p) => !p.skip)
  for (const p of plan) console.log(`  ${p.skip ? 'skip' : 'make'}  ${p.master}${p.skip ? `  (${p.skip})` : `  ${p.jpeg.length} bytes from a ${p.avifBytes} byte AVIF`}`)
  console.log(`${todo.length} to upload, ${plan.length - todo.length} already there.`)
  if (!APPLY || todo.length === 0) return 0

  if (askLine(`Type APPLY to upload ${todo.length} new JPEG master(s) to ${label} storage: `).trim() !== 'APPLY') fail('not applied: APPLY was not typed.')
  const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET)
  let done = 0
  for (const p of todo) {
    const { error } = await storage.upload(`stock/${p.master}`, p.jpeg, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
    if (error) fail(`upload of ${p.master} refused: ${error.message} (${done} uploaded before it).`)
    const back = await readPublic(`${base}/${p.master}`)
    const w = back.bytes ? (await sharp(back.bytes).metadata()).width : null
    if (back.status !== 200 || !String(back.type).startsWith('image/jpeg') || w !== p.width) fail(`${p.master} read back ${back.status} ${back.type} ${w} wide (${done} uploaded before it).`)
    done += 1
  }
  console.log(`UPLOADED AND READ BACK: ${done} JPEG master(s) on ${label}.`)
  if (label === 'PRODUCTION') {
    appendFileSync(WRITES_LOG, `${new Date().toISOString()} spine-jpeg-masters: ${done} new JPEG masters uploaded beside the AVIF renditions in ${BUCKET}/stock (no overwrite, no delete), each read back 200 image/jpeg at its width; approved: ${APPROVED}\n`)
  }
  return 0
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    if (error instanceof Refusal) console.error(`REFUSED: ${error.message}`)
    else console.error(`FAILED: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
    process.exitCode = error instanceof Refusal ? 2 : 1
  },
)
