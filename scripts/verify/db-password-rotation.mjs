/**
 * AFTER ROTATING THE DATABASE PASSWORD: is every copy of it the new one?
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * The production database password is the ONE credential this platform holds
 * that the running application never touches. Nothing under `src/` opens a
 * Postgres connection: the app speaks to Supabase over PostgREST with the
 * service-role key. The password is an OPERATOR credential, used by the
 * migration tooling and by the 29 scripts that connect directly.
 *
 * That is exactly what makes rotating it dangerous in a quiet way. Nothing goes
 * red. No page breaks, no sentinel fires, no gate fails. The first sign that a
 * copy was missed is `28P01 password authentication failed for user "postgres"`
 * from a script somebody runs days later, and this project has already lost two
 * hours to that error once, chasing a parsing bug that did not exist
 * (scripts/lib/db-credentials.mjs records it).
 *
 * ============================================================================
 * THE PART THAT IS EASY TO GET WRONG
 * ============================================================================
 *
 * THE PASSWORD IS NOT IN ONE FILE. Measured on 25 August 2026, the same
 * production password sat in FOUR `.env.local` files, one per checkout:
 *
 *     eventlinqs-app/.env.local              (the main checkout)
 *     eventlinqs-app-backend/.env.local
 *     eventlinqs-app-hardening/.env.local
 *     eventlinqs-app-tab-a/.env.local
 *
 * And the resolution order in `credentialSources()` searches the CURRENT
 * worktree first and the main checkout LAST. So a script run from a worktree
 * whose own `.env.local` still holds the old password uses the old password,
 * while the same script run from the main checkout works. Updating "the" copy
 * fixes the one you tested and leaves the trap set in three others.
 *
 * ============================================================================
 * WHAT THIS REPORTS
 * ============================================================================
 *
 * Every file holding a database credential, with a SHA-256 fingerprint of the
 * value rather than the value. Files sharing a fingerprint hold the same
 * secret; a file whose fingerprint differs from the others is either the one
 * you updated or the one you forgot, and the connection test says which.
 *
 * NO PASSWORD IS EVER PRINTED, logged, or written anywhere by this script.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   node scripts/verify/db-password-rotation.mjs            # inventory only
 *   node scripts/verify/db-password-rotation.mjs --connect --project test
 *   node scripts/verify/db-password-rotation.mjs --connect --project prod
 *
 * `--connect` proves the resolved credential actually authenticates. Without a
 * connection this is an inventory, not a verification, and it says so.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import {
  REPO_ROOT,
  mainWorktreeRoot,
  refForAlias,
  resolveCredential,
  describeEndpoint,
  isProductionRef,
} from '../lib/db-credentials.mjs'
import { openProject } from '../lib/production-write-preflight.mjs'

const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const value = name => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const ALIAS = value('project') ?? 'test'

/** A short, stable fingerprint. Enough to compare copies, useless as a secret. */
const fingerprint = v => createHash('sha256').update(String(v)).digest('hex').slice(0, 8)

/**
 * Every checkout of this project on this machine.
 *
 * Derived from the worktree list rather than hardcoded, so a worktree added
 * tomorrow is inventoried too. The founder's `C:/elrel` worktree lives outside
 * the project folder, which is precisely the kind of copy a hardcoded list
 * forgets.
 */
function checkoutRoots() {
  /*
   * NORMALISED BEFORE DEDUPING. The first run of this script listed the main
   * checkout's .env.test three times, because REPO_ROOT and mainWorktreeRoot()
   * return the same directory with different separators and casing and a Set of
   * raw strings treats those as three places. An inventory that triple-counts a
   * file is an inventory nobody can read a verdict off.
   */
  const norm = p => resolve(String(p)).split('\\').join('/').toLowerCase()
  const seen = new Map()
  const add = p => {
    if (!p) return
    const key = norm(p)
    if (!seen.has(key)) seen.set(key, resolve(String(p)))
  }

  add(REPO_ROOT)
  const main = mainWorktreeRoot()
  if (main) {
    add(main)
    // Sibling directories of the main checkout: the other worktrees.
    const parent = dirname(resolve(main))
    try {
      for (const name of readdirSync(parent)) {
        const candidate = join(parent, name)
        try {
          if (!statSync(candidate).isDirectory()) continue
        } catch {
          continue
        }
        if (existsSync(join(candidate, 'package.json'))) add(candidate)
      }
    } catch (error) {
      console.warn('[scripts/verify/db-password-rotation:127]', error instanceof Error ? error.message : error)
      /* the parent may not be readable; the explicit roots still stand */
    }
  }
  return [...seen.values()]
}

const ENV_FILES = ['.env.local', '.env', '.env.production', '.env.prod', '.env.test', '.env.test.local']

function inventory() {
  const found = []
  for (const root of checkoutRoots()) {
    for (const name of ENV_FILES) {
      const file = resolve(root, name)
      if (!existsSync(file)) continue
      let text
      try {
        text = readFileSync(file, 'utf8')
      } catch (error) {
        console.warn('[scripts/verify/db-password-rotation:146]', error instanceof Error ? error.message : error)
        continue
      }
      for (const line of text.split(/\r?\n/)) {
        const direct = line.match(/^\s*(SUPABASE_DB_PASSWORD(?:_\w+)?)\s*=\s*(.+)\s*$/)
        if (direct) {
          const v = direct[2].trim()
          if (v) found.push({ file, key: direct[1], length: v.length, fingerprint: fingerprint(v), via: 'variable' })
          continue
        }
        const url = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+)\s*$/)
        if (url) {
          const parts = url[1].trim().match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^/?]+)/)
          if (parts && parts[2]) {
            found.push({
              file,
              key: 'SUPABASE_DB_URL',
              length: parts[2].length,
              fingerprint: fingerprint(parts[2]),
              via: `inside a connection string, user ${parts[1]}`,
            })
          }
        }
      }
    }
  }
  return found
}

