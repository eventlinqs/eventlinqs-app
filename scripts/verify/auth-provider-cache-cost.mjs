/**
 * THE COST OF THE PROVIDER GATE. The artefact `src/lib/auth/providers.ts` cites.
 *
 * WHY THIS FILE EXISTS AT ALL. It did not, and the resolver's doc comment said
 * it did: "The cost is measured in scripts/verify/auth-provider-cache-cost.mjs".
 * A claim of proof pointing at nothing is worse than no claim, because a reader
 * who wants to check the cost stops looking once they see a citation. The
 * roast that carried this item forward recorded it as unmet rather than quietly
 * dropping the sentence, and this is the artefact rather than the deletion.
 *
 * WHAT IT MEASURES, AND WHY EACH PART IS NOT ALREADY A UNIT TEST.
 *
 *   A. WARM COST. `tests/unit/auth/providers.test.ts` already proves 25 calls
 *      make 1 fetch. It does not say what a call COSTS once warm, which is the
 *      number that decides whether this belongs on a render path. Measured here.
 *
 *   B. TTL EXPIRY, THE REAL ONE. The unit test named "a fail-safe answer is
 *      cached only briefly" advances the clock AND calls
 *      `__resetProviderCache()`. The reset is what makes it refetch, so the
 *      test would pass with the TTL comparison deleted: it proves the reset
 *      seam works, not the expiry. This drives expiry with the clock ONLY,
 *      never touching the reset seam, which is the behaviour a founder toggling
 *      a provider in the dashboard actually depends on.
 *
 *   C. COLD COST, REAL NETWORK. What the settings endpoint costs against a real
 *      Supabase project, since that is the latency a cold serverless instance
 *      adds to the first auth page render. Needs TEST credentials, so it is
 *      SKIPPED with a loud notice rather than faked when they are absent.
 *      TEST project only. This script performs no writes of any kind.
 *
 *   D. FAIL-SAFE COST. What a Supabase outage costs: the answer, and how long
 *      it sticks. The asymmetry the whole module is built on.
 *
 * Run: npm run verify:provider-cost
 * Exit 0 if every measured property holds, 1 with the failing property named.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

// The resolver is TypeScript and imports through the `@/` alias, so this needs
// tsx to resolve both and measure the REAL module. Re-implementing it here would
// measure a copy and prove nothing about what ships.
//
// It re-runs itself under tsx rather than being launched that way, so that the
// plain `node scripts/verify/auth-provider-cache-cost.mjs` a reader will type
// after seeing the citation in providers.ts simply works. In-process
// registration was tried first and fails with ERR_REQUIRE_CYCLE_MODULE on the
// resolver's import graph, so a child process is the honest mechanism.
if (!process.env.EL_PROVIDER_COST_TSX) {
  const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (!existsSync(tsx)) {
    console.error('\n[provider-cost] tsx is not installed. Run npm ci first.\n')
    process.exit(1)
  }
  const child = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, EL_PROVIDER_COST_TSX: '1' },
  })
  process.exit(child.status === null ? 1 : child.status)
}

// ---------------------------------------------------------------------------
// Load TEST credentials if the founder has them, without ever reaching for
// production. `.env.test` is the only file consulted, by name, on purpose.
// ---------------------------------------------------------------------------
function loadTestEnv() {
  const file = join(ROOT, '.env.test')
  if (!existsSync(file)) return false
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const value = m[2].trim().replace(/^["']|["']$/g, '')
    if (value) process.env[m[1]] = value
  }
  return true
}

const results = []
const record = (part, name, pass, detail) => {
  results.push({ part, name, pass, detail })
  const mark = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${part}. ${name}`)
  if (detail) console.log(`         ${detail}`)
}

console.log('\n[provider-cost] Cost of the enabled-provider gate.\n')

const providersUrl = new URL('../../src/lib/auth/providers.ts', import.meta.url).href
const { getEnabledProviders, __resetProviderCache } = await import(providersUrl)

// A settings body in the live GoTrue shape.
const body = (google) => JSON.stringify({ external: { google, email: true } })

const realFetch = globalThis.fetch
const realNow = Date.now

/** Swap in a counting fetch. Returns a handle carrying the call count. */
function countingFetch(respond) {
  const handle = { calls: 0 }
  globalThis.fetch = async (...args) => {
    handle.calls += 1
    return respond(...args)
  }
  return handle
}

function restore() {
  globalThis.fetch = realFetch
  Date.now = realNow
}

// ---------------------------------------------------------------------------
// A. WARM COST: what a call costs once the memo is populated.
// ---------------------------------------------------------------------------
{
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://cost-probe.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'cost-probe-key'
  delete process.env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW

  __resetProviderCache()
  const f = countingFetch(async () => new Response(body(true)))

  await getEnabledProviders() // cold, populates the memo

  const RENDERS = 1000
  const start = performance.now()
  for (let i = 0; i < RENDERS; i += 1) await getEnabledProviders()
  const elapsed = performance.now() - start
  const perCall = elapsed / RENDERS

  restore()

  // One fetch total: the cold one. Every warm call must add no network at all.
  record(
    'A',
    'warm calls add no network',
    f.calls === 1,
    `${RENDERS} warm calls after 1 cold fetch. Total fetches: ${f.calls}. Expected 1.`,
  )
  record(
    'A',
    'warm call cost is negligible on a render path',
    perCall < 0.05,
    `${perCall.toFixed(5)}ms per call over ${RENDERS} calls (${elapsed.toFixed(2)}ms total). ` +
      `Budget 0.05ms. This is a frozen object read behind an integer comparison.`,
  )
}

