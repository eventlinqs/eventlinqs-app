/**
 * DEAD BRANCH SCOPE MAINTENANCE.
 *
 *   node scripts/check-dead-branch-env.mjs            report only, exit 1 on any find
 *   node scripts/check-dead-branch-env.mjs --fix      also delete the dead records
 *
 * WHAT THIS IS FOR. A branch-pinned environment record applies to exactly one
 * git branch's deployments. Vercel refuses to CREATE one for a branch that does
 * not exist:
 *
 *   {"status":"error","reason":"branch_not_found",
 *    "message":"Branch \"...\" not found in the connected Git repository."}
 *
 * but it does NOT remove the record when that branch is later deleted. The
 * asymmetry is the whole problem: records accumulate, outlive their branch, and
 * keep holding credentials that nobody is watching and nobody can reach. Each
 * one is a copy of a secret with no owner and no reason to exist.
 *
 * KEYED ON BRANCH EXISTENCE, NEVER ON A HARDCODED LIST. An earlier sketch of
 * this carried a list of branch names believed to be dead. That was wrong twice
 * over: the list was mostly WRONG (of nine branches assumed dead, eight were
 * still on the remote and unmerged), and a list is stale the moment anyone
 * pushes or deletes a branch. The remote is asked directly, every run.
 *
 * LIVE BRANCHES ARE NEVER TOUCHED. A record is only ever a candidate when its
 * branch is absent from `git ls-remote --heads origin`. Branches that are
 * currently checked out in a worktree are additionally protected, so a branch
 * that exists locally but has not been pushed yet cannot be swept.
 *
 * NEVER PRINTS A VALUE. Names, scopes and branches only.
 */

import { execFileSync } from 'node:child_process'

import { gitEnv } from './lib/git-env.mjs'

const args = process.argv.slice(2)
const FIX = args.includes('--fix')
const VERCEL = ['--yes', 'vercel@55']
const SCOPE_LABEL = { Production: 'production', Preview: 'preview', Development: 'development' }

function run(file, argv) {
  try {
    // env: gitEnv() even though `file` is a variable and this runs vercel as
    // well as git. This decides which branches are DEAD, and --fix deletes
    // Vercel environment variables on that answer. Under a leaked GIT_DIR the
    // worktree enumeration would describe another repository and a live branch
    // could be classified dead, which deletes a live deployment's credentials.
    // NOTE for the guard: no-inherited-git-env cannot see this call, because the
    // command is a variable rather than the literal 'git'. It is fixed by hand
    // and named in that guard's stated blind spot.
    return { ok: true, out: execFileSync(file, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true, env: gitEnv() }) }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}\n${e.stderr ?? ''}` }
  }
}

console.log('\nDEAD BRANCH SCOPE MAINTENANCE')
console.log('='.repeat(74))

// ── The branches that actually exist, asked of the remote, not remembered ──
const remote = run('git', ['ls-remote', '--heads', 'origin'])
if (!remote.ok) {
  console.error('FAIL  could not reach the remote, so no branch can be proven dead.')
  console.error('      Refusing to guess: a wrong guess deletes a live deployment\'s credentials.')
  process.exit(1)
}
const liveBranches = new Set(
  remote.out.split(/\r?\n/).map(l => l.split('refs/heads/')[1]).filter(Boolean).map(s => s.trim()),
)

// Branches checked out in a worktree count as live even if never pushed.
const worktrees = run('git', ['worktree', 'list', '--porcelain'])
if (worktrees.ok) {
  for (const line of worktrees.out.split(/\r?\n/)) {
    const m = /^branch refs\/heads\/(.+)$/.exec(line.trim())
    if (m) liveBranches.add(m[1].trim())
  }
}
console.log(`${liveBranches.size} live branches on the remote (plus any checked out locally)`)

// ── Every branch-pinned record in the store ───────────────────────────────
const listing = run('npx', [...VERCEL, 'env', 'ls'])
if (!listing.ok) {
  console.error('FAIL  the Vercel CLI could not list the project. Run: npx vercel login')
  process.exit(1)
}

const pinned = []
for (const line of listing.out.split(/\r?\n/)) {
  const cells = line.trim().split(/\s{2,}/)
  if (cells.length < 3 || !/^[A-Z][A-Z0-9_]*$/.test(cells[0])) continue
  for (const token of cells[2].split(',').map(s => s.trim()).filter(Boolean)) {
    const m = /^(Production|Preview|Development)\s*\((.+)\)$/.exec(token)
    if (!m) continue
    pinned.push({ name: cells[0], scope: SCOPE_LABEL[m[1]], gitBranch: m[2] })
  }
}
console.log(`${pinned.length} branch-pinned records in the environment store`)

const dead = pinned.filter(r => !liveBranches.has(r.gitBranch))
const deadBranches = [...new Set(dead.map(r => r.gitBranch))].sort()

console.log('')
if (dead.length === 0) {
  console.log('PASS  every branch-pinned record belongs to a branch that still exists.')
  console.log('')
  process.exit(0)
}

console.log(`FAIL  ${dead.length} record(s) are pinned to ${deadBranches.length} branch(es) that no longer exist:`)
for (const b of deadBranches) {
  console.log(`\n  ${b}  (deleted from the remote)`)
  for (const r of dead.filter(x => x.gitBranch === b)) {
    console.log(`    - ${r.name} [${r.scope}]`)
  }
}

if (!FIX) {
  console.log('')
  console.log('Each of these is a credential copy with no owner and no deployment that can reach it.')
  console.log('Re-run with --fix to delete them, or delete one by hand:')
  console.log(`  npx vercel@55 env rm <NAME> <scope> <branch> --yes`)
  console.log('')
  process.exit(1)
}

console.log('\n--fix: deleting')
let removed = 0
for (const r of dead) {
  const res = run('npx', [...VERCEL, 'env', 'rm', r.name, r.scope, r.gitBranch, '--yes'])
  console.log(`  ${res.ok ? 'removed' : 'FAILED '}  ${r.name} [${r.scope}] (${r.gitBranch})`)
  if (res.ok) removed++
}
console.log(`\n${removed} of ${dead.length} removed.\n`)
process.exit(removed === dead.length ? 0 : 1)
