/**
 * PRODUCTION WRITE PREFLIGHT - the control that puts the existing isolation rule
 * in the path of a `node scripts/...` invocation.
 *
 * WHY THIS EXISTS. `SUPABASE_ENV_ISOLATION` in src/lib/health/critical-env.mjs
 * already carries the right rule, the right severity and the right escape hatch,
 * and its own comment (lines 181 to 189) records the exact near-misses that
 * produced it. It was wired to two entry points only: `prebuild`
 * (scripts/check-public-env.mjs) and the runtime health sentinel
 * (src/lib/health/checks.ts). A script run is neither. So `.env.local`, which
 * points at the PRODUCTION project by design because the app genuinely runs
 * against production from this repo, was one `node scripts/seed-events.mjs`
 * away from a full RLS-bypassing write to the live database, with nothing
 * asking first. This module closes that gap without touching the env file and
 * without a second, drifting copy of the rule.
 *
 * IT DOES NOT REIMPLEMENT THE RULE. The production decision and the
 * ALLOW_PRODUCTION_SUPABASE handling come from the existing rule object:
 * this module looks up `SUPABASE_ENV_ISOLATION` in `CRITICAL_ENV_RULES` and
 * evaluates it through the shared `evalEnvRule`. If that rule is tightened,
 * this preflight tightens with it, with zero drift. Only the ref readers
 * (refFromUrl / refFromJwt) are imported directly, and only to NAME the
 * resolved project in the output.
 *
 * IT IS DELIBERATELY STRICTER THAN THE BUILD GUARD IN TWO WAYS, both of which
 * make it refuse more often and never less:
 *
 *   1. FAIL CLOSED ON AN UNREADABLE REF. The build guard passes when no ref can
 *      be read, and that is correct for a build: a fresh clone and CI (which
 *      uses https://example.supabase.co) must still build. A script is the
 *      opposite case. "I could not tell which database this is about to write
 *      to" is not a pass, so this refuses. The override does NOT cover this
 *      case: the fix is to make the target readable, not to wave it through.
 *   2. EVERY INVOCATION IS TREATED AS A LOCAL RUN. The rule exempts
 *      `target === 'production'`, because production resolving production is the
 *      entire point of production. That exemption belongs to a Vercel
 *      deployment, not to a laptop. VERCEL_ENV and NEXT_PUBLIC_VERCEL_ENV are
 *      therefore stripped from the bag handed to the rule, so a stray
 *      VERCEL_ENV in a shell cannot buy a script the production exemption.
 *
 * NOTHING HERE PRINTS KEY MATERIAL. The only identifier it ever emits is the
 * project ref, which refs.mjs documents (lines 18 to 22) as non-secret: it is
 * compiled into every production browser bundle. Keys are read to extract a ref
 * claim and are never logged, never packed into a message and never returned.
 *
 * USAGE. First executable statement of any write-capable script:
 *
 *   import { assertNotProduction } from './lib/production-write-preflight.mjs'
 *   assertNotProduction()
 *
 * A script that reads a specific env file rather than the repo default declares
 * it, so the preflight judges the same environment the script will actually use:
 *
 *   assertNotProduction({ envFile: '.env.test' })
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CRITICAL_ENV_RULES, evalEnvRule } from '../../src/lib/health/critical-env.mjs'
import { refFromJwt, refFromUrl } from '../../src/lib/env/refs.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

/**
 * The variables the isolation rule reads, plus the bare `SUPABASE_URL` some
 * scripts use.
 *
 * ALLOW_PRODUCTION_SUPABASE is deliberately NOT in this list. It is read from
 * the real environment ONLY, never from a file, so the approval is per run and
 * cannot be parked in .env.local and forgotten. A bypass that can be stored is
 * a bypass that gets stored once and silently disables the control forever,
 * which is the failure this whole preflight exists to end. The env manifest
 * already treats a STORED guard bypass as a violation in its own right
 * (tests/unit/security/env-manifest.test.ts), so this matches that posture.
 */
const RELEVANT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL_PREVIEW',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY_PREVIEW',
]

const nonEmpty = v => typeof v === 'string' && v.trim().length > 0

