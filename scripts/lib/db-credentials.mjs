/**
 * DATABASE CREDENTIALS - the one place a Postgres connection is assembled.
 *
 * WHY THIS EXISTS, stated as the failure it removes. On 25 August 2026 the
 * founder spent two hours hand-assembling connection strings for
 * `scripts/verify/seeded-order-forensics.mjs` and got `28P01 password
 * authentication failed for user "postgres"` from every one of them, while the
 * preflight banner overhead printed the CORRECT project ref. Two hours were lost
 * to a five-character cause, and three separate red herrings kept the real one
 * hidden:
 *
 *   1. THE PASSWORD WAS PERCENT-ENCODED BY HAND, AND THIS CODE DOES NOT DECODE.
 *      `parseConnectionString` in production-write-preflight.mjs passes the
 *      password through VERBATIM, on purpose, because the stored TEST password
 *      is not encoded. Encode `+ & # !` into `%2B %26 %23 %21` and pg faithfully
 *      authenticates with the literal text `%2B%26%23%21`. That is a wrong
 *      password, so the server says so, and it says so in the one way that looks
 *      like a credentials problem rather than a formatting one. Reproduced
 *      against TEST: verbatim CONNECTED, percent-encoded returned exactly
 *      `28P01 password authentication failed for user "postgres"`.
 *
 *   2. THE REPORTED USER IS ALWAYS `postgres`, WHICH LOOKS LIKE THE STRING WAS
 *      IGNORED. It was not. `postgres.<ref>` is a Supavisor TENANT identifier;
 *      the Postgres role behind it is plain `postgres`, so `current_user` reads
 *      `postgres` on a SUCCESSFUL pooler connection too. Measured, on a
 *      connection that worked. The username in the error proves nothing about
 *      which string was used, and reading it as evidence sends you hunting a
 *      parsing bug that is not there.
 *
 *   3. "`.env.test` HOLDS A REDACTED PLACEHOLDER" WAS A MISREADING OF pg's OWN
 *      ERROR TEXT. Hand a malformed URL to `new pg.Client({ connectionString })`
 *      and pg throws ERR_INVALID_URL while printing the input as
 *      `*****REDACTED*****`. That is pg masking a value, not a placeholder value
 *      sitting in the file. `.env.test` holds a real, working TEST credential and
 *      always did.
 *
 * WHAT THIS MODULE GUARANTEES, in the founder's words, each mapped to code:
 *
 *   "The script builds its own connection from credentials already in my env
 *   file. I supply the target project and the production approval, nothing more."
 *     -> `resolveCredential()` searches a declared list of sources for a
 *        PASSWORD ONLY, keyed by project. `endpointsFor()` builds the host, port,
 *        user and database. Nobody types a URL.
 *
 *   "Percent-encoding is handled in code, never by me."
 *     -> Passwords are stored RAW. Discrete fields go to pg, so no encoding is
 *        ever required. `connectWithDiagnosis()` additionally detects a password
 *        that was encoded by hand and retries it decoded ONCE, then says so, so
 *        the old habit degrades into a warning instead of a two-hour hunt.
 *
 *   "A shell variable always beats a file, and a REDACTED placeholder is treated
 *   as absent rather than as a value."
 *     -> `SOURCES` is ordered, process.env first. `isPlaceholder()` is applied to
 *        every candidate value before it is accepted.
 *
 *   "On failure it says which credential source it used and what was missing, in
 *   plain words. Never a raw pg stack trace. Never print a password."
 *     -> `explainFailure()` returns prose. No value from any credential is ever
 *        returned, logged, or packed into a message anywhere in this file.
 *
 * HOST FORMS ARE NOT INVENTED, they are Supabase's own (Law 7). From
 * https://supabase.com/docs/guides/database/connecting-to-postgres (fetched
 * 25 August 2026):
 *
 *   direct              db.<ref>.supabase.co:5432        user `postgres`
 *                       "Best for persistent backend services", and for
 *                       "migrations, pg_dump, backup and management tools",
 *                       which is exactly what every caller of this module is.
 *                       On IPv6, "or on IPv4 if the project has the IPv4 add-on".
 *   session pooler      aws-<region>.pooler.supabase.com:5432   user `postgres.<ref>`
 *                       "Persistent backend on IPv4-only networks".
 *   transaction pooler  aws-<region>.pooler.supabase.com:6543   user `postgres.<ref>`
 *                       "Serverless and edge functions". Not used here.
 *
 * MEASURED ON THIS MACHINE, 25 August 2026, which is why direct is tried first:
 * `db.<ref>.supabase.co` publishes AAAA records only (A lookup returns ENODATA)
 * for both the TEST and PRODUCTION projects, and a TCP connect over IPv6
 * succeeded to both. The pooler publishes A and AAAA and answered on both 5432
 * and 6543. Direct therefore works here and needs no region, so it is the first
 * candidate; the pooler is kept as the fallback for an IPv4-only network, where
 * direct cannot resolve at all.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUCTION_SUPABASE_REF, refFromUrl } from '../../src/lib/env/refs.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..', '..')

/* ------------------------------------------------------------------ *
 * Values that are present but mean "absent"
 * ------------------------------------------------------------------ */

