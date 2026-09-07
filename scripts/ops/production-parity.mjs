/**
 * PRODUCTION PARITY (close-out C16.2, 7 September 2026).
 *
 * THE FAILURE THIS EXISTS TO END. On 6 September 2026 two merges to main passed
 * every pull-request check and then failed to deploy: the production build was
 * blocked by the guards that probe the DATABASE THE BUILD WILL RUN AGAINST
 * (schema-ahead-of-code, event-lifecycle-installed), because production did not
 * carry the two C13 migrations, and CI on main then went red through the
 * preview-state guard, which saw main's newest deployment in ERROR. The pull
 * request passed because a preview build points at TEST, where the migrations
 * are applied, and nothing on a pull request asked the one question that
 * decides a production build: DOES PRODUCTION CARRY WHAT THIS TREE NEEDS?
 *
 * This script asks it, before a push and before a merge, against production:
 *
 *   1. SCHEMA PARITY. Every migration in supabase/migrations must be applied on
 *      the production project. A migration the tree carries and production has
 *      not applied is a production build that will be refused, so it is a FAIL
 *      here, naming the files and the founder's command. The applied list comes
 *      from the Supabase Management API with SUPABASE_ACCESS_TOKEN (the same
 *      call scripts/ci/types-drift-guard.mjs makes; locally the pre-push gate
 *      hands the CLI's stored token to this process, never printing it).
 *
 *   2. ENVIRONMENT PARITY. The production scope of the Vercel store must satisfy
 *      src/lib/env/manifest.mjs for the production scope: required variables
 *      present, forbidden variables absent, readable values well shaped. Read
 *      through GET /v10/projects/{idOrName}/env with decrypt=true
 *      (https://vercel.com/docs/rest-api/projects/retrieve-the-environment-variables-of-a-project-by-id-or-name,
 *      last updated 2026-09-06, fetched 2026-09-07): each record carries key,
 *      value, type (encrypted, plain, secret, sensitive, system), target and
 *      gitBranch. A record held as sensitive is not decrypted, so for those the
 *      store LISTING proves presence and the production build itself judges the
 *      shape (LOCK 2, scripts/check-public-env.mjs); that is stated in the
 *      output rather than passed silently. VERCEL_TOKEN is required in CI; on a
 *      developer machine without one the environment half SKIPS LOUDLY and the
 *      required CI job carries it, which is recorded, not hidden.
 *
 * NEVER PRINTS A VALUE. A name, a state, a length and an 8-character fingerprint
 * at most, the same discipline as every other env lock in this repository.
 *
 * Exit 0 when production carries every migration and the environment half found
 * nothing (or was skipped on a machine with no token); exit 1 otherwise.
 *
 * Runs as the `production-parity` step of scripts/ops/pre-push-gate.mjs and as
 * the `production parity` job in .github/workflows/ci.yml, which branch
 * protection on main requires (scripts/guards/branch-protection-required.mjs
 * holds that).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENV_MANIFEST, policyFor, shapeFor } from '../../src/lib/env/manifest.mjs'
import { checkShape, fingerprint } from '../../src/lib/env/manifest-checks.mjs'
import { resolveVercelToken } from '../lib/vercel-login.mjs'
import { declareWork } from '../lib/work-report.mjs'

export { judgeStoredLogin, resolveVercelToken, vercelCliAuthCandidates } from '../lib/vercel-login.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[production-parity]'

/** What this run did and found, for the claim contract (scripts/lib/work-report.mjs). */
const tally = { migrations: 0, pending: 0, records: 0, faults: 0, envSkipped: null }

export const PRODUCTION_PROJECT_REF = 'gndnldyfudbytbboxesk'
export const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

/** The migrations the repository carries that the target has not applied. */
export function computePendingMigrations(repoFiles, appliedVersions) {
  return repoFiles
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, version: (file.match(/^(\d+)/) || [])[1] || null }))
    .filter((m) => m.version && !appliedVersions.has(m.version))
}

/**
 * The production scope of a Vercel env listing, one record per variable name.
 * `readable` is true only when the API returned a decrypted value; a record the
 * store holds as sensitive is present but unreadable, and is judged for
 * presence only.
 */
export function productionEnvFromListing(envs) {
  const byName = new Map()
  for (const e of envs ?? []) {
    const targets = Array.isArray(e.target) ? e.target : e.target ? [e.target] : []
    if (!targets.includes('production')) continue
    if (e.gitBranch) continue
    const readable = e.type !== 'sensitive' && typeof e.value === 'string' && (e.decrypted === undefined || e.decrypted === true || e.decrypted === 'true')
    byName.set(e.key, { readable, value: readable ? e.value : null, type: e.type })
  }
  return byName
}

