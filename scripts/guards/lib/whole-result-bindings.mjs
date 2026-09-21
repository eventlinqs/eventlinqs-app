/**
 * ---------------------------------------------------------------------------
 * THE SECOND SPELLING OF A DISCARDED READ ERROR, AND IT IS THE ONE THE
 * PLATFORM'S ONE DOOR WAS WRITTEN IN.
 * ---------------------------------------------------------------------------
 *
 * `awaitedDestructures` in scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs
 * judges a read whose result is DESTRUCTURED, which is the spelling the
 * campaigner used and the spelling that guard was built for. It cannot see the
 * other one, and on 21 September 2026 the other one was sitting in
 * `src/lib/consent/resolver.ts`, the module whose own header calls itself THE
 * ONE DOOR every message this platform sends to a person goes through:
 *
 *     const [eventResult, suppressionResult, policyResult] = await Promise.all([...])
 *     const suppressions = (suppressionResult.data ?? []).map(...)
 *
 * Nothing is destructured, so there is no `{ data }` for that matcher to look
 * at, and `suppressionResult.error` is never read. A failed suppression read
 * therefore arrives as an EMPTY LIST of suppressions, and the decision function
 * is handed a valid grant with nothing standing against it.
 *
 * DRIVEN, NOT ARGUED, before this file was written: the same person, the same
 * ledger, one read failing. With every read working the resolver answers "a
 * all_marketing suppression recorded on 1 Feb 2026 stops this message" and
 * REFUSES. With the suppression read returning `{ data: null, error }` it
 * answers "granted on 10 Jan 2026 under wording v1" and PERMITS. The platform
 * mails a person who unsubscribed, and files their grant as the reason.
 *
 * THE RULE. In the scoped directories, a PostgREST read whose result is bound
 * as a WHOLE OBJECT, and whose `.data` is then read, must also have its
 * `.error` read somewhere in the same file, or go through a door. Binding the
 * object is not reading the error: `result.data ?? []` cannot tell a failure
 * from an empty table any more than `const { data }` can.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG, because each of these is the correct
 * shape, and a guard that fires on correct code is a guard somebody switches
 * off:
 *
 *   AN ELEMENT WHOSE CHAIN SITS INSIDE A DOOR CALL. `readEveryRow('x', (from,
 *   to) => admin.from(...).range(from, to))` is a read that throws, and the
 *   name bound to it holds rows rather than a response.
 *
 *   A NAME ASSIGNED FROM AN OBJECT LITERAL, `const eventResult = { data:
 *   rows.flat() }`. There is no response and no error to read, because the door
 *   above it already decided. This is the live spelling in
 *   `filterPermittedRecipients`, six lines below the defect.
 *
 *   AN ELEMENT THAT IS AN OBJECT DESTRUCTURE, which `awaitedDestructures`
 *   judges. One read, one finding, from whichever matcher can see it.
 *
 * IT LIVES IN ITS OWN FILE so the unit test and the drill can import the
 * judgement without importing a guard that scans the tree at module scope,
 * which is the fault lane C recorded on 21 September in two guards of its own.
 */
import { stripNonCode, normaliseEol, lineAt } from './source.mjs'

/**
 * Index just past the bracket matching the one at `open`, or the end of the
 * string when it is unbalanced. Operates on the code-only view, so a bracket
 * found here is never one inside a string or a comment: this tree writes
 * `.select('id, audience_members(email)')`, and a walker that counted that
 * parenthesis would lose the chain it was following.
 */
export function skipBalanced(code, open, openCh, closeCh) {
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === openCh) depth += 1
    else if (code[i] === closeCh) {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return code.length
}

/** Is `at` inside the parentheses of a door call that begins within [from, to)? */
function insideADoorCall(code, at, from, to, doors) {
  for (const door of doors) {
    const re = new RegExp(`\\b${door}\\s*[(<]`, 'g')
    re.lastIndex = from
    let m
    while ((m = re.exec(code)) !== null && m.index < to) {
      const open = code.indexOf('(', m.index)
      if (open === -1) break
      const close = skipBalanced(code, open, '(', ')')
      if (open < at && close > at) return true
    }
  }
  return false
}

/** The top-level comma-separated elements of the array whose `[` is at `open`. */
export function elementsOf(code, open) {
  const out = []
  let depth = 0
  let start = open + 1
  for (let i = open; i < code.length; i += 1) {
    const ch = code[i]
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === '}') depth -= 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        out.push({ start, end: i })
        return out
      }
    } else if (ch === ',' && depth === 1) {
      out.push({ start, end: i })
      start = i + 1
    }
  }
  return out
}

