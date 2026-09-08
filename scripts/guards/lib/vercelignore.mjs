/**
 * THE .vercelignore GRAMMAR, PARSED ONCE, SHARED BY EVERYTHING THAT NEEDS IT.
 *
 * Extracted from scripts/guards/vercelignore-covers-guard-reads.mjs, which owned
 * the only evaluator in the repository and could not lend it out: that file is a
 * guard with top-level side effects, so importing its judge ran the whole guard.
 * Nothing about the semantics changed in the move; the parser now returns its
 * refusals instead of calling that guard's fail().
 *
 * The grammar is deliberately small. Vercel applies gitignore semantics, and this
 * evaluator REFUSES a pattern it does not understand (globstar, character classes,
 * a wildcard anywhere but a final slash-star) rather than guessing what Vercel
 * would do with it. A wrong guess here is a deployment that dies for a reason
 * nobody can reproduce.
 *
 * THE ONE RULE THAT IS EASY TO GET WRONG, written down because it has cost four
 * deployments: gitignore never re-includes a file inside an excluded DIRECTORY.
 * `!docs/security/CREDENTIAL-ROTATION.md` on its own does nothing while `docs/*`
 * excludes the docs/security directory. Each level has to be walked down:
 * !docs/security/, docs/security/*, !docs/security/the-file.
 */
import { readFileSync } from 'node:fs'

/**
 * @typedef {{ negate: boolean, dirOnly: boolean, pattern: string, kind: 'name' | 'exact' | 'children', line: number }} IgnoreRule
 */

/**
 * Parse .vercelignore text into rules.
 *
 * @param {string} text
 * @returns {{ rules: IgnoreRule[], errors: string[] }} errors are patterns outside
 *   the grammar. A caller that cares must surface them; they are never silently
 *   treated as "matches nothing".
 */
export function parseVercelIgnore(text) {
  /** @type {IgnoreRule[]} */
  const rules = []
  /** @type {string[]} */
  const errors = []

  text.split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim()
    if (raw === '' || raw.startsWith('#')) return

    let negate = false
    let pattern = raw
    if (pattern.startsWith('!')) {
      negate = true
      pattern = pattern.slice(1)
    }
    let dirOnly = false
    if (pattern.endsWith('/')) {
      dirOnly = true
      pattern = pattern.slice(0, -1)
    }
    if (pattern.startsWith('/')) pattern = pattern.slice(1)

    if (pattern.includes('**') || pattern.includes('[') || pattern.includes('?') || pattern.includes('{')) {
      errors.push(`line ${i + 1} "${raw}" uses a pattern this evaluator does not read; keep to name, path, and path/*`)
      return
    }

    /** @type {IgnoreRule['kind']} */
    let kind = 'exact'
    if (pattern.endsWith('/*')) {
      kind = 'children'
      pattern = pattern.slice(0, -2)
      if (pattern.includes('*')) {
        errors.push(`line ${i + 1} "${raw}" has a wildcard somewhere other than its last segment`)
        return
      }
    } else if (pattern.includes('*')) {
      errors.push(`line ${i + 1} "${raw}" has a wildcard somewhere other than a final /*`)
      return
    } else if (!pattern.includes('/')) {
      kind = 'name'
    }

    rules.push({ negate, dirOnly, pattern, kind, line: i + 1 })
  })

  return { rules, errors }
}

/** Read and parse the .vercelignore at a repository root. */
export function readVercelIgnore(root) {
  return parseVercelIgnore(readFileSync(`${root}/.vercelignore`, 'utf8'))
}

/**
 * Does one rule match this path?
 *
 * @param {IgnoreRule} rule
 * @param {string} path posix-separated, relative to the repository root
 * @param {boolean} isDir
 */
function matches(rule, path, isDir) {
  if (rule.dirOnly && !isDir) return false
  if (rule.kind === 'exact') return path === rule.pattern
  if (rule.kind === 'children') {
    return path.startsWith(`${rule.pattern}/`) && !path.slice(rule.pattern.length + 1).includes('/')
  }
  // A bare name matches that segment at any depth.
  return path.split('/').includes(rule.pattern)
}

/** Last matching rule wins for one path, as in gitignore. */
function ownStatus(rules, path, isDir) {
  let ignored = false
  for (const rule of rules) {
    if (matches(rule, path, isDir)) ignored = !rule.negate
  }
  return ignored
}

/**
 * Build the judge for a rule set.
 *
 * A path is ignored when its own last rule excludes it, OR when any ancestor
 * directory is ignored, because gitignore never re-includes a file inside an
 * excluded directory and Vercel inherits that. The returned reason names the
 * ancestor that sealed it, so a message can say where the walk-down is missing.
 *
 * @param {IgnoreRule[]} rules
 * @returns {(path: string) => { ignored: boolean, by: string }}
 */
export function makeJudgeIgnored(rules) {
  return function judgeIgnored(path) {
    const parts = path.split('/')
    for (let depth = 1; depth < parts.length; depth++) {
      const ancestor = parts.slice(0, depth).join('/')
      if (ownStatus(rules, ancestor, true)) {
        return { ignored: true, by: `its directory ${ancestor}/ is excluded and never re-included` }
      }
    }
    return ownStatus(rules, path, false)
      ? { ignored: true, by: 'its own last matching rule excludes it' }
      : { ignored: false, by: '' }
  }
}
