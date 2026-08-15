/**
 * PROOF: thinning a worktree loses nothing, and a worktree that needs a
 * document can still get it.
 *
 * THE CLAIM UNDER TEST. `docs/` is 10.69 GB replicated across nine linked
 * worktrees, and sparse-checkout is the recommended reclaim. That is only safe
 * if three things are true, and "sparse-checkout does not delete history" is a
 * fact about git, not evidence about THIS repo:
 *
 *   1. a thinned worktree really is smaller;
 *   2. a thinned worktree can materialise any document on demand;
 *   3. the primary keeps everything, and refuses to be thinned by accident.
 *
 * The proof creates a throwaway LINKED worktree with `--no-checkout`, so the
 * evidence archive is never written to disk even once. That matters on a
 * machine with 3.5 GB free: a proof that needs 1.5 GB to demonstrate saving
 * 1.5 GB is not a proof anybody can run.
 *
 * Usage: node scripts/verify/sparse-checkout-proof.mjs
 */
import { execFileSync } from 'node:child_process'

import { gitEnv } from '../lib/git-env.mjs'
import { existsSync, rmSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..', '..')
const PROOF = join(resolve(REPO, '..'), '__sparse-proof__')

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`)
  console.log(`         ${detail}`)
}

const git = (cwd, ...a) =>
  execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv() }).trim()

function sizeGb(dir) {
  let bytes = 0
  const walk = (d) => {
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
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

console.log('SPARSE CHECKOUT PROOF')
console.log(`primary : ${REPO}`)
console.log(`proof   : ${PROOF}\n`)

const primaryDocsBefore = sizeGb(join(REPO, 'docs'))

try {
  rmSync(PROOF, { recursive: true, force: true })
  try {
    git(REPO, 'worktree', 'remove', '--force', PROOF)
  } catch {
    /* not registered */
  }

  // --no-checkout: nothing is written until sparse-checkout has been set, so
  // the 1.5 GB archive is never materialised even momentarily.
  git(REPO, 'worktree', 'add', '--no-checkout', '--detach', PROOF, 'HEAD')
  git(PROOF, 'sparse-checkout', 'init', '--cone')
  git(PROOF, 'sparse-checkout', 'set', 'src', 'scripts', 'supabase', 'tests', 'public')
  git(PROOF, 'checkout')

  // --- 1. it is genuinely smaller -----------------------------------------
  const thinDocs = existsSync(join(PROOF, 'docs')) ? sizeGb(join(PROOF, 'docs')) : 0
  const trackedInDocs = git(REPO, 'ls-files', 'docs').split('\n').filter(Boolean).length
  check(
    'the thinned worktree does not materialise docs/',
    thinDocs < 0.01,
    `docs/ on disk: ${thinDocs.toFixed(3)} GB, against ${primaryDocsBefore.toFixed(2)} GB in the primary`,
  )
  check(
    'it is still a usable worktree',
    existsSync(join(PROOF, 'src')) && existsSync(join(PROOF, 'package.json')),
    'src/ and package.json are present, so it can build and test',
  )

  // --- 2. NOTHING IS LOST --------------------------------------------------
  // The files are still in the commit this worktree has checked out. Asked of
  // git, not of the filesystem.
  const listedInCommit = git(PROOF, 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'docs')
    .split('\n')
    .filter(Boolean).length
  check(
    'every docs file is still in the commit the thin worktree points at',
    listedInCommit === trackedInDocs,
    `${listedInCommit} of ${trackedInDocs} tracked docs files present in HEAD, with 0 bytes on disk`,
  )

  const sampleFile = git(REPO, 'ls-files', 'docs')
    .split('\n')
    .filter((f) => /\.(png|jpg)$/i.test(f))[0]
  const bytesFromGit = execFileSync('git', ['show', `HEAD:${sampleFile}`], {
    cwd: PROOF,
    maxBuffer: 64 * 1024 * 1024,
    env: gitEnv(),
  }).length
  check(
    'a specific image is byte-retrievable from the thin worktree',
    bytesFromGit > 0,
    `${sampleFile} reads back ${(bytesFromGit / 1024).toFixed(0)} KB via git show, without materialising it`,
  )

  // --- 3. a worktree that NEEDS a document can get it ----------------------
  git(PROOF, 'sparse-checkout', 'add', 'docs/roast')
  const gotIt = existsSync(join(PROOF, 'docs', 'roast'))
  const stillThin = !existsSync(join(PROOF, 'docs', 'benchmark'))
  check(
    'it can materialise one document folder on demand',
    gotIt,
    gotIt ? 'docs/roast is now on disk in the thin worktree' : 'docs/roast did not appear',
  )
  check(
    'and the rest stays thin',
    stillThin,
    stillThin ? 'docs/benchmark is still not materialised' : 'the whole archive came back',
  )

  // --- 4. full restore is one command -------------------------------------
  git(PROOF, 'sparse-checkout', 'disable')
  const restored = sizeGb(join(PROOF, 'docs'))
  check(
    'a full restore brings everything back',
    restored > primaryDocsBefore * 0.5,
    `docs/ restored to ${restored.toFixed(2)} GB in the throwaway worktree`,
  )
  // Put it back to thin so the cleanup below is cheap.
  git(PROOF, 'sparse-checkout', 'init', '--cone')
  git(PROOF, 'sparse-checkout', 'set', 'src')

  // --- 5. the primary is untouched, and refuses ---------------------------
  check(
    'the primary still has everything',
    Math.abs(sizeGb(join(REPO, 'docs')) - primaryDocsBefore) < 0.01,
    `docs/ in the primary: ${sizeGb(join(REPO, 'docs')).toFixed(2)} GB, unchanged`,
  )

  let refusal = ''
  let refusalExit = 0
  try {
    refusal = execFileSync('node', ['scripts/sparse-checkout-docs.mjs', '--apply'], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    refusalExit = err.status ?? 1
    refusal = `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
  check(
    'the tool REFUSES to thin the primary without --force',
    refusalExit === 2 && /PRIMARY worktree/.test(refusal),
    refusalExit === 2 ? 'exit 2, naming the primary as the copy that keeps everything' : `exit ${refusalExit}`,
  )
} catch (err) {
  check('the proof ran', false, String(err).slice(0, 300))
} finally {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', PROOF], { cwd: REPO, stdio: 'ignore', env: gitEnv() })
  } catch {
    rmSync(PROOF, { recursive: true, force: true })
  }
  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: REPO, stdio: 'ignore', env: gitEnv() })
  } catch {
    /* ignore */
  }
  console.log(`\ncleanup: ${existsSync(PROOF) ? 'STILL PRESENT' : 'removed'}`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} pass, ${failed.length} FAIL`)
if (failed.length) for (const f of failed) console.log(`  ${f.name}`)
process.exit(failed.length ? 1 : 0)