async function main() {
  console.log('[db-rotation] NO PASSWORD IS PRINTED. Values are shown as a SHA-256 prefix only.')
  console.log('')

  const found = inventory()
  if (found.length === 0) {
    console.log('[db-rotation] no database credential found in any checkout. Nothing to verify.')
    process.exit(0)
  }

  console.log(`[db-rotation] ${found.length} database credential(s) across ${new Set(found.map(f => f.file)).size} file(s):`)
  for (const f of found) {
    console.log(`  ${f.fingerprint}  len ${String(f.length).padStart(3)}  ${f.key}`)
    console.log(`             ${f.file}`)
    if (f.via !== 'variable') console.log(`             ${f.via}`)
  }

  /*
   * GROUPED BY FINGERPRINT. Copies of one secret share one fingerprint; a group
   * of one is either the file you just updated or the file you forgot, and this
   * is the line that shows you which files are about to disagree.
   */
  const groups = new Map()
  for (const f of found) {
    if (!groups.has(f.fingerprint)) groups.set(f.fingerprint, [])
    groups.get(f.fingerprint).push(f)
  }
  console.log('')
  console.log('[db-rotation] DISTINCT SECRETS:')
  for (const [fp, files] of groups) {
    console.log(`  ${fp}  in ${files.length} file(s)`)
  }
  if (groups.size > 2) {
    console.log('')
    console.log('[db-rotation] MORE THAN TWO DISTINCT SECRETS. There should be two: production and TEST.')
    console.log('[db-rotation] A third means a rotation reached some copies and not others.')
  }

  console.log('')
  console.log('[db-rotation] RESOLUTION ORDER MATTERS AND IT IS NOT ALPHABETICAL.')
  console.log('[db-rotation] credentialSources() searches the CURRENT worktree first and the main')
  console.log('[db-rotation] checkout LAST, so a stale copy in the worktree you happen to be standing')
  console.log('[db-rotation] in beats the correct one in the main checkout, silently.')

  if (!flag('connect')) {
    console.log('')
    console.log('[db-rotation] INVENTORY ONLY. Nothing was connected, so nothing is verified.')
    console.log('[db-rotation] Re-run with --connect --project test (or prod) to prove the credential works.')
    process.exit(0)
  }

  const ref = refForAlias(ALIAS)
  if (!ref) {
    console.error(`[db-rotation] could not resolve a project ref for --project ${ALIAS}`)
    process.exit(2)
  }
  const cred = resolveCredential({ ref, alias: ALIAS })
  console.log('')
  console.log(`[db-rotation] CONNECTING to ${ref}${isProductionRef(ref) ? '  (PRODUCTION, read only)' : '  (TEST)'}`)
  console.log(`[db-rotation] credential source: ${cred.from || 'NOTHING FOUND'}`)
  if (cred.password) console.log(`[db-rotation] fingerprint of the credential it will use: ${fingerprint(cred.password)}`)
  if (!cred.password) {
    console.error('[db-rotation] FAIL - no password resolved. Every script that connects directly will fail.')
    process.exit(1)
  }

  /*
   * READ ONLY, ENFORCED BY THE SERVER, NOT BY THIS FILE'S GOOD INTENTIONS.
   *
   * `openProject(alias, { readOnly: true })` opens the session with
   * `-c default_transaction_read_only=on`, so Postgres itself raises 25006 on
   * any INSERT, UPDATE, DELETE or DDL whatever this script goes on to ask for.
   * That matters here more than anywhere: this is the one verification script
   * whose entire job is to point at PRODUCTION, and a check on a production
   * database should not hold a power it does not need.
   *
   * It is also the shared opener, so `one-db-connection-source` is satisfied and
   * a failure comes back as prose naming the credential source rather than as a
   * pg stack trace with the password masked.
   */
  let connected = null
  try {
    const { client, ref: openedRef, target } = await openProject(ALIAS, { readOnly: true })
    const r = await client.query('select current_user, current_database()')
    connected = {
      endpoint: describeEndpoint(target.clientConfig ?? { user: r.rows[0].current_user, host: '', port: 0, database: r.rows[0].current_database }),
      ref: openedRef,
      row: r.rows[0],
    }
    await client.end()
  } catch (err) {
    console.error('[db-rotation] FAIL - the resolved credential did not authenticate.')
    console.error(String(err?.message ?? err))
    console.error('')
    console.error('[db-rotation] 28P01 here means the copy this worktree reads is the OLD password.')
    console.error('[db-rotation] Compare the fingerprint above with the inventory: the file whose')
    console.error('[db-rotation] fingerprint matches is the one still holding the stale value.')
    process.exit(1)
  }

  console.log(`[db-rotation] connected to ${connected.ref}`)
  console.log(`[db-rotation] current_user ${connected.row.current_user}, database ${connected.row.current_database}`)
  console.log('[db-rotation] the session is default_transaction_read_only=on, so it could not have written')
  console.log('')
  console.log('[db-rotation] PASS - the credential this worktree resolves authenticates against the')
  console.log(`[db-rotation] intended project. Run it once per checkout listed above; each one reads`)
  console.log('[db-rotation] its OWN .env.local first.')
  process.exit(0)
}

main().catch(err => {
  console.error('[db-rotation] fatal:', err?.message ?? err)
  process.exit(2)
})
