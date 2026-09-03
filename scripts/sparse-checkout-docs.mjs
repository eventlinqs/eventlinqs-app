/**
 * sparse-checkout-docs.mjs - stop every worktree carrying its own copy of the
 * evidence archive.
 *
 * ---------------------------------------------------------------------------
 * THE MEASUREMENT THAT LED HERE (8 August 2026). The EventLinqs tree was
 * 16.60 GB and `reclaim-space` could not touch the largest part of it:
 *
 *     10.69 GB  docs/, replicated across nine linked worktrees
 *      2.80 GB  node_modules across all worktrees
 *      1.66 GB  the shared .git object store
 *
 * `docs/` is 2790 image files, single files up to 26 MB. Nine linked worktrees
 * each check out their own full copy of it, and almost none of them ever reads
 * it: a branch fixing RLS does not need the competitor benchmark captures.
 *
 * NOTHING IS DELETED AND NOTHING IS LOST. Sparse-checkout changes only which
 * paths are MATERIALISED in a working tree. Every object stays in the shared
 * `.git`, every file stays in every commit, and any excluded path can be pulled
 * back in a second with `--get` or the whole thing with `--restore`.
 *
 * DOCTRINE, inherited from the reclaim-space incident: this script operates on
 * the worktree it is RUN FROM and never reaches sideways. Run it inside each
 * worktree you want thinned, when nobody is working in that worktree.
 *
 * Run:  node scripts/sparse-checkout-docs.mjs            report only
 *       node scripts/sparse-checkout-docs.mjs --apply    thin THIS worktree
 *       node scripts/sparse-checkout-docs.mjs --get docs/roast   materialise one path
 *       node scripts/sparse-checkout-docs.mjs --restore  full checkout back
 */
import { execFileSync } from 'node:child_process'

import { gitEnv } from './lib/git-env.mjs'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const RESTORE = args.includes('--restore')
const FORCE = args.includes('--force')
const GET = args.includes('--get') ? args[args.indexOf('--get') + 1] : null

/**
 * Paths a working tree needs to build, test and run. docs/ is not one.
 *
 * `.githooks` IS one, and its absence from this list was a silent hole in Law
 * 8. `.githooks/commit-msg` is the first of the two layers that stop an AI
 * authorship trailer entering the history, and it is the only layer that acts
 * before the commit exists. `core.hooksPath` is local config that lives in the
 * shared .git, so it survives thinning; the hook FILE does not. Thinning a
 * worktree therefore left `core.hooksPath` pointing at a directory that was no
 * longer on disk, and git runs no hook and reports no error when the file is
 * missing. Enforcement disappeared with nothing to notice, which is the exact
 * failure mode the second layer exists to catch and the second layer is
 * bounded by date and skippable with --no-verify.
 *
 * The rule this encodes: a path that ENFORCES something is not evidence and is
 * never thinned, however rarely it is read.
 */
const KEEP = [
  'src', 'scripts', 'supabase', 'tests', 'public', 'types',
  'design-assets', '.github', '.husky', '.githooks',
]

const git = (...a) =>
  execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv() }).trim()

function sizeGb(dir) {
  let bytes = 0
  const walk = (d) => {
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch (error) {
      console.warn('[scripts/sparse-checkout-docs:62]', error instanceof Error ? error.message : error)
      return
    }
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else {
        try {
          bytes += statSync(full).size
        } catch {
          /* vanished */
        }
      }
    }
  }
  walk(dir)
  return bytes / 1024 ** 3
}

const gitDir = git('rev-parse', '--git-dir')
const commonDir = git('rev-parse', '--git-common-dir')
const isPrimary = resolve(REPO, gitDir) === resolve(REPO, commonDir)

console.log('SPARSE CHECKOUT: docs/')
console.log(`worktree : ${REPO}`)
console.log(`role     : ${isPrimary ? 'PRIMARY (holds the shared object store)' : 'linked worktree'}`)
console.log(`branch   : ${git('rev-parse', '--abbrev-ref', 'HEAD')}`)

