/**
 * LOCK 3: CROSS-STORE AND CROSS-VARIABLE CONSISTENCY.
 *
 *   node scripts/check-env-stores.mjs                 both halves (local)
 *   node scripts/check-env-stores.mjs --mode=stores   the store inventory only
 *   node scripts/check-env-stores.mjs --mode=handshake  the cross-store proof only (CI)
 *   node scripts/check-env-stores.mjs --json out.json  also write the inventory
 *
 * WHAT THIS CHECKS THAT NOTHING ELSE CAN. The build guard sees the environment of
 * the ONE scope it is building, and the runtime sentinel sees the environment of
 * the ONE deployment it is serving. Neither can see:
 *
 *   - whether a variable also exists on a scope that FORBIDS it;
 *   - whether a variable every preview needs is PINNED to one git branch, so
 *     every other branch deploys without it;
 *   - whether a secret can be READ BACK out of the store by anyone with project
 *     access;
 *   - whether a variable that must live in TWO stores is missing from the second.
 *
 * Those are store facts, and this is where they are checked, against the same
 * `src/lib/env/manifest.mjs` the other locks read.
 *
 * THE CROSS-STORE EQUALITY PROOF. CRON_SECRET must be the same secret in Vercel
 * Production and in GitHub Actions. Neither store will reveal a sensitive value,
 * and printing one to compare them would defeat the point. So the comparison is
 * the AUTHENTICATION HANDSHAKE: the copy this process holds is presented as a
 * bearer token to the production deployment, which validates it against the
 * Vercel copy. 200 proves the two are byte-identical. 401 proves they differ or
 * one is absent. It is an exact equality test that leaks nothing, and it is
 * strictly stronger than comparing fingerprints, because it also proves the
 * deployment currently serving traffic actually holds the value.
 *
 * A CROSS-HOST REDIRECT WOULD BREAK THE PROOF, so the handshake refuses to
 * follow one. curl and fetch both DROP the Authorization header when a redirect
 * crosses to a different host, which turns a correct secret into a 401 and reads
 * exactly like a mismatch. This is not hypothetical: the post-deploy smoke gate
 * probed https://www.eventlinqs.com, which 301s to the canonical
 * https://www.eventlinqs.com.au, and the bearer never arrived.
 *
 * NEVER PRINTS A VALUE. Presence, scope, branch, length and an 8-character
 * fingerprint only.
 *
 * Exit 0 when every declared expectation holds, 1 otherwise. A capability this
 * run could not exercise is reported as NOT VERIFIED and is a FAILURE unless the
 * caller narrowed the mode on purpose, so a missing tool can never read as a pass.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { ENV_MANIFEST, CROSS_RULES, policyFor } from '../src/lib/env/manifest.mjs'
import { evaluateStores, formatFinding } from '../src/lib/env/manifest-checks.mjs'

const args = process.argv.slice(2)
const arg = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}
const mode = arg('mode') ?? 'all'
const jsonOut = arg('json')
const baseUrl = arg('base') ?? process.env.ENV_LOCK_BASE_URL ?? 'https://www.eventlinqs.com.au'

const VERCEL = ['--yes', 'vercel@55']
const SCOPES = ['production', 'preview', 'development']
const SCOPE_LABEL = { Production: 'production', Preview: 'preview', Development: 'development' }

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

function run(file, argv, opts = {}) {
  try {
    return { ok: true, out: execFileSync(file, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true, ...opts }) }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}\n${e.stderr ?? ''}` }
  }
}

/**
 * Parse `vercel env ls` into one record per (variable, scope, branch).
 *
 * The LISTING is the authoritative source for PRESENCE and SCOPE, and it is
 * never redacted. It is deliberately not used for the value: see readability
 * below.
 */
function parseEnvListing(text) {
  const records = []
  for (const line of text.split(/\r?\n/)) {
    const cells = line.trim().split(/\s{2,}/)
    // name | value | environments | age
    if (cells.length < 3) continue
    if (!/^[A-Z][A-Z0-9_]*$/.test(cells[0])) continue
    const name = cells[0]
    // THE `value` COLUMN IS DELIBERATELY NOT CAPTURED. `vercel env ls` prints
    // "Encrypted" for a genuinely sensitive record AND for a merely encrypted
    // one that `env pull` hands back in plain text. The two are visually
    // identical and only one is safe, so treating that column as an exposure
    // signal reports secrets as protected when they are readable. Exposure is
    // measured by what `env pull` actually returns, below, and by nothing else.
    for (const token of cells[2].split(',').map(s => s.trim()).filter(Boolean)) {
      const m = /^(Production|Preview|Development)(?:\s*\((.+)\))?$/.exec(token)
      if (!m) continue
      records.push({ name, scope: SCOPE_LABEL[m[1]], gitBranch: m[2] ?? null })
    }
  }
  return records
}

