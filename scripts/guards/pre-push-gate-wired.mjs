/**
 * GUARD: the pre-push gate is wired, whole, and git will actually run it.
 *
 * WHY (close-out C2.3, 5 September 2026). The rule that nothing is pushed
 * until the same checks pass locally is enforced by exactly one thing: a
 * pre-push hook that runs scripts/ops/pre-push-gate.mjs. Every way that stops
 * being true is quiet. The hook file can be deleted; it can stop invoking the
 * gate; it can invoke the gate with a step selection and run a third of it; it
 * can swallow the verdict and exit 0; git can be pointed at another hooks
 * directory, or at none, because core.hooksPath is LOCAL config that no clone
 * inherits (Law 8 records the same trap for the commit-msg hook). In every one
 * of those states a push looks exactly like a gated push.
 *
 * WHAT IT CHECKS, and prints as it goes:
 *
 *   1. .githooks/pre-push exists, starts with #!/bin/sh, invokes the gate,
 *      passes it no --only or --skip, and exits with the gate result;
 *   2. scripts/ops/pre-push-gate.mjs exists, and package.json exposes it as
 *      the one command, `npm run gate:push`;
 *   3. where git is present and this is not CI or Vercel: the hook is
 *      executable in the index (mode 100755, the bit git preserves across
 *      clones), and core.hooksPath is .githooks, so git runs the file at all.
 *
 * WHAT IT DOES NOT NEED. Git. Vercel builds from a tarball with no repository,
 * so the git-backed checks degrade to a printed SKIP there, the way
 * migration-collision-guard does; the file-backed checks are the ones that
 * matter on a build and they need nothing but the tree.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gitEnv } from '../lib/git-env.mjs'
import { declareWork } from '../lib/work-report.mjs'

export const HOOK = '.githooks/pre-push'
export const GATE = 'scripts/ops/pre-push-gate.mjs'
export const NPM_SCRIPT = 'gate:push'
export const HOOKS_PATH = '.githooks'

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0

/** The hook text, judged. Comment lines are ignored; the shebang is not a comment. */
export function inspectHook(text) {
  if (!nonEmpty(text)) return ['is empty']
  const problems = []
  if (!/^#!\/bin\/sh\b/.test(text)) problems.push('does not start with #!/bin/sh, so git will not run it as a shell hook')
  const code = text.split(/\r?\n/).filter((l) => !/^\s*#/.test(l))
  const calls = code.filter((l) => /\bnode\s+scripts\/ops\/pre-push-gate\.mjs\b/.test(l))
  if (calls.length === 0) problems.push(`never invokes ${GATE}, so no gate runs on a push`)
  for (const l of calls) {
    if (/--(only|skip)\b/.test(l)) problems.push(`invokes the gate with a step selection (${l.trim()}); the hook runs the WHOLE gate`)
  }
  const propagates = calls.some((l) => /^\s*exec\s+node\b/.test(l)) || /\bexit\s+"?\$\{?(status|\?)/.test(code.join('\n'))
  if (calls.length > 0 && !propagates) problems.push('does not exit with the gate result, so a red gate would not block the push')
  return problems
}

/** package.json, judged: the one command must exist and point at the gate. */
export function inspectPackage(pkg) {
  const actual = pkg?.scripts?.[NPM_SCRIPT]
  if (actual === `node ${GATE}`) return []
  return [`package.json scripts.${NPM_SCRIPT} is ${actual === undefined ? 'missing' : JSON.stringify(actual)}; the one command is "node ${GATE}"`]
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const problems = []
  let checks = 0
  let hookLines = 0

  const hookPath = join(root, HOOK)
  checks += 1
  if (!existsSync(hookPath)) {
    problems.push(`${HOOK} is missing`)
  } else {
    let text = ''
    try {
      text = readFileSync(hookPath, 'utf8')
    } catch (error) {
      problems.push(`${HOOK} is unreadable (${error.message})`)
    }
    hookLines = text.split(/\r?\n/).length
    for (const p of inspectHook(text)) problems.push(`${HOOK} ${p}`)
  }

  checks += 1
  if (!existsSync(join(root, GATE))) problems.push(`${GATE} is missing, so the hook has nothing to run`)

  checks += 1
  try {
    for (const p of inspectPackage(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')))) problems.push(p)
  } catch (error) {
    problems.push(`package.json could not be read as JSON (${error.message})`)
  }

  const onCi = Boolean(process.env.CI || process.env.GITHUB_ACTIONS || process.env.VERCEL || process.env.VERCEL_ENV)
  if (onCi) {
    console.log('[pre-push-gate-wired] SKIP the git-backed checks: CI and Vercel have no local hooks to run')
  } else {
    checks += 1
    try {
      const entry = git(root, ['ls-files', '-s', HOOK])
      const mode = entry.split(/\s+/)[0]
      if (mode !== '100755') problems.push(`${HOOK} is mode ${mode || '(absent from the index)'} in the index; it must be 100755 or git will not execute it on a clone`)
    } catch (error) {
      console.log(`[pre-push-gate-wired] SKIP the index-mode check: git unavailable (${error.message.split(/\r?\n/)[0]})`)
    }
    checks += 1
    try {
      const hooksPath = git(root, ['config', '--get', 'core.hooksPath'])
      if (hooksPath !== HOOKS_PATH) problems.push(`core.hooksPath is ${JSON.stringify(hooksPath)}, so git runs some other hooks directory`)
    } catch (error) {
      // exit 1 with empty output is git saying the key is unset; anything else is git being absent
      if (error.status === 1 && !nonEmpty(error.stderr)) {
        problems.push(`core.hooksPath is not set in this repository, so git never runs ${HOOK}`)
      } else {
        console.log(`[pre-push-gate-wired] SKIP the core.hooksPath check: git unavailable (${(error.message || '').split(/\r?\n/)[0]})`)
      }
    }
  }

  declareWork('pre-push-gate-wired', {
    did: { 'hook line read': hookLines, 'wiring point checked': checks },
    found: { 'wiring fault': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`[pre-push-gate-wired] FAIL - ${problems.length} wiring fault(s):`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error(`  The hook runs  node ${GATE}  and exits with its status; nothing else.`)
    console.error(`  One command wires git to it in every worktree of this repository:`)
    console.error(`    git config core.hooksPath ${HOOKS_PATH}`)
    process.exitCode = 1
    return
  }
  console.log(`[pre-push-gate-wired] PASS - ${HOOK} runs the whole gate, npm run ${NPM_SCRIPT} is the same command, git is pointed at it.`)
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()