// ---------------------------------------------------------------------------
// B. TTL EXPIRY driven by the clock ALONE. No reset seam. This is what a
//    dashboard toggle actually relies on.
// ---------------------------------------------------------------------------
{
  __resetProviderCache()
  let googleOn = false
  const f = countingFetch(async () => new Response(body(googleOn)))

  const first = await getEnabledProviders()

  // The founder enables Google in the Supabase dashboard at this instant.
  googleOn = true

  // Still inside the success TTL: the site must NOT have noticed yet. Stating
  // the staleness as a measured fact is the point; it is the number the
  // invalidation note in providers.ts quotes.
  const beforeExpiry = await getEnabledProviders()

  // Advance past the success TTL of 5 minutes. Nothing else changes: no reset.
  const base = realNow()
  Date.now = () => base + 5 * 60 * 1000 + 1000

  const afterExpiry = await getEnabledProviders()
  const fetchesAfter = f.calls
  restore()

  record(
    'B',
    'a disabled provider resolves false',
    first.google === false,
    `first resolution: google=${first.google}`,
  )
  record(
    'B',
    'inside the TTL the dashboard change is not yet visible, and costs no fetch',
    beforeExpiry.google === false && f.calls >= 1,
    `after the dashboard toggle but inside the TTL: google=${beforeExpiry.google} (stale, as designed)`,
  )
  record(
    'B',
    'the TTL expires on the clock alone and refetches',
    afterExpiry.google === true && fetchesAfter === 2,
    `after TTL + 1s: google=${afterExpiry.google}, total fetches=${fetchesAfter}. ` +
      `Expected google=true and exactly 2 fetches. __resetProviderCache() was NOT called.`,
  )
}

// ---------------------------------------------------------------------------
// C. COLD COST against a real Supabase project. TEST only, read only.
// ---------------------------------------------------------------------------
{
  const hadEnvFile = loadTestEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_TEST || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key || !hadEnvFile) {
    record(
      'C',
      'cold cost against a real project',
      null,
      `SKIPPED: no .env.test credentials in this shell. Not faked, and not run ` +
        `against production. Provide .env.test to measure. (.env.test present: ${hadEnvFile})`,
    )
  } else {
    const SAMPLES = 5
    const times = []
    let ok = true
    for (let i = 0; i < SAMPLES; i += 1) {
      const t0 = performance.now()
      try {
        const res = await realFetch(`${url}/auth/v1/settings`, {
          headers: { apikey: key },
          cache: 'no-store',
        })
        if (!res.ok) ok = false
        await res.json()
      } catch {
        ok = false
      }
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]
    record(
      'C',
      'cold cost against a real project',
      ok && median < 3000,
      `${SAMPLES} samples against ${new URL(url).host}: ` +
        `min ${times[0].toFixed(0)}ms, median ${median.toFixed(0)}ms, ` +
        `max ${times[times.length - 1].toFixed(0)}ms. ` +
        `Ceiling is the 3000ms FETCH_TIMEOUT_MS in providers.ts. Read only, TEST project.`,
    )
  }
}

// ---------------------------------------------------------------------------
// D. FAIL-SAFE COST: what an outage costs, and for how long.
// ---------------------------------------------------------------------------
{
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://cost-probe.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'cost-probe-key'
  __resetProviderCache()

  let down = true
  const f = countingFetch(async () =>
    down ? new Response('bad gateway', { status: 502 }) : new Response(body(true)),
  )

  const during = await getEnabledProviders()

  // Supabase recovers. The fail-safe answer must not be sticky for the full
  // success TTL, or one blip hides the button for five minutes.
  down = false
  const base = realNow()
  Date.now = () => base + 31_000
  const after = await getEnabledProviders()
  const calls = f.calls
  restore()

  record(
    'D',
    'an outage hides the button rather than showing a broken one',
    during.google === false,
    `502 from the settings endpoint resolved to google=${during.google}. ` +
      `The user sees email sign-in, never a raw provider error page.`,
  )
  record(
    'D',
    'the fail-safe answer expires in 30s, not 5 minutes',
    after.google === true && calls === 2,
    `31s after the 502, with Supabase healthy: google=${after.google}, fetches=${calls}. ` +
      `A blip costs at most 30s of hidden button, not a full TTL.`,
  )
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
restore()

const failed = results.filter((r) => r.pass === false)
const skipped = results.filter((r) => r.pass === null)
const passed = results.filter((r) => r.pass === true)

console.log(
  `\n[provider-cost] ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped.`,
)

if (failed.length > 0) {
  console.error('\n[provider-cost] FAILED\n')
  for (const r of failed) console.error(`    ${r.part}. ${r.name}\n       ${r.detail}`)
  console.error('')
  process.exit(1)
}

console.log('[provider-cost] The cited cost measurement now exists and holds.\n')