/**
 * Probe READ-BACK exposure for one scope.
 *
 * `vercel env pull` will not return a value the store holds as sensitive. That
 * single fact has burned this project twice, because "empty on pull" reads like
 * "not set" and is a different claim entirely. So this is used for exactly ONE
 * inference, the only one it supports: a value that COMES BACK proves the record
 * is NOT sensitive. A redacted result proves nothing on its own and is recorded
 * as unknown, which never fails a check. Whether that record is sensitive or
 * genuinely empty is settled by the build guard and the runtime sentinel, which
 * can both see the real value.
 *
 * THE REDACTION MARKER IS VERSION-DEPENDENT, and reading it wrong turns every
 * sensitive record into a false alarm. Vercel CLI 55 writes an empty string;
 * CLI 58 writes the literal `[SENSITIVE]`. Both mean "withheld". Both are
 * treated as withheld here so this check cannot start crying wolf the day the
 * CLI is upgraded.
 */
const REDACTED = new Set(['', '[SENSITIVE]', '[REDACTED]'])

/**
 * Pull one (scope, git branch) combination and return what came back.
 *
 * A BRANCH-PINNED RECORD IS ONLY VISIBLE TO A BRANCH-SCOPED PULL. A plain
 * `--environment=preview` pull resolves the scope-wide records and nothing that
 * is pinned to a git branch, so every pinned record used to fall through as
 * "unknown" and unknown never failed anything. Twenty-two records sat that way,
 * STRIPE_SECRET_KEY, CRON_SECRET, QUEUE_SECRET and HEALTH_CHECK_TOKEN among
 * them, while this script printed ALL CHECKS PASSED. Passing `--git-branch`
 * resolves exactly the environment that branch's deployments receive, so there
 * is now no record this cannot reach.
 *
 * Returns null ONLY when the pull itself failed, which the caller turns into a
 * loud failure rather than a silent unknown.
 */
function readabilityFor(scope, gitBranch) {
  const tmp = path.join(os.tmpdir(), `el-env-${crypto.randomBytes(8).toString('hex')}.env`)
  const argv = [...VERCEL, 'env', 'pull', tmp, `--environment=${scope}`]
  if (gitBranch) argv.push(`--git-branch=${gitBranch}`)
  argv.push('--yes')
  const res = run('npx', argv)
  if (!res.ok || !fs.existsSync(tmp)) return null
  const map = new Map()
  for (const line of fs.readFileSync(tmp, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i < 1 || !/^[A-Z][A-Z0-9_]*$/.test(line.slice(0, i))) continue
    let v = line.slice(i + 1)
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    map.set(line.slice(0, i), v)
  }
  fs.unlinkSync(tmp)
  return map
}

console.log(`\nLOCK 3  CROSS-STORE AND CROSS-VARIABLE CONSISTENCY`)
console.log(`manifest: ${ENV_MANIFEST.length} variables, ${CROSS_RULES.length} cross rules`)
console.log('='.repeat(74))

let inventory = null

