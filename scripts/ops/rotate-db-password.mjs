/**
 * AFTER YOU CLICK RESET: put the new database password in every checkout, and
 * prove each one authenticates.
 *
 * FOUNDER INSTRUCTION, 26 August 2026: "One command after I click Reset is
 * exactly right."
 *
 * WHAT IS GENUINELY YOURS AND WHY. The reset itself mints a value that does not
 * exist until you click it, in a dashboard, and nothing can script that. This
 * script does the other half: the four-file propagation and the proof, which is
 * the half that has actually gone wrong.
 *
 * THE FAILURE THIS EXISTS TO PREVENT. The production database password is the one
 * credential the running application never touches: nothing under src/ opens a
 * Postgres connection, so rotating it breaks no page, fires no sentinel and fails
 * no gate. It sits in FOUR `.env.local` files, one per checkout, and
 * `credentialSources()` searches the CURRENT worktree first and the main checkout
 * LAST. So a script run from a worktree whose own copy is stale uses the stale
 * password while the same script from the main checkout works. Updating "the"
 * copy fixes the one you tested and leaves the trap set in three others, and the
 * first sign is `28P01 password authentication failed for user "postgres"` from
 * something somebody runs days later. This project has already lost two hours to
 * that error once, chasing a parsing bug that did not exist.
 *
 * THE PASSWORD IS NEVER PRINTED, never logged, never written anywhere but the
 * four target files, and never passed as an argument, because an argument lands
 * in shell history. It is read from the environment, which you set in your own
 * shell.
 *
 * Usage (PowerShell), after clicking Reset in the Supabase dashboard:
 *
 *   $env:NEW_DB_PASSWORD = "<paste the new password>"
 *   node scripts/ops/rotate-db-password.mjs
 *   Remove-Item Env:NEW_DB_PASSWORD
 *
 * Add --dry-run to see exactly which files would change and nothing else.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const VAR = 'SUPABASE_DB_PASSWORD_SYDNEY'
const DRY_RUN = process.argv.includes('--dry-run')

/**
 * Every checkout that holds a copy. Measured 25 and 26 August 2026 by
 * scripts/verify/db-password-rotation.mjs; el-moat, C:/elrel and
 * eventlinqs-organiser-engine have no `.env.local` and resolve through the main
 * checkout, so they are correctly absent from this list.
 */
const TARGETS = [
  'C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-app/.env.local',
  'C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-app-backend/.env.local',
  'C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-app-hardening/.env.local',
  'C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-app-tab-a/.env.local',
]

const NEWLINE = String.fromCharCode(10)
const fingerprint = (v) => createHash('sha256').update(v).digest('hex').slice(0, 12)

const next = process.env.NEW_DB_PASSWORD

if (!next) {
  console.error('FAIL: NEW_DB_PASSWORD is not set.')
  console.error('')
  console.error('  PowerShell : $env:NEW_DB_PASSWORD = "<paste the new password>"')
  console.error('  bash       : export NEW_DB_PASSWORD=\'<paste the new password>\'')
  console.error('')
  console.error('It is read from the environment rather than an argument on purpose:')
  console.error('an argument lands in shell history.')
  process.exit(1)
}

/*
 * THE PERCENT-ENCODING TRAP, refused rather than warned about.
 *
 * A password hand-encoded for a connection string is the cause of the 28P01 that
 * cost two hours, and it is invisible afterwards because `pg` prints REDACTED for
 * a string it could not parse. The value here must be the RAW password exactly as
 * the dashboard shows it. Supabase generates from an alphanumeric alphabet, so a
 * literal % is a very strong signal that something has already been encoded.
 */
if (/%[0-9A-Fa-f]{2}/.test(next)) {
  console.error('REFUSED: NEW_DB_PASSWORD looks percent-encoded (it contains a %XX sequence).')
  console.error('')
  console.error('Paste the password RAW, exactly as the dashboard shows it. Encoding is')
  console.error('applied where a connection string is built, never here. A hand-encoded')
  console.error('password is the cause of the 28P01 that cost this project two hours, and')
  console.error('it is invisible afterwards because pg prints REDACTED for a string it')
  console.error('could not parse.')
  process.exit(1)
}

if (next.trim() !== next) {
  console.error('REFUSED: NEW_DB_PASSWORD has leading or trailing whitespace.')
  console.error('That is almost always a copy-paste artefact and it authenticates as a')
  console.error('different password than the one you can see.')
  process.exit(1)
}

console.log(`rotate-db-password${DRY_RUN ? '  (DRY RUN, nothing is written)' : ''}`)
console.log(`  variable    : ${VAR}`)
console.log(`  new value   : fingerprint ${fingerprint(next)} (the password itself is never printed)`)
console.log(`  checkouts   : ${TARGETS.length}`)
console.log('')

let written = 0
let unchanged = 0
const missing = []

