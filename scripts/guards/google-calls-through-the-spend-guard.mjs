/**
 * GUARD: NO BILLED GOOGLE PLACES CALL WITHOUT THE COST GUARD.
 * The PROJECT MANAGER's note of 30 October 2026 (4.52 pm), on Lawal's order of a minute before:
 * free licensed venue photos first, "Google only for the rest, and Google stays OFF until Lawal says (he
 * wants the cost first)"; a daily quota and a monthly spend cap, the counter on /admin/today.
 *
 * WHY: the cap lives in the database (public.google_spend_reserve, migration *_google_spend_guard.sql) and holds only
 * if every call asks it first. A Places web service address written into a new file that never asks would spend with
 * no quota, no cap and no line on /admin/today, and nothing else in the build would say so.
 *
 * CLAUSES
 *   1  Every file under src/ whose code names a Places web service address (places.googleapis.com, or
 *      maps.googleapis.com/maps/api/place) imports withGoogleSpend from src/lib/google/spend-guard and calls it.
 *   2  src/lib/google/spend-guard.ts asks the database (google_spend_reserve) before it makes the call.
 *   3  The migration takes every reservation on the one settings row FOR UPDATE and starts with Google OFF.
 *
 * WHAT IT CANNOT SEE, said plainly: the browser's Maps JavaScript API (maps, Place Autocomplete) is billed to the
 * public key in the visitor's browser and never passes the server, so no server guard can count it; and the server
 * Geocoding call (src/lib/geo/geocode.ts) is a separate API this guard does not judge. Both are named here so the
 * counter is never read as the whole Google bill.
 *
 * Registered in run-guards.mjs; drilled in scripts/verify/guard-failure-drills.mjs.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '[google-calls-through-the-spend-guard]'
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

const PLACES = /places\.googleapis\.com|maps\.googleapis\.com\/maps\/api\/place/
const GUARD_MODULE = 'src/lib/google/spend-guard.ts'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?|mjs|mts)$/.test(name)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

let filesScanned = 0
const callers = []
for (const file of walk('src')) {
  filesScanned += 1
  const src = code(readFileSync(file, 'utf8'))
  if (!PLACES.test(src)) continue
  callers.push(file)
  const imports = /import\s*\{[^}]*\bwithGoogleSpend\b[^}]*\}\s*from\s*['"](@\/lib\/google\/spend-guard|\.\.?\/[^'"]*spend-guard)['"]/.test(src)
  if (!imports || !/\bwithGoogleSpend\s*\(/.test(src)) fail('1', `${file} names a Places web service address and never asks the cost guard (withGoogleSpend)`)
}
if (filesScanned < 500) fail('1', `only ${filesScanned} file(s) found under src; the scan cannot be trusted`)

if (!existsSync(GUARD_MODULE)) fail('2', `${GUARD_MODULE} is missing`)
else if (!/\.rpc\(\s*['"]google_spend_reserve['"]/.test(code(readFileSync(GUARD_MODULE, 'utf8')))) fail('2', `${GUARD_MODULE} no longer asks the database (google_spend_reserve) before the call`)

const migration = readdirSync('supabase/migrations').find((f) => f.endsWith('_google_spend_guard.sql'))
if (!migration) fail('3', 'the google_spend_guard migration is missing')
else {
  const sql = readFileSync(join('supabase/migrations', migration), 'utf8')
  if (!/from public\.google_spend_settings where id for update/.test(sql)) fail('3', `${migration} no longer serialises reservations on the settings row`)
  if (!/enabled boolean not null default false/.test(sql)) fail('3', `${migration} no longer starts with Google OFF`)
}

console.log(`${TAG} did ${filesScanned} file(s) scanned under src, ${callers.length} naming a Places web service address${callers.length ? `: ${callers.join(', ')}` : ''}`)
console.log(`${TAG} not judged, said so: the browser Maps JavaScript API and the server Geocoding call`)
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every billed Places call asks the cost guard first, and the guard starts with Google OFF`)