/**
 * Judge the production scope against the manifest. Returns findings; each is
 * {name, state, reason, length, fp} and never a value.
 */
export function judgeEnvParity(listing, manifest = ENV_MANIFEST) {
  const findings = []
  const notes = []
  for (const entry of manifest) {
    const policy = policyFor(entry, 'production')
    const rec = listing.get(entry.name)
    const present = Boolean(rec)
    if (policy === 'forbidden') {
      if (present) findings.push({ name: entry.name, state: 'forbidden-present', reason: `is FORBIDDEN on production but the store holds it. ${entry.describe}.`, length: rec.value ? rec.value.length : null, fp: rec.value ? fingerprint(rec.value) : null })
      continue
    }
    if (policy === 'required' && !present) {
      findings.push({ name: entry.name, state: 'missing', reason: `is REQUIRED on production and the store does not hold it. ${entry.describe}.`, length: 0, fp: null })
      continue
    }
    if (!present) continue
    if (!rec.readable) {
      notes.push({ name: entry.name, state: 'present-unreadable', reason: `present as ${rec.type}, not decrypted for this token; its shape is judged by the production build (LOCK 2)` })
      continue
    }
    const value = rec.value.trim()
    if (value.length === 0) {
      findings.push({ name: entry.name, state: 'empty', reason: `is present on production but EMPTY (the silent-failure class). ${entry.describe}.`, length: 0, fp: null })
      continue
    }
    const problem = checkShape(value, shapeFor(entry, 'production'))
    if (problem) findings.push({ name: entry.name, state: 'malformed', reason: `fails its declared shape on production: ${problem}`, length: value.length, fp: fingerprint(value) })
  }
  return { findings, notes }
}

function say(line) {
  console.log(`${TAG} ${line}`)
}
function fail(line) {
  console.error(`${TAG} ${line}`)
}

/**
 * The migrations a project has applied, listed through the Supabase Management
 * API (the same call scripts/ci/types-drift-guard.mjs makes). Read only. Shared
 * with scripts/ops/apply-production-migrations.mjs so the founder's step and
 * the gate agree on what "pending" means. Never throws: a rejected token and an
 * unreachable API come back as `{ ok: false, reason }` so the caller can say
 * which, and neither is ever mistaken for "nothing pending".
 */
