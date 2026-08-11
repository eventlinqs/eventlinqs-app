#!/usr/bin/env node
/**
 * Law 8 enforcement: the founder is the sole author.
 *
 * The commit-msg hook in .githooks/ is the first line of defence, and it is the
 * cheap one because it rejects a message before it becomes history. This guard is
 * the second line, for the two ways the hook is missed:
 *
 *   git commit --no-verify        deliberately skips it
 *   core.hooksPath never set      a fresh clone has no hooks at all, and
 *                                 core.hooksPath is local config, not committed
 *
 * WHY IT IS BOUNDED, stated plainly rather than buried, because a scoped guard
 * always looks like a soft one until the reason is given.
 *
 * 705 of the 1351 reachable commits in this repository already carry
 * `Co-Authored-By: Claude <noreply@anthropic.com>`, dating from 2026-04-11. The
 * founder has explicitly NOT authorised the history rewrite that would remove
 * them; the runbook is written and waiting at
 * docs/roast/AUTHORSHIP-HISTORY-REWRITE.md and will be run after launch.
 *
 * An unbounded guard would therefore fail every build from the moment it was
 * registered until that rewrite ran, which would block the launch it exists to
 * protect. A gate that cannot go green is a gate somebody switches off, and then
 * the law has no enforcement at all. So the guard enforces the law from the moment
 * the law was enacted, and prints the deferred debt on every run so it is visible
 * rather than forgotten.
 *
 * EFFECTIVE_FROM is the commit immediately BEFORE Law 8 was written. Every commit
 * that descends from it, including the one that introduced the law, must be clean.
 * Delete the boundary and the `--all-history` branch of this file on the day the
 * rewrite lands.
 */

import { execFileSync } from 'node:child_process'

/**
 * The last commit made before Law 8 existed: 'Law 7: research before recommending'.
 * Everything after this must be clean.
 */
const EFFECTIVE_FROM = '7fd2f4e'

/** How many commits back to inspect, per the founder's instruction. */
const WINDOW = 200

const PATTERNS = [
  {
    re: /^[ \t]*co-authored-by:.*(claude|anthropic|openai|gpt|copilot|gemini|\bai\b|bot\b|assistant)/im,
    why: 'Co-Authored-By trailer naming an AI or a tool',
  },
  { re: /generated with/i, why: '"Generated with" tool credit' },
  { re: /\u{1F916}/u, why: 'robot emoji' },
  { re: /noreply@(anthropic|openai)\.com/i, why: 'model vendor noreply address' },
]

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/**
 * Whether this process can see git history at all.
 *
 * WHY THIS EXISTS. Vercel builds from an uploaded source tarball with no `.git`
 * directory, so every git call exits 128 "not a git repository". Before this
 * check the guard threw that error straight out of `commits()`, `prebuild`
 * failed, and the deployment was blocked with a stack trace. That is precisely
 * the failure this file's own header warns about: a gate that cannot go green
 * is a gate somebody switches off, and then the law has no enforcement at all.
 *
 * SKIPPING HERE IS NOT A WEAKENING, because the guard is not the only line of
 * defence and this environment is the one place it can assert nothing. With no
 * history there are no commit messages to inspect: the guard cannot pass or
 * fail, it can only crash or stand aside. Law 8 is still enforced at both
 * places that DO have history:
 *
 *   .githooks/commit-msg   rejects the trailer before it becomes history
 *   this guard in CI       actions/checkout gives a real repository, and the
 *                          build job runs it on every pull request
 *
 * A commit only reaches a Vercel build after CI has run this guard over it, so
 * nothing gets in through the gap left open here.
 */
function hasGitHistory() {
  try {
    git(['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}

if (!hasGitHistory()) {
  console.log(
    '[no-ai-authorship] SKIP - no git history in this environment (a Vercel build\n' +
      '                  unpacks a source tarball with no .git). Nothing to assert.\n' +
      '                  Law 8 still gated by .githooks/commit-msg at commit time and\n' +
      '                  by this guard in CI, where the checkout is a real repository.',
  )
  process.exit(0)
}

/** Commit list as [sha, subject] pairs, newest first. */
function commits(range) {
  const out = git(['log', ...range, `-${WINDOW}`, '--format=%H%x1f%s%x1e'])
  return out
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, subject] = r.split('\x1f')
      return { sha, subject }
    })
}

function messageOf(sha) {
  return git(['log', '-1', '--format=%B', sha])
}

const allHistory = process.argv.includes('--all-history')

let boundaryKnown = true
try {
  git(['rev-parse', '--verify', `${EFFECTIVE_FROM}^{commit}`])
} catch {
  boundaryKnown = false
}

const range = allHistory || !boundaryKnown ? ['HEAD'] : [`${EFFECTIVE_FROM}..HEAD`]
const scope = allHistory
  ? `the last ${WINDOW} commits on HEAD (all-history mode)`
  : boundaryKnown
    ? `commits after ${EFFECTIVE_FROM} (Law 8 effective boundary)`
    : `the last ${WINDOW} commits on HEAD (boundary commit not present in this checkout)`

const offenders = []
for (const c of commits(range)) {
  const msg = messageOf(c.sha)
  for (const p of PATTERNS) {
    if (p.re.test(msg)) {
      offenders.push({ ...c, why: p.why })
      break
    }
  }
}

// The deferred debt, printed every run so it stays visible rather than forgotten.
if (!allHistory && boundaryKnown) {
  let pre = 0
  try {
    for (const c of commits([EFFECTIVE_FROM])) {
      if (PATTERNS.some((p) => p.re.test(messageOf(c.sha)))) pre++
    }
  } catch {
    /* informational only */
  }
  console.log(
    `[no-ai-authorship] scope: ${scope}.\n` +
      `                  DEFERRED: ${pre} of the last ${WINDOW} commits up to ${EFFECTIVE_FROM} carry an AI trailer.\n` +
      `                  The history rewrite is NOT authorised. Runbook: docs/roast/AUTHORSHIP-HISTORY-REWRITE.md`,
  )
}

if (offenders.length) {
  console.error(
    `\n[no-ai-authorship] FAIL - ${offenders.length} commit(s) attribute this work to an AI.\n` +
      `Law 8: the founder is the sole author.\n`,
  )
  for (const o of offenders) {
    console.error(`  ${o.sha.slice(0, 9)}  ${o.subject}`)
    console.error(`      ${o.why}`)
  }
  console.error(
    `\nThe commit-msg hook should have caught this. Either it was bypassed with\n` +
      `--no-verify, or core.hooksPath is not set in this checkout:\n` +
      `  git config core.hooksPath .githooks\n\n` +
      `To fix a commit that is not yet pushed:\n` +
      `  git commit --amend    (then delete the trailer line)\n`,
  )
  process.exit(1)
}

console.log('[no-ai-authorship] PASS - no commit in scope attributes this work to an AI.')
