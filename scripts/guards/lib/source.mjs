/**
 * Shared source-reading helpers for the build guards.
 *
 * Every guard here scans source text, so every guard must scan CODE and not
 * prose. Without this, a guard's own explanation of the pattern it bans (and
 * the comments in the fixed code explaining why the old call was removed) trip
 * the guard, which teaches the team to distrust it. A guard that cries wolf
 * gets switched off, and a switched-off guard is worse than none.
 *
 * Two strengths, because the guards need different things:
 *
 *   stripComments  removes comments, KEEPS string contents. For guards that
 *                  look for a literal value, such as a sender address.
 *   stripNonCode   removes comments AND string contents. For guards that look
 *                  for a call expression, which must never match a mention of
 *                  that call inside a string or a doc comment.
 *
 * Both preserve byte offsets and newlines, so reported line numbers stay true.
 *
 * Deliberately small scanners rather than a parser: guards run inside
 * `prebuild` and must not pull a TypeScript dependency onto the build path.
 *
 * Also the single source of the file LIST every guard scans. It used to be a
 * `globSync` call copy-pasted into three guards, which crashed the CI build on
 * 2026-08-05: `node:fs` only began exporting `globSync` in Node 22, and CI runs
 * Node 20, so all three died at import with a SyntaxError while passing locally
 * on Node 24. One walker, in one place, on an API that has existed since Node
 * 10, removes both the duplication and the version exposure.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const blank = (ch) => (ch === '\n' ? '\n' : ' ')

function scan(src, { blankStrings }) {
  let out = ''
  let i = 0
  const n = src.length

  while (i < n) {
    const two = src.slice(i, i + 2)

    if (two === '//') {
      while (i < n && src[i] !== '\n') out += blank(src[i++])
      continue
    }
    if (two === '/*') {
      out += '  '
      i += 2
      while (i < n && src.slice(i, i + 2) !== '*/') out += blank(src[i++])
      if (i < n) out += '  '
      i += 2
      continue
    }

    const ch = src[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      out += ch
      i += 1
      while (i < n && src[i] !== ch) {
        if (src[i] === '\\') {
          out += blankStrings ? '  ' : src.slice(i, i + 2)
          i += 2
          continue
        }
        out += blankStrings ? blank(src[i]) : src[i]
        i += 1
      }
      if (i < n) out += ch
      i += 1
      continue
    }

    out += ch
    i += 1
  }
  return out
}

/** Comments blanked, string contents kept. */
export function stripComments(src) {
  return scan(src, { blankStrings: false })
}

/** Comments AND string contents blanked. */
export function stripNonCode(src) {
  return scan(src, { blankStrings: true })
}

/** Read a file once and return all three views. */
export function readSource(path) {
  const raw = readFileSync(path, 'utf8')
  return { raw, withStrings: stripComments(raw), code: stripNonCode(raw) }
}

/** 1-indexed line number of a character offset. */
export function lineAt(src, index) {
  return src.slice(0, index).split('\n').length
}

/**
 * Every source file under `subdir` (default src/), as forward-slashed paths
 * relative to `root`, sorted so guard output is stable run to run and machine to
 * machine.
 *
 * `readdirSync(dir, { withFileTypes: true })` is the same walk the pre-existing
 * scripts/ci/critical-path-guard.mjs has always used, and it is available in
 * every Node the platform supports. Do NOT swap this back to fs.globSync or
 * fs.promises.glob: both are Node 22+ and CI runs the version pinned in .nvmrc.
 *
 * `subdir` exists so a guard can scan scripts/ rather than src/ without a second
 * copy of this walker, which is the duplication this module was written to end.
 */
export function sourceFiles(root, { extensions = ['.ts', '.tsx'], subdir = 'src' } = {}) {
  const out = []

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // Nothing under a dot-directory or node_modules is platform source.
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full)
    }
  }

  walk(join(root, subdir))
  return out.map((f) => relative(root, f).replace(/\\/g, '/')).sort()
}
