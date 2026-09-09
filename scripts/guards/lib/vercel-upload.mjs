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
import { existsSync, linkSync, copyFileSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gitEnv } from '../../lib/git-env.mjs'
import { describeNoGit, gitAvailability } from './git-availability.mjs'
import { walkTrackedFiles } from './gitignore.mjs'
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
 * THE FILE LIST FOR THE UPLOAD, WITHOUT NEEDING GIT, AND MORE ACCURATE WITH IT.
 *
 * Close-out F2.2: "remove its dependence on git ls-files: derive the file list by
 * walking the filesystem and applying the .vercelignore rules, so it works in any
 * checkout, shallow or otherwise."
 *
 * IT NOW WORKS WITHOUT GIT. `walkTrackedFiles` reads every .gitignore governing
 * the tree and walks the filesystem, so a shallow clone, a worktree, a tarball or
 * a directory somebody unzipped all enumerate correctly. That is the dependence
 * removed: the function no longer FAILS without git.
 *
 * WHERE GIT IS AVAILABLE IT IS STILL ASKED, and the reason is a fact no ignore
 * evaluator can recover, measured on this repository rather than assumed:
 *
 *     tracked but not walked                          339
 *     of those, surviving .vercelignore                34
 *     of those, under public/ and therefore shipped    16
 *
 * Those 339 are FORCE-ADDED: `git add -f` on a path .gitignore excludes, which is
 * how the skill files, the Lighthouse baselines and sixteen product rasters under
 * public/ came to be tracked. Being force-added is a fact that exists only in the
 * index. No amount of correct ignore-rule evaluation recovers it, because the
 * rules say the opposite and git is simply overriding them. Vercel clones the
 * repository, so those files ARE on the build host, and a simulation without them
 * is a simulation of a tree that is missing sixteen shipped assets.
 *
 * So: the walk is the FLOOR and the index is a CORRECTION. Both deltas are
 * returned rather than folded away, so the caller prints how far the two
 * disagreed instead of anybody having to trust that they did not.
 *
 * @param {string} root
 * @returns {{ files: string[], source: string, addedByIndex: string[], droppedAsUntracked: string[] }}
 */
export function filesForUpload(root) {
  const walked = walkTrackedFiles(root)
  if (!isGitCheckout(root)) {
    // ONE SENTENCE, SHARED (close-out F2.4). Every build-time script that reaches
    // for git says this, in these words, so five different phrasings for one fact
    // cannot appear in one build log again.
    console.log(describeNoGit({ root, wanted: 'the force-added files only the index holds' }))
    return {
      files: walked,
      source: `a filesystem walk applying every .gitignore (${gitAvailability(root).shape} .git)`,
      addedByIndex: [],
      droppedAsUntracked: [],
    }
  }

  let tracked
  try {
    tracked = listTrackedFiles(root)
  } catch (error) {
    // The predicate said this is a checkout and git disagreed. Say so and carry
    // on with the walk rather than throwing, which is the whole point of F2.2.
    console.warn(
      `[vercel-upload] the index could not be read (${(error.message || '').split(/\r?\n/)[0]}); ` +
        `using the filesystem walk alone, which cannot see force-added files.`,
    )
    return {
      files: walked,
      source: 'a filesystem walk applying every .gitignore (the index refused to be read)',
      addedByIndex: [],
      droppedAsUntracked: [],
    }
  }

  const walkedSet = new Set(walked)
  const trackedSet = new Set(tracked)
  const addedByIndex = tracked.filter((f) => !walkedSet.has(f))
  const droppedAsUntracked = walked.filter((f) => !trackedSet.has(f))
  return {
    files: tracked.slice().sort(),
    source: 'a filesystem walk, corrected by the git index',
    addedByIndex,
    droppedAsUntracked,
  }
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
  const tracked = files ?? filesForUpload(root).files

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

  /*
   * THE EMPTY .git SKELETON, because the build host has one and this simulation
   * did not. Vercel removes the FILES `.vercelignore` matches and leaves the
   * DIRECTORIES; `.git` is matched, so the build host carries an empty `.git`
   * tree. `git ls-files` never mentions `.git`, so nothing above reproduced it,
   * and the simulation was missing the one shape that broke the preview build of
   * ffded236: a tree where `.git` exists and git still refuses to work in it.
   *
   * Reproduced by walking the real `.git` and creating its DIRECTORIES only.
   */
  const realGit = join(root, '.git')
  if (existsSync(realGit) && statSync(realGit).isDirectory()) {
    const stack = ['.git']
    while (stack.length > 0) {
      const rel = stack.pop()
      ensureDir(rel)
      for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
        if (entry.isDirectory()) stack.push(`${rel}/${entry.name}`)
      }
    }
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
 * Is this tree a git checkout that git can actually use?
 *
 * THE VERSION BEFORE THIS ONE WAS `existsSync('.git')` AND IT WAS WRONG ON THE
 * ONE HOST IT WAS WRITTEN FOR. It was never run there. On 9 September 2026 the
 * preview build of ffded236 died proving it: the guard that keys on this did not
 * skip, called `git ls-files`, and got
 *
 *     fatal: not a git repository (or any of the parent directories): .git
 *     Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).
 *
 * Both facts at once, and they are only a contradiction if you believe the old
 * test. `.vercelignore` names `.git`, so Vercel removes the FILES inside it and
 * leaves the DIRECTORY standing - the same mechanism this whole module exists to
 * model, applied to `.git` itself, and the build log for 7564b40 says so by
 * enumerating /.git/config and the hook samples as removed. So `.git` exists on
 * the build host and is empty, `existsSync` answered yes, and git answered no.
 *
 * The test is now what git itself needs:
 *   - `.git` is a FILE: a linked worktree, which this repository has nine of.
 *   - `.git` is a directory holding HEAD: an ordinary checkout.
 *   - `.git` is a directory with no HEAD: the Vercel shape. Not a checkout.
 *
 * @param {string} root
 */
export function isGitCheckout(root) {
  // ONE DEFINITION OF THE THREE SHAPES, in lib/git-availability.mjs, because two
  // copies of this predicate is exactly how the wrong one gets fixed (close-out
  // F2.4). The reasoning above is why the test is what it is; the test itself
  // now lives in one place and every git-reading script asks it.
  return gitAvailability(root).usable
}

/**
 * Remove a materialised upload.
 *
 * Safe against the obvious accident: `rmSync(recursive)` pointed at a repository
 * would delete a repository, so this refuses anything that IS one.
 *
 * THE MARKER IS isGitCheckout, NOT existsSync('.git'), and the difference is not
 * pedantry: the upload this module builds now carries an empty `.git` skeleton,
 * because the build host has one and a simulation that does not have one is a
 * simulation of somewhere else. `existsSync` would refuse to clean up every
 * upload it had just built.
 *
 * @param {string} dest
 */
export function removeUpload(dest) {
  if (!dest || !existsSync(dest)) return
  if (isGitCheckout(dest)) {
    throw new Error(`refusing to remove ${dest}: it is a real git checkout, not a materialised upload`)
  }
  rmSync(dest, { recursive: true, force: true })
}
