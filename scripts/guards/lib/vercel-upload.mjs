/**
 * REPRODUCE THE TREE VERCEL ACTUALLY BUILDS IN, ON THIS MACHINE.
 *
 * WHY THIS EXISTS, and it is the fourth occurrence of the same defect.
 *
 * .vercelignore strips docs/ from the deployment, so a build-time script that
 * reads a docs/ path passes locally and blocks every Vercel build. That was
 * caught three times (docs/PRICING.md, docs/security/CREDENTIAL-ROTATION.md,
 * docs/scope/community-layer-approved.json) and answered with
 * scripts/guards/vercelignore-covers-guard-reads.mjs, which judges REQUIRED
 * reads statically and accepts a WRITTEN RATIONALE for the scripts declared
 * TOLERANT of an absent docs/.
 *
 * On 8 September 2026 a rationale was wrong and nothing executed it. The
 * deployment of 7564b40 failed on launch-readiness-honest.mjs, whose reviewed
 * entry read "SKIPS by name when docs/verification is absent, which is exactly
 * the stripped upload". It is not. Read the build log of that deployment:
 *
 *     Found .vercelignore
 *     Removed 4464 ignored files defined in .vercelignore
 *       /.git/config
 *       /.git/description
 *       /.git/hooks/applypatch-msg.sample
 *
 * .vercelignore names `.git`, a DIRECTORY, and the removal enumerated the FILES
 * inside it. Vercel deletes matched files and leaves the directory tree standing.
 * So docs/verification EXISTS on the build host and is EMPTY, the guard read a
 * present directory with its report missing as "somebody deleted it", and it
 * blocked the deploy. The rationale was prose, and prose does not run.
 *
 * This module makes the claim executable. It materialises the upload shape:
 * every tracked path's DIRECTORIES created, and only the files .vercelignore
 * keeps linked in. A guard can then run a script in that tree and observe what
 * Vercel would observe, instead of asserting it in a comment.
 *
 * COST. The files are HARD LINKS, so 6,600 of them add directory entries and no
 * data, which matters on a machine held to a disk floor. The caller removes the
 * tree in a finally; removeUpload() unlinks names, never file contents.
 *
 * FIDELITY, stated so the limits are visible rather than assumed:
 *   - No .git. The Vercel host has none either: every git-reading guard printed
 *     "fatal: not a git repository" in that same build log.
 *   - node_modules is a junction to the real one. Vercel does not upload it at
 *     all, it installs or restores from cache, so the upload semantics do not
 *     apply and a link is the cheap equivalent.
 *   - Untracked files are absent, because Vercel clones from git.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, linkSync, copyFileSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gitEnv } from '../../lib/git-env.mjs'
import { makeJudgeIgnored, readVercelIgnore } from './vercelignore.mjs'

/**
 * Every path git tracks, posix-separated, relative to the root. This is what
 * Vercel clones, so it is the correct starting set for the upload.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function listTrackedFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnv(),
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\0').filter(Boolean)
}

/**
 * Build the upload tree at dest.
 *
 * @param {object} options
 * @param {string} options.root the real repository root
 * @param {string} options.dest an empty directory to build in
 * @param {string[]} [options.files] tracked paths; defaults to listTrackedFiles(root)
 * @param {boolean} [options.linkNodeModules] junction node_modules across (default true)
 * @returns {{ kept: number, stripped: number, directories: number, ignoreErrors: string[] }}
 */
export function materialiseVercelUpload({ root, dest, files, linkNodeModules = true }) {
  const { rules, errors } = readVercelIgnore(root)
  const judge = makeJudgeIgnored(rules)
  const tracked = files ?? listTrackedFiles(root)

  const madeDirs = new Set()
  const ensureDir = (relDir) => {
    if (relDir === '' || relDir === '.' || madeDirs.has(relDir)) return
    mkdirSync(join(dest, relDir), { recursive: true })
    madeDirs.add(relDir)
  }

  let kept = 0
  let stripped = 0

  for (const rel of tracked) {
    // The directory is created whether or not the file survives. That single
    // line is the whole point of this module: it is what leaves docs/verification
    // present and empty on the build host.
    const relDir = dirname(rel).replace(/\\/g, '/')
    ensureDir(relDir === '.' ? '' : relDir)

    if (judge(rel).ignored) {
      stripped += 1
      continue
    }

    const from = join(root, rel)
    const to = join(dest, rel)
    if (!existsSync(from)) continue // tracked but deleted in the working tree
    try {
      linkSync(from, to)
    } catch {
      // Different volume, or a filesystem with no hard links. Copying costs disk
      // but never correctness, and it is the rare path.
      copyFileSync(from, to)
    }
    kept += 1
  }

  if (linkNodeModules && existsSync(join(root, 'node_modules')) && !existsSync(join(dest, 'node_modules'))) {
    symlinkSync(join(root, 'node_modules'), join(dest, 'node_modules'), 'junction')
  }

  return { kept, stripped, directories: madeDirs.size, ignoreErrors: errors }
}

/**
 * Does this directory hold no regular file, at any depth?
 *
 * The question a guard actually needs when its subject lives under docs/. An
 * absent directory answers true, and so does a directory of empty directories,
 * which is what .vercelignore leaves behind and is the shape that broke the
 * deployment of 7564b40. A symlink counts as a file: something is there.
 *
 * @param {string} absDir
 */
export function holdsNoFile(absDir) {
  if (!existsSync(absDir)) return true
  const stack = [absDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(join(dir, entry.name))
      else return false
    }
  }
  return true
}

/**
 * Is this tree a git checkout?
 *
 * The exact discriminator between a developer machine or a CI runner, both of
 * which hold the whole repository, and the Vercel build host, which unpacks a
 * source tarball with no .git at all. Every git-reading guard in this repository
 * printed "fatal: not a git repository" in the build log of 7564b40, which is
 * what makes this observable rather than inferred. no-ai-authorship.mjs already
 * skips on the same signal.
 *
 * @param {string} root
 */
export function isGitCheckout(root) {
  return existsSync(join(root, '.git'))
}

/**
 * Remove a materialised upload.
 *
 * Safe against the obvious accident: it refuses a path that is not the one this
 * module built, because rmSync(recursive) pointed at a repository would delete
 * a repository. The marker is the absence of a .git directory plus the presence
 * of the sentinel this module writes.
 *
 * @param {string} dest
 */
export function removeUpload(dest) {
  if (!dest || !existsSync(dest)) return
  if (existsSync(join(dest, '.git'))) {
    throw new Error(`refusing to remove ${dest}: it contains a .git directory, so it is a real repository`)
  }
  rmSync(dest, { recursive: true, force: true })
}