/** The repo's standard env-file shape. Deliberately the same parse the scripts use. */
function parseEnvFile(file) {
  const out = {}
  if (!existsSync(file)) return null
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (t === '' || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const value = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    // `KEY=` followed only by an inline comment is an EMPTY value, not a value
    // that happens to start with a hash. .env.local carries four of these.
    out[t.slice(0, i).trim()] = value.startsWith('#') ? '' : value
  }
  return out
}

/**
 * Build the environment this process will actually resolve, and remember where
 * each value came from so the output can name the source without naming a value.
 *
 * Precedence, highest first, matching how Node's --env-file and Next's loader
 * both behave: a variable already in the real environment wins over any file.
 */
function collectEnv(envFileHint) {
  const candidates = []
  if (envFileHint) candidates.push(resolve(process.cwd(), envFileHint))
  // The repo default, checked from the working directory and from the repo root,
  // because the scripts resolve it both ways.
  for (const c of [resolve(process.cwd(), '.env.local'), resolve(REPO_ROOT, '.env.local')]) {
    if (!candidates.includes(c)) candidates.push(c)
  }

  const bag = {}
  const origin = {}

  for (const name of RELEVANT) {
    if (nonEmpty(process.env[name])) {
      bag[name] = process.env[name]
      origin[name] = 'the process environment'
    }
  }

  for (const file of candidates) {
    const parsed = parseEnvFile(file)
    if (!parsed) continue
    const shown = relative(REPO_ROOT, file).split('\\').join('/') || file
    for (const name of RELEVANT) {
      if (bag[name] !== undefined) continue
      if (!nonEmpty(parsed[name])) continue
      bag[name] = parsed[name]
      origin[name] = shown
    }
  }

  // Some scripts read SUPABASE_URL rather than the public name. The rule reads
  // the public name, so mirror it across when only the bare one is set.
  if (!nonEmpty(bag.NEXT_PUBLIC_SUPABASE_URL) && nonEmpty(bag.SUPABASE_URL)) {
    bag.NEXT_PUBLIC_SUPABASE_URL = bag.SUPABASE_URL
    origin.NEXT_PUBLIC_SUPABASE_URL = origin.SUPABASE_URL
  }

  // The approval, from the real environment only. See RELEVANT above.
  if (nonEmpty(process.env.ALLOW_PRODUCTION_SUPABASE)) {
    bag.ALLOW_PRODUCTION_SUPABASE = process.env.ALLOW_PRODUCTION_SUPABASE
    origin.ALLOW_PRODUCTION_SUPABASE = 'the process environment'
  }

  return { bag, origin, candidates }
}

/** Which project the process resolves, and from which variable, by ref only. */
function describeTarget(bag, origin) {
  const urlVar = nonEmpty(bag.NEXT_PUBLIC_SUPABASE_URL_PREVIEW) ? 'NEXT_PUBLIC_SUPABASE_URL_PREVIEW' : 'NEXT_PUBLIC_SUPABASE_URL'
  const keyVar = nonEmpty(bag.SUPABASE_SERVICE_ROLE_KEY_PREVIEW) ? 'SUPABASE_SERVICE_ROLE_KEY_PREVIEW' : 'SUPABASE_SERVICE_ROLE_KEY'
  const urlRef = refFromUrl(bag[urlVar] ?? '')
  const keyRef = refFromJwt(bag[keyVar] ?? '')
  if (urlRef) return { ref: urlRef, from: `${urlVar} via ${origin[urlVar]}` }
  if (keyRef) return { ref: keyRef, from: `${keyVar} via ${origin[keyVar]}` }
  return { ref: '', from: '' }
}

function scriptName() {
  const entry = process.argv[1]
  if (!entry) return 'this script'
  const rel = relative(REPO_ROOT, entry).split('\\').join('/')
  return rel.startsWith('..') ? entry : rel
}

function refuse(lines) {
  const bar = '='.repeat(72)
  console.error('')
  console.error(bar)
  console.error('REFUSED BY THE PRODUCTION WRITE PREFLIGHT')
  console.error(bar)
  for (const l of lines) console.error(l)
  console.error(bar)
  console.error('')
  process.exit(1)
}

