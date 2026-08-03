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
 */
import { readFileSync } from 'node:fs'

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
