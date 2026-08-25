/**
 * NO UNGUARDED PRODUCTION WRITE.
 *
 * Fails the build when a file under scripts/ can write to a Supabase project and
 * carries nothing that checks WHICH project that is.
 *
 * WHY IT EXISTS. On 2026-08-13 an audit of this repo found 37 write-capable
 * scripts, 27 of which refused a production target and 10 of which did not. All
 * ten resolved `.env.local`, which points at the PRODUCTION project by design,
 * and four printed `node --env-file=.env.local <script>` in their own header as
 * the documented way to run them. Doing the documented thing was what fired the
 * gun. The ten were fixed by hand, and a hand-fix is exactly the control that
 * fails one file later: the eleventh script is written next month, by someone
 * who never read this, and there is nothing to notice it. This guard is that
 * something.
 *
 * WHAT COUNTS AS WRITE-CAPABLE. Either of two independent transports:
 *
 *   TRANSPORT A, the Supabase client. Both halves must appear on non-comment
 *   lines of the same file:
 *
 *     1. AN ADMIN CREDENTIAL is named:  SUPABASE_SERVICE_ROLE_KEY,
 *        SUPABASE_SERVICE_ROLE_KEY_PREVIEW, SUPABASE_SECRET_KEY, or the
 *        `service_role` Postgres role.
 *     2. A MUTATION is performed:  a PostgREST client call (.insert(, .upsert(,
 *        .update(, .delete(, .rpc(), a storage write (.upload(, .remove(), an
 *        auth admin mutation (createUser, deleteUser, updateUserById,
 *        inviteUserByEmail), or a raw request declaring a mutating method
 *        (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE').
 *
 *   TRANSPORT B, a direct Postgres connection. ANY ONE signal is enough, with
 *   no credential clause at all:
 *
 *     a `pg` or `postgres` import, a Client or Pool construction, a
 *     `.query(` call, a connection string (SUPABASE_DB_URL, connectionString,
 *     a postgres:// or postgresql:// literal), or a Supabase database host
 *     (db.<ref>.supabase.co or a *.pooler.supabase.com host).
 *
 *   Transport B needs no credential clause because it IS the wider power. It
 *   authenticates as `postgres`, the schema owner, not as service_role: DROP,
 *   ALTER and TRUNCATE are in scope, so an accident there is not a bad row, it
 *   is a missing table. One signal is therefore enough to demand a guard.
 *
 *   ADDED 2026-08-13, after this guard reported PASS while four scripts under
 *   scripts/verify/ held exactly this shape with the production host written in
 *   as a string literal. The blind spot was documented in this header from the
 *   first version, which is how it was found rather than discovered the hard
 *   way, but a documented hole is still a hole.
 *
 * WHAT COUNTS AS GUARDED. Any one of three, because two already existed in the
 * codebase and rewriting 27 working scripts to a new idiom would be churn that
 * buys nothing:
 *
 *   A. THE PREFLIGHT       a call to assertNotProduction() from
 *                          scripts/lib/production-write-preflight.mjs
 *   B. A TEST ALLOWLIST    the TEST project ref, or a ref constant, appears and
 *                          the file throws or exits within a few lines, as in
 *                          `if (!url.includes(TEST_REF)) throw ...`
 *   C. A PROD DENYLIST     the same shape against the PRODUCTION ref, as in
 *                          `if (url.includes(PROD_REF)) throw ...`
 *
 * WHY A LINE SCAN RATHER THAN scripts/guards/lib/source.mjs. That module's
 * `stripNonCode` does not understand regex literals, so a literal containing a
 * quote character desynchronises its string scanner and everything after it is
 * blanked as though it were string content. Nearly every script under scripts/
 * parses an env file with `.replace(/^["']|["']$/g, '')`, which trips exactly
 * that. Measured on 2026-08-13: eight scripts that DO carry a working ref check
 * were reported as unguarded, because the `throw` on the line after that regex
 * had been blanked away. A guard that accuses correct code of being unsafe gets
 * switched off, and the same desync silently hides `.insert(` from the
 * write-capable half, which fails in the dangerous direction. So this guard
 * strips full-line and block comments itself and scans the lines. The scanner
 * bug is real and belongs to the six guards that scan src/; it is recorded here
 * rather than fixed here, because changing a shared scanner those guards depend
 * on is its own change with its own proof.
 *
 * THIS TEST IS HEURISTIC AND CAN UNDER-COUNT. Stated plainly, because a guard
 * believed to be exhaustive is more dangerous than one known to be partial. It
 * matches idioms in text, not behaviour, so it will miss:
 *
 *   - a write performed through a helper module that this file only calls
 *     (the credential and the mutation then live in different files),
 *   - a method or table name assembled at runtime, `fetch(url, opts)` where
 *     `opts` is built elsewhere, or a mutation behind a dynamic import,
 *   - any write through a transport this list does not name. The Supabase
 *     management API via SUPABASE_ACCESS_TOKEN is the known remaining one: it
 *     can alter the project itself and no script under scripts/ uses it today,
 *     which is the only reason it is not covered here.
 *
 * It can also OVER-count, which is the safe direction: a `.delete(` on a Map in
 * a file that happens to name the service-role key reads as a write here. The
 * fix for a false positive is to add the preflight, not to loosen the pattern.
 *
 * A pass therefore means "no file matched the shapes below unguarded". It does
 * not mean "no script can reach production".
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { sourceFiles } from './lib/source.mjs'
import { PRODUCTION_SUPABASE_REF } from '../../src/lib/env/refs.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/** The TEST project, named so an allowlist guard is recognisable as one. */
const TEST_SUPABASE_REF = 'vkapkibzokmfaxqogypq'