/**
 * A value that LOOKS set but carries no credential.
 *
 * `*****REDACTED*****` is on this list because pg prints exactly that when it
 * masks a connection string, and somebody eventually copies it into a file
 * believing it is the value. A placeholder accepted as a password produces
 * 28P01, which reads as "wrong password" rather than "no password", and that is
 * the confusion this function exists to end.
 */
export function isPlaceholder(value) {
  const t = String(value ?? '').trim()
  if (t === '') return true
  return (
    /^\**REDACTED\**$/i.test(t) ||
    /^<.*>$/.test(t) ||
    /^\[.*\]$/.test(t) ||
    /^(your[-_ ]?|my[-_ ]?)?(password|db[-_ ]?password|secret|token)$/i.test(t) ||
    /^(changeme|change[-_]me|placeholder|todo|fixme|xxx+|\.\.\.+)$/i.test(t)
  )
}

/** Present, a string, and not a placeholder. */
const usable = v => typeof v === 'string' && v.trim().length > 0 && !isPlaceholder(v)

/* ------------------------------------------------------------------ *
 * Env files
 * ------------------------------------------------------------------ */

/** The repo's standard env-file shape. Same parse the rest of scripts/ uses. */
export function parseEnvFile(file) {
  if (!existsSync(file)) return null
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (t === '' || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const value = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    out[t.slice(0, i).trim()] = value.startsWith('#') ? '' : value
  }
  return out
}

/** Files Node loaded with --env-file / --env-file-if-exists, in order. */
export function envFilesOnTheCommandLine() {
  const flags = ['--env-file', '--env-file-if-exists']
  const files = []
  const argv = process.execArgv
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    for (const flag of flags) {
      if (arg.startsWith(`${flag}=`)) files.push(arg.slice(flag.length + 1))
      else if (arg === flag && typeof argv[i + 1] === 'string') files.push(argv[i + 1])
    }
  }
  return files
}

/**
 * The MAIN checkout's directory, when this repository is a linked git worktree.
 *
 * WHY THIS IS LOAD-BEARING. This project runs nine worktrees, and env files are
 * gitignored, so they exist in the MAIN checkout and nowhere else. A worktree
 * therefore has `.env.test` (copied in) but no `.env.local`, and `.env.local` is
 * the file that holds the PRODUCTION credential. Resolving credentials relative
 * to the worktree alone finds the TEST password and concludes, wrongly, that no
 * production password exists anywhere on the machine. It does:
 * SUPABASE_DB_PASSWORD_SYDNEY has been sitting in the main checkout the whole
 * time, which is why scripts/verify/schema-provenance.mjs reached for
 * '../eventlinqs-app/.env.local' by hand.
 *
 * Derived from `.git` rather than by guessing a sibling directory name. In a
 * linked worktree `.git` is a FILE reading `gitdir: <path>/.git/worktrees/<name>`,
 * so the main checkout is two levels above that gitdir. No git process is
 * spawned, which also means no inherited GIT_ variables to clear.
 */
