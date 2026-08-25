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
import {
  connectWithDiagnosis,
  credentialSources,
  endpointsFor,
  hydrateEnvForAlias,
  isPlaceholder,
  parseConnectionString as parseConnectionStringShared,
  refForAlias,
  resolveCredential,
  targetFromArgv,
} from './db-credentials.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

/**
 * The variables the isolation rule reads, plus the bare `SUPABASE_URL` some
 * scripts use.
 *
 * ALLOW_PRODUCTION_SUPABASE is deliberately NOT in this list, so it is never
 * picked up by the file reader below. The approval must be per run and must not
 * be parkable in a file, because a bypass that can be stored is a bypass that
 * gets stored once and silently disables the control forever, which is the
 * failure this whole preflight exists to end. The env manifest already treats a
 * STORED guard bypass as a violation in its own right
 * (tests/unit/security/env-manifest.test.ts), so this matches that posture.
 *
 * KEEPING IT OUT OF THIS LIST IS NOT SUFFICIENT, AND SAYING SO IS THE POINT.
 * This comment previously claimed the approval "is read from the real
 * environment ONLY, never from a file". That claim was false, and a false claim
 * inside a security control is worse than no claim, because it is the sentence
 * the next reader trusts instead of checking.
 *
 * The hole: `node --env-file=<file>` writes the file's variables INTO
 * `process.env` before the script runs, so a bare `process.env` read cannot tell
 * a shell approval from a file approval. Node publishes the loading behaviour
 * and the precedence at https://nodejs.org/api/cli.html#--env-fileconfig
 * (fetched 15 August 2026): "Loads environment variables from a file relative to
 * the current directory, making them available to applications on process.env",
 * and "If the same variable is defined in the environment and in the file, the
 * value from the environment takes precedence."
 *
 * That hole matters here specifically because the runbook drives the purge
 * scripts as `node --env-file=<production env file> scripts/verify/...`, which
 * is exactly the invocation that would have loaded a parked approval.
 *
 * WHAT CLOSES IT, and what it can and cannot see. `--env-file` can only arrive
 * on the command line, and the command line is readable at `process.execArgv`.
 * Verified by execution on the pinned runtime, node v24.19.0:
 *
 *   node --env-file=probe.env -e "console.log(process.execArgv)"
 *     -> [ '--env-file=probe.env', '-e', ... ]        the flag is visible
 *   node --env-file probe.env -e "..."
 *     -> [ '--env-file', 'probe.env', '-e', ... ]     the spaced form too
 *   NODE_OPTIONS="--env-file=probe.env" node -e "..."
 *     -> node.exe: --env-file= is not allowed in NODE_OPTIONS
 *
 * The third line is the one that makes this reliable rather than best-effort:
 * there is no second, invisible path by which a file can inject the approval.
 * Node does not publish that refusal on the page above, so it is recorded here
 * as VERIFIED BY EXECUTION on v24.19.0 rather than cited, and the drill in
 * tests/unit/security/production-write-preflight-approval.test.ts re-measures it
 * so a future runtime that starts allowing it turns a test red here.
 *
 * So `approvalParkedInEnvFile()` reads every file named by a `--env-file` or
 * `--env-file-if-exists` flag and refuses the approval outright if any of them
 * defines ALLOW_PRODUCTION_SUPABASE. It CANNOT tell "shell only" from "shell and
 * file", because by the time the script runs those are the same string. So it
 * refuses both, which is stricter and never looser, matching the two other ways
 * this module is deliberately stricter than the build guard. The remedy is the
 * one we want anyway: take the approval out of the file and give it in the shell.
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

/** The name of the approval, written once so the scanner and the messages agree. */
const APPROVAL = 'ALLOW_PRODUCTION_SUPABASE'

/**
 * Every file this process loaded with --env-file, read off the command line.
 *
 * Both spellings Node accepts are handled, and both argument forms:
 *   --env-file=<path>   --env-file <path>
 *   --env-file-if-exists=<path>   --env-file-if-exists <path>
 *
 * Reasoning for reading execArgv rather than argv: execArgv holds the flags Node
 * itself consumed, which is where these land. See the header note for the
 * measurements that establish this is the only path in.
 */
function envFilesOnTheCommandLine() {
  const flags = ['--env-file', '--env-file-if-exists']
  const files = []
  const argv = process.execArgv
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    for (const flag of flags) {
      if (arg.startsWith(`${flag}=`)) {
        files.push(arg.slice(flag.length + 1))
      } else if (arg === flag && typeof argv[i + 1] === 'string') {
        files.push(argv[i + 1])
      }
    }
  }
  return files
}

