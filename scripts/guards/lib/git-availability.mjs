/**
 * IS THERE A GIT REPOSITORY HERE, ANSWERED ONCE, IN ONE SENTENCE SHAPE.
 *
 * Close-out F2.4. The Vercel build log of ffded236 shows SEVEN build-time
 * scripts reaching for git on a host that has none. One threw and killed the
 * deploy; the rest degraded, each in its own words, and the words were the
 * problem:
 *
 *   [branch-protection-required] no origin remote could be read (...)
 *   [one-pull-request-at-a-time] no origin remote could be read (...)
 *   [preview-state] git could not name the branch here (...)
 *   [preview-state] git could not name the commit here (...)
 *   [migration-collision] SKIP - git unavailable: (...)
 *   [no-ai-authorship] SKIP - no git history in this environment (a Vercel
 *                      build unpacks a source tarball with no .git).
 *
 * Read those as an operator. The first two say the REMOTE is missing, which
 * sends you to look for a remote; there is no repository at all. The last one
 * states a mechanism that is no longer true: the build host has a `.git`, it is
 * simply empty, and that difference is precisely what killed the deployment
 * those lines appear in. Five sentences for one fact is five things to line up,
 * and F1.6 already established the principle for a different guard: three
 * machines, one sentence shape.
 *
 * So every git-reading build-time script asks this module, and every one of them
 * says the same thing in the same words. Which script it was is already in the
 * tag at the start of the line.
 *
 * THE SHAPES ARE DISTINGUISHED because they are genuinely different situations
 * and only one of them is a fault:
 *
 *   checkout    a .git directory holding HEAD: an ordinary clone.
 *   worktree    a .git FILE pointing elsewhere: this repository has nine.
 *   emptied     a .git directory with no HEAD. THE VERCEL SHAPE. .vercelignore
 *               names `.git`, Vercel removes the FILES a rule matches and leaves
 *               the DIRECTORY, so `.git` exists and git refuses to work in it.
 *   absent      no .git at all: a source tarball, or a subdirectory.
 *
 * `emptied` is the one that has to be named out loud, because every reasonable
 * person's first test is `existsSync('.git')` and on that host it says yes.
 *
 * ENFORCEMENT. scripts/guards/build-host-needs-declared.mjs fails the build when
 * an entry point declares a `git` need and does not reach this module, so a
 * script added next month cannot invent a seventh sentence.
 *
 * Driven in tests/unit/guards/git-availability.test.ts.
 */
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** @typedef {'checkout' | 'worktree' | 'emptied' | 'absent'} GitShape */

/**
 * What shape is `.git` here?
 *
 * @param {string} root
 * @returns {GitShape}
 */
export function gitShape(root) {
  const dotGit = join(root, '.git')
  if (!existsSync(dotGit)) return 'absent'
  if (!statSync(dotGit).isDirectory()) return 'worktree'
  return existsSync(join(dotGit, 'HEAD')) ? 'checkout' : 'emptied'
}

/**
 * Can git actually be used here?
 *
 * @param {string} [root]
 * @returns {{ usable: boolean, shape: GitShape }}
 */
export function gitAvailability(root = process.cwd()) {
  const shape = gitShape(root)
  return { usable: shape === 'checkout' || shape === 'worktree', shape }
}

/** The sentence for each shape, so no caller writes its own. */
const WHY = {
  absent: 'there is no .git here at all, so this tree was never a repository (a source tarball, or a subdirectory)',
  emptied:
    'there is a .git directory here and it holds no HEAD, which is the Vercel build host shape: .vercelignore names .git, and Vercel removes the files a rule matches while leaving the directory standing',
  checkout: 'this is an ordinary git checkout',
  worktree: 'this is a linked git worktree',
}

/**
 * THE ONE SENTENCE every git-reading build-time script prints when it cannot
 * read a repository. Its own tag names which script it was.
 *
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {string} [options.wanted] what the script was going to ask git for, so
 *   the reader knows what is NOT being judged rather than only that something
 *   went wrong.
 * @returns {string}
 */
export function describeNoGit({ root = process.cwd(), wanted = 'git' } = {}) {
  const { shape } = gitAvailability(root)
  return `NO GIT REPOSITORY: ${WHY[shape]}. ${wanted} is therefore NOT JUDGED here, rather than judged and found absent.`
}

/**
 * The whole line, tag included, ready to print.
 *
 * @param {string} tag e.g. '[branch-protection-required]'
 * @param {string} wanted
 * @param {string} [root]
 */
export function noGitLine(tag, wanted, root = process.cwd()) {
  return `${tag} ${describeNoGit({ root, wanted })}`
}
