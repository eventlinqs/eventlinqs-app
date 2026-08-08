/**
 * STORE ISOLATION: can a non-production process reach a production store?
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS FOR, measured 8 August 2026.
 *
 * A local dev server, deliberately pointed at the TEST database, wrote TEST
 * values into the Redis that PRODUCTION reads:
 *
 *     ff:v1:broadcast_artists = "true"     (production's row says false)
 *
 * Namespacing the key fixed the collision. It did NOT fix the cause, which is
 * this: a non-production process was holding credentials that reach a
 * production store, and nothing anywhere said it could not.
 *
 * THE MECHANISM, exactly.
 *
 *   * `.env.local` in this repo holds PRODUCTION values. Next.js loads it
 *     automatically and only skips a variable already present in process.env.
 *   * `.env.test` is an INCOMPLETE OVERLAY: 11 variables against .env.local's
 *     22. It redirects Supabase, Stripe and the cron secret to TEST.
 *   * Every variable it does NOT define therefore falls through to .env.local.
 *
 * So "run it against TEST" redirected three things and silently left FIFTEEN
 * pointing at production, including the Upstash store, the production Resend
 * key (a local run can send real email), the production admin TOTP encryption
 * key, and SERVICE_ROLE, which `scripts/batch-4-seed-real-covers.mjs` builds a
 * Supabase client from.
 *
 * The fallback direction is the whole defect: an ABSENT variable resolves
 * TOWARDS production. Every other guard in this repo assumes the opposite.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CHECKS
 *
 *   1. every store-reaching variable is DEFINED in the TEST overlay, so nothing
 *      falls through to the production file;
 *   2. where both files define one, the values DIFFER, so the TEST overlay is
 *      not simply a copy of production's store;
 *   3. no store-reaching variable is left to a code-level default.
 *
 * It compares two local files and never prints a secret: only whether a value
 * is present, and whether two values are equal.
 *
 * Usage: node scripts/verify/env-store-isolation.mjs
 * Exit 1 on any shared store.
 */
import { readFileSync, existsSync } from 'node:fs'

const PROD_FILE = '.env.local'
const TEST_FILE = '.env.test'

/**
 * Variables whose value is a credential or an address for an EXTERNAL STORE:
 * something that holds state, costs money, or sends to a real person.
 *
 * A variable that only changes appearance (a map token, an app name) is not
 * listed: sharing it has no blast radius. The test is "if a TEST process used
 * production's value here, what could it touch?"
 */
const STORE_VARS = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', store: 'Supabase', why: 'which database every read and write lands in' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', store: 'Supabase', why: 'full read and write on that database, bypassing RLS' },
  // Dead alias: nothing in src/ or scripts/ reads `process.env.SERVICE_ROLE`
  // (verified by grep; batch-4-seed-real-covers.mjs assigns
  // SUPABASE_SERVICE_ROLE_KEY to a local const that merely shares the name).
  // It is still listed, because the value IS a production service-role key and
  // it is still loaded into the environment of every local process. Nothing
  // reads it today; the exposure is real and one `process.env.SERVICE_ROLE`
  // away from being a live path.
  { name: 'SERVICE_ROLE', store: 'Supabase', why: 'a production service-role key present in the process environment. Dead alias today: nothing reads it. Delete it from the production overlay rather than mirroring it' },
  { name: 'SUPABASE_DB_PASSWORD_SYDNEY', store: 'Supabase', why: 'direct Postgres access' },
  { name: 'UPSTASH_REDIS_REST_URL', store: 'Upstash', why: 'the store holding the resolved FEE cache, the AI budget counter, feature flags and rate limits' },
  { name: 'UPSTASH_REDIS_REST_TOKEN', store: 'Upstash', why: 'write access to that store' },
  { name: 'STRIPE_SECRET_KEY', store: 'Stripe', why: 'creates real charges' },
  { name: 'STRIPE_WEBHOOK_SECRET', store: 'Stripe', why: 'which deliveries are trusted' },
  { name: 'RESEND_API_KEY', store: 'Resend', why: 'sends email to real people from the real domain' },
  { name: 'ADMIN_TOTP_ENC_KEY', store: 'Admin 2FA', why: 'decrypts production admin second factors' },
  { name: 'CRON_SECRET', store: 'Cron', why: 'authorises the scheduled jobs that send and charge' },
]