// ── HALF ONE: the store inventory ──────────────────────────────────────────
if (mode === 'all' || mode === 'stores') {
  console.log('\nSTORE INVENTORY (Vercel scopes + GitHub Actions)')

  const listing = run('npx', [...VERCEL, 'env', 'ls'])
  if (!listing.ok) {
    record('the Vercel environment listing is readable', false, 'the Vercel CLI could not list the project. Run: npx vercel login')
  } else {
    const parsed = parseEnvListing(listing.out)
    record('the Vercel environment listing is readable', parsed.length > 0, `${parsed.length} scope records across ${new Set(parsed.map(r => r.name)).size} variables`)

    // EVERY distinct (scope, git branch) the listing mentions gets its own pull,
    // so no record class is left unmeasured. The scope-wide pull is always run
    // even when nothing is pinned there, because that is what covers the
    // ordinary records.
    const pairs = new Map()
    for (const scope of SCOPES) pairs.set(`${scope} `, { scope, gitBranch: null })
    for (const r of parsed) {
      if (r.gitBranch) pairs.set(`${r.scope} ${r.gitBranch}`, { scope: r.scope, gitBranch: r.gitBranch })
    }

    const pulled = new Map()
    const failedPulls = []
    for (const [key, pair] of pairs) {
      const map = readabilityFor(pair.scope, pair.gitBranch)
      pulled.set(key, map)
      if (map === null) failedPulls.push(pair.gitBranch ? `${pair.scope} (${pair.gitBranch})` : pair.scope)
    }
    record(
      'read-back exposure was measured for every scope and every pinned branch',
      failedPulls.length === 0,
      failedPulls.length === 0
        ? `${pairs.size} scope/branch combination(s) pulled, covering all ${parsed.length} records`
        : `could not pull: ${failedPulls.join('; ')}. Those records are reported UNASSESSED, never assumed safe.`,
    )

    const records = parsed.map(r => {
      const map = pulled.get(`${r.scope} ${r.gitBranch ?? ''}`)
      if (!map) return { ...r, readable: 'unassessed', length: 0, fp: null }
      const value = map.get(r.name)
      const isReadable = typeof value === 'string' && !REDACTED.has(value)
      return {
        ...r,
        readable: isReadable,
        length: isReadable ? value.length : 0,
        fp: isReadable ? crypto.createHash('sha256').update(value).digest('hex').slice(0, 8) : null,
      }
    })

    const gh = run('gh', ['secret', 'list'])
    const ghSecrets = gh.ok
      ? gh.out.split(/\r?\n/).map(l => l.split(/\s+/)[0]).filter(n => /^[A-Z][A-Z0-9_]*$/.test(n))
      : []
    record('the GitHub Actions secret list is readable', gh.ok, gh.ok ? `${ghSecrets.length} repository secrets` : 'gh could not list secrets. Run: gh auth status')

    inventory = { records, githubSecrets: ghSecrets, generatedFor: baseUrl }
    // This run DID measure exposure, on every scope and every pinned branch, so
    // it asks to be held to that claim: any record that slipped through
    // unmeasured is reported as a failure rather than quietly ignored.
    const verdict = evaluateStores(inventory, { exposureAssessed: true })
    if (verdict.findings.length === 0) {
      record('every manifest expectation holds across the stores', true, `${records.length} records checked`)
    } else {
      for (const f of verdict.findings) record(`${f.name} [${f.scope}]`, false, f.reason)
    }
  }
} else {
  console.log('\nSTORE INVENTORY: skipped by --mode')
}

// ── HALF TWO: the cross-store equality proof ───────────────────────────────
if (mode === 'all' || mode === 'handshake') {
  console.log('\nCROSS-STORE EQUALITY (the bearer handshake)')

  for (const rule of CROSS_RULES.filter(r => r.kind === 'crossStore')) {
    const held = process.env[rule.variable]
    if (!held || held.trim().length === 0) {
      record(
        `${rule.id}: this process holds a copy of ${rule.variable}`,
        false,
        `${rule.variable} is not in this process's environment, so the two stores cannot be compared. ` +
          `NOT VERIFIED is a failure, never a pass: in GitHub Actions set it from secrets.${rule.variable}.`,
      )
      continue
    }
    const fp = crypto.createHash('sha256').update(held.trim()).digest('hex').slice(0, 8)

    // No redirects. A cross-host redirect drops the Authorization header and
    // turns a correct secret into a 401 that reads exactly like a mismatch.
    let res
    try {
      res = await fetch(`${baseUrl}${rule.handshakePath}`, {
        headers: { authorization: `Bearer ${held.trim()}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(60000),
      })
    } catch (e) {
      record(`${rule.id}: ${baseUrl} is reachable`, false, String(e).slice(0, 140))
      continue
    }

    if (res.status >= 300 && res.status < 400) {
      record(
        `${rule.id}: ${baseUrl} answers without a redirect`,
        false,
        `${baseUrl}${rule.handshakePath} returned ${res.status} to ${res.headers.get('location') ?? 'an unnamed location'}. ` +
          `A bearer token is DROPPED across a cross-host redirect, so this probe can never authenticate. Point it at the canonical host.`,
      )
      continue
    }

    record(
      `${rule.id}: the Vercel Production copy and this store's copy are the SAME secret`,
      res.status === 200,
      res.status === 200
        ? `HTTP 200 from ${baseUrl}${rule.handshakePath} with the bearer this process holds (fp ${fp}). ` +
          `The deployment validated it against its own copy, so the two are byte-identical.`
        : `HTTP ${res.status}. The copy this process holds (fp ${fp}) is NOT the copy the production deployment holds, ` +
          `or the deployment has none. Re-set both stores from one generated value.`,
    )
  }
} else {
  console.log('\nCROSS-STORE EQUALITY: skipped by --mode')
}

if (jsonOut && inventory) {
  fs.writeFileSync(jsonOut, JSON.stringify(inventory, null, 2))
  console.log(`\ninventory written to ${jsonOut}`)
}

const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(74)}`)
if (failed.length === 0) {
  console.log(`ALL ${results.length} CHECKS PASSED.\n`)
  process.exit(0)
}
console.log(`${failed.length} of ${results.length} CHECKS FAILED:`)
for (const f of failed) console.log(`  - ${f.name}`)
console.log('')
process.exit(1)