/**
 * The file that parked the approval, or null.
 *
 * Returns the path as written on the command line, because that is the string
 * the person needs to open and edit, not a resolved absolute path they then have
 * to match back to what they typed.
 */
function approvalParkedInEnvFile() {
  for (const file of envFilesOnTheCommandLine()) {
    const parsed = parseEnvFile(resolve(process.cwd(), file))
    if (parsed && nonEmpty(parsed[APPROVAL])) return file
  }
  return null
}

/**
 * Computed once. The command line cannot change during a run, so neither can
 * this, and evaluating it at module load keeps both assert functions honest
 * without either being able to forget the check.
 */
const PARKED_APPROVAL = approvalParkedInEnvFile()

/** Is the approval present AND given in a way this module will honour? */
function approvalGiven() {
  return PARKED_APPROVAL === null && nonEmpty(process.env[APPROVAL])
}

/**
 * The extra lines a refusal carries when the approval WAS supplied but came from
 * a file. Without these the person sees the ordinary "requires approval" refusal
 * while looking straight at the approval they set, which is the confusing shape
 * this whole change exists to avoid.
 */
function parkedApprovalLines() {
  if (!PARKED_APPROVAL) return []
  return [
    '',
    `${APPROVAL} IS SET, AND IT IS BEING IGNORED ON PURPOSE.`,
    `It is defined in ${PARKED_APPROVAL}, which this process loaded with`,
    '--env-file. An approval that lives in a file is not an approval for THIS run:',
    'it approves every run from now on, including the ones nobody meant to make.',
    '',
    `Remove ${APPROVAL} from ${PARKED_APPROVAL}, then give it in the shell for the`,
    'one run you intend:',
  ]
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

  // The approval, and ONLY when it did not come out of a --env-file. See the
  // RELEVANT note above for why keeping it off the file-reader list was never
  // enough on its own.
  if (approvalGiven()) {
    bag[APPROVAL] = process.env[APPROVAL]
    origin[APPROVAL] = 'the process environment'
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
      ...(PARKED_APPROVAL
        ? parkedApprovalLines()
        : ['', 'If this run IS an approved production write, state that explicitly:']),
      `  PowerShell : $env:${APPROVAL}="1"; node ${script}`,
      `  bash       : ${APPROVAL}=1 node ${script}`,
    ])
  }

  // The rule passed. Either the target is not production, or the override was
  // set. Say which, out loud, so an approved production run is never quiet.
  if (approvalGiven() && bag[APPROVAL] === '1') {
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

// ── the direct Postgres path ────────────────────────────────────────────────
//
// A second transport to the same database, and a worse one. The Supabase client
// above authenticates as `service_role`, which bypasses RLS. A direct Postgres
// connection authenticates as `postgres`, which OWNS THE SCHEMA: it can DROP,
// ALTER and TRUNCATE, so an accident there is not a bad row, it is a missing
// table. Four scripts under scripts/verify/ used this transport with the
// production host written into the source as a string literal, which meant no
// environment variable could point them anywhere else. They are the reason this
// section exists.

/**
 * The project ref a Postgres connection target identifies.
 *
 * TWO SHAPES, and the second is exactly why reading the HOST alone is not
 * enough:
 *
 *   db.<ref>.supabase.co           direct connection. The ref is in the host.
 *   <region>.pooler.supabase.com   the shared pooler. The host identifies NO
 *                                  project at all: every project in the region
 *                                  answers on it. The ref is in the USERNAME,
 *                                  as `postgres.<ref>`.
 *
 * .env.test in this repo is the pooler shape, so a check that read only the
 * host would have resolved "no ref" for every real TEST connection and, worse,
 * would wave through a pooler URL whose username pointed at production. Both
 * positions are read, and the host wins when both are present.
 */
export function refFromDatabaseTarget({ host = '', user = '' } = {}) {
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(String(host).trim())
  if (direct) return direct[1].toLowerCase()
  const pooled = /^postgres\.([a-z0-9]+)$/i.exec(String(user).trim())
  if (pooled) return pooled[1].toLowerCase()
  return ''
}

/**
 * Split a Postgres connection string into its DISCRETE parts, by hand.
 *
 * WHY HAND-PARSED, AND WHY NOTHING MAY HAND `connectionString` TO pg AGAIN.
 * A Supabase database password routinely contains characters that are RESERVED
 * in a URL and are not percent-encoded, and the real SUPABASE_DB_URL value in
 * this repo is one of them. Two things follow:
 *
 *   1. `new URL(...)` throws on it, so the ref could never be read that way.
 *   2. `new pg.Client({ connectionString })` throws ERR_INVALID_URL, and pg
 *      prints the offending input as `*****REDACTED*****`. That redaction reads
 *      like an unset placeholder value rather than a parse failure, which is
 *      exactly how an hour was lost to it once. Handing pg discrete fields
 *      removes the parse from the path entirely, so the failure cannot recur.
 *
 * The password is passed through VERBATIM, with no percent-decoding, because
 * the stored value is not percent-encoded. It is extracted for the client
 * config only: `resolveDatabaseTarget` keeps it inside `clientConfig` and never
 * puts it on the returned target, never packs it into a message, and never
 * logs it.
 *
 * The two positional rules are what make an unescaped password safe to read:
 * the LAST `@` separates credentials from host (an `@` inside the password
 * cannot split it early), and the FIRST `:` inside the credentials separates
 * user from password (a `:` inside the password stays in the password).
 *
 * @returns {{ user: string, password: string, host: string, port: number, database: string } | null}
 */
function parseConnectionString(raw) {
  const s = String(raw ?? '').trim().replace(/^["']|["']$/g, '')
  const schemeEnd = s.indexOf('://')
  const at = s.lastIndexOf('@')
  if (schemeEnd === -1 || at === -1 || at < schemeEnd) return null

  const creds = s.slice(schemeEnd + 3, at)
  const sep = creds.indexOf(':')

  const tail = s.slice(at + 1)
  const cut = tail.search(/[/?]/)
  const hostPort = cut === -1 ? tail : tail.slice(0, cut)
  const database = cut === -1 || tail[cut] === '?' ? '' : tail.slice(cut + 1).split('?')[0]

  // An IPv6 literal keeps its brackets, matching what the ref reader has always
  // been handed. Otherwise the port is whatever follows the colon.
  let host = hostPort
  let port = ''
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']')
    host = hostPort.slice(0, close + 1)
    port = hostPort.slice(close + 1).replace(/^:/, '')
  } else {
    const colon = hostPort.indexOf(':')
    if (colon !== -1) {
      host = hostPort.slice(0, colon)
      port = hostPort.slice(colon + 1)
    }
  }

  return {
    user: sep === -1 ? creds : creds.slice(0, sep),
    password: sep === -1 ? '' : creds.slice(sep + 1),
    host,
    port: Number(port || 5432),
    database: database || 'postgres',
  }
}

/**
 * The Postgres target this process is configured for, from the environment.
 *
 * DEFAULTS TO NOTHING. There is deliberately no fallback that reconstructs a
 * host from NEXT_PUBLIC_SUPABASE_URL: .env.local holds the production project,
 * so such a fallback would quietly rebuild `db.<production>.supabase.co` and
 * restore the exact default this change exists to remove. No configuration
 * means no target, and no target means refuse.
 */
export function resolveDatabaseTarget(aliasOverride = '') {
  // ---------------------------------------------------------------------
  // PATH 1: the caller named a project. `--project prod`, and nothing else.
  //
  // This is the path that exists so a connection string is never assembled by
  // hand again. The caller supplies WHICH project; this module supplies the
  // host, the port, the user, the database and the password, from credentials
  // that are already on the machine. See scripts/lib/db-credentials.mjs for the
  // two hours of evidence that produced it.
  // ---------------------------------------------------------------------
  const alias = aliasOverride || targetFromArgv()
  if (alias) {
    const ref = refForAlias(alias)
    if (!ref) {
      return {
        clientConfig: null, host: '', user: '', source: `--project ${alias}`,
        unresolvedAlias: alias,
      }
    }
    // Naming the project loads the project: the DB password AND whatever else
    // that environment needs (Stripe keys, service-role keys), without ever
    // overriding a shell value. See hydrateEnvForAlias for why this is not left
    // to --env-file.
    const hydrated = hydrateEnvForAlias(alias, ref)
    if (hydrated.loaded.length > 0) {
      console.log(`[preflight] loaded ${hydrated.loaded.length} variable(s) from ${hydrated.file}: ${hydrated.loaded.join(', ')}`)
    }
    const cred = resolveCredential({ ref, alias })
    const endpoints = endpointsFor(ref, { alias, password: cred.password })
    const primary = endpoints[0]
    return {
      clientConfig: cred.password
        ? { user: primary.user, password: primary.password, host: primary.host, port: primary.port, database: primary.database, ssl: primary.ssl }
        : null,
      endpoints,
      credential: { from: cred.from, key: cred.key, tried: cred.tried, found: Boolean(cred.password) },
      host: primary.host,
      user: primary.user,
      alias,
      source: `--project ${alias}`,
    }
  }

  // ---------------------------------------------------------------------
  // PATH 2: the legacy SUPABASE_DB_URL / SUPABASE_DB_HOST configuration.
  //
  // Now read through the SHARED source list rather than process.env alone, so a
  // value sitting in .env.test is found without --env-file, while a shell
  // variable still beats every file. A placeholder is treated as ABSENT: pg
  // prints `*****REDACTED*****` when it masks a string, and that text has been
  // copied into a file and believed before now.
  // ---------------------------------------------------------------------
  const fromSources = name => {
    for (const src of credentialSources()) {
      const v = src.bag?.[name]
      if (v === undefined) continue
      if (isPlaceholder(v)) continue
      return { value: v, where: src.label }
    }
    return { value: '', where: '' }
  }

  const found = fromSources('SUPABASE_DB_URL')
  const conn = found.value
  if (nonEmpty(conn)) {
    const parts = parseConnectionString(conn) ?? { user: '', password: '', host: '', port: 5432, database: 'postgres' }
    return {
      credential: { from: found.where, key: 'SUPABASE_DB_URL', tried: [], found: nonEmpty(parts.password) },
      // DISCRETE FIELDS, never `connectionString`. See parseConnectionString:
      // the password is not percent-encoded, so the string form makes pg throw
      // ERR_INVALID_URL and report the input as `*****REDACTED*****`. An
      // unparseable value lands here with an empty host, which fails the ref
      // check below and is refused before a socket is opened.
      clientConfig: {
        user: parts.user,
        password: parts.password,
        host: parts.host,
        port: parts.port,
        database: parts.database,
        ssl: { rejectUnauthorized: false },
      },
      // Top level carries the two IDENTIFYING parts only. The password stays
      // inside clientConfig so a caller that logs its target cannot leak it.
      user: parts.user,
      host: parts.host,
      source: `SUPABASE_DB_URL (from ${found.where})`,
    }
  }

  const hostFound = fromSources('SUPABASE_DB_HOST')
  const host = hostFound.value
  if (nonEmpty(host)) {
    const user = (fromSources('SUPABASE_DB_USER').value || '').trim()
    const pw = fromSources('SUPABASE_DB_PASSWORD')
    return {
      credential: { from: pw.where, key: 'SUPABASE_DB_PASSWORD', tried: [], found: nonEmpty(pw.value) },
      clientConfig: {
        host: host.trim(),
        port: Number(fromSources('SUPABASE_DB_PORT').value || 5432),
        user,
        password: pw.value,
        database: fromSources('SUPABASE_DB_NAME').value || 'postgres',
        ssl: { rejectUnauthorized: false },
      },
      host: host.trim(),
      user,
      source: `SUPABASE_DB_HOST (from ${hostFound.where})`,
    }
  }

  return { clientConfig: null, host: '', user: '', source: '' }
}

/**
 * Refuse to continue when the Postgres target this process is configured for is
 * the PRODUCTION project. Call it BEFORE constructing the client, so a refused
 * run never builds one and never opens a socket.
 *
 * The verdict comes from the same SUPABASE_ENV_ISOLATION rule the rest of this
 * module uses: the resolved ref is rendered back into the project URL shape the
 * rule reads, so there is one definition of "this is production" and one
 * override, not a second rule that can drift away from the first.
 *
 * @returns {{ clientConfig: object, ref: string, host: string, user: string, source: string }}
 */
export function assertNotProductionDatabase(aliasOverride = '') {
  const script = scriptName()
  const rule = CRITICAL_ENV_RULES.find(r => r.name === 'SUPABASE_ENV_ISOLATION')

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

  const target = resolveDatabaseTarget(aliasOverride)

  // FAIL CLOSED, part zero: `--project <alias>` named something unrecognisable.
  if (target.unresolvedAlias) {
    refuse([
      `Script          : ${script}`,
      `Resolved project: UNKNOWN  (--project ${target.unresolvedAlias})`,
      '',
      `"${target.unresolvedAlias}" is not a project this repository knows.`,
      '',
      'Accepted values:',
      '  --project prod    the production project, from PRODUCTION_SUPABASE_REF',
      '  --project test    the TEST project, read from .env.test',
      '  --project <ref>   any 20-character Supabase project ref, spelled out',
    ])
  }

  // FAIL CLOSED, part one: nothing configured.
  if (!target.clientConfig) {
    // A NAMED project with no password is a DIFFERENT failure from no project at
    // all, and saying so is the entire point of this change. The person knows
    // which database they want; what is missing is one credential, in one file.
    if (target.alias) {
      const ref = refForAlias(target.alias)
      refuse([
        `Script          : ${script}`,
        `Resolved project: ${ref}  (--project ${target.alias})`,
        'Password        : NOT FOUND',
        '',
        'The project resolved cleanly. What is missing is the password, and these',
        'places were searched for it, in order:',
        ...(target.credential?.tried ?? []).map(t => `  - ${t.key} in ${t.where}: ${t.verdict}`),
        ...((target.credential?.tried ?? []).length === 0
          ? ['  (none of the candidate variables were present anywhere)']
          : []),
        '',
        'Put it in ONE file, once, and never type a connection string again:',
        '',
        `  .env.${target.alias}.local`,
        `      SUPABASE_DB_PASSWORD_${target.alias.toUpperCase()}=<the password, RAW>`,
        '',
        'STORE IT RAW. Do NOT percent-encode it. This tooling hands DISCRETE fields',
        'to pg, so + & # ! and every other character are passed through untouched.',
        'Encoding them turns a correct password into a wrong one, and the server',
        'then answers 28P01, which reads as "wrong password" rather than "wrongly',
        'encoded password". That is exactly the two hours this change exists to',
        'refund.',
        '',
        `Reset or copy the password at:`,
        `  https://supabase.com/dashboard/project/${ref}/settings/database`,
        '',
        'A shell variable always wins over a file, so a one-off run can also do:',
        `  PowerShell : $env:SUPABASE_DB_PASSWORD_${target.alias.toUpperCase()}="..."; node ${script} --project ${target.alias}`,
      ])
    }
    refuse([
      `Script          : ${script}`,
      'Resolved project: NONE CONFIGURED',
      '',
      'This script opens a DIRECT Postgres connection as the database owner, and',
      'no target is configured for this process.',
      '',
      'THE SHORT WAY, which requires no connection string at all:',
      `  node ${script} --project test`,
      `  node ${script} --project prod     (production also needs ${APPROVAL}=1)`,
      '',
      'The password is read from your env files. If none is stored yet the next',
      'run will tell you exactly which file to put it in.',
      '',
      'There is no default. The production host used to be written into this',
      'script as a literal, so running it with no configuration at all connected',
      'to the live database as the schema owner. It now connects to nothing.',
    ])
  }

  // FAIL CLOSED, part two: configured, but not identifiable.
  const ref = refFromDatabaseTarget(target)
  if (!ref) {
    refuse([
      `Script          : ${script}`,
      'Resolved project: UNKNOWN',
      `Resolved from   : ${target.source}`,
      '',
      'A Postgres target is configured but no Supabase project ref could be read',
      'from it. Neither the host (db.<ref>.supabase.co) nor the username',
      '(postgres.<ref>, the pooler shape) identified a project.',
      '',
      'An unknown target is refused, not allowed. This connection would hold the',
      'rights to DROP and TRUNCATE, so "probably not production" is not good',
      'enough. ALLOW_PRODUCTION_SUPABASE does not cover this case: it approves a',
      'KNOWN production target, and there is nothing here to approve.',
    ])
  }

  const judged = { NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` }
  if (approvalGiven()) {
    judged[APPROVAL] = process.env[APPROVAL]
  }

  const verdict = evalEnvRule(rule, judged)

  if (!verdict.ok) {
    refuse([
      `Script          : ${script}`,
      `Resolved project: ${ref}  (PRODUCTION)`,
      `Resolved from   : ${target.source}`,
      '',
      'Nothing has been written. This ran before the Postgres client was',
      'constructed and before any socket was opened.',
      '',
      'This connection authenticates as the database OWNER, not as service_role.',
      'It can DROP, ALTER and TRUNCATE, so this is a wider power than the',
      'Supabase client path and is refused on the same terms.',
      '',
      'Writing to the production project requires Lawal Adams\' explicit approval,',
      'given for that run.',
      '',
      'To run this against TEST instead:',
      `  node ${script} --project test`,
      ...(PARKED_APPROVAL
        ? parkedApprovalLines()
        : ['', 'If this run IS an approved production run, state that explicitly:']),
      `  PowerShell : $env:${APPROVAL}="1"; node ${script} --project prod`,
      `  bash       : ${APPROVAL}=1 node ${script} --project prod`,
    ])
  }

  if (approvalGiven() && process.env[APPROVAL] === '1') {
    const bar = '!'.repeat(72)
    console.warn('')
    console.warn(bar)
    console.warn('PRODUCTION DATABASE WRITE APPROVED BY OVERRIDE  (ALLOW_PRODUCTION_SUPABASE=1)')
    console.warn(`  script : ${script}`)
    console.warn(`  project: ${ref}`)
    console.warn('  This connects as the database OWNER. DROP, ALTER and TRUNCATE are in scope.')
    console.warn(bar)
    console.warn('')
    return withConnect(target, ref)
  }

  console.log(`[preflight] ${script}: Postgres target ${ref} (not production), from ${target.source}. Proceeding.`)
  return withConnect(target, ref)
}

/**
 * Preflight a NAMED project and return a live connection to it.
 *
 * For the scripts that legitimately talk to TWO databases in one run, such as
 * scripts/verify/schema-provenance.mjs, which compares production's schema with
 * TEST's. Each project goes through the same refusal and the same credential
 * resolution as a single-target run; the only difference is that the alias comes
 * from the caller rather than from `--project` on the command line.
 *
 * @param {string} alias 'prod', 'test', or a bare project ref.
 * @param {{ readOnly?: boolean }} [opts]
 * @returns {Promise<{ client: object, ref: string, target: object }>}
 */
export async function openProject(alias, opts = {}) {
  const target = assertNotProductionDatabase(alias)
  const client = await target.connect(opts)
  return { client, ref: target.ref, target }
}

/**
 * Attach `connect()` to a resolved target.
 *
 * THE BLESSED WAY TO OPEN A CONNECTION. Callers do
 *
 *   const db = await target.connect()
 *
 * instead of `new pg.Client(target.clientConfig)` followed by `db.connect()`.
 * The difference is entirely in what happens when it FAILS: this path turns a
 * driver error into prose that names the credential source and the missing
 * thing, retries a hand-encoded password once in decoded form, and never prints
 * a password or a stack trace. `clientConfig` is still exported unchanged, so
 * nothing that already works breaks; it is simply no longer the recommended
 * path, and scripts/guards/one-db-connection-source.mjs holds the line.
 *
 * `pg` is imported lazily, inside the call, so that merely importing this
 * preflight does not require the driver. Several guards import it purely to read
 * its exports.
 */
function withConnect(target, ref) {
  const resolved = { ...target, ref }
  /**
   * @param {{ readOnly?: boolean }} [opts] `readOnly` sets
   *   `default_transaction_read_only=on` for the SESSION, which is enforced by
   *   the SERVER rather than by the script remembering to only run selects. The
   *   probe scripts relied on this and it is preserved here rather than lost in
   *   the migration onto the shared helper.
   */
  resolved.connect = async (opts = {}) => {
    const pgModule = (await import('pg')).default ?? (await import('pg'))
    const extra = opts.readOnly ? { options: '-c default_transaction_read_only=on' } : {}
    const base = target.endpoints ?? [{ ...target.clientConfig, label: `configured target (${target.source})` }]
    const endpoints = base.map(e => ({ ...e, ...extra }))
    const { client, endpoint, notes } = await connectWithDiagnosis(pgModule, endpoints, {
      ref,
      alias: target.alias ?? '',
      credentialFrom: target.credential?.from ?? '',
      credentialKey: target.credential?.key ?? '',
      tried: target.credential?.tried ?? [],
    })
    console.log(`[db] connected: ${endpoint.user}@${endpoint.host}:${endpoint.port}/${endpoint.database}`)
    console.log(`[db] endpoint : ${endpoint.label ?? 'configured'}`)
    if (target.credential?.from) {
      console.log(`[db] password : ${target.credential.key} from ${target.credential.from}`)
    }
    for (const n of notes) console.warn(`[db] ${n}`)
    return client
  }
  return resolved
}

export default assertNotProduction
