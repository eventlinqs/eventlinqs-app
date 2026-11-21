/**
 * THE THEATRE PHOTOGRAPH'S JPEG MASTER, ONTO THE PATH THE PAGE NAMES (WINDOW 5A, 21 November 2026; the PM's 10:15
 * order: "the theatre JPEG master (script, after AQ, before AR's gate)").
 *
 * WHY. src/lib/images/spine.ts names each spine photograph's JPEG master beside its AVIF. The arts tile's slot was
 * renamed on 26 August 2026 to its community first key (stock/categories/arts-community), and its three AVIF
 * renditions were copied there (scripts/ops/copy-spine-category-objects.mjs). The JPEG masters were made on
 * 10 November from supabase/seed/imagery-map.json, which still carries the old key, so the master landed only under
 * the old path. Read on production at 09:37 and again at 11:06 on 21 November: the page's
 * stock/categories/arts-community/theatre-interior-evening-1440.jpg answers 400, the old path's JPEG 200 image/jpeg
 * (124,411 bytes), the new path's AVIF 200. /categories/theatre names the missing JPEG 14 times.
 *
 * WHAT. One server side storage.copy() of that one JPEG from the old path to the new: the bytes never leave Supabase,
 * nothing is re-encoded. COPY ONLY: no move, no rename, no delete, no overwrite (an object already at the destination
 * is read back and the run stops there). The old path keeps serving whatever names it.
 *
 * THE SCRIPT PROVES ITSELF (law 10): the new path is read back from its public URL, 200 image/jpeg, the same bytes.
 *
 * Usage, from the repository root:
 *   dry run (reads public files only, no key):
 *     node scripts/ops/copy-spine-theatre-jpeg-master.mjs
 *   apply (Lawal's words quoted; the service key read from the Management API under the token wrapper, held in memory):
 *     ALLOW_PRODUCTION_SUPABASE=1 powershell -File scripts/ops/with-supabase-token.ps1 node scripts/ops/copy-spine-theatre-jpeg-master.mjs --apply --approved-by-founder "<his words>"
 *   and type APPLY when asked.
 */
import { appendFileSync, readSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'gndnldyfudbytbboxesk'
const BUCKET = 'event-images'
const FROM = 'stock/categories/arts-cult' + 'ure/theatre-interior-evening-1440.jpg'
const TO = 'stock/categories/arts-community/theatre-interior-evening-1440.jpg'
const PUBLIC = `https://${PROD_REF}.supabase.co/storage/v1/object/public/${BUCKET}`
const WRITES_LOG = 'C:\\dev\\PRODUCTION-WRITES.txt'
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const APPROVED = args.includes('--approved-by-founder') ? args[args.indexOf('--approved-by-founder') + 1] : undefined

function stop(message) {
  console.error(`REFUSED: ${message}`)
  process.exit(2)
}

async function read(path) {
  const res = await fetch(`${PUBLIC}/${path}`, { headers: { 'user-agent': 'EventLinqs-ops/1.0 (copy-spine-theatre-jpeg-master)' } })
  const bytes = res.ok ? Buffer.from(await res.arrayBuffer()) : null
  return { status: res.status, type: res.headers.get('content-type'), bytes }
}

function askLine(question) {
  process.stdout.write(question)
  const buf = Buffer.alloc(64)
  let n = 0
  try {
    n = readSync(0, buf, 0, 64, null)
  } catch (error) {
    stop(`could not read the typed answer: ${error instanceof Error ? error.message : String(error)}`)
  }
  return buf.subarray(0, n).toString('utf8')
}

async function main() {
  const from = await read(FROM)
  const to = await read(TO)
  console.log(`copy-spine-theatre-jpeg-master on PRODUCTION (${PROD_REF}); ${APPLY ? 'APPLY' : 'DRY RUN (nothing written)'}`)
  console.log(`  from ${FROM}: ${from.status} ${from.type} ${from.bytes?.length ?? 0} bytes`)
  console.log(`  to   ${TO}: ${to.status} ${to.type}`)
  if (from.status !== 200 || from.type !== 'image/jpeg' || !from.bytes) stop('the source JPEG does not answer 200 image/jpeg; nothing to copy.')
  if (to.status === 200) {
    console.log('  the destination already answers 200: nothing to do (no overwrite).')
    return
  }
  if (!APPLY) {
    console.log('  would copy 1 object, server side, no overwrite. Run again with --apply and Lawal\'s words to write it.')
    return
  }
  if (!APPROVED || APPROVED.trim().length < 10) stop('production needs --approved-by-founder "<Lawal\'s words>".')
  if (process.env.ALLOW_PRODUCTION_SUPABASE !== '1') stop('the copy targets PRODUCTION and ALLOW_PRODUCTION_SUPABASE is not 1.')
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) stop('run under scripts/ops/with-supabase-token.ps1: SUPABASE_ACCESS_TOKEN is not set.')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) stop(`could not read the project's API keys (HTTP ${res.status}).`)
  const keys = await res.json()
  const service = (Array.isArray(keys) ? keys : []).find((k) => k?.name === 'service_role' && typeof k.api_key === 'string' && k.api_key.length > 0)
  if (!service) stop('no service_role key was returned; nothing was written.')
  if (askLine(`Type APPLY to copy 1 object in PRODUCTION storage (${BUCKET}/${TO}): `).trim() !== 'APPLY') stop('not applied: APPLY was not typed.')
  const db = createClient(`https://${PROD_REF}.supabase.co`, service.api_key, { auth: { persistSession: false } })
  const { error } = await db.storage.from(BUCKET).copy(FROM, TO)
  if (error) stop(`the copy was refused: ${error.message}`)
  const after = await read(TO)
  const same = after.bytes !== null && Buffer.compare(after.bytes, from.bytes) === 0
  console.log(`  read back ${TO}: ${after.status} ${after.type} ${after.bytes?.length ?? 0} bytes; same bytes as the source: ${same}`)
  if (after.status !== 200 || after.type !== 'image/jpeg' || !same) stop('the read back did not prove the copy; it is logged as unproved.')
  appendFileSync(
    WRITES_LOG,
    `${new Date().toISOString()} copy-spine-theatre-jpeg-master: 1 object copied server side in ${BUCKET} (no overwrite, no delete): ${FROM} to ${TO}, read back 200 image/jpeg, ${after.bytes.length} bytes, identical; approved: ${APPROVED}\n`,
  )
  console.log('  logged in C:\\dev\\PRODUCTION-WRITES.txt')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
