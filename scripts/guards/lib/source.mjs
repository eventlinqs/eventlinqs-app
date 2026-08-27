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
 * 2026-08-05: `node:fs` only began exporting `globSync` in Node 22, and CI ran
 * Node 20 at the time, so all three died at import with a SyntaxError while
 * passing locally on Node 24. One walker, in one place, on an API that has
 * existed since Node 10, removes both the duplication and the version exposure.
 *
 * The contract moved to Node 24 on 13 August 2026, so `globSync` is now
 * available. This walker stays anyway. It is not here because the newer API was
 * unavailable; it is here because ONE definition of the scanned file list is
 * worth having, and because an API that has existed since Node 10 cannot be the
 * thing that breaks the next runtime move.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const blank = (ch) => (ch === '\n' ? '\n' : ' ')

/**
 * Keywords after which a `/` can only begin a REGEX, never a division.
 *
 * `return /x/.test(s)` is the realistic one. Without this the scanner sees an
 * identifier before the slash, decides it is division, and walks straight into
 * the regex body looking for string quotes.
 */
const REGEX_PRECEDING_KEYWORDS = [
  'return', 'typeof', 'instanceof', 'case', 'in', 'of', 'new', 'delete', 'void',
  'do', 'else', 'yield', 'await', 'throw',
]

/**
 * Does the `/` at `i` begin a regex literal rather than a division?
 *
 * The classic JavaScript ambiguity, resolved the classic way: look at the last
 * significant character before it. After a value (an identifier, a number, a
 * closing bracket) a slash divides. After an operator, a comma, an opening
 * bracket or the start of a statement, it opens a regex. `)` is deliberately
 * treated as a VALUE, so `(a + b) / 2` stays division; the rare
 * `if (x) /re/.test(y)` is accepted as the cost of not mangling arithmetic.
 */
function startsRegex(src, i) {
  let j = i - 1
  while (j >= 0 && /\s/.test(src[j])) j -= 1
  if (j < 0) return true
  const prev = src[j]
  if (/[A-Za-z0-9_$)\]]/.test(prev)) {
    // Could still be a keyword rather than a value.
    let k = j
    while (k >= 0 && /[A-Za-z]/.test(src[k])) k -= 1
    const word = src.slice(k + 1, j + 1)
    return REGEX_PRECEDING_KEYWORDS.includes(word)
  }
  return true
}

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

    /*
     * REGEX LITERALS. Added 13 August 2026, and the omission was not cosmetic.
     *
     * The scanner used to know only comments and quotes, so a regex containing a
     * quote character opened a phantom string. `.replace(/^["']|["']$/g, '')` is
     * the shape that exposes it: the `"` inside the character class is read as
     * the start of a string literal and the scanner consumes forward looking for
     * a closing quote that has nothing to do with it. Every subsequent quote is
     * then paired off by one, so from that point on the file is scanned
     * inside-out: real code is blanked as though it were string contents, and
     * real string contents are exposed as though they were code.
     *
     * It fails in the DANGEROUS direction. A desynchronised scanner blanks the
     * code that follows, and blanked code matches no pattern, so every guard
     * built on this view reports the rest of that file as clean. A file can be
     * made invisible to seven guards by one regex.
     *
     * The body is consumed here with character classes respected, because `/`
     * inside `[...]` does not end the literal.
     */
    if (src[i] === '/' && startsRegex(src, i)) {
      out += ' '
      i += 1
      let inClass = false
      while (i < n && src[i] !== '\n') {
        const c = src[i]
        if (c === '\\') {
          out += '  '
          i += 2
          continue
        }
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) break
        out += blank(c)
        i += 1
      }
      if (i < n && src[i] === '/') {
        out += ' '
        i += 1
        // The flags. Blanked with the literal so `g`, `i` and friends cannot be
        // read as identifiers by a guard scanning the code view.
        while (i < n && /[a-z]/.test(src[i])) out += blank(src[i++])
      }
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

/**
 * Line endings, normalised to LF at the read boundary.
 *
 * WHY THIS EXISTS. The index of this repository stores LF, `core.autocrlf` is
 * true and there is no `.gitattributes`, so every text file is materialised
 * CRLF on Windows and LF on the Linux CI runner. `git ls-files --eol` says it
 * plainly: `i/lf  w/crlf`.
 *
 * A structural pattern such as `\{\n {8}Row: \{` then matches on CI and matches
 * NOTHING on the founder's machine, because the `\r` sits between the `{` and
 * the `\n` with nothing to absorb it. A pattern whose `\n` follows a lazy
 * wildcard is unaffected, which is why this failed in only some scanners and
 * looked like an unrelated bug in each.
 *
 * It fails in the DANGEROUS direction, exactly as the regex-literal bug above
 * did: a scanner that matches nothing finds no problems and reports PASS. Two
 * guards happened to carry a "yielded no tables" sanity check and went red;
 * anything without one would have gone quietly green.
 *
 * Normalising HERE rather than in each pattern is deliberate. There is no way
 * to write a `\n` in a consumer that reintroduces the bug once the bytes
 * arriving are already LF, so the fix cannot rot as new scanners are added.
 * `sourceFiles` below already sorts "machine to machine"; this is the same
 * commitment applied to the bytes rather than the order.
 */
export function normaliseEol(text) {
  return text.replace(/\r\n/g, '\n')
}

/** Read a file once and return all three views. */
export function readSource(path) {
  const raw = normaliseEol(readFileSync(path, 'utf8'))
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
 * every Node the platform supports, which is what keeps it working across a
 * runtime move rather than only on the runtime of the day.
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
