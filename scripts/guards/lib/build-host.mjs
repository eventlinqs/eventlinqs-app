/**
 * THE VERCEL BUILD HOST IS NOT A DEVELOPER MACHINE.
 *
 * Close-out F2.1, and it is the generalisation of five lost deployments rather
 * than a sixth guard against the fifth one. The class had been named "docs get
 * stripped", which is one instance of it. The real class is one sentence:
 *
 *     No docs. No git. No token. No developer environment of any kind.
 *
 * THE FIVE, so the generalisation is grounded in what actually happened rather
 * than in what sounds general:
 *
 *   1. docs/PRICING.md                        check-pricing-lock          docs
 *   2. docs/security/CREDENTIAL-ROTATION.md   payment-critical-doctrine   docs
 *   3. docs/scope/community-layer-approved.json  community-layer-protected  docs
 *   4. docs/verification/LAUNCH-READINESS.md  launch-readiness-honest     docs
 *   5. git ls-files -z                        excluded-reads-survive-...  git
 *
 * The fifth is the one that proves the point. Every safeguard built after the
 * fourth was about docs/, and the fifth arrived through `.git`, which the same
 * ignore file strips by the same mechanism, and which no docs-shaped guard could
 * see. Naming the class narrowly is how a guard built to stop a failure watches
 * the next one walk past.
 *
 * SO THERE ARE THREE CAPABILITIES, and every build-time script declares which of
 * them it needs. This module DETECTS what a script actually uses, from its own
 * source and the source of everything it imports; the declaration lives in
 * build-host-needs.mjs, and build-host-needs-declared.mjs fails the build when
 * the two disagree IN EITHER DIRECTION.
 *
 * WHY A DECLARATION IS NOT THE TOLERANT LIST THAT FAILED BEFORE. The list deleted
 * in F1.9.2 was a REVIEW: prose asserting a script coped, believed without ever
 * being executed, and one of its entries was wrong. This is not a review and it
 * excuses nothing. It is a claim that is checked three ways: the source must
 * actually use what is declared, the source must declare everything it uses, and
 * the script is then RUN on a host without that capability by
 * excluded-reads-survive-the-upload.mjs. A declaration here buys a script no
 * tolerance at all; it only makes the script's dependence visible so the run can
 * be aimed at it.
 *
 * Driven in tests/unit/guards/build-host.test.ts and drilled in
 * scripts/verify/guard-failure-drills.mjs, which adds an undeclared dependency of
 * each of the three kinds and watches the gate go red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importClosure, pathLiterals, runnableEntries } from './build-time-scripts.mjs'
import { excludedTopLevels } from './build-time-scripts.mjs'
import { readVercelIgnore } from './vercelignore.mjs'

/**
 * What the build host does not have, in the words a failure message uses.
 *
 * The order is the order they cost a deployment, which is also roughly how
 * often each one bites.
 */
export const CAPABILITIES = Object.freeze({
  docs: 'a file outside src/ that .vercelignore strips from the upload',
  git: 'a usable git repository (the host has an empty .git and no objects)',
  token: 'a developer or CI credential (VERCEL_TOKEN, GITHUB_TOKEN, a CLI login)',
})

/** Every capability name, sorted, so a message and a registry cannot disagree on order. */
export const CAPABILITY_NAMES = Object.freeze(Object.keys(CAPABILITIES).sort())

/**
 * Anything that can start a process. Same list as no-inherited-git-env.mjs uses,
 * for the same reason: a call site is a call site whichever of these spelled it.
 */
const SPAWNERS = ['spawnSync', 'spawn', 'execFileSync', 'execFile', 'execSync', 'exec']

/**
 * A spawner invoked with the literal command `git`.
 *
 * DELIBERATELY NOT A SEARCH FOR THE WORD "git". This file, and every guard that
 * explains itself, says "git" in prose dozens of times. The signal is a CALL:
 * one of the spawners, then `'git'` as the first argument.
 */
const GIT_CALL = new RegExp(`\\b(?:${SPAWNERS.join('|')})\\(\\s*['"\`]git['"\`]`, 'g')

/**
 * A token-shaped environment variable read.
 *
 * `_TOKEN` is the shape, taken from the names that exist rather than invented:
 * VERCEL_TOKEN and GITHUB_TOKEN are what the build-time scripts read, and
 * SUPABASE_ACCESS_TOKEN, SENTRY_AUTH_TOKEN, HEALTH_CHECK_TOKEN and
 * UPSTASH_REDIS_REST_TOKEN are the manifest's other token names, so a script
 * that starts reading one of those is caught without an edit here.
 */
const TOKEN_ENV = /process\.env\.([A-Z][A-Z0-9_]*_TOKEN)\b/g

/**
 * The module that resolves the Vercel CLI login off disk. Importing it IS a
 * token dependence even when no `_TOKEN` variable is named, because the whole
 * point of it is to find a credential the build host does not have.
 */