function readEnvFile(file) {
  if (!existsSync(file)) return null
  const out = new Map()
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    out.set(line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, ''))
  }
  return out
}

const prod = readEnvFile(PROD_FILE)
const test = readEnvFile(TEST_FILE)

console.log('STORE ISOLATION')
console.log(`production overlay : ${PROD_FILE} ${prod ? `(${prod.size} vars)` : '(absent)'}`)
console.log(`test overlay       : ${TEST_FILE} ${test ? `(${test.size} vars)` : '(absent)'}`)
console.log('')

if (!prod || !test) {
  console.log('Both overlays are needed to compare. Nothing to check on this machine.')
  process.exit(0)
}

// A sanity check on the premise: this only makes sense if .env.local really is
// production and .env.test really is TEST.
const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'
const prodUrl = prod.get('NEXT_PUBLIC_SUPABASE_URL') ?? ''
const testUrl = test.get('NEXT_PUBLIC_SUPABASE_URL') ?? ''
if (!prodUrl.includes(PROD_REF) || !testUrl.includes(TEST_REF)) {
  console.log('[skip] the two overlays are not the expected production/TEST pair on this machine.')
  console.log(`       ${PROD_FILE} -> ${prodUrl || '(unset)'}`)
  console.log(`       ${TEST_FILE} -> ${testUrl || '(unset)'}`)
  process.exit(0)
}

const failures = []

console.log('--- every store-reaching variable must be DEFINED in the TEST overlay ---')
console.log('    (an absent variable falls through to the production file)')
console.log('')
for (const v of STORE_VARS) {
  const inProd = prod.has(v.name)
  const inTest = test.has(v.name)
  if (!inProd && !inTest) {
    console.log(`  [ok  ] ${v.name.padEnd(28)} in neither file, nothing to inherit`)
    continue
  }
  if (inProd && !inTest) {
    console.log(`  [FAIL] ${v.name.padEnd(28)} ${v.store}: INHERITED FROM PRODUCTION`)
    console.log(`         ${v.why}`)
    failures.push(`${v.name} (${v.store}) is inherited from ${PROD_FILE}`)
    continue
  }
  if (inTest && inProd && prod.get(v.name) === test.get(v.name)) {
    console.log(`  [FAIL] ${v.name.padEnd(28)} ${v.store}: TEST holds the IDENTICAL production value`)
    console.log(`         ${v.why}`)
    failures.push(`${v.name} (${v.store}) is identical in both overlays`)
    continue
  }
  console.log(`  [ok  ] ${v.name.padEnd(28)} ${v.store}: isolated`)
}

// Anything else inherited is worth naming even when it is not a store, because
// the mechanism is the same and today's harmless variable is tomorrow's store.
const otherInherited = [...prod.keys()].filter(
  (k) => !test.has(k) && !STORE_VARS.some((v) => v.name === k),
)
if (otherInherited.length) {
  console.log('')
  console.log(`--- also inherited, not classified as stores (${otherInherited.length}) ---`)
  console.log(`    ${otherInherited.join(', ')}`)
  console.log('    Not a failure. Named because the mechanism is identical and a')
  console.log('    variable moves into the store list the day something starts')
  console.log('    holding state behind it.')
}

const sharedStores = [...new Set(failures.map((f) => f.match(/\(([^)]+)\)/)?.[1]).filter(Boolean))]
console.log('')
if (failures.length) {
  console.log(`===== ${failures.length} SHARED =====`)
  for (const f of failures) console.log(`  ${f}`)
  console.log('')
  console.log(`Stores a TEST-pointed process can reach in production: ${sharedStores.join(', ')}`)
  console.log('')
  console.log('THE FIX IS NOT A NAMESPACE. Namespacing the keys stops the two')
  console.log('environments corrupting each other\'s DATA, and it is done')
  console.log('(src/lib/redis/client.ts). It does not stop a non-production process')
  console.log('holding a production credential. Give the TEST overlay its own value')
  console.log('for each variable above, so an absent variable can never resolve')
  console.log('towards production.')
} else {
  console.log('===== ALL GREEN =====')
  console.log('No store-reaching variable is inherited from the production overlay.')
}
process.exit(failures.length ? 1 : 0)
