/**
 * FULL GITIGNORE SEMANTICS, FOR ENUMERATING A TREE WITHOUT GIT.
 *
 * Close-out F2.2: "remove its dependence on git ls-files: derive the file list by
 * walking the filesystem and applying the .vercelignore rules, so it works in any
 * checkout, shallow or otherwise."
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM vercelignore.mjs, which already parses an
 * ignore file. That evaluator deliberately REFUSES any pattern it does not
 * understand - a globstar, a character class, a wildcard anywhere but a final
 * `/*` - and its refusal is load-bearing: it also backs
 * `stripped-or-deleted.mjs`, which decides whether a missing file was stripped by
 * Vercel or deleted by a person, and a wrong guess there costs either a
 * deployment or the whole point of the guard. Widening THAT parser would widen
 * that determination. So this is a second, wider evaluator with its own tests,
 * and the narrow one is left exactly as it was.
 *
 * WHY IT HAD TO BE WIDER. This repository's `.gitignore` carries 44 patterns the
 * narrow grammar refuses: `*.png`, `.env*`, a globstar re-including every SVG
 * under public, another re-including the benchmark captures by filename prefix.
 * A walk that ignored those patterns would carry
 * `node_modules`, `.next` and `.env.local` into a simulated upload and then RUN
 * scripts inside it. That is not a less faithful simulation, it is a dangerous
 * one.
 *
 * WHAT MAKES IT TRUSTWORTHY, and it is not this comment. Where git IS available,
 * `agreesWithGit()` compares this walk against `git ls-files` path for path and
 * the guard fails on any disagreement. The replacement therefore proves itself on
 * every run on every machine that can check it, instead of being believed.
 *
 * SUPPORTED, which is the whole of gitignore except the parts nothing here uses:
 *   name              matches that segment at any depth
 *   dir/              directories only
 *   /rooted           anchored at the root
 *   a/b/c             a path with a slash is anchored
 *   *                 any run of characters within one segment, never crossing /
 *   ?                 one character within one segment
 *   [abc] [a-z] [!a]  a character class
 *   **                any number of segments
 *   !                 re-include, last matching rule wins
 *
 * NOT SUPPORTED, and REFUSED rather than guessed: `{a,b}` brace expansion, which
 * gitignore does not have either. A pattern this cannot read is returned as an
 * error, never silently treated as matching nothing.
 *
 * Driven in tests/unit/guards/gitignore.test.ts, and against the real repository
 * by the agreement check.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @typedef {{ negate: boolean, dirOnly: boolean, anchored: boolean, re: RegExp, raw: string, line: number, base: string }} GitignoreRule
 */

/**
 * One gitignore pattern segment translated to a regular expression fragment.
 *
 * `*` and `?` never cross a slash, which is the single most commonly mistaken
 * rule in gitignore: `docs/*.png` does not match `docs/a/b.png`.
 *
 * @param {string} segment
 * @returns {string}
 */
function segmentToRegex(segment) {
  let out = ''
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i]
    if (c === '*') {
      out += '[^/]*'
    } else if (c === '?') {
      out += '[^/]'
    } else if (c === '[') {
      const close = segment.indexOf(']', i + 1)
      if (close === -1) {
        out += '\\['
        continue
      }
      let cls = segment.slice(i + 1, close)
      // gitignore spells negation `!`; a regular expression spells it `^`.
      if (cls.startsWith('!')) cls = `^${cls.slice(1)}`
      out += `[${cls}]`
      i = close
    } else {
      out += c.replace(/[.+^${}()|\\]/g, '\\$&')
    }
  }
  return out
}

/**
 * Translate a whole pattern to an anchored regular expression over a
 * posix-separated, repository-relative path.
 *
 * @param {string} pattern already stripped of `!` and a trailing `/`
 * @param {boolean} anchored
 * @returns {RegExp}
 */
function patternToRegex(pattern, anchored) {
  const segments = pattern.split('/')
  const parts = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg === '**') {
      // A leading or trailing globstar may match nothing at all, so the slash
      // it would otherwise require is folded into the globstar itself.
      parts.push('(?:.*/)?§GLOBSTAR§')
      continue
    }
    parts.push(segmentToRegex(seg))
  }
  let body = parts.join('/').split('§GLOBSTAR§/').join('').split('§GLOBSTAR§').join('.*')
  // An unanchored single-segment pattern matches that name at any depth.
  const prefix = anchored ? '^' : '^(?:.*/)?'
  /*
   * THE PATTERN MATCHES A PATH, NOT A PATH AND EVERYTHING UNDER IT.
   *
   * The first version appended `(?:/.*)?$` here, reasoning that excluding
   * `node_modules` must also exclude everything inside it. That is true, and it
   * is already handled by the ancestor walk in makeGitignoreJudge - the two
   * together double-counted, and the double count broke `dir/*`.
   *
   * The real case, caught by asking git rather than by reading this code. The
   * ignore file says:
   *
   *     .claude/*
   *     !.claude/skills/
   *
   * With the suffix, `.claude/*` matched `.claude/skills/brief-roast/SKILL.md`
   * four levels down. The re-inclusion is directory-only, so it did not apply to
   * a FILE, the exclusion won, and six tracked skill files vanished from the
   * simulated upload. Git disagrees, because its `*` never crosses a slash:
   * `.claude/*` matches the immediate child `.claude/skills`, that child is
   * re-included, git descends, and nothing matches the file at all.
   */
  return new RegExp(`${prefix}${body}$`)
}