export function mainWorktreeRoot() {
  try {
    const dotGit = resolve(REPO_ROOT, '.git')
    if (!existsSync(dotGit)) return ''
    const text = readFileSync(dotGit, 'utf8').trim()
    const m = /^gitdir:\s*(.+)$/m.exec(text)
    if (!m) return ''
    const gitdir = m[1].trim().split('\\').join('/')
    const marker = '/.git/worktrees/'
    const i = gitdir.indexOf(marker)
    if (i === -1) return ''
    return gitdir.slice(0, i)
  } catch (error) {
    console.warn('[scripts/lib/db-credentials:183]', error instanceof Error ? error.message : error)
    return ''
  }
}

/**
 * Every credential source, HIGHEST PRECEDENCE FIRST.
 *
 * The shell is first and that is the whole point: a variable exported for one
 * run must beat a file that was written weeks ago. Node's own `--env-file`
 * already behaves this way (measured on v24.19.0: a shell value survives a file
 * that defines the same name), so this ordering agrees with the runtime rather
 * than fighting it.
 */
export function credentialSources({ alias = '' } = {}) {
  const sources = [{ kind: 'shell', label: 'the shell (process environment)', bag: process.env }]
  const seen = new Set()
  const push = (file, label) => {
    const abs = resolve(REPO_ROOT, file)
    if (seen.has(abs)) return
    seen.add(abs)
    const bag = parseEnvFile(abs)
    if (bag) sources.push({ kind: 'file', label, file: abs, bag })
  }
  for (const f of envFilesOnTheCommandLine()) push(f, `${f} (loaded with --env-file)`)
  if (alias) push(`.env.${alias}.local`, `.env.${alias}.local`)
  if (alias) push(`.env.${alias}`, `.env.${alias}`)
  push('.env.local', '.env.local')
  push('.env.test', '.env.test')

  // The MAIN checkout, last, because a file in THIS worktree should always win.
  // Without these two a linked worktree cannot see the production credential at
  // all: env files are gitignored, so they live in the main checkout only.
  const main = mainWorktreeRoot()
  if (main) {
    const label = main.split('/').pop() || main
    push(`${main}/.env.local`, `${label}/.env.local (the main checkout)`)
    push(`${main}/.env.test`, `${label}/.env.test (the main checkout)`)
  }
  return sources
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

/**
 * Resolve a project ALIAS to a ref.
 *
 * `prod` comes from PRODUCTION_SUPABASE_REF, the single constant the env guards
 * already share, so there is no second literal to drift. `test` is DISCOVERED
 * from `.env.test`, not hardcoded, so a new TEST project needs no code change.
 */
export function refForAlias(alias) {
  const a = String(alias ?? '').trim().toLowerCase()
  if (a === '') return ''
  if (a === 'prod' || a === 'production') return PRODUCTION_SUPABASE_REF
  if (/^[a-z0-9]{20}$/.test(a)) return a
  for (const src of credentialSources({ alias: a })) {
    if (src.kind !== 'file') continue
    const ref = refFromUrl(src.bag.NEXT_PUBLIC_SUPABASE_URL ?? '')
    if (ref && src.label.includes(`.env.${a}`)) return ref
  }
  return ''
}

/** Is this ref the production project? One definition, shared with the guards. */
export const isProductionRef = ref => String(ref ?? '').toLowerCase() === PRODUCTION_SUPABASE_REF

/**
 * The project this run is aimed at, taken from `--project` / `--ref` on the
 * command line. Returns '' when the caller did not say, which leaves the legacy
 * SUPABASE_DB_URL path in charge.
 */
export function targetFromArgv(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    for (const flag of ['--project', '--ref', '--db']) {
      if (a === flag && typeof argv[i + 1] === 'string') return argv[i + 1].trim()
      if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1).trim()
    }
  }
  return ''
}

/* ------------------------------------------------------------------ *
 * Connection strings, parsed - never built by hand by a human
 * ------------------------------------------------------------------ */

