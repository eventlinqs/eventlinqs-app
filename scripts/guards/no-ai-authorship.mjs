// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
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

import { gitEnv } from '../lib/git-env.mjs'

/**
 * The boundary. Every commit descending from this must be clean.
 *
 * MOVED 12 August 2026 by founder ruling, from `7fd2f4e` (the commit before Law 8
 * was written) to the integration tip, the merge of the fifth and last launch
 * branch. The reason is recorded rather than left to be guessed: bringing five
 * branches together carried 113 commits with a trailer into this line, none of
 * them written here, and an unbounded guard would fail every build until the
 * history rewrite runs. That rewrite is written and NOT authorised
 * (docs/roast/AUTHORSHIP-HISTORY-REWRITE.md).
 *
 * The move does NOT hide the debt. Every deferred commit is listed with its sha
 * and subject in docs/roast/LAW8-DEBT.md, and the count prints on every run.
 *
 * Full sha rather than an abbreviation, for the same reason the allowlist below
 * uses full shas: an abbreviation can become ambiguous as the repository grows.
 *
 * Delete this boundary and the `--all-history` branch the day the rewrite lands.
 */
const EFFECTIVE_FROM = '579e3a6011f5cb27ccaa9da37f7134959b2dca83'

/**
 * How many commits back to inspect.
 *
 * This is a BOUND, not a filter. If the scope holds more than this the guard now
 * FAILS rather than inspecting only the newest 200 and reporting PASS, because
 * `git log -N` keeps the N most recent and a scope that outgrows the window
 * silently stops examining its own oldest commits. That is enforcement which is
 * not happening, reported as enforcement which is.
 */
const WINDOW = 200

/**
 * Commits that carry a trailer, were INHERITED from another branch rather than
 * written here, and are deferred by founder ruling instead of rewritten.
 *
 * Keyed by FULL sha, deliberately. An abbreviation can become ambiguous as the
 * repository grows and could later resolve to a different object; a full sha
 * names one commit for ever. It also means this list cannot quietly widen into a
 * blanket exemption, which is the way a scoped guard turns into a disabled one.
 * Every entry carries its reason, because an allowlist without reasons is
 * indistinguishable from someone silencing a failure.
 *
 * Nothing here is hidden. A deferred commit is still matched by the same
 * patterns and is still PRINTED on every run, next to the pre-boundary debt, so
 * the ledger stays visible until the authorised rewrite clears it.
 */
const INHERITED_DEFERRED = new Map([
  [
    '86bb285b660a806c8fc03bbc4a9308cb7fe25410',
    'origin/main tip: "Production defect sweep before launch (#112)", squash-merged\n' +
      '      carrying 27 trailers. It entered this branch by merging main, so it is\n' +
      "      main's history rather than work done here. Founder ruling 2026-08-12\n" +
      '      (R-LAW8-DEBT): defer it exactly as the pre-boundary trailers are deferred.\n' +
      '      Rewriting it would rewrite main and break every branch based on it, and\n' +
      '      that rewrite is still not authorised. Clears with the rewrite in\n' +
      '      docs/roast/AUTHORSHIP-HISTORY-REWRITE.md.',
  ],
  [
    '36179dc1a7dc497a029d2542e8c3c22f770c5921',
    'origin/main tip: "Integration/launch (#118)", the GitHub squash-merge of THIS\n' +
      '      branch on 16 August. GitHub composes a squash message by concatenating the\n' +
      '      squashed commits\' messages, so it inherited their trailers wholesale; every\n' +
      '      one of those underlying commits is already deferred here or pre-boundary.\n' +
      '      It became reachable only by merging main back into integration/launch on\n' +
      '      20 August, and the 43 commits this branch has made since the squash are\n' +
      '      all clean. Same class and same founder ruling as 86bb285b: deferring it\n' +
      "      keeps the guard blocking for new work rather than turning it off. Rewriting\n" +
      '      it would rewrite main. Clears with the rewrite in\n' +
      '      docs/roast/AUTHORSHIP-HISTORY-REWRITE.md.',
  ],
])

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
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: gitEnv() })
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

