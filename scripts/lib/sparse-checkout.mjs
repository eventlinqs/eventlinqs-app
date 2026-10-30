/**
 * WHAT A SPARSE CHECKOUT LEAVES OUT ON PURPOSE.
 *
 * The window worktrees run with sparse-checkout on, so about 4,400 tracked files under docs/ are in git and absent
 * from the disk, by design, to keep C: above the build floor. A test that judges the repository by looking at the
 * disk then reads those files as missing and fails on every run there, which is how three tests became "the
 * baseline" that every window quoted and nobody fixed (X13, 31 October 2026).
 *
 * These two helpers let such a test tell the two apart. A path git marks skip-worktree is held by git and left out
 * of this checkout; anything else that is missing really is missing. Vercel uploads from a full clone, and the gate
 * runs on a full checkout, so there the set is empty and nothing a test judges changes.
 */
import { execFileSync } from 'node:child_process'
import { gitEnv } from './git-env.mjs'

/** Every tracked path this checkout leaves out of the working tree (git ls-files -t marks them 'S'). */
export function sparseAbsentPaths(root) {
  const out = execFileSync('git', ['ls-files', '-t', '-z'], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnv(),
    maxBuffer: 64 * 1024 * 1024,
  })
  return new Set(
    out
      .split('\0')
      .filter((entry) => entry.startsWith('S '))
      .map((entry) => entry.slice(2)),
  )
}

/** Whether HEAD holds the path: a file, or for a path ending in '/' a directory with at least one file in it. */
export function heldAtHead(root, path) {
  const out = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', path.replace(/\/$/, '')], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnv(),
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\0').some(Boolean)
}

/**
 * Whether this checkout leaves the path out on purpose: the file itself, or for a path ending in '/' a file under it.
 * Asked only of a path already found absent from the disk.
 */
export function leftOutOfThisCheckout(sparse, path) {
  const prefix = path.endsWith('/') ? path : null
  if (!prefix) return sparse.has(path)
  for (const p of sparse) if (p.startsWith(prefix)) return true
  return false
}
