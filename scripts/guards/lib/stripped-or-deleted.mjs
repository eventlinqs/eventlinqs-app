/**
 * IS THIS FILE MISSING BECAUSE VERCEL STRIPPED IT, OR BECAUSE SOMEBODY DELETED IT?
 *
 * Close-out F1.9.2 PART THREE. The two answers demand opposite behaviour: a
 * STRIPPED file means the guard cannot see and must say so; a DELETED file means
 * evidence has gone and the build must fail. Getting it backwards costs either a
 * deployment or the whole point of the guard.
 *
 * launch-readiness-honest.mjs decided it by asking whether a parent DIRECTORY
 * existed. That is a guess, and on 8 September 2026 it guessed wrong and blocked
 * the deployment of 7564b40: Vercel deletes the matched FILES and leaves the
 * DIRECTORY tree standing, which its own build log says in as many words. The
 * ignore file names `.git`, and the removal enumerated /.git/config,
 * /.git/description and the hook samples inside it.
 *
 * THIS IS A DETERMINATION, NOT A GUESS. It asks the only two questions that
 * actually decide it:
 *
 *   1. Does .vercelignore exclude this path? The rules are evaluated with the
 *      same evaluator the ignore guard uses, so the answer is the one Vercel
 *      would reach rather than an impression of it.
 *   2. Is this the Vercel build host? From the shared scope resolver, which reads
 *      the variables Vercel publishes.
 *
 * Excluded AND on Vercel is STRIPPED. Anything else missing is DELETED. A
 * developer or a CI runner deleting the report therefore still FAILS, which is
 * the whole point of the guard, and no amount of directory-shaped inference is
 * involved.
 *
 * ONE DETERMINATION, SHARED. F1.9.2 PART THREE: "Every guard that distinguishes
 * stripped from deleted uses the same shared determination. Enumerate them and
 * report how many there are." `callersOf()` below enumerates them from the import
 * graph rather than from a list, and the guards print the count.
 *
 * Driven in tests/unit/guards/stripped-or-deleted.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeJudgeIgnored, parseVercelIgnore } from './vercelignore.mjs'
import { resolveBuildScope } from '../../../src/lib/health/build-scope.mjs'
import { buildTimeScripts, importClosure, runnableEntries } from './build-time-scripts.mjs'

/** @typedef {'present' | 'stripped' | 'deleted'} FileState */

/**
 * @param {string} path repository-relative, posix separators
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {Record<string, string | undefined>} [options.env]
 * @returns {{ state: FileState, why: string }}
 */
export function stateOf(path, { root = process.cwd(), env = process.env } = {}) {
  if (existsSync(join(root, path))) return { state: 'present', why: 'it is on disk' }

  const ignoreFile = join(root, '.vercelignore')
  if (!existsSync(ignoreFile)) {
    return {
      state: 'deleted',
      why: 'it is not on disk and there is no .vercelignore to have excluded it',
    }
  }
  const { rules } = parseVercelIgnore(readFileSync(ignoreFile, 'utf8'))
  const excluded = makeJudgeIgnored(rules)(path).ignored
  const { scope } = resolveBuildScope(env)

  if (excluded && scope === 'vercel') {
    return {
      state: 'stripped',
      why: '.vercelignore excludes it and this is the Vercel build host, so it was never uploaded',
    }
  }
  if (excluded) {
    return {
      state: 'deleted',
      why: `.vercelignore excludes it, but this is a ${scope} build and the whole tree is present here, so it is missing because it was removed`,
    }
  }
  return {
    state: 'deleted',
    why: `.vercelignore does NOT exclude it, so even a Vercel build would have received it${scope === 'vercel' ? '' : ` and this is a ${scope} build`}`,
  }
}

/**
 * Every build-time script that uses this determination, from the import graph.
 * Reported by its callers so "how many guards distinguish stripped from deleted"
 * is a measured number rather than a claim.
 *
 * @param {string} [root]
 * @returns {string[]} sorted, repository-relative
 */
export function callersOf(root = process.cwd()) {
  const self = 'scripts/guards/lib/stripped-or-deleted.mjs'
  const out = []
  for (const entry of runnableEntries(root)) {
    if (importClosure(root, [entry]).includes(self)) out.push(entry)
  }
  // A library that imports it but is reached by no entry point would be invisible
  // above, so the whole build-time set is swept as well.
  for (const file of buildTimeScripts(root)) {
    if (file === self) continue
    if (!out.includes(file) && importClosure(root, [file]).includes(self)) out.push(file)
  }
  return [...new Set(out)].sort()
}