const docsGb = existsSync(join(REPO, 'docs')) ? sizeGb(join(REPO, 'docs')) : 0
const tracked = git('ls-files', 'docs').split('\n').filter(Boolean).length
let untracked = 0
try {
  untracked = git('ls-files', '--others', '--exclude-standard', 'docs').split('\n').filter(Boolean).length
} catch {
  /* none */
}
console.log(`docs/    : ${docsGb.toFixed(2)} GB, ${tracked} tracked file(s), ${untracked} untracked`)

const state = (() => {
  try {
    return git('sparse-checkout', 'list') ? 'sparse' : 'full'
  } catch {
    return 'full'
  }
})()
console.log(`state    : ${state} checkout\n`)

// --- refusals ---------------------------------------------------------------
if ((APPLY || RESTORE) && isPrimary && !FORCE) {
  console.log('REFUSING: this is the PRIMARY worktree.')
  console.log('')
  console.log('The primary holds the shared object store and is the copy that keeps')
  console.log('everything. Thinning it would leave no working tree with the evidence')
  console.log('materialised, so a reviewer would have to know this command exists before')
  console.log('they could open a screenshot. Thin the LINKED worktrees instead.')
  console.log('')
  console.log('  --force  override, if you genuinely want the primary thinned too')
  process.exit(2)
}

if (APPLY && untracked > 0 && !FORCE) {
  console.log(`REFUSING: ${untracked} UNTRACKED file(s) under docs/.`)
  console.log('')
  console.log('Sparse-checkout only manages TRACKED paths. Untracked files are left on')
  console.log('disk, so they would neither be reclaimed nor protected, and they are the')
  console.log('one category that is NOT recoverable from git. Commit them or remove them')
  console.log('first, then run this again.')
  console.log('')
  console.log('  git status --short docs/ | Select-String "^\\?\\?"')
  process.exit(2)
}

// --- actions ----------------------------------------------------------------
if (GET) {
  // Materialise one path without abandoning the thin checkout: the answer to
  // "what if this worktree DOES need a document".
  const current = (() => {
    try {
      return git('sparse-checkout', 'list').split('\n').filter(Boolean)
    } catch {
      return []
    }
  })()
  if (current.length === 0) {
    console.log('This worktree is already a full checkout; every path is present.')
    process.exit(0)
  }
  git('sparse-checkout', 'add', GET)
  console.log(`ADDED ${GET} to the checkout.`)
  console.log(`present now: ${existsSync(join(REPO, GET)) ? 'YES' : 'no'}`)
  process.exit(0)
}

if (RESTORE) {
  git('sparse-checkout', 'disable')
  console.log('RESTORED: full checkout. Every tracked path is materialised again.')
  console.log(`docs/ now: ${sizeGb(join(REPO, 'docs')).toFixed(2)} GB`)
  process.exit(0)
}

if (APPLY) {
  const before = docsGb
  git('sparse-checkout', 'init', '--cone')
  git('sparse-checkout', 'set', ...KEEP)
  const after = existsSync(join(REPO, 'docs')) ? sizeGb(join(REPO, 'docs')) : 0
  console.log(`APPLIED. Kept: ${KEEP.join(', ')}`)
  console.log(`docs/ ${before.toFixed(2)} GB -> ${after.toFixed(2)} GB  (reclaimed ${(before - after).toFixed(2)} GB)`)
  console.log('')
  console.log('Nothing was deleted from history. To get one document back:')
  console.log('  node scripts/sparse-checkout-docs.mjs --get docs/roast')
  console.log('To undo entirely:')
  console.log('  node scripts/sparse-checkout-docs.mjs --restore')
  process.exit(0)
}

// --- report -----------------------------------------------------------------
console.log('REPORT ONLY. Nothing changed.')
console.log(`Applying --apply here would stop materialising ${docsGb.toFixed(2)} GB of docs/.`)
console.log('')
console.log('Every file stays in the shared .git and in every commit. This changes only')
console.log('which paths are written to this working tree.')
console.log('')
console.log('  --apply    thin this worktree')
console.log('  --get P    materialise one path again')
console.log('  --restore  full checkout back')
