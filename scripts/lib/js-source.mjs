/**
 * READING JAVASCRIPT AND TYPESCRIPT AS CODE, NOT AS TEXT.
 *
 * Two guards now need the same two things: source with its comments removed, and
 * the body of every `catch` block. Both were about to be written twice.
 *
 * `stripComments` was first written inside scripts/guards/sitemap-resolves.mjs
 * after that guard's own first run failed on a `venues.slug` mention that lived
 * in the comment recording the bug it had just been written to catch. A guard
 * that cannot tell a post-mortem from the defect is a guard that punishes
 * writing the post-mortem.
 */

const NEWLINE = String.fromCharCode(10)
const BACKSLASH = String.fromCharCode(92)

/**
 * Remove comments, preserve string and template literals, and preserve LENGTH.
 *
 * Every removed character is replaced by a space (or a newline), so an offset
 * into the stripped source is the same offset into the original. That is what
 * lets a caller report a real line number for something it found in the stripped
 * copy, rather than a number that drifts by however much comment preceded it.
 */
export function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== NEWLINE) {
        out += ' '
        i++
      }
      continue
    }
    if (c === '/' && d === '*') {
      out += '  '
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === NEWLINE ? NEWLINE : ' '
        i++
      }
      out += '  '
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out += c
      i++
      while (i < n) {
        if (src[i] === BACKSLASH) {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        out += src[i]
        if (src[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** 1-indexed line number of an offset. */
export function lineAt(src, offset) {
  return src.slice(0, offset).split(NEWLINE).length
}

/**
 * Every `catch` block in a file, with its binding and its body.
 *
 * Braces are MATCHED rather than regex-guessed, because a catch body containing
 * an object literal, a nested try, or a function is the normal case and a
 * non-greedy `\{[^}]*\}` finds the wrong end of it every time.
 *
 * @param {string} raw the original source
 * @returns {{ binding: string|null, body: string, line: number, index: number }[]}
 */
export function catchBlocks(raw) {
  const src = stripComments(raw)
  const out = []
  const re = /\bcatch\s*(\(([^)]*)\))?\s*\{/g
  let m
  while ((m = re.exec(src)) !== null) {
    const bodyStart = re.lastIndex
    let depth = 1
    let i = bodyStart
    while (i < src.length && depth > 0) {
      const ch = src[i]
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      i += 1
    }
    // Unbalanced braces mean the file did not parse the way this reader assumed,
    // and guessing the end of the block would produce a confident wrong verdict.
    if (depth !== 0) continue
    out.push({
      binding: (m[2] ?? '').trim().replace(/:.*$/, '').trim() || null,
      body: src.slice(bodyStart, i - 1),
      tryBody: tryBodyBefore(src, m.index),
      line: lineAt(src, m.index),
      index: m.index,
    })
    re.lastIndex = i
  }
  return out
}

/**
 * Does this catch body do ANYTHING with the error?
 *
 * Three ways of speaking, which is the founder's own list: logging, re-throwing,
 * or recording. "Recording" is read as USING THE BINDING: if the body mentions
 * the caught value at all it is carrying it somewhere, into a result object, a
 * failures array, a returned message, a status. What it is NOT is discarding it.
 *
 * A catch with NO BINDING that neither logs nor throws has, by construction,
 * thrown the error away: there is not even a name by which it could be recorded.
 * That is the shape that ate a 42703 on a column which has never existed and
 * published zero venue URLs for the whole life of that code.
 */
export function catchSpeaks({ binding, body }) {
  if (/\bthrow\b/.test(body)) return 'rethrows'
  if (/console\.(error|warn|log|info|debug)\s*\(/.test(body)) return 'logs'
  if (/captureException|Sentry\.|logger\s*\.|reportClientError/.test(body)) return 'reports'
  if (binding) {
    const safe = binding.replace(/[.*+?^${}()|[\]\\]/g, `${BACKSLASH}$&`)
    if (new RegExp(`\\b${safe}\\b`).test(body)) return 'records'
  }
  return null
}

/**
 * The body of the `try` (or the `.then(...)` chain) that this catch guards.
 *
 * Walks BACKWARDS from `catch` to the matching `{` of its try block. The
 * `.catch(` method form has no try block, so the preceding statement is taken
 * instead: it is the expression whose failure is being swallowed either way.
 */
function tryBodyBefore(src, catchIndex) {
  let i = catchIndex - 1
  while (i >= 0 && /\s/.test(src[i])) i--
  if (src[i] !== '}') {
    // `.catch(() => {})` on a promise: take the statement it hangs off.
    const start = Math.max(0, catchIndex - 600)
    return src.slice(start, catchIndex)
  }
  let depth = 1
  i--
  while (i >= 0 && depth > 0) {
    if (src[i] === '}') depth += 1
    else if (src[i] === '{') depth -= 1
    i--
  }
  return src.slice(i + 2, catchIndex)
}

/**
 * Does this try block touch the world outside the process?
 *
 * THIS IS THE DEFECT LINE, and it is drawn here rather than at "every catch"
 * for a reason that is recorded so it is not read as leniency.
 *
 * A catch around `JSON.parse`, `new URL`, `decodeURIComponent` or `atob` IS the
 * validation: the throw is the expected negative answer to a question the code
 * asked on purpose, and there is no incident to report. Failing the build on
 * those would put roughly two hundred entries in an exemption list, and an
 * exemption list that long is an inventory rather than a gate.
 *
 * A catch around a database query, a network call, a filesystem read or a
 * subprocess is the other thing entirely. That is where a 42703 on a column
 * which has never existed was eaten whole, and zero venue URLs were published
 * for the life of that code with nothing anywhere able to notice.
 */
export function tryTouchesTheWorld(tryBody) {
  return (
    /(?<!Buffer|Array|Object|Map|Set|String|Date)\.from\s*\(|\.rpc\s*\(|supabase|serviceClient|createClient|\.query\s*\(/.test(tryBody) ||
    /\bfetch\s*\(|axios|got\s*\(/.test(tryBody) ||
    /readFile|writeFile|readdir|\bstat\s*\(|mkdir|unlink|rm\s*\(|createReadStream|createWriteStream|appendFile/.test(tryBody) ||
    /execSync|spawnSync|\bexeca\b|child_process/.test(tryBody) ||
    /stripe\.|\bresend\b|sendMail|webpush|\bsharp\s*\(/.test(tryBody)
  )
}