/**
 * Split a Postgres connection string into DISCRETE parts, by hand.
 *
 * NEVER `new URL()`, and never handed to pg as a `connectionString`. A Supabase
 * password routinely contains characters that are reserved in a URL and are not
 * percent-encoded. `new URL()` THROWS on the real value in this repo (measured:
 * `Invalid URL`), and pg's own parse throws ERR_INVALID_URL while masking the
 * input as `*****REDACTED*****`.
 *
 * Two positional rules make an unescaped password safe to read: the LAST `@`
 * separates credentials from host, and the FIRST `:` inside the credentials
 * separates user from password.
 */
export function parseConnectionString(raw) {
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

/** The project ref a host/user pair identifies, or ''. */
export function refFromDatabaseTarget({ host = '', user = '' } = {}) {
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(String(host).trim())
  if (direct) return direct[1].toLowerCase()
  const pooled = /^postgres\.([a-z0-9]+)$/i.exec(String(user).trim())
  if (pooled) return pooled[1].toLowerCase()
  return ''
}

/* ------------------------------------------------------------------ *
 * Finding the password
 * ------------------------------------------------------------------ */

/**
 * The variable names that may carry a password for a project, most specific
 * first. `SUPABASE_DB_PASSWORD_SYDNEY` is included because
 * scripts/verify/schema-provenance.mjs already established it.
 */
export function passwordKeysFor(ref, alias) {
  const keys = []
  if (ref) keys.push(`SUPABASE_DB_PASSWORD_${ref.toUpperCase()}`)
  if (alias) keys.push(`SUPABASE_DB_PASSWORD_${alias.toUpperCase()}`)
  if (isProductionRef(ref)) keys.push('SUPABASE_DB_PASSWORD_PROD', 'SUPABASE_DB_PASSWORD_PRODUCTION')
  keys.push('SUPABASE_DB_PASSWORD_SYDNEY', 'SUPABASE_DB_PASSWORD')
  return [...new Set(keys)]
}

/**
 * Find the password for `ref`, and say where it came from.
 *
 * Order: the dedicated per-project keys, then any SUPABASE_DB_URL whose OWN ref
 * matches the target. A SUPABASE_DB_URL naming a DIFFERENT project is skipped
 * and reported as skipped, because silently borrowing the TEST password for a
 * PRODUCTION host is how you get 28P01 and conclude your string is malformed.
 *
 * @returns {{ password: string, from: string, key: string, tried: Array }}
 *   `password` is '' when nothing usable was found. It is never logged.
 */
export function resolveCredential({ ref, alias = '' } = {}) {
  const tried = []
  const keys = passwordKeysFor(ref, alias)

  for (const src of credentialSources({ alias })) {
    for (const key of keys) {
      const v = src.bag?.[key]
      if (v === undefined) continue
      if (!usable(v)) {
        tried.push({ where: src.label, key, verdict: isPlaceholder(v) ? 'placeholder, treated as absent' : 'empty' })
        continue
      }
      tried.push({ where: provenanceOf(key, src.label), key, verdict: 'USED' })
      return { password: v, from: provenanceOf(key, src.label), key, tried }
    }

    const url = src.bag?.SUPABASE_DB_URL
    if (url === undefined) continue
    if (!usable(url)) {
      tried.push({ where: src.label, key: 'SUPABASE_DB_URL', verdict: isPlaceholder(url) ? 'placeholder, treated as absent' : 'empty' })
      continue
    }
    const parts = parseConnectionString(url)
    if (!parts) {
      tried.push({ where: src.label, key: 'SUPABASE_DB_URL', verdict: 'unparseable, ignored' })
      continue
    }
    const urlRef = refFromDatabaseTarget(parts)
    if (ref && urlRef && urlRef !== ref) {
      tried.push({ where: src.label, key: 'SUPABASE_DB_URL', verdict: `names project ${urlRef}, not ${ref}, so skipped` })
      continue
    }
    if (!usable(parts.password)) {
      tried.push({ where: src.label, key: 'SUPABASE_DB_URL', verdict: 'carries no password' })
      continue
    }
    const where = provenanceOf('SUPABASE_DB_URL', src.label)
    tried.push({ where, key: 'SUPABASE_DB_URL', verdict: 'USED (password taken from the string)' })
    return { password: parts.password, from: where, key: 'SUPABASE_DB_URL', tried }
  }

  return { password: '', from: '', key: '', tried }
}

/**
 * Fill process.env from the named project's env file, WITHOUT overriding
 * anything already set.
 *
 * WHY THIS IS HERE AND NOT LEFT TO --env-file. `--project prod` resolves the
 * DATABASE, but a script needs more than a database to do its job: the
 * seeded-order forensics cannot classify a payment intent without
 * STRIPE_SECRET_KEY, and with only a project named it printed
 * "Stripe key mode : NOT SET" and refused to give a verdict. Making the founder
 * remember a second flag to avoid that is exactly the class of papercut this
 * work exists to remove, so naming the project loads the project.
 *
 * Precedence is unchanged and non-negotiable: a variable already in the
 * environment is never overwritten, so a shell export still beats the file. This
 * matches Node's own --env-file behaviour, measured on v24.19.0.
 *
 * ALLOW_PRODUCTION_SUPABASE IS DELIBERATELY EXCLUDED. The preflight already
 * refuses an approval that was parked in a file, on the grounds that it approves
 * every future run rather than this one. Hydrating it here would smuggle it in
 * through the back door and defeat that check.
 *
 * @returns {{ file: string, loaded: string[] }} names only, never values.
 */
export function hydrateEnvForAlias(alias, ref = '') {
  const NEVER = new Set(['ALLOW_PRODUCTION_SUPABASE'])
  for (const src of credentialSources({ alias })) {
    if (src.kind !== 'file') continue
    // MATCH ON THE PROJECT, NOT ON THE FILE NAME. Keying this on `.env.<alias>`
    // meant `--project prod` hydrated nothing, because the production
    // environment lives in the main checkout's `.env.local`, whose name says
    // nothing about which project it is. The forensics run then printed
    // "Stripe key mode : NOT SET" against the live database and refused to give
    // a verdict, which is the exact outcome this hydration exists to prevent.
    //
    // Matching on the ref is also the SAFER rule: it makes it structurally
    // impossible to load TEST Stripe keys alongside a PRODUCTION database
    // connection, which would let a live payment intent be classified as
    // test-mode and a real customer's order be read as synthetic.
    const fileRef = refFromUrl(src.bag.NEXT_PUBLIC_SUPABASE_URL ?? '')
    const named = src.label.startsWith(`.env.${alias}`)
    if (!named && !(ref && fileRef === ref)) continue
    const loaded = []
    for (const [k, v] of Object.entries(src.bag)) {
      if (NEVER.has(k)) continue
      if (process.env[k] !== undefined) continue
      if (!usable(v)) continue
      process.env[k] = v
      // Remember where it really came from. Without this the credential report
      // says "from the shell" for a value this function just put there, which is
      // technically where it was read from and completely useless to a person
      // trying to work out which file to edit.
      HYDRATED_FROM.set(k, src.label)
      loaded.push(k)
    }
    return { file: src.label, loaded }
  }
  return { file: '', loaded: [] }
}

/** key -> the env file it was hydrated from, so provenance survives hydration. */
const HYDRATED_FROM = new Map()

/** Honest provenance for a key read out of process.env. */
export function provenanceOf(key, shellLabel) {
  const file = HYDRATED_FROM.get(key)
  return file ? `${file} (loaded because you named the project)` : shellLabel
}

/* ------------------------------------------------------------------ *
 * Where to connect
 * ------------------------------------------------------------------ */

/** The AWS region of any pooler host configured anywhere, or ''. */
export function poolerRegionFromEnv(alias = '') {
  for (const src of credentialSources({ alias })) {
    const url = src.bag?.SUPABASE_DB_URL
    if (!usable(url)) continue
    const parts = parseConnectionString(url)
    const m = /^aws-\d+-([a-z0-9-]+)\.pooler\.supabase\.com$/i.exec(parts?.host ?? '')
    if (m) return { region: m[1].toLowerCase(), host: parts.host, from: src.label }
  }
  return { region: '', host: '', from: '' }
}

/**
 * Every endpoint worth trying for a project, in order.
 *
 * DIRECT FIRST. It needs no region, it is the form Supabase documents for
 * "migrations, pg_dump, backup and management tools", and it is reachable from
 * this machine over IPv6 (measured). The session pooler follows for IPv4-only
 * networks, where the direct host has no A record to resolve at all.
 */
export function endpointsFor(ref, { alias = '', password = '' } = {}) {
  const out = [
    {
      label: 'direct (db.<ref>.supabase.co:5432, IPv6 unless the IPv4 add-on is on)',
      user: 'postgres',
      host: `db.${ref}.supabase.co`,
      port: 5432,
      database: 'postgres',
      password,
      ssl: { rejectUnauthorized: false },
    },
  ]
  const pooler = poolerRegionFromEnv(alias)
  if (pooler.host) {
    out.push({
      label: `session pooler (${pooler.host}:5432, region taken from ${pooler.from})`,
      user: `postgres.${ref}`,
      host: pooler.host,
      port: 5432,
      database: 'postgres',
      password,
      ssl: { rejectUnauthorized: false },
    })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Connecting, with a diagnosis instead of a stack trace
 * ------------------------------------------------------------------ */

/** Does this look like somebody percent-encoded it by hand? */
export const looksPercentEncoded = pw => /%[0-9A-Fa-f]{2}/.test(String(pw ?? ''))

/** Strip the config down to what may safely be printed. Password never included. */
export const describeEndpoint = e => `${e.user}@${e.host}:${e.port}/${e.database}`

/**
 * Connect, trying each endpoint, and turn any failure into prose.
 *
 * THE PERCENT-ENCODING RETRY. If a password contains a `%XX` escape and the
 * server rejects it with 28P01, this retries ONCE with the decoded form. That is
 * "percent-encoding is handled in code": a founder who encoded by hand out of
 * habit gets a working connection and a warning telling them to store it raw,
 * rather than an authentication failure that looks like a wrong password.
 *
 * @param {object} pgModule the imported `pg` module (injected so this file has
 *   no opinion about how the caller imported it, and so it is testable).
 * @returns {Promise<{ client: object, endpoint: object, notes: string[] }>}
 */
export async function connectWithDiagnosis(pgModule, endpoints, context = {}) {
  const Client = pgModule.Client ?? pgModule.default?.Client
  const notes = []
  const failures = []

  for (const endpoint of endpoints) {
    const attempts = [{ password: endpoint.password, how: 'as stored' }]
    if (looksPercentEncoded(endpoint.password)) {
      let decoded = null
      try { decoded = decodeURIComponent(endpoint.password) } catch { decoded = null }
      if (decoded !== null && decoded !== endpoint.password) attempts.push({ password: decoded, how: 'percent-decoded' })
    }

    for (const attempt of attempts) {
      const client = new Client({ ...endpoint, password: attempt.password, connectionTimeoutMillis: 20000 })
      try {
        await client.connect()
        if (attempt.how === 'percent-decoded') {
          notes.push(
            'The stored password contained percent-escapes and was REJECTED as stored, but',
            'ACCEPTED once decoded. It has been decoded for you and the connection is live.',
            'Store the password RAW, not percent-encoded: this tooling hands discrete fields',
            'to pg, so no URL encoding is ever needed and encoding it can only break it.',
          )
        }
        return { client, endpoint, notes }
      } catch (e) {
        failures.push({ endpoint, how: attempt.how, code: e.code ?? '', message: e.message ?? String(e) })
        try { await client.end() } catch { /* nothing to close */ }
      }
    }
  }

  const err = new Error(explainFailure(failures, context))
  err.diagnosed = true
  err.failures = failures.map(f => ({ endpoint: describeEndpoint(f.endpoint), how: f.how, code: f.code }))
  throw err
}

/**
 * Turn a set of connection failures into something a human can act on.
 *
 * Deliberately prose, deliberately no stack. Every branch names the credential
 * SOURCE and the missing thing, and none of them can contain a password: only
 * `context.credentialFrom`, `context.credentialKey` and endpoint descriptions
 * are interpolated, and none of those carry the value.
 */
export function explainFailure(failures, context = {}) {
  const { ref = '', alias = '', credentialFrom = '', credentialKey = '', tried = [] } = context
  const L = []
  L.push('')
  L.push('='.repeat(78))
  L.push('COULD NOT CONNECT TO THE DATABASE')
  L.push('='.repeat(78))
  L.push(`Project        : ${ref || 'UNKNOWN'}${alias ? `  (--project ${alias})` : ''}`)
  L.push(`Password from  : ${credentialFrom ? `${credentialKey} in ${credentialFrom}` : 'NOTHING FOUND'}`)
  L.push('')

  if (!credentialFrom) {
    L.push('No password was found for this project. These places were searched, in order:')
    for (const t of tried) L.push(`  - ${t.key} in ${t.where}: ${t.verdict}`)
    if (tried.length === 0) L.push('  (no candidate variables were present anywhere)')
    L.push('')
    L.push('Put the password in ONE place and never type it again. For example:')
    L.push(`  .env.${alias || 'prod'}.local     ->   SUPABASE_DB_PASSWORD_${(alias || 'prod').toUpperCase()}=<the password, RAW>`)
    L.push('')
    L.push('Store it RAW. Do NOT percent-encode it. This tooling hands discrete fields to')
    L.push('pg, so + & # ! and every other character are passed through untouched, and')
    L.push('encoding them can only turn a correct password into a wrong one.')
    L.push('='.repeat(78))
    return L.join('\n')
  }

  const auth = failures.filter(f => f.code === '28P01')
  const net = failures.filter(f => ['ENOTFOUND', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(f.code))

  L.push('Endpoints tried:')
  for (const f of failures) {
    L.push(`  - ${describeEndpoint(f.endpoint)}  (password ${f.how})  ->  ${f.code || 'error'}`)
  }
  L.push('')

  if (auth.length > 0) {
    L.push('THE SERVER ANSWERED AND REJECTED THE PASSWORD (28P01).')
    L.push('That is a credentials problem, not a networking or formatting one. Note that')
    L.push('the username in a 28P01 message is always "postgres" even on the pooler, where')
    L.push('the tenant is written postgres.<ref>, so the name in the error tells you')
    L.push('nothing about which string was used. Do not read it as evidence.')
    L.push('')
    L.push(`The password came from ${credentialKey} in ${credentialFrom}. Either:`)
    L.push('  - it is stale, because the database password was rotated; or')
    L.push('  - it was percent-encoded when it was saved. Save it RAW instead.')
    if (failures.some(f => f.how === 'percent-decoded')) {
      L.push('')
      L.push('It was also retried percent-DECODED and rejected that way too, so encoding is')
      L.push('not the cause here. Treat it as stale and rotate or re-copy it.')
    }
    L.push('')
    L.push('Reset it at:')
    L.push(`  https://supabase.com/dashboard/project/${ref}/settings/database`)
  } else if (net.length === failures.length && failures.length > 0) {
    L.push('THE SERVER WAS NEVER REACHED. No password was rejected, so the credential is')
    L.push('not implicated at all. This is a network path problem.')
    L.push('')
    L.push('db.<ref>.supabase.co publishes IPv6 (AAAA) records only unless the project has')
    L.push("Supabase's IPv4 add-on. On an IPv4-only network it cannot resolve, and the")
    L.push('session pooler (aws-<region>.pooler.supabase.com:5432, user postgres.<ref>) is')
    L.push('the documented alternative. Configure a SUPABASE_DB_URL naming the pooler for')
    L.push('any project and this tooling will reuse its region automatically.')
  } else {
    L.push('The failure was not an authentication rejection and not a clean network error.')
    L.push('The codes above are what the driver reported.')
  }

  L.push('='.repeat(78))
  return L.join('\n')
}
