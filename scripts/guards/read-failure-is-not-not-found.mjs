/**
 * GUARD: a read whose empty answer decides a 404 may not discard, fold, or
 * merely log its error.
 *
 * THE INCIDENT, 12 September 2026, the FOURTH occurrence of one class. The
 * pre-push gate's checkout drive opened a published, public, paid event at 768
 * wide and the page answered 404, once, between a 200 at 390 and a 200 at 1440.
 * The row was published and public, the select policies carry no time clause,
 * and the server log carried no failed read, because the read that decided the
 * answer had discarded its error:
 *
 *     const { data } = await supabase.from('events').select('id').eq('slug', slug).maybeSingle()
 *     if (data) return children
 *     notFound()
 *
 * A dropped socket, a pool refusal, a statement timeout: every one of them lands
 * in `error`, leaves `data` null, and is indistinguishable from an empty table to
 * the line below. A buyer whose read blinked is told the event does not exist. A
 * crawler following our own sitemap is told to delete the page.
 *
 * The first three occurrences were each fixed where they stood (the organiser
 * profile twice, then the squad payment page) and each fix was a paragraph in a
 * file header. The measurement that followed the third counted only the VISIBLE
 * fold, `if (error || !x) notFound()`, so the silent form above walked past it.
 * The fourth is why this is a guard: the class is now defined by what the code
 * DOES with the read, not by how the fold happens to be spelled.
 *
 * WHAT IS JUDGED. Every file under src/app whose code (comments stripped) calls
 * notFound(). In each, every awaited PostgREST read that is destructured
 * (`const { data } = await ...`, `const { data: event, error } = await ...`) and
 * whose bound value DECIDES: it is tested for absence straight into notFound(),
 * or it is the `if (x) return children` of an existence layout, or it is
 * returned from a fetch helper whose caller 404s, or an alias of it is. Those
 * are the reads this class lives in. A read whose value feeds a list or a label
 * is not judged here; an empty rail is a different question from a false 404.
 *
 * THE THREE FAULTS, and one is enough to fail the build:
 *
 *   discarded   the destructure never binds `error`. The fourth occurrence.
 *   folded      the notFound() condition names the error binding, so a fault
 *               and an absence share one answer. The third occurrence.
 *   not thrown  `error` is bound and the code between the read and the decision
 *               never throws: it logs, or checks and continues, and 404s anyway.
 *               The second occurrence ("the fix then was to make the error
 *               VISIBLE. It still answered 404.").
 *
 * THE FIX IS ONE DOOR. src/lib/supabase/read-or-throw.ts: `readOrThrow` retries
 * a transient fault, throws a real one, and answers null only when the database
 * itself said "no row" (PGRST116). A read routed through it has no destructure
 * for this guard to judge, which is the point: the decision is made once, in one
 * place, and the routes inherit it.
 *
 * WHAT THIS GUARD CANNOT SEE, said plainly rather than implied:
 *
 *  - It reads text, not a call graph. A helper in src/lib that folds a read into
 *    null for a caller in src/app to 404 on is invisible here; the ones found on
 *    12 September (event access, the organiser event, the gig) were fixed by hand
 *    and are pinned by tests/unit/seo/read-failure-is-not-not-found.test.ts.
 *  - A decision spelled some other way (a redirect, a rendered refusal) is not a
 *    notFound() and is not judged. The checkout reservation and the door's
 *    authorisation reads were fixed by hand for that reason.
 *  - An array destructure of Promise.all is not judged. The door scan page had
 *    one and it now runs each read through the door above.
 *
 * Run: node scripts/guards/read-failure-is-not-not-found.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { lineAt, stripComments } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

export const TAG = '[read-failure-is-not-not-found]'
const ROOT = process.cwd()
const APP = join(ROOT, 'src', 'app')
const EXT = /\.(ts|tsx)$/
const IDENT = '[A-Za-z_$][\\w$]*'
const FIX =
  'Route the read through readOrThrow (src/lib/supabase/read-or-throw.ts): it retries a blink, ' +
  'throws a real fault so the answer is a 500 and never a false 404, and answers null only when ' +
  'the database itself said "no row".'

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The `data` and `error` bindings of a destructure list such as
 * `data: event, error: eventError`. A nested `data: { user }` (the auth read)
 * binds neither, and is therefore never a read this guard judges.
 */