for (const file of TARGETS) {
  const label = file.replace('C:/Users/61416/OneDrive/Desktop/EventLinqs/', '')

  if (!existsSync(file)) {
    console.log(`  MISSING  ${label}`)
    missing.push(file)
    continue
  }

  const src = readFileSync(file, 'utf8')
  const eol = src.includes(String.fromCharCode(13, 10)) ? String.fromCharCode(13, 10) : NEWLINE
  const lines = src.split(eol)

  let found = false
  let already = false
  for (let i = 0; i < lines.length; i += 1) {
    const m = new RegExp(`^${VAR}=(.*)$`).exec(lines[i])
    if (!m) continue
    found = true
    if (m[1] === next) {
      already = true
      break
    }
    lines[i] = `${VAR}=${next}`
    break
  }

  if (!found) {
    // Absent rather than stale. Appending is correct: a checkout that resolves
    // the production credential must carry it, and a silent skip here is how
    // one checkout ends up on a different password from the other three.
    lines.push(`${VAR}=${next}`)
    console.log(`  APPENDED ${label}  (the variable was not present)`)
    if (!DRY_RUN) writeFileSync(file, lines.join(eol))
    written += 1
    continue
  }

  if (already) {
    console.log(`  same     ${label}  already holds this value`)
    unchanged += 1
    continue
  }

  console.log(`  updated  ${label}`)
  if (!DRY_RUN) writeFileSync(file, lines.join(eol))
  written += 1
}

console.log('')
console.log(`did ${written} file(s) written, ${unchanged} already correct`)
console.log(`found ${missing.length} missing checkout(s)`)

if (missing.length > 0) {
  console.error('')
  console.error('FAIL: a checkout in the list has no .env.local.')
  console.error('Either the checkout moved, or it was deleted. Fix the list in this script')
  console.error('rather than leaving an entry that silently checks nothing.')
  process.exit(1)
}

if (DRY_RUN) {
  console.log('')
  console.log('DRY RUN: nothing was written. Re-run without --dry-run to apply.')
  process.exit(0)
}

/*
 * PROVE IT, FROM EVERY CHECKOUT. Writing the file is not the deliverable; the
 * deliverable is that a script run from any of the four authenticates. The
 * verifier is run with its own cwd set to each checkout so it resolves
 * credentials exactly as a real run from that directory would.
 */
console.log('')
console.log('verifying from each checkout:')
/*
 * THE VERIFIER IS RESOLVED ABSOLUTELY, from this checkout.
 *
 * It used to be the relative path 'scripts/verify/db-password-rotation.mjs',
 * looked for inside each target checkout. Three of the four do not carry it, so
 * all four were SKIPPED, `verified` stayed 0, and the script printed
 * "PASS: 0 checkout(s) authenticate". Zero verifications reported as a pass is
 * the exact class this repository has spent the week removing, and it appeared
 * inside the script written to close it.
 *
 * One verifier, run with its cwd set to each checkout, so credential resolution
 * still happens from that directory while the code comes from here.
 */
const verifier = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'verify', 'db-password-rotation.mjs')
let verified = 0
const failedAt = []

for (const file of TARGETS) {
  const cwd = file.replace(/\/\.env\.local$/, '')
  const label = cwd.replace('C:/Users/61416/OneDrive/Desktop/EventLinqs/', '')

  if (!existsSync(cwd)) {
    console.log(`  MISSING  ${label}  the checkout directory does not exist`)
    failedAt.push(label)
    continue
  }

  const run = spawnSync(
    process.execPath,
    [verifier, '--connect', '--project', 'prod'],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ALLOW_PRODUCTION_SUPABASE: '1', NEW_DB_PASSWORD: '' },
      timeout: 120000,
    },
  )

  const ok = run.status === 0
  if (ok) verified += 1
  else failedAt.push(label)
  console.log(`  ${ok ? 'PASS    ' : 'FAIL    '} ${label}`)
  if (!ok) {
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`.split(NEWLINE).filter(Boolean).slice(-6)
    for (const line of out) console.log(`      ${line}`)
  }
}

console.log('')
console.log(`did ${verified + failedAt.length} checkout(s) verified, ${verified} authenticated`)

/*
 * ZERO IS A FAILURE. A rotation that verified nothing has proved nothing, and
 * saying PASS for it is worse than saying nothing at all: it ends the job.
 */
if (verified === 0) {
  console.error('FAIL: NOT ONE checkout was verified. The rotation is unproven.')
  console.error('A run that verifies nothing has not passed; it has not looked.')
  process.exit(1)
}

if (verified !== TARGETS.length) {
  console.error(`FAIL: ${verified} of ${TARGETS.length} checkouts verified. Every copy must be proven.`)
  process.exit(1)
}

if (failedAt.length > 0) {
  console.error(`FAIL: ${failedAt.length} checkout(s) do not authenticate: ${failedAt.join(', ')}`)
  console.error('The rotation is INCOMPLETE. A stale copy produces 28P01 from a script')
  console.error('somebody runs days from now, with nothing red in between.')
  process.exit(1)
}

console.log(`PASS: ${verified} checkout(s) authenticate against production with the new password.`)
console.log('')
console.log('Now clear the variable from your shell:')
console.log('  PowerShell : Remove-Item Env:NEW_DB_PASSWORD')
console.log('  bash       : unset NEW_DB_PASSWORD')