/**
 * Refuse to continue when this process resolves the PRODUCTION Supabase project.
 * Call it as the FIRST executable statement of any write-capable script.
 *
 * @param {{ envFile?: string }} [opts] envFile: the env file this script reads,
 *   when it is not the repo default `.env.local`.
 */
export function assertNotProduction(opts = {}) {
  const script = scriptName()
  const rule = CRITICAL_ENV_RULES.find(r => r.name === 'SUPABASE_ENV_ISOLATION')

  // The rule is the whole point. If it ever goes missing, this must not silently
  // become a no-op that reports success.
  if (!rule) {
    refuse([
      `Script          : ${script}`,
      '',
      'SUPABASE_ENV_ISOLATION was not found in CRITICAL_ENV_RULES',
      '(src/lib/health/critical-env.mjs). This preflight evaluates that rule and',
      'cannot judge the target without it, so it refuses rather than pass a check',
      'it did not actually perform.',
    ])
  }

  const { bag, origin, candidates } = collectEnv(opts.envFile)
  const target = describeTarget(bag, origin)

  // FAIL CLOSED. An unreadable target is not a pass. Checked before the rule,
  // because the rule treats "no ref anywhere" as ok and a script must not.
  if (!target.ref) {
    refuse([
      `Script          : ${script}`,
      'Resolved project: UNKNOWN',
      '',
      'No readable Supabase project ref could be resolved for this process.',
      'Neither the process environment nor any of these files supplied one:',
      ...candidates.map(c => `  ${relative(REPO_ROOT, c).split('\\').join('/') || c}`),
      '',
      'An unknown target is refused, not allowed. A script that cannot say which',
      'database it is about to write to must not write to one. ALLOW_PRODUCTION_SUPABASE',
      'does not cover this case: it approves a KNOWN production target, and there is',
      'nothing here to approve.',
      '',
      'Point the process at a project it can read, for example by sourcing .env.test,',
      'or declare the file this script reads:  assertNotProduction({ envFile: ".env.test" })',
    ])
  }

  // A script run is a local run. The rule's production exemption belongs to a
  // Vercel deployment, so it is not reachable from here.
  const judged = { ...bag }
  delete judged.VERCEL_ENV
  delete judged.NEXT_PUBLIC_VERCEL_ENV

  const verdict = evalEnvRule(rule, judged)

  if (!verdict.ok) {
    refuse([
      `Script          : ${script}`,
      `Resolved project: ${target.ref}  (PRODUCTION)`,
      `Resolved from   : ${target.from}`,
      '',
      'Nothing has been written. This ran before any Supabase client was',
      'constructed and before any request left this machine.',
      '',
      'Writing to the production project requires Lawal Adams\' explicit approval,',
      'given for that run. It is not implied by the script being convenient to run,',
      'by .env.local being the default file, or by a previous approval.',
      '',
      'To run this against TEST instead, point the process at the TEST project:',
      '  PowerShell : Get-Content .env.test | ForEach-Object { if ($_ -match \'^([A-Z0-9_]+)=(.*)$\') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] } }',
      '  bash       : set -a; . ./.env.test; set +a',
      '',
      'If this run IS an approved production write, state that explicitly:',
      `  PowerShell : $env:ALLOW_PRODUCTION_SUPABASE="1"; node ${script}`,
      `  bash       : ALLOW_PRODUCTION_SUPABASE=1 node ${script}`,
    ])
  }

  // The rule passed. Either the target is not production, or the override was
  // set. Say which, out loud, so an approved production run is never quiet.
  if (bag.ALLOW_PRODUCTION_SUPABASE === '1') {
    const bar = '!'.repeat(72)
    console.warn('')
    console.warn(bar)
    console.warn(`PRODUCTION WRITE APPROVED BY OVERRIDE  (ALLOW_PRODUCTION_SUPABASE=1)`)
    console.warn(`  script : ${script}`)
    console.warn(`  project: ${target.ref}`)
    console.warn(`  Every write from here lands in that project and bypasses RLS.`)
    console.warn(bar)
    console.warn('')
    return { ref: target.ref, override: true }
  }

  console.log(`[preflight] ${script}: project ${target.ref} (not production), from ${target.from}. Proceeding.`)
  return { ref: target.ref, override: false }
}

export default assertNotProduction
