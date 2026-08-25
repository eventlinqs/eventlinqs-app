/**
 * ONE DATABASE CONNECTION SOURCE - no script assembles its own.
 *
 * WHY THIS EXISTS. On 25 August 2026 the founder lost two hours to a
 * `28P01 password authentication failed for user "postgres"` that had one cause
 * and three decoys, and the reason it took two hours rather than two minutes is
 * that the connection logic existed in NINE COPIES. Each copy hand-split
 * SUPABASE_DB_URL slightly differently, each had its own idea of which host to
 * fall back to, and not one of them could say what it had actually used when it
 * failed. Fixing the shared helper fixed nothing for the eight scripts that were
 * not using it.
 *
 * So the rule is now structural rather than advisory: a script that opens a
 * Postgres connection gets its target and its credential from
 * scripts/lib/db-credentials.mjs, through
 * scripts/lib/production-write-preflight.mjs. Nothing else may.
 *
 * WHAT IS BANNED, and why each one specifically:
 *
 *   1. `connectionString:` handed to pg. pg parses it with WHATWG URL rules,
 *      which throw on the unencoded `?` and `$` in this repo's real password,
 *      and then pg prints the input as `*****REDACTED*****`. That redaction has
 *      already been mistaken once for an unset placeholder value sitting in
 *      .env.test. Discrete fields make the parse impossible to reach.
 *
 *   2. `new URL(...)` applied to a database URL. Same parse, same throw,
 *      measured on the real value: `new URL()` returns `Invalid URL`.
 *
 *   3. Reading SUPABASE_DB_URL / SUPABASE_DB_PASSWORD* / DATABASE_URL out of the
 *      environment directly. That is where a private, divergent copy of the
 *      resolution logic always starts.
 *
 *   4. A hardcoded Supabase host. `aws-1-ap-southeast-2.pooler.supabase.com`
 *      was pasted into four scripts, which silently pins a region and hides the
 *      documented IPv6 direct host from anyone reading them.
 *
 * WHAT IS ALLOWED. `target.clientConfig` and `target.endpoints` are the shared
 * helper's own output, so spreading them into a pg.Client or pg.Pool is fine:
 * the credential still came from one place. The helper itself and this guard are
 * exempt, by path, and the exemption is printed on every run rather than being
 * an invisible special case.
 *
 * IT PRINTS WHAT IT SCANNED. A guard that reports only violations cannot be told
 * apart from a guard whose matcher silently stopped matching, so this one always
 * says how many files it read and how many opened a database connection.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

/** The shared helper, and this guard. Everything else is subject to the rule. */
const EXEMPT = [
  'scripts/lib/db-credentials.mjs',
  'scripts/lib/production-write-preflight.mjs',
  'scripts/guards/one-db-connection-source.mjs',
  'scripts/guards/no-unguarded-production-write.mjs',
  // The drills hold each banned shape as a STRING they splice into another file
  // to prove this guard fires. Scanning them flags the very fixtures that prove
  // the guard works, and the tempting fix is to delete the fixtures.
  'scripts/verify/guard-failure-drills.mjs',
]