export async function fetchAppliedMigrations(token, project) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/migrations`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const rejected = res.status === 401 || res.status === 403
      return {
        ok: false,
        status: res.status,
        reason: `HTTP ${res.status}${rejected ? ': the token is PRESENT but REJECTED, expired, revoked, or without access to this project' : ''}`,
      }
    }
    const body = await res.json()
    return { ok: true, status: res.status, applied: new Set((Array.isArray(body) ? body : []).map((m) => String(m.version))) }
  } catch (err) {
    return { ok: false, status: 0, reason: `could not reach the Supabase Management API: ${err.message}` }
  }
}

async function schemaParity() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const project = process.env.SUPABASE_PROJECT_ID || PRODUCTION_PROJECT_REF
  if (!token) {
    fail('FAIL schema: SUPABASE_ACCESS_TOKEN is not set, so what production has applied cannot be listed.')
    fail('  Locally the pre-push gate hands the Supabase CLI token to this step (scripts/ops/with-supabase-token.ps1);')
    fail('  in CI the repository secret SUPABASE_ACCESS_TOKEN must be set. This step does not guess.')
    return false
  }
  const listed = await fetchAppliedMigrations(token, project)
  if (!listed.ok) {
    fail(`FAIL schema: could not list applied migrations on ${project} (${listed.reason}).`)
    return false
  }
  const { applied } = listed
  const files = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR) : []
  const pending = computePendingMigrations(files, applied)
  tally.migrations = files.filter((f) => f.endsWith('.sql')).length
  tally.pending = pending.length
  say(`schema: ${tally.migrations} migration(s) in the tree, ${applied.size} applied on ${project}, ${pending.length} pending`)
  if (pending.length === 0) {
    say('schema: PASS - production carries every migration this tree needs')
    return true
  }
  fail(`FAIL schema: production ${project} is BEHIND this tree by ${pending.length} migration(s). A production build of this tree would be refused by the schema guards, exactly as main was on 6 September 2026:`)
  for (const p of pending) fail(`    ${p.file}`)
  fail('  Applying a migration to production is the founder\'s step (CLAUDE.md, Verification and gates, Migrations). One command, in PowerShell from the repo:')
  fail('    npm run migrate:production')
  fail('  It lists these files, asks for the production ref typed back, hands over the CLI\'s own prompts, proves the result and rests the CLI on TEST')
  fail('  (scripts/ops/apply-production-migrations.mjs; add `-- --dry-run` to list only).')
  fail('  Until then this tree cannot reach production, so it does not reach main.')
  return false
}

function vercelIds() {
  let projectId = process.env.VERCEL_PROJECT_ID
  let teamId = process.env.VERCEL_ORG_ID
  const file = join(ROOT, '.vercel', 'project.json')
  if ((!projectId || !teamId) && existsSync(file)) {
    try {
      const cfg = JSON.parse(readFileSync(file, 'utf8'))
      projectId = projectId || cfg.projectId
      teamId = teamId || cfg.orgId
    } catch (error) {
      console.warn(`${TAG} .vercel/project.json could not be read (${error.message}); falling back to VERCEL_PROJECT_ID and VERCEL_ORG_ID`)
    }
  }
  return { projectId, teamId }
}

/*
 * The Vercel token, in this order and never printed: VERCEL_TOKEN from the
 * environment, otherwise the login the Vercel CLI keeps on this machine,
 * refreshed through the CLI when it has expired. Lives in
 * scripts/lib/vercel-login.mjs since 7 September 2026 so the deployment-state
 * guard reads the same login; re-exported here so nothing that imported it
 * from this file moves.
 */

async function envParity() {
  const inCi = process.env.GITHUB_ACTIONS === 'true'
  const resolved = resolveVercelToken()
  const token = resolved.token
  if (!token) {
    if (inCi) {
      fail('FAIL environment: VERCEL_TOKEN is not set in CI, so the production store cannot be read. Add the repository secret.')
      return false
    }
    tally.envSkipped = `${resolved.reason}; the required CI job judges the store with the repository secret`
    console.warn(`${TAG} SKIP environment: ${resolved.reason}, so the production store was NOT judged here.`)
    console.warn(`${TAG}   The required CI job "production parity" judges it with the repository secret before any merge.`)
    console.warn(`${TAG}   To make the local half real: \`vercel login\` once on this machine (the login is read, never printed),`)
    console.warn(`${TAG}   or put a token with read access to the project in .env.local as VERCEL_TOKEN.`)
    return true
  }
  say(`environment: reading the production store with ${resolved.source}`)
  const { projectId, teamId } = vercelIds()
  if (!projectId || !teamId) {
    fail('FAIL environment: VERCEL_PROJECT_ID and VERCEL_ORG_ID are not available (env or .vercel/project.json).')
    return false
  }
  let body
  try {
    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}&decrypt=true`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      fail(`FAIL environment: GET /v10/projects/{id}/env answered HTTP ${res.status}.`)
      if (res.status === 401 || res.status === 403) fail('  The token is PRESENT but REJECTED, or lacks access to the project.')
      return false
    }
    body = await res.json()
  } catch (err) {
    fail(`FAIL environment: could not reach the Vercel API: ${err.message}`)
    return false
  }
  const envs = Array.isArray(body) ? body : body.envs ?? []
  const listing = productionEnvFromListing(envs)
  const { findings, notes } = judgeEnvParity(listing)
  tally.records = listing.size
  tally.faults = findings.length
  say(`environment: ${listing.size} production record(s) listed, ${ENV_MANIFEST.length} manifest entries judged, ${notes.length} present as sensitive (shape judged by the production build)`)
  if (typeof body.hiddenProductionEnvCount === 'number' && body.hiddenProductionEnvCount > 0) {
    say(`environment: note - the API reports ${body.hiddenProductionEnvCount} hidden production record(s) this token cannot list`)
  }
  for (const n of notes) say(`  present   ${n.name}: ${n.reason}`)
  if (findings.length === 0) {
    say('environment: PASS - the production store satisfies the manifest for every readable record')
    return true
  }
  fail(`FAIL environment: ${findings.length} production record(s) would refuse a production build:`)
  for (const f of findings) fail(`    ${f.name} [${f.state}] ${f.reason}${f.length !== null ? ` (length ${f.length}${f.fp ? `, fp ${f.fp}` : ''})` : ''}`)
  return false
}

const invokedDirectly = process.argv[1] && /production-parity\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const schemaOk = await schemaParity()
  const envOk = await envParity()
  declareWork('production-parity', {
    did: { 'migration compared against production': tally.migrations, 'production store record judged': tally.records },
    found: { 'migration pending on production': tally.pending, 'production store fault': tally.faults },
    zeroIsFine: tally.envSkipped ? { 'production store record judged': tally.envSkipped } : {},
    exitOnZero: false,
  })
  // exitCode rather than process.exit: on Windows, exiting while a fetch
  // socket is still closing trips a libuv assertion and the code reads 127.
  if (schemaOk && envOk) {
    say('PASS - a production build of this tree would not be refused for a migration or an environment record')
    process.exitCode = 0
  } else {
    fail('FAIL - this tree is not at parity with production; a merge would go red on main and fail to deploy')
    process.exitCode = 1
  }
}