/** A PostgREST read not wrapped in a door, anywhere inside [from, to). */
function bareChainIn(code, from, to, doors) {
  const re = /\.(?:from|rpc)\s*\(/g
  re.lastIndex = from
  let m
  while ((m = re.exec(code)) !== null && m.index < to) {
    if (!insideADoorCall(code, m.index, from, to, doors)) return true
  }
  return false
}

/**
 * `name.data`, `name?.count`, `name[0].count`: the three ways a response's
 * payload is read in this tree.
 *
 * THE INDEX IS NOT DECORATION. `const counts = await Promise.all([...five
 * head-only count reads...])` then `counts[0].count ?? 0` is the live spelling
 * in src/lib/attribution/read.ts, and a matcher that required the property to
 * follow the bare name could not see any of the five. A failed count read
 * arrives as `count: null`, so `?? 0` prints ZERO ORDERS on the screen that
 * summarises what the platform has attributed.
 *
 * `count` is judged beside `data` for the same reason: a count IS the payload
 * of a `head: true` read, and it takes a fallback exactly as a row list does.
 */
const property = (name, prop) =>
  new RegExp(`\\b${name}\\s*(?:\\[[^\\]]*\\])?\\s*(?:\\?\\.|\\.)\\s*${prop}\\b`)

/** Either payload shape: rows, or the count of a head-only read. */
const readsThePayloadOf = (code, name) => property(name, 'data').test(code) || property(name, 'count').test(code)

/**
 * THE SECOND KIND OF DOOR: one that takes the RESULT rather than the read.
 *
 * `readOrThrow(label, () => admin.from(...))` wraps the read, so there is no
 * response in the caller at all. `countOrRaise('orders', counts[0])` is the
 * other shape: the response is bound here and handed over, and the error is
 * read inside the door rather than in this file. Both decide; only the first
 * one is invisible to a matcher looking for `name.error`.
 *
 * Naming them is what stops this guard demanding a redundant `if (x.error)`
 * beside a call that already throws on it, which is how a correct file gets
 * edited to satisfy a guard and ends up saying the same thing twice.
 */
export const RESULT_DOORS = ['countOrRaise']

const handedToAResultDoor = (code, name) =>
  RESULT_DOORS.some((door) => new RegExp(`\\b${door}\\s*\\([^()]*\\b${name}\\b`).test(code))

/**
 * The end of the block the binding at `from` lives in, so a question about a
 * name is asked where that name is live and nowhere else.
 *
 * THIS IS NOT FUSSINESS, IT IS THE FAULT THE FIRST DRAFT SHIPPED WITH. The
 * first version asked "does this file read `eventResult.error`" and
 * `src/lib/consent/resolver.ts` holds TWO functions that both bind
 * `eventResult` and `suppressionResult`. The second one builds them from an
 * object literal over rows a door already fetched, and the first one binds them
 * to raw reads that discard their error. Asked file-wide, the correct second
 * function excused the defective first one, and the two reads at the very
 * centre of this item did not appear in the guard's own output.
 *
 * One `.test()` over a whole file cannot tell two occurrences of a name apart.
 * Walking to the end of the enclosing block can, because that is exactly the
 * region a `const` is visible in.
 */
function scopeEnd(code, from) {
  let depth = 0
  for (let i = from; i < code.length; i += 1) {
    const ch = code[i]
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1
      if (depth < 0) return i
    }
  }
  return code.length
}

/**
 * Every whole-object binding of a PostgREST read in one file.
 *
 * @param {string} src the file's text
 * @param {string[]} doors the names that decide for a read and throw
 * @returns {{name: string, line: number, handled: boolean, shape: string}[]}
 */
export function wholeResultBindings(src, doors) {
  const text = normaliseEol(src)
  const code = stripNonCode(text)
  const out = []
  const seen = new Set()

  /*
   * `at` is where the finding is REPORTED and `livesFrom` is where the name
   * becomes visible, and they are not the same index. A Promise.all element
   * starts INSIDE the array brackets, so a scope walk from there stops at the
   * `]` that closes the array and sees none of the function the name is used
   * in. The walk starts at the destructuring statement instead.
   */
  const consider = (name, at, livesFrom, shape) => {
    // Keyed by POSITION, never by name: one file binds `eventResult` twice.
    if (!name || seen.has(at)) return
    seen.add(at)
    const live = code.slice(livesFrom, scopeEnd(code, livesFrom))
    /*
     * Only a binding that is USED can publish a failure: its payload read
     * here, or the whole response handed to a door that reads it there. A
     * binding that is used for neither is awaited and dropped, and there is
     * nothing for a failure to become.
     */
    if (!readsThePayloadOf(live, name) && !handedToAResultDoor(live, name)) return
    const handled = property(name, 'error').test(live) || handedToAResultDoor(live, name)
    out.push({ name, line: lineAt(text, at), handled, shape })
  }

  for (const m of code.matchAll(/(?:const|let|var)\s*\[([^[\]]*)\]\s*=\s*await\s+Promise\.all\s*\(\s*\[/g)) {
    const names = m[1].split(',').map((n) => n.trim())
    const open = m.index + m[0].length - 1
    elementsOf(code, open).forEach((element, i) => {
      const name = names[i]
      // Anything that is not a plain identifier is a destructure, judged elsewhere.
      if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return
      if (!bareChainIn(code, element.start, element.end, doors)) return
      consider(name, element.start, m.index, 'element')
    })
  }

  /*
   * THE PLAIN ASSIGNMENT, BOUNDED BY THE CALL IT AWAITS RATHER THAN BY A
   * STATEMENT, AND THE FIRST ATTEMPT WAS WRONG IN THE DANGEROUS DIRECTION.
   *
   * It ran to the next semicolon at depth zero. This codebase is written
   * without semicolons, so there was no depth-zero semicolon in the whole
   * probe: the bound became "the end of the file", and a read that correctly
   * goes through `readEveryRow` was flagged because an unrelated `.rpc(` four
   * lines below it fell inside the window. The probe caught it before the tree
   * ever saw it, which is the entire reason the probe exists.
   *
   * The bound is now the balanced parentheses of the FIRST call after `await`,
   * which is the head of this expression and nothing else, and the head's own
   * name decides the door question:
   *
   *     await readEveryRow('x', (from, to) => admin.from(...))   head is a door
   *     (await admin.rpc('f', {})) as unknown as { ... }         head is a read
   *     await admin.from('t').select('c')                        head is a read
   */
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*await\b/g)) {
    const afterAwait = m.index + m[0].length
    const open = code.indexOf('(', afterAwait)
    if (open === -1) continue
    const head = code.slice(afterAwait, open)
    // A head that is not a member expression is some other await entirely.
    if (!/^[\s\w$.]*$/.test(head)) continue
    if (doors.some((door) => new RegExp(`\\b${door}\\s*$`).test(head))) continue
    const end = skipBalanced(code, open, '(', ')')
    if (!bareChainIn(code, m.index, end, doors)) continue
    consider(m[1], m.index, m.index, 'assignment')
  }

  return out
}