// THE FAIL-OPEN THIS CLOSES. `commits()` passes -WINDOW to git log, which keeps
// the NEWEST WINDOW commits. Before this check, a scope larger than the window
// quietly stopped examining its oldest commits and still printed PASS. Skipped in
// --all-history mode, where scanning a bounded tail is the stated intent.
if (!allHistory) {
  let inScope = null
  try {
    inScope = Number(git(['rev-list', '--count', ...range]).trim())
  } catch {
    inScope = null
  }
  if (inScope !== null && Number.isFinite(inScope) && inScope > WINDOW) {
    console.error(
      `\n[no-ai-authorship] FAIL - the scope holds ${inScope} commits but WINDOW is ${WINDOW}.\n` +
        `Only the newest ${WINDOW} would be inspected, so a PASS here would be false.\n\n` +
        `Move EFFECTIVE_FROM forward and record the newly deferred commits in\n` +
        `docs/roast/LAW8-DEBT.md, or raise WINDOW deliberately. Do not ignore this.\n`,
    )
    process.exit(1)
  }
}

const offenders = []
const deferredHits = []
const scanned = commits(range)
for (const c of scanned) {
  const msg = messageOf(c.sha)
  for (const p of PATTERNS) {
    if (p.re.test(msg)) {
      // A deferred commit is still MATCHED here by the same pattern. It is routed
      // to the ledger rather than skipped before testing, so "deferred" can never
      // quietly become "not looked at".
      if (INHERITED_DEFERRED.has(c.sha)) deferredHits.push({ ...c, why: p.why })
      else offenders.push({ ...c, why: p.why })
      break
    }
  }
}

// HOW MANY COMMITS WERE ACTUALLY READ. Printed unconditionally, because it is the
// only thing in this output that separates a real PASS from a vacuous one.
// actions/checkout defaults to fetch-depth 1, and against a one-commit clone this
// guard reports PASS having inspected a single message: enforcement that is not
// happening, reported as enforcement that is. A reader of the CI log can now see
// the difference without knowing the checkout configuration.
console.log(`[no-ai-authorship] scanned ${scanned.length} commit(s), scope: ${scope}.`)

/*
 * REFUSE TO JUDGE WHAT IT CANNOT SEE. Printing the count told a reader of the log
 * the difference between a real pass and a vacuous one, but only if a reader
 * looked; the exit code said PASS either way. Founder ruling 2026-08-20: a guard
 * that cannot see enough history must FAIL LOUDLY rather than pass, because "a
 * check that passed without doing its work" is the failure class that has cost
 * this project the most.
 *
 * Two independent signals, because either alone can be fooled. `--is-shallow-
 * repository` catches actions/checkout's default fetch-depth 1. The floor catches
 * a clone that is technically complete but truncated below the point where this
 * guard could see the boundary at all.
 *
 * .github/workflows/ci.yml sets fetch-depth: 0 on the job that runs the guards
 * (the only job that runs `npm run build`), so CI is not currently vacuous. This
 * exists so that it cannot become vacuous silently.
 */
const isShallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true'
const MIN_VISIBLE = 2
if (isShallow || scanned.length < MIN_VISIBLE) {
  console.error(
    `\n[no-ai-authorship] FAIL - this guard cannot see enough history to judge.\n` +
      `  shallow repository: ${isShallow}\n` +
      `  commits visible in scope: ${scanned.length} (floor ${MIN_VISIBLE})\n\n` +
      `  A shallow checkout makes this guard inspect one message and report PASS, which is\n` +
      `  enforcement that is not happening reported as enforcement that is. Refusing instead.\n` +
      `  In GitHub Actions set:\n` +
      `      - uses: actions/checkout@v4\n` +
      `        with:\n` +
      `          fetch-depth: 0\n` +
      `  Locally, unshallow with: git fetch --unshallow`,
  )
  process.exit(1)
}

// The ledgers, printed every run so the debt stays visible rather than forgotten.
if (deferredHits.length) {
  console.log(`[no-ai-authorship] DEFERRED (inherited, founder-ruled): ${deferredHits.length}`)
  for (const d of deferredHits) {
    console.log(`  ${d.sha.slice(0, 9)}  ${d.subject}`)
    console.log(`      ${d.why}`)
    console.log(`      ${INHERITED_DEFERRED.get(d.sha)}`)
  }
}

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
    `[no-ai-authorship] DEFERRED (pre-boundary): ${pre} of the last ${WINDOW} commits\n` +
      `                  up to ${EFFECTIVE_FROM.slice(0, 9)} carry an AI trailer.\n` +
      `                  Every deferred commit is listed with its sha and subject in\n` +
      `                  docs/roast/LAW8-DEBT.md, so the debt stays visible.\n` +
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
