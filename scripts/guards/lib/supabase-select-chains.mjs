/**
 * THE POSTGREST BUILDER CHAIN, READ AS A CHAIN RATHER THAN AS A WINDOW OF TEXT.
 *
 * WHY THIS EXISTS. A guard that wants to know whether a database read is
 * BOUNDED has to see where one read ends and the next begins. The obvious
 * approach, "grep for .from( and look at the next 900 characters", is wrong in
 * the dangerous direction, and it was wrong here first: the sweep that found
 * this defect classified
 *
 *     admin.from('audience_members').select(...),
 *     admin.from('consent_events').select(...).order(...),
 *     admin.from('consent_policy').select(...).eq(...).maybeSingle(),
 *
 * as three BOUNDED reads, because the `.maybeSingle()` belonging to the third
 * one sat inside the text window of the first two. Both of the first two were
 * in fact unbounded, one of them was silently truncating a live screen, and a
 * fixed-size window said PASS about both. A guard whose scanner cannot tell
 * two adjacent reads apart reports the absence of what it cannot see.
 *
 * So this walks the chain: from `.from('table')` it follows `.method(...)`
 * links across balanced parentheses until the next character is not a `.`,
 * and returns the methods that genuinely belong to THAT read.
 *
 * TWO VIEWS OF THE SAME BYTES, and the reason is not fussiness. The table name
 * lives inside a string literal, so it can only be read from the view that
 * KEEPS string contents; the parenthesis walk must not count a `(` that is
 * inside a string or a comment, so it can only be done on the view that blanks
 * them. `readSource` preserves byte offsets across both, so one offset indexes
 * both views and the two halves cannot drift.
 */
import { readSource, lineAt } from './source.mjs'

/** A `.from('x')` anywhere, with its table name captured. */
const FROM_CALL = /\.from\(\s*(['"])([A-Za-z0-9_]+)\1\s*\)/g

/**
 * Skip a balanced `(...)` starting at `open`, which must index the `(`.
 * Operates on the code-only view, so quotes and comments are already blanked
 * and a parenthesis found here is always a real one.
 *
 * @returns the index just past the matching `)`, or -1 when it is unbalanced
 */
function skipParens(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1
    else if (code[i] === ')') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * Every PostgREST read in one file, as a chain.
 *
 * @param {string} path
 * @returns {{table: string, methods: string[], line: number, text: string}[]}
 */
export function selectChainsIn(path) {
  const { raw, withStrings, code } = readSource(path)
  const chains = []

  FROM_CALL.lastIndex = 0
  let match
  while ((match = FROM_CALL.exec(withStrings))) {
    const table = match[2]
    const start = match.index
    let cursor = start + match[0].length
    const methods = []

    for (;;) {
      // The chain continues only across whitespace and a dot. Anything else,
      // including a comma, a closing bracket or an operator, ends this read.
      const rest = code.slice(cursor)
      const link = rest.match(/^\s*\.\s*([A-Za-z0-9_]+)\s*\(/)
      if (!link) break
      methods.push(link[1])
      const open = cursor + link[0].length - 1
      const after = skipParens(code, open)
      if (after < 0) break
      cursor = after
    }

    /*
     * `text` IS FOR READING AND `orderColumns` IS FOR JUDGING, and the two are
     * separate because using the first for the second is a bug that reports
     * PASS.
     *
     * `text` is truncated to 220 characters so a failure message stays legible.
     * A guard that regexes it for `.order('x')` therefore cannot see the order
     * of any chain longer than that, and long chains are the norm on a screen
     * that selects eight columns and filters on four. Found on 20 September
     * 2026 by a drill that planted `.order('created_at')` on the organiser
     * dashboard's 300-character orders read and watched the guard pass.
     *
     * So the columns a chain is ORDERED BY are extracted here, from the whole
     * chain, and exposed as data. Added as a NEW FIELD: every existing reader
     * takes `table`, `methods`, `line` or `text` and is unaffected.
     */
    const whole = withStrings.slice(start, cursor)
    chains.push({
      table,
      methods,
      line: lineAt(raw, start),
      text: whole.replace(/\s+/g, ' ').slice(0, 220),
      orderColumns: [...whole.matchAll(/\.order\(\s*(['"])([A-Za-z0-9_]+)\1/g)].map((m) => m[2]),
    })
  }

  return chains
}

/**
 * Is this read bounded, and by what.
 *
 * A read is bounded when it can never be silently truncated by the project's
 * row ceiling (https://supabase.com/docs/reference/javascript/select, fetched
 * 2026-09-19: "By default, Supabase projects return a maximum of 1,000 rows"):
 *
 *   single / maybeSingle   one row is asked for and one row comes back
 *   head: true             no rows are returned at all, only a count
 *   limit / range          the bound is stated in the source, so a reader can
 *                          see it and a reviewer can judge it
 *
 * `count: 'exact'` alone is NOT a bound: it reports the true total in the
 * Content-Range header while the body still stops at the ceiling, which is the
 * precise shape that makes this defect invisible.
 */
export function boundednessOf(chain, { headSelects = new Set() } = {}) {
  if (chain.methods.includes('single') || chain.methods.includes('maybeSingle')) return 'single-row'
  if (chain.methods.includes('limit')) return 'limit'
  if (chain.methods.includes('range')) return 'range'
  if (headSelects.has(chain.line)) return 'head-only'
  return null
}

/** `.select('id', { count: 'exact', head: true })` returns no rows at all. */
export function headOnlySelectLines(path) {
  const { raw, withStrings } = readSource(path)
  const lines = new Set()
  const re = /\.from\(\s*['"][A-Za-z0-9_]+['"]\s*\)\s*\.?\s*\n?\s*\.select\([^)]*head:\s*true/g
  let m
  while ((m = re.exec(withStrings))) lines.add(lineAt(raw, m.index))
  return lines
}