/**
 * THE MATCHER IS ASKED A QUESTION IT KNOWS THE ANSWER TO BEFORE IT IS TRUSTED
 * WITH THE TREE, for the reason the sibling probe records: a blind matcher has
 * no natural symptom, it simply reports that every read is fine.
 *
 * Six lines, and every one of them is a real shape out of this tree.
 */
export const WHOLE_RESULT_PROBE = [
  'async function first(admin) {',
  '  const [bad, good] = await Promise.all([',
  "    admin.from('t').select('c').eq('id', 1).maybeSingle(),",
  "    admin.from('u').select('c').eq('id', 1).maybeSingle(),",
  '  ])',
  '  const rows = bad.data ?? []',
  '  const more = good.data ?? []',
  "  if (good.error) throw new Error('said')",
  '  return [rows, more]',
  '}',
  'async function second(admin) {',
  "  const [bad] = await Promise.all([admin.from('t').select('c').maybeSingle()])",
  "  if (bad.error) throw new Error('said')",
  '  return bad.data',
  '}',
  'async function counting(admin) {',
  "  const counts = await Promise.all([admin.from('t').select('id', { count: 'exact', head: true })])",
  '  return counts[0].count ?? 0',
  '}',
  'async function countingProperly(admin) {',
  "  const tallies = await Promise.all([admin.from('t').select('id', { count: 'exact', head: true })])",
  "  return countOrRaise('things', tallies[0])",
  '}',
  'async function shapes(admin, rows) {',
  "  const doored = await readEveryRow('x', (from, to) => admin.from('v').select('c').range(from, to))",
  '  const literal = { data: rows }',
  "  const cast = (await admin.rpc('f', {})) as unknown as { data: null; error: null }",
  '  return [doored.data, literal.data, cast.data]',
  '}',
].join('\n')

/** @returns a sentence naming what the matcher failed to see, or null when it is sound. */
export function wholeResultCalibrationFault(doors) {
  const found = wholeResultBindings(WHOLE_RESULT_PROBE, doors)
  const named = (name) => found.filter((f) => f.name === name)

  /*
   * THE TWO `bad`s ARE THE WHOLE POINT OF THIS PROBE. One function discards
   * its error and one reads it, and they bind the SAME NAME, which is the
   * shape in src/lib/consent/resolver.ts that the first draft of this matcher
   * could not tell apart. Asserting only that "a bad was found" would go green
   * on a matcher that had collapsed them back into one.
   */
  const bad = named('bad')
  if (bad.length !== 2) return `it saw ${bad.length} of the 2 same-named bindings in its own probe`
  if (bad[0].handled) return 'it called a binding with no `error` read handled'
  if (!bad[1].handled) return 'it let one function’s handled binding and another’s stand as one'

  if (named('good').length !== 1 || !named('good')[0].handled) return 'it could not see an `error` that IS read'
  if (named('doored').length !== 0) return 'it flagged a read that goes through a door'
  if (named('literal').length !== 0) return 'it flagged a name bound to an object literal'
  if (named('cast').length !== 1) return 'it did not see a parenthesised await with a cast'
  if (named('counts').length !== 1) return 'it did not see an indexed count read'
  if (named('counts')[0].handled) return 'it called an unhandled count read handled'
  if (named('tallies').length !== 1) return 'it did not see a count read handed to a result door'
  if (!named('tallies')[0].handled) return 'it demanded an `error` beside a door that already throws on one'
  return null
}