export function parseBindings(list) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of list) {
    if (ch === '{' || ch === '[') depth += 1
    if (ch === '}' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  const out = { data: null, error: null }
  for (const raw of parts) {
    const part = raw.trim()
    let m = new RegExp(`^data\\s*(?::\\s*(${IDENT}))?$`).exec(part)
    if (m) {
      out.data = m[1] ?? 'data'
      continue
    }
    m = new RegExp(`^error\\s*(?::\\s*(${IDENT}))?$`).exec(part)
    if (m) out.error = m[1] ?? 'error'
  }
  return out
}

/**
 * The right-hand side of `const { ... } = ` starting at `start`: the text up to
 * the first `;` or newline at bracket depth zero whose next line does not
 * continue the expression (a chained `.call()`, a ternary arm, an `as` cast).
 */
export function readRhs(src, start) {
  let depth = 0
  for (let i = start; i < src.length; i += 1) {
    const c = src[i]
    if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') depth -= 1
    else if (c === ';' && depth <= 0) return { rhs: src.slice(start, i), end: i }
    else if (c === '\n' && depth <= 0) {
      const next = (/^\s*([^\n]*)/.exec(src.slice(i + 1)) ?? ['', ''])[1].trimStart()
      if (!/^(\.|\?|:|as\b|\|\||&&)/.test(next)) return { rhs: src.slice(start, i), end: i }
    }
  }
  return { rhs: src.slice(start), end: src.length }
}

/** Is this awaited expression a PostgREST read? */
const isRead = (rhs) => /\bawait\b/.test(rhs) && /\.(from|rpc|select|single|maybeSingle)\(/.test(rhs)

/**
 * Where, inside the window after a read, its bound value decides a 404.
 * Returns `{ index, how }` or null when the value decides nothing of the kind.
 */
export function findDecision(window, name, { singleRow = true } = {}) {
  const candidates = []

  // `if (<anything with !name in it>) notFound()`, the negation anywhere in the
  // condition: `if (!event)`, `if (!event || !event.organisation_id)`, and the
  // fold `if (eventError || !event)` are all one decision.
  const notFoundIf = (bound, how) => {
    const negated = new RegExp(`!${escapeRe(bound)}\\b`)
    const every = /if\s*\(([^)]*)\)\s*(?:\{\s*)?(?:return\s+)?notFound\(\)/g
    let m
    while ((m = every.exec(window))) {
      if (negated.test(m[1])) candidates.push({ index: m.index, how })
    }
  }
  notFoundIf(name, `if (!${name}) notFound()`)

  const n = escapeRe(name)
  const children = new RegExp(`if\\s*\\(\\s*${n}\\s*\\)\\s*return children\\b`).exec(window)
  if (children) candidates.push({ index: children.index, how: `if (${name}) return children` })

  // `return data` or `return data ?? null` from a fetch helper is an existence
  // answer for the caller to 404 on, when the read asked for ONE ROW (.single()
  // or .maybeSingle()). `return (data ?? [])`, `return data ?? fallbackPrice`
  // and a scalar handed back from an rpc are values with a default, and are not.
  if (singleRow) {
    const returned = new RegExp(`\\breturn\\s+\\(?\\s*${n}\\b(?!\\s*\\?\\?(?!\\s*null\\b))`).exec(window)
    if (returned) candidates.push({ index: returned.index, how: `return ${name}` })
  }

  const alias = new RegExp(`const\\s+(${IDENT})\\s*=\\s*${n}\\s+as\\b`).exec(window)
  if (alias) notFoundIf(alias[1], `if (!${alias[1]}) notFound(), where ${alias[1]} is ${name}`)

  if (candidates.length === 0) return null
  candidates.sort((x, y) => x.index - y.index)
  return candidates[0]
}

/**
 * Judge one file's source. Returns every fault plus the counts the runner
 * declares. `file` is only used to label the faults.
 */
export function judgeSource(source, file) {
  const src = stripComments(source)
  const faults = []
  let reads = 0
  let decisive = 0
  if (!/\bnotFound\(\)/.test(src)) return { faults, reads, decisive, judged: false }

  const opener = /const\s*\{([^{}]*)\}\s*=\s*/g
  const found = []
  let m
  while ((m = opener.exec(src))) {
    const { rhs, end } = readRhs(src, m.index + m[0].length)
    if (!isRead(rhs)) continue
    found.push({ index: m.index, list: m[1], rhs, end })
  }

  for (let i = 0; i < found.length; i += 1) {
    const read = found[i]
    reads += 1
    const bindings = parseBindings(read.list)
    if (!bindings.data) continue
    const windowEnd = i + 1 < found.length ? found[i + 1].index : Math.min(src.length, read.end + 3000)
    const window = src.slice(read.end, windowEnd)
    const decision = findDecision(window, bindings.data, { singleRow: /\.(single|maybeSingle)\(\)/.test(read.rhs) })
    if (!decision) continue
    decisive += 1

    const line = lineAt(src, read.index)
    const text = src.slice(read.index, read.end).split('\n')[0].trim()
    const before = window.slice(0, decision.index)
    const base = { file, line, name: bindings.data, read: text, decision: decision.how, fix: FIX }

    if (!bindings.error) {
      faults.push({
        ...base,
        kind: 'discarded',
        why: `discards the error of the read that decides ${decision.how}: a dropped socket leaves \`${bindings.data}\` null exactly as an empty table would, and the decision cannot tell them apart`,
      })
      continue
    }
    const fold = new RegExp(`if\\s*\\(([^)]*\\b${escapeRe(bindings.error)}\\b[^)]*)\\)\\s*(?:\\{\\s*)?(?:return\\s+)?notFound\\(\\)`).exec(window)
    if (fold && fold.index <= decision.index) {
      faults.push({
        ...base,
        kind: 'folded',
        why: `folds the read error \`${bindings.error}\` into notFound(): a fault and an absence share one answer, and the fault's answer is false`,
      })
      continue
    }
    if (!/\bthrow\b/.test(before)) {
      faults.push({
        ...base,
        kind: 'not thrown',
        why: `binds the error as \`${bindings.error}\` and never throws it before ${decision.how}: making a fault visible and making it honest are different jobs, and this one still answers 404`,
      })
    }
  }
  return { faults, reads, decisive, judged: true }
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (EXT.test(entry)) yield full
  }
}

/** Judge the whole of src/app. */
export function scanApp(root = APP) {
  let files = 0
  let judged = 0
  let reads = 0
  let decisive = 0
  const faults = []
  for (const full of walk(root)) {
    files += 1
    const rel = relative(ROOT, full).split(sep).join('/')
    const result = judgeSource(readFileSync(full, 'utf8'), rel)
    if (!result.judged) continue
    judged += 1
    reads += result.reads
    decisive += result.decisive
    faults.push(...result.faults)
  }
  return { files, judged, reads, decisive, faults }
}

const invokedDirectly =
  Boolean(process.argv[1]) && /read-failure-is-not-not-found\.mjs$/.test(process.argv[1].split(sep).join('/'))

if (invokedDirectly) {
  const { files, judged, reads, decisive, faults } = scanApp()
  for (const f of faults) {
    console.error(`${TAG} FAIL: ${f.file}:${f.line} ${f.why}`)
    console.error(`      ${f.read}`)
    console.error(`      ${f.fix}`)
  }
  declareWork('read-failure-is-not-not-found', {
    did: {
      'route file read': files,
      'file that can answer 404 judged': judged,
      'awaited read inspected': reads,
      'read that decides a 404 judged': decisive,
    },
    found: { 'read whose failure would answer a false 404': faults.length },
    zeroIsFine: {
      'read that decides a 404 judged':
        'every decisive read has moved behind readOrThrow, so there is no destructure left to judge; the door is the guard',
    },
    exitOnZero: false,
  })
  if (faults.length > 0) {
    console.error(`${TAG} ${faults.length} read(s) would answer "not found" because they could not ask. Build blocked.`)
    process.exit(1)
  }
  console.log(
    `${TAG} PASS - ${judged} route file(s) can answer 404, ${reads} awaited read(s) inspected, ${decisive} decide a 404 and every one names and throws its error.`,
  )
}