/**
 * Parse one ignore file.
 *
 * @param {string} text
 * @param {string} [base] the directory the file sits in, posix-separated and
 *   relative to the repository root. A nested .gitignore's patterns are relative
 *   to its own directory, which is easy to forget and wrong in a way that only
 *   shows up on somebody else's machine.
 * @returns {{ rules: GitignoreRule[], errors: string[] }}
 */
export function parseGitignore(text, base = '') {
  /** @type {GitignoreRule[]} */
  const rules = []
  /** @type {string[]} */
  const errors = []

  text.split(/\r?\n/).forEach((line, i) => {
    // A trailing space is only significant when escaped, which nothing here uses.
    const raw = line.replace(/\s+$/, '')
    if (raw === '' || raw.startsWith('#')) return

    let negate = false
    let pattern = raw
    if (pattern.startsWith('!')) {
      negate = true
      pattern = pattern.slice(1)
    }
    if (pattern.includes('{') || pattern.includes('}')) {
      errors.push(`line ${i + 1} "${raw}" uses brace expansion, which gitignore does not have and this cannot read`)
      return
    }
    let dirOnly = false
    if (pattern.endsWith('/')) {
      dirOnly = true
      pattern = pattern.slice(0, -1)
    }
    // A slash anywhere but the end anchors the pattern to the ignore file's own
    // directory. A bare name floats and matches at any depth.
    const anchored = pattern.includes('/')
    if (pattern.startsWith('/')) pattern = pattern.slice(1)
    if (pattern === '') return

    const full = base === '' ? pattern : `${base}/${pattern}`
    rules.push({
      negate,
      dirOnly,
      anchored,
      re: patternToRegex(full, anchored || base !== ''),
      raw,
      line: i + 1,
      base,
    })
  })

  return { rules, errors }
}

/**
 * Every ignore file that governs a tree, root first, nested after, in the order
 * git applies them: a deeper file's rules win over a shallower one's.
 *
 * @param {string} root
 * @param {string[]} names which ignore files to read, e.g. ['.gitignore']
 * @returns {{ rules: GitignoreRule[], errors: string[], files: string[] }}
 */
export function collectIgnoreRules(root, names = ['.gitignore']) {
  /** @type {GitignoreRule[]} */
  const rules = []
  /** @type {string[]} */
  const errors = []
  /** @type {string[]} */
  const files = []

  /** Read the ignore files in one directory, then recurse into its children. */
  const visit = (rel, depth) => {
    for (const name of names) {
      const abs = join(root, rel, name)
      if (!existsSync(abs)) continue
      const parsed = parseGitignore(readFileSync(abs, 'utf8'), rel)
      rules.push(...parsed.rules)
      for (const e of parsed.errors) errors.push(`${rel === '' ? '' : `${rel}/`}${name} ${e}`)
      files.push(rel === '' ? name : `${rel}/${name}`)
    }
    if (depth > 12) return
    let entries
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // Never descend into these looking for ignore files: node_modules holds
      // thousands of them and none of them govern this repository's tree.
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') continue
      visit(rel === '' ? entry.name : `${rel}/${entry.name}`, depth + 1)
    }
  }
  visit('', 0)

  return { rules, errors, files }
}

/**
 * Build the judge. Last matching rule wins, and a file inside an ignored
 * directory is ignored no matter what re-includes it, which is the rule that has
 * cost this repository four deployments.
 *
 * @param {GitignoreRule[]} rules
 * @returns {(path: string, isDir?: boolean) => boolean}
 */
export function makeGitignoreJudge(rules) {
  const ownStatus = (path, isDir) => {
    let ignored = null
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue
      if (rule.re.test(path)) ignored = !rule.negate
    }
    return ignored
  }

  return function judge(path, isDir = false) {
    const parts = path.split('/')
    for (let depth = 1; depth < parts.length; depth++) {
      const ancestor = parts.slice(0, depth).join('/')
      if (ownStatus(ancestor, true) === true) return true
    }
    return ownStatus(path, isDir) === true
  }
}

/**
 * Walk a tree and return every path git would track: every file not ignored by
 * any .gitignore governing it.
 *
 * NO GIT INVOLVED. That is the point: it works in a shallow clone, a worktree, a
 * tarball, or anywhere else that has files and no repository.
 *
 * @param {string} root
 * @param {object} [options]
 * @param {(path: string, isDir?: boolean) => boolean} [options.judge]
 * @returns {string[]} sorted, posix-separated, repository-relative
 */
export function walkTrackedFiles(root, { judge } = {}) {
  const decide = judge ?? makeGitignoreJudge(collectIgnoreRules(root).rules)
  const out = []
  const stack = ['']
  while (stack.length > 0) {
    const rel = stack.pop()
    let entries
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`
      // `.git` is never tracked and holds tens of thousands of files.
      if (entry.name === '.git' && rel === '') continue
      if (entry.isDirectory()) {
        if (decide(path, true)) continue
        stack.push(path)
      } else if (!decide(path, false)) {
        out.push(path)
      }
    }
  }
  return out.sort()
}