const CLI_LOGIN_MODULE = 'scripts/lib/vercel-login.mjs'

/**
 * The top levels .vercelignore strips, EXCEPT `.git`.
 *
 * `.git` is excluded by that file and is therefore a top level, but a script
 * naming a path inside it does not have a DOCS dependence, it has a GIT one, and
 * reporting it as docs would send the reader to .vercelignore to re-include
 * something that must stay excluded. One mechanism, two capabilities, and the
 * distinction is the reader's whole next step.
 *
 * @param {string} root
 */
export function strippedTopLevels(root) {
  const all = excludedTopLevels(readVercelIgnore(root).rules)
  all.delete('.git')
  return all
}

/**
 * A line that is nothing but comment.
 *
 * NARROW ON PURPOSE, AND THE DIRECTION OF THE ERROR IS THE REASON. Every guard
 * in this repository explains itself at length, and those explanations quote the
 * code they are about. Before this test, `no-inherited-git-env.mjs` was reported
 * as needing git because its header quotes the very call site it forbids, and
 * `one-fee-copy.mjs` was reported twice for `docs/marketing` because its comment
 * names the constant directly beneath it. Requiring a declaration for a
 * dependence that exists only in prose would put a false claim in the registry,
 * which is the exact defect the registry is built to prevent.
 *
 * So this strips WHOLE-LINE comments only: a JSDoc continuation, a `//` line, an
 * opening `/*`. It does NOT lex the language, and it therefore still matches a
 * trailing comment on a line of real code. That is the safe direction: a
 * spurious declaration is noise, and a MISSED call is a deployment. Anything
 * cleverer here risks stripping a real call inside a template literal or a
 * regular expression, and that error is the expensive one.
 *
 * @param {string} line
 */
function isCommentOnly(line) {
  const t = line.trim()
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')
}

/**
 * What one file's own source uses. No imports followed: the caller walks the
 * closure, so a hit is attributed to the file that actually contains it.
 *
 * @param {string} root
 * @param {string} file repository-relative
 * @param {Set<string>} stripped from strippedTopLevels()
 * @returns {Array<{ capability: keyof CAPABILITIES, evidence: string, line: number }>}
 */
export function usesInFile(root, file, stripped) {
  const text = readFileSync(join(root, file), 'utf8')
  const lines = text.split(/\r?\n/)
  const out = []

  lines.forEach((lineText, i) => {
    if (isCommentOnly(lineText)) return
    GIT_CALL.lastIndex = 0
    for (const m of lineText.matchAll(GIT_CALL)) out.push({ capability: 'git', evidence: m[0], line: i + 1 })
    TOKEN_ENV.lastIndex = 0
    for (const m of lineText.matchAll(TOKEN_ENV)) out.push({ capability: 'token', evidence: m[1], line: i + 1 })
  })

  if (file === CLI_LOGIN_MODULE) {
    out.push({ capability: 'token', evidence: 'the Vercel CLI login on disk', line: 1 })
  }

  for (const { literal, line } of pathLiterals(root, [file])) {
    if (isCommentOnly(lines[line - 1] ?? '')) continue
    if (stripped.has(literal.split('/')[0])) out.push({ capability: 'docs', evidence: literal, line })
  }

  return out
}

/**
 * What one prebuild entry point uses, across everything it imports.
 *
 * THE CLOSURE, NEVER THE FILE. scripts/verify/launch-readiness.mjs holds the
 * docs/ literals and scripts/guards/launch-readiness-honest.mjs is what prebuild
 * runs; a scan that read only the entry point would have seen nothing, which is
 * the mistake that made the fourth failure invisible. Vercel reaches the module
 * through the import, so the scan does too.
 *
 * @param {string} root
 * @param {string} entry
 * @param {Set<string>} stripped
 * @returns {Record<string, Array<{ file: string, evidence: string, line: number }>>}
 */
export function usedBy(root, entry, stripped) {
  /** @type {Record<string, Array<{ file: string, evidence: string, line: number }>>} */
  const found = {}
  for (const file of importClosure(root, [entry])) {
    for (const use of usesInFile(root, file, stripped)) {
      ;(found[use.capability] ??= []).push({ file, evidence: use.evidence, line: use.line })
    }
  }
  return found
}

/**
 * Every prebuild entry point, with the capabilities its code actually uses.
 *
 * @param {string} root
 * @returns {Array<{ entry: string, uses: Record<string, Array<{ file: string, evidence: string, line: number }>> }>}
 */
export function scanBuildTimeScripts(root) {
  const stripped = strippedTopLevels(root)
  return runnableEntries(root).map((entry) => ({ entry, uses: usedBy(root, entry, stripped) }))
}

/**
 * The one line a failure prints for a use, so the reader can go straight to it.
 *
 * @param {string} capability
 * @param {{ file: string, evidence: string, line: number }} use
 */
export function describeUse(capability, use) {
  return `${capability}: ${use.file}:${use.line}  ${use.evidence}`
}