const SCAN_DIRS = ['scripts', 'supabase']

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch (error) {
    console.warn('[scripts/guards/one-db-connection-source:71]', error instanceof Error ? error.message : error)
    return out }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      walk(p, out)
    } else if (/\.(mjs|cjs|js)$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

const rel = p => relative(REPO_ROOT, p).split('\\').join('/')

/** Strip comments and template/quoted strings so prose cannot trip the matchers. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const RULES = [
  {
    id: 'connectionString',
    why: 'hands pg a connection string; pg parses it with URL rules that throw on this repo\'s real password and then prints it as *****REDACTED*****',
    test: c => /\bconnectionString\s*:/.test(c),
  },
  {
    id: 'new URL on a database url',
    why: 'new URL() throws Invalid URL on an unencoded Postgres password (measured on the real value)',
    test: c => /new URL\s*\(\s*[^)]*(?:SUPABASE_DB_URL|DATABASE_URL|POSTGRES_URL|conn\b|connectionString)/.test(c),
  },
  {
    id: 'direct env read',
    why: 'reads the database credential straight from the environment instead of through the shared resolver',
    test: c => /process\.env\.(SUPABASE_DB_URL|SUPABASE_DB_PASSWORD\w*|SUPABASE_DB_HOST|DATABASE_URL|POSTGRES_URL)\b/.test(c),
  },
  {
    id: 'hardcoded supabase host',
    why: 'pins a region and hides the documented direct host; the helper derives both',
    test: c => /['"`][^'"`]*\.(?:pooler\.supabase\.com|supabase\.co)[^'"`]*['"`]/.test(c) && /new\s+(?:pg\.)?(?:default\.)?(?:Client|Pool)\s*\(/.test(c),
  },
]

const files = walk(join(REPO_ROOT, SCAN_DIRS[0])).concat(walk(join(REPO_ROOT, SCAN_DIRS[1])))
const violations = []
let connectors = 0
let viaHelper = 0

for (const f of files) {
  const r = rel(f)
  if (EXEMPT.includes(r)) continue
  const src = readFileSync(f, 'utf8')
  const c = code(src)

  // A script that talks to Postgres either imports the driver itself, or reaches
  // it through the shared helper. Counting BOTH matters: the migration onto
  // `target.connect()` removed the `pg` import from most of these files, so a
  // detector that looked only for that import would report a shrinking
  // population and read as though coverage were improving while it was only
  // becoming invisible.
  // Deliberately NOT "imports production-write-preflight": most scripts import
  // that module for assertNotProduction(), which judges the SUPABASE CLIENT and
  // opens no database connection. Counting those would inflate the population
  // from 17 to 62 and make the figure meaningless.
  const importsDriver = /from\s+['"]pg['"]|require\(['"]pg['"]\)/.test(src)
  const usesHelper = /target\.connect\(|openProject\(|assertNotProductionDatabase|resolveDatabaseTarget/.test(c)
  if (importsDriver || usesHelper) {
    connectors += 1
    if (usesHelper) viaHelper += 1
  }

  // The BANS apply to every scanned file, not only to ones that import the
  // driver. A file that reads SUPABASE_DB_URL out of the environment is starting
  // a private copy of the resolution logic whether or not it has got as far as
  // importing pg yet, and that is the moment worth catching.
  for (const rule of RULES) {
    if (!rule.test(c)) continue
    const line = src.split(/\r?\n/).findIndex(l => rule.test(code(l))) + 1
    violations.push({ file: r, line, id: rule.id, why: rule.why })
  }
}

console.log(`[one-db-connection-source] scanned ${files.length} file(s) under ${SCAN_DIRS.join('/ and ')}/`)
console.log(`[one-db-connection-source] ${connectors} open a Postgres connection; ${viaHelper} import the shared helper`)
console.log(`[one-db-connection-source] exempt by path (the helper itself): ${EXEMPT.length}`)
for (const e of EXEMPT) console.log(`    ${e}`)

if (violations.length > 0) {
  console.error('')
  console.error('[one-db-connection-source] FAIL - a script builds its own database connection.')
  console.error('')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`)
    console.error(`      ${v.id}: ${v.why}`)
  }
  console.error('')
  console.error('  Use the shared helper instead:')
  console.error('')
  console.error("    import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'")
  console.error('    const target = assertNotProductionDatabase()')
  console.error('    const db = await target.connect()            // add { readOnly: true } for a probe')
  console.error('')
  console.error('  and run it with  --project test  or  --project prod. The helper resolves the')
  console.error('  host, the port, the user and the password, refuses production without')
  console.error('  approval, and explains any failure in words instead of a pg stack trace.')
  process.exit(1)
}

console.log('[one-db-connection-source] PASS - every database connection comes from the shared helper.')
