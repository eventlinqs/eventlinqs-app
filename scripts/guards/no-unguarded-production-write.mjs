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
 * WHAT COUNTS AS WRITE-CAPABLE. Both halves must appear on non-comment lines of
 * the same file:
 *
 *   1. AN ADMIN CREDENTIAL is named:  SUPABASE_SERVICE_ROLE_KEY,
 *      SUPABASE_SERVICE_ROLE_KEY_PREVIEW, SUPABASE_SECRET_KEY, or the
 *      `service_role` Postgres role.
 *   2. A MUTATION is performed:  a PostgREST client call (.insert(, .upsert(,
 *      .update(, .delete(, .rpc(), a storage write (.upload(, .remove(), an
 *      auth admin mutation (createUser, deleteUser, updateUserById,
 *      inviteUserByEmail), or a raw request declaring a mutating method
 *      (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE').
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
 *   - any write through a transport this list does not name, including a direct
 *     Postgres connection via SUPABASE_DB_URL or a database password, and the
 *     Supabase management API via SUPABASE_ACCESS_TOKEN. Those are different
 *     paths to the same database and this guard does not see them.
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
 * This guard's own source names every pattern it bans, so it would flag itself.
 * Excluded by exact path rather than by a cleverer pattern, because the honest
 * version of "the scanner cannot scan itself" is a one-line exclusion.
 */
const SELF = 'scripts/guards/no-unguarded-production-write.mjs'

const CREDENTIAL = /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY_PREVIEW|SUPABASE_SECRET_KEY|service_role/
const MUTATION = /\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(|\.upload\(|\.remove\(|createUser\(|deleteUser\(|updateUserById\(|inviteUserByEmail\(|method\s*:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/
const REFUSAL = /throw\s+new\s+Error|process\.exit\s*\(\s*1\s*\)|\bdie\s*\(/
const PREFLIGHT = /assertNotProduction\s*\(/
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
let writeCapable = 0

for (const rel of files) {
  if (rel === SELF) continue

  const lines = codeLines(readFileSync(join(ROOT, rel), 'utf8'))
  const body = lines.join('\n')

  if (!CREDENTIAL.test(body)) continue
  if (!MUTATION.test(body)) continue

  writeCapable += 1

  if (PREFLIGHT.test(body)) continue
  if (hasRefCheck(lines)) continue

  offenders.push(rel)
}

if (offenders.length > 0) {
  console.error('')
  console.error('[no-unguarded-production-write] FAILED. Build blocked.')
  console.error('')
  console.error(`  ${offenders.length} write-capable script(s) under scripts/ can reach a Supabase`)
  console.error('  project with a service-role credential and nothing checks which project:')
  console.error('')
  for (const o of offenders) console.error(`    ${o}`)
  console.error('')
  console.error('  Add the preflight as the first executable statement of each:')
  console.error('')
  console.error("    import { assertNotProduction } from './lib/production-write-preflight.mjs'")
  console.error('    assertNotProduction()')
  console.error('')
  console.error('  (from scripts/verify/ the path is ../lib/production-write-preflight.mjs)')
  console.error('')
  console.error('  It resolves the project this process will actually use, refuses PRODUCTION')
  console.error('  unless ALLOW_PRODUCTION_SUPABASE=1 is explicitly set, and refuses outright')
  console.error('  when it cannot tell. A script that already refuses a production ref itself')
  console.error('  satisfies this guard as it stands.')
  console.error('')
  process.exit(1)
}

console.log(
  `[no-unguarded-production-write] PASS. ${writeCapable} write-capable script(s) under scripts/, ` +
    'every one guarded (preflight, TEST allowlist, or PROD denylist).',
)