/**
 * Four files name every pattern this guard looks for, so each would flag itself.
 * Excluded by exact path rather than by a cleverer pattern, because the honest
 * version of "the scanner cannot scan itself" is a short list.
 *
 *   the guard itself   its regexes ARE the banned shapes
 *   the preflight      it is the guard implementation, not a script. It parses
 *                      connection strings and names both refs by design.
 *   db-credentials     added 2026-08-25. The preflight's credential half, split
 *                      out of it. It is the ONE place a connection is assembled,
 *                      so of course it contains every shape; excluding the
 *                      preflight but not the module it delegates to would just
 *                      relocate the false positive.
 *   the drills         scripts/verify/guard-failure-drills.mjs holds the banned
 *                      shapes as DATA: each is a string it splices into another
 *                      file to prove a guard fires. It opens no connection of its
 *                      own, and a guard that fails on its own test fixtures
 *                      teaches people to delete the fixtures.
 */
const EXCLUDED = new Set([
  'scripts/guards/no-unguarded-production-write.mjs',
  'scripts/lib/production-write-preflight.mjs',
  'scripts/lib/db-credentials.mjs',
  'scripts/verify/guard-failure-drills.mjs',
])

const CREDENTIAL = /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY_PREVIEW|SUPABASE_SECRET_KEY|service_role/
const MUTATION = /\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(|\.upload\(|\.remove\(|createUser\(|deleteUser\(|updateUserById\(|inviteUserByEmail\(|method\s*:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/

/**
 * TRANSPORT B: a direct Postgres connection, any one signal. No credential
 * clause, because this transport authenticates as the schema owner.
 */
const DIRECT_POSTGRES = new RegExp(
  [
    /from\s+['"`](pg|postgres)['"`]/.source, // import pg from 'pg'
    /require\(\s*['"`](pg|postgres)['"`]\s*\)/.source,
    /new\s+(pg\.)?(Client|Pool)\s*\(/.source, // new pg.Client({...})
    /\.query\s*\(/.source, // client.query('INSERT ...')
    /connectionString/.source,
    /SUPABASE_DB_URL/.source,
    /postgres(ql)?:\/\//.source, // a connection string literal
    /db\.[a-z0-9]+\.supabase\.co/.source, // direct database host
    /pooler\.supabase\.com/.source, // shared pooler host
  ].join('|'),
)
const REFUSAL = /throw\s+new\s+Error|process\.exit\s*\(\s*1\s*\)|\bdie\s*\(/
/**
 * All three entry points: the Supabase-client one, the Postgres one, and
 * openProject(), added 2026-08-25 for the scripts that legitimately preflight
 * TWO projects in one run (schema-provenance compares production against TEST).
 * openProject calls assertNotProductionDatabase internally, so a script using it
 * IS guarded; without this it reads as unguarded and the fix a reader would
 * reach for is to stop using the shared helper.
 */
const PREFLIGHT = /assertNotProduction(Database)?\s*\(|openProject\s*\(/
/** Either ref written out, or the constant names the existing 27 guards use. */
const REF_TOKEN = new RegExp(`${PRODUCTION_SUPABASE_REF}|${TEST_SUPABASE_REF}|\\bPROD_REF\\b|\\bTEST_REF\\b|\\bPRODUCTION_SUPABASE_REF\\b`)

/** How far a refusal may sit from the ref it is checking and still count. */
const GUARD_WINDOW = 5

/**
 * Full-line and block comments removed, line count preserved so a window over
 * line numbers stays meaningful. Inline trailing comments are deliberately NOT
 * stripped: doing it correctly needs a real parser (the `//` in an https:// URL
 * is the obvious trap), and leaving them in only ever adds lines to the scan,
 * which pushes both halves towards over-counting rather than under-counting.
 */
function codeLines(raw) {
  const out = []
  let inBlock = false
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (inBlock) {
      out.push('')
      if (t.includes('*/')) inBlock = false
      continue
    }
    if (t.startsWith('/*')) {
      out.push('')
      if (!t.includes('*/')) inBlock = true
      continue
    }
    if (t.startsWith('//') || t.startsWith('*')) {
      out.push('')
      continue
    }
    out.push(line)
  }
  return out
}

/**
 * D. A PROVABLY READ-ONLY SESSION. Added 2026-08-18.
 *
 * WHY A FOURTH SHAPE, and why this is not a loosening. This guard exists to stop
 * an unintended WRITE. Its three existing shapes all work by identifying the
 * TARGET and refusing production. That is the only available move for a script
 * that needs write power. But a read-only PRODUCTION probe is a legitimate and
 * necessary thing to own: diagnosing production requires reading production, and
 * `scripts/probe/prod-sale-gate-probe.mjs` already argues exactly this in its
 * header. It escaped this guard only because it reads through the Supabase client
 * rather than through Postgres, which is an accident of transport, not a
 * principle. A probe that needs pg_policies, information_schema or
 * pg_get_functiondef cannot use PostgREST at all, because those live outside the
 * exposed schema.
 *
 * So the fourth shape does not identify the target. It removes the CAPABILITY:
 *
 *   1. the connection is opened with `-c default_transaction_read_only=on`, so
 *      POSTGRES ITSELF raises 25006 on any INSERT/UPDATE/DELETE/DDL in the
 *      session, whatever the file goes on to ask for. This is server-side and is
 *      not a promise made by the file about itself.
 *   2. the file never turns that off, and never reaches for the session-wide
 *      escape hatches that could.
 *   3. the file contains no database mutation verb at all, on either transport,
 *      so there is no write even attempting to run.
 *
 * All three are required. Any one alone would be a loophole: (1) without (2) could
 * be switched off mid-file; (1) and (2) without (3) would pass a file that clearly
 * intends to write and would merely fail at runtime, which is not the standard
 * this guard holds. A file satisfying all three cannot write to any database,
 * production included, so demanding it also refuse production would be demanding
 * a check against a power it does not hold.
 *
 * The failure direction is also right: if somebody later adds a write to such a
 * file, clause 3 stops matching, the file is no longer read-only in this guard's
 * eyes, and it goes back to needing the preflight.
 */
const READ_ONLY_SESSION = /default_transaction_read_only\s*=\s*on/
const READ_ONLY_DEFEATED = new RegExp(
  [
    /default_transaction_read_only\s*=\s*off/.source,
    /SET\s+SESSION\s+CHARACTERISTICS/.source,
    /transaction_read_only\s*=\s*['"`]?off/.source,
  ].join('|'),
  'i',
)
/**
 * Any SQL statement that changes data or schema, in the file's own source.
 *
 * GRANT and REVOKE require a following `ON`, and that is not decoration. The first
 * version matched `/\bGRANT\s/i`, which also matches the ordinary English word
 * "grant" in a lowercase sentence. It fired on three console.log lines in a
 * read-only probe that said things like "none grant anon anything by default", and
 * the only available remedies were to keep rewording English prose forever or to
 * weaken the check. Requiring the `ON` that every real GRANT/REVOKE statement
 * carries distinguishes the statement from the noun without giving anything up.
 *
 * The other alternatives were both worse: matching case-sensitively would miss a
 * lowercase `grant select on ...`, and dropping the clause would miss the real
 * thing entirely.
 */
const SQL_MUTATION = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|DROP\s+(TABLE|FUNCTION|INDEX|POLICY|SCHEMA)|TRUNCATE|ALTER\s+(TABLE|DEFAULT\s+PRIVILEGES)|CREATE\s+(TABLE|FUNCTION|INDEX|POLICY|OR\s+REPLACE)|\b(GRANT|REVOKE)\b[^\n;]{0,80}\bON\b)/i

function isProvablyReadOnly(body) {
  if (!READ_ONLY_SESSION.test(body)) return false
  if (READ_ONLY_DEFEATED.test(body)) return false
  if (MUTATION.test(body)) return false
  if (SQL_MUTATION.test(body)) return false
  return true
}

/** A ref token and a refusal within GUARD_WINDOW lines of each other. */
function hasRefCheck(lines) {
  const refAt = []
  const refuseAt = []
  lines.forEach((l, i) => {
    if (REF_TOKEN.test(l)) refAt.push(i)
    if (REFUSAL.test(l)) refuseAt.push(i)
  })
  return refAt.some((r) => refuseAt.some((x) => x >= r && x - r <= GUARD_WINDOW))
}

const files = sourceFiles(ROOT, { extensions: ['.mjs', '.js', '.cjs', '.ts', '.mts'], subdir: 'scripts' })

const offenders = []
/** Read-only production probes: named in the summary, never silently skipped. */
const readOnlyProbes = []
let writeCapable = 0

let viaClient = 0
let viaPostgres = 0

for (const rel of files) {
  if (EXCLUDED.has(rel)) continue

  const lines = codeLines(readFileSync(join(ROOT, rel), 'utf8'))
  const body = lines.join('\n')

  const clientWrite = CREDENTIAL.test(body) && MUTATION.test(body)
  const postgresWrite = DIRECT_POSTGRES.test(body)
  if (!clientWrite && !postgresWrite) continue

  // A provably read-only session holds no write power, so it is not counted as
  // write-capable at all. Counted separately so the summary still says how many
  // such probes exist rather than hiding them.
  if (postgresWrite && !clientWrite && isProvablyReadOnly(body)) {
    readOnlyProbes.push(rel)
    continue
  }

  writeCapable += 1
  if (clientWrite) viaClient += 1
  if (postgresWrite) viaPostgres += 1

  if (PREFLIGHT.test(body)) continue
  if (hasRefCheck(lines)) continue

  // The remedy differs by transport, so the verdict carries which one it is.
  offenders.push({ rel, postgres: postgresWrite })
}

if (offenders.length > 0) {
  const pgOffenders = offenders.filter((o) => o.postgres)
  const clientOffenders = offenders.filter((o) => !o.postgres)

  console.error('')
  console.error('[no-unguarded-production-write] FAILED. Build blocked.')
  console.error('')
  console.error(`  ${offenders.length} write-capable script(s) under scripts/ can reach a database`)
  console.error('  and nothing in them checks which one.')

  if (clientOffenders.length > 0) {
    console.error('')
    console.error('  VIA THE SUPABASE CLIENT (a service-role credential plus a mutation):')
    console.error('')
    for (const o of clientOffenders) console.error(`    ${o.rel}`)
    console.error('')
    console.error('  Add the preflight as the first executable statement of each:')
    console.error('')
    console.error("    import { assertNotProduction } from './lib/production-write-preflight.mjs'")
    console.error('    assertNotProduction()')
  }

  if (pgOffenders.length > 0) {
    console.error('')
    console.error('  VIA A DIRECT POSTGRES CONNECTION (authenticates as the schema OWNER,')
    console.error('  so DROP, ALTER and TRUNCATE are in scope):')
    console.error('')
    for (const o of pgOffenders) console.error(`    ${o.rel}`)
    console.error('')
    console.error('  Resolve the target from the environment and check it before building')
    console.error('  the client. Never write a database host into the source:')
    console.error('')
    console.error("    import { assertNotProductionDatabase } from './lib/production-write-preflight.mjs'")
    console.error('    const target = assertNotProductionDatabase()')
    console.error('    const client = new pg.Client(target.clientConfig)')
  }

  console.error('')
  console.error('  (from scripts/verify/ the path is ../lib/production-write-preflight.mjs)')
  console.error('')
  console.error('  Either entry point resolves the project this process will actually use,')
  console.error('  refuses PRODUCTION unless ALLOW_PRODUCTION_SUPABASE=1 is explicitly set,')
  console.error('  and refuses outright when it cannot tell. A script that already refuses a')
  console.error('  production ref itself satisfies this guard as it stands.')
  console.error('')
  process.exit(1)
}

console.log(
  `[no-unguarded-production-write] PASS. ${writeCapable} write-capable script(s) under scripts/ ` +
    `(${viaClient} via the Supabase client, ${viaPostgres} via a direct Postgres connection), ` +
    'every one guarded (preflight, TEST allowlist, or PROD denylist).',
)
// Named rather than merely counted: a silently exempted category is how an
// exemption becomes a habit. Anyone reading a PASS can see exactly which files
// were admitted on the read-only argument and go check them.
if (readOnlyProbes.length > 0) {
  console.log(
    `[no-unguarded-production-write] plus ${readOnlyProbes.length} provably read-only probe(s), ` +
      'admitted because a default_transaction_read_only=on session cannot write:',
  )
  for (const p of readOnlyProbes) console.log(`    ${p}`)
}
