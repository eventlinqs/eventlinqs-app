/**
 * AN UNSUBSCRIBE LINK NEVER ANSWERS 500.
 *
 * WHAT HAPPENED, 21 September 2026. The route sweep in the push gate refused a
 * push of 348 commits with two lines:
 *
 *     http://127.0.0.1:63687/unsubscribe/zzzzzzzzzzzz: server error 500
 *     http://127.0.0.1:63687/waitlist/unsubscribe/zzzzzzzzzzzz: server error 500
 *
 * `unsubscribe_token` is a `uuid` column (migrations 20260624000002 line 40,
 * 20260704000003 line 39). `unsubscribe_token = 'zzzzzzzzzzzz'` is therefore not
 * a query that finds nothing, it is a query Postgres refuses to run:
 *
 *     22P02  invalid input syntax for type uuid: "zzzzzzzzzzzz"
 *
 * Earlier the same day, commit 162c6d28 correctly moved three of these pages on
 * to `readOrThrow`, so that a dropped socket could never again tell somebody
 * their statutory unsubscribe link "may have already been used". Every error is
 * now a throw. A malformed token produces an error. So the fix for the outage
 * turned a mangled link into a server error, on the one surface where the Spam
 * Act 2003 (Cth) requires a working facility.
 *
 * WHY A GUARD RATHER THAN TWO FIXED FILES. This was the FOURTH occurrence of
 * one mistake and the first three fixes were each written in one file and
 * stayed there:
 *
 *   /artists/claim/[token]            already tested the shape, so 162c6d28 did
 *                                     not break it, and nobody learned anything
 *   /unsubscribe/recovery/[token]     answered 500 on PRODUCTION on 12 September
 *                                     2026 for this exact reason, fixed in place
 *   /unsubscribe/[token]              broken 21 September
 *   /waitlist/unsubscribe/[token]     broken 21 September
 *
 * A rule obeyed in one file is a rule that will be missed in the next one. The
 * route sweep cannot catch the rest of the family because every token route is
 * exempt from it by name: there is no value an anonymous sweep can hold, which
 * is precisely why two of them were only found by a URL somebody typed by hand.
 *
 * WHAT IT ASSERTS, and it reads CODE rather than files: comments are blanked
 * before anything is judged, because commenting a check out is the most natural
 * way to disable it and a guard that reads a commented-out call as if it ran is
 * not guarding anything.
 *
 *   ONE   every source file that queries a token column tests the token's shape
 *         first, at EVERY occurrence, not once per file
 *   TWO   the shape is spelled in exactly one place, so the next fix cannot be
 *         written in one file and stay there
 *   THREE the predicate is anchored at both ends and carries no `g` flag, the
 *         two ways a shape test can be wrong while looking right
 *
 * WHAT IT CANNOT SEE, stated so a pass is not read as more than it is: whether
 * the page RENDERS something useful. That is proven by driving both URLs at
 * 390, 768 and 1440 (scripts/verify/unsubscribe-mangled-link-drive.mjs) and by
 * the route sweep, which is the check that found this.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const failures = []
const passes = []

const PREDICATE_MODULE = 'src/lib/consent/token.ts'
const PREDICATE = 'isUnsubscribeToken'
/** The column whose type makes a malformed value an error rather than a miss. */
const TOKEN_COLUMN = 'unsubscribe_token'

/**
 * Blanks COMMENTS ONLY, preserving length so every index still points at the
 * same character, and preserving string literals because every check below
 * looks for a quoted column name.
 */
function codeOnly(src) {
  const out = src.split('')
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === ch) break
        j += 1
      }
      i = j + 1
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === '//') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      blank(i, stop)
      i = stop
      continue
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    i += 1
  }
  return out.join('')
}

function sourceFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx?$/.test(entry.name)) acc.push(full)
  }
  return acc
}

/** Every index of `needle` in `hay`. */
function indexesOf(hay, needle) {
  const out = []
  let at = hay.indexOf(needle)
  while (at !== -1) {
    out.push(at)
    at = hay.indexOf(needle, at + 1)
  }
  return out
}

/**
 * Where each top-level function in a module begins.
 *
 * THIS EXISTS BECAUSE THE DRILL CAUGHT THE GUARD, not review. Clause one first
 * asked only whether SOME `isUnsubscribeToken(` appeared earlier in the FILE
 * than the read. src/lib/consent/record.ts holds three resolvers, and the drill
 * that deletes the shape test from the SECOND one left the first one's call
 * sitting above it, so the guard passed on a tree where two of the three reads
 * were unguarded. That is the identical defect this guard exists to stop,
 * committed by the guard itself.
 *
 * A read is therefore judged against its own function, never against the file.
 */
function functionStarts(code) {
  const starts = []
  /*
   * AND THE ARROW IS REQUIRED, which the guard also learned by being run. The
   * first version accepted `const NAME = (` as a function start, so
   * `const organisationName =\n  (row as { ... })` in record.ts read as a new
   * function between a resolver's shape test and its own second read, and the
   * guard reported a false positive on correct code. A parenthesis after `=`
   * is an expression; only `=>` makes it a function.
   */
  const re = /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s|\bconst\s+\w+\s*=\s*(?:async\s*)?\([^()]*\)\s*=>/g
  let m = re.exec(code)
  while (m) {
    starts.push(m.index)
    m = re.exec(code)
  }
  return starts
}

// ── CLAUSE ONE ───────────────────────────────────────────────────────────────
// Every read of the token column is preceded by a test of the token's shape.
//
// PER OCCURRENCE, NOT PER FILE. src/lib/consent/record.ts holds three separate
// resolvers, each with its own read; a file-level "does the predicate appear
// anywhere" test would pass with two of the three guards deleted. That is the
// exact shape of the defect this guard exists to stop, so it is checked at
// every occurrence and the failure names the line.

const SCANNED_ROOTS = [join(ROOT, 'src', 'app'), join(ROOT, 'src', 'lib')]
const GENERATED_TYPES = 'src/types/database.ts'

let readsFound = 0
let filesWithReads = 0

for (const root of SCANNED_ROOTS) {
  for (const file of sourceFiles(root)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    if (rel === GENERATED_TYPES || rel === PREDICATE_MODULE) continue
    const raw = readFileSync(file, 'utf8')
    if (!raw.includes(TOKEN_COLUMN)) continue
    const code = codeOnly(raw)

    // A READ, not a mention. The column name appears in types, in metadata
    // objects and in insert payloads; the thing that can raise 22P02 is a
    // FILTER on it.
    const reads = [
      ...indexesOf(code, `.eq('${TOKEN_COLUMN}'`),
      ...indexesOf(code, `.eq("${TOKEN_COLUMN}"`),
      ...indexesOf(code, `.match({ ${TOKEN_COLUMN}`),
    ].sort((a, b) => a - b)
    if (reads.length === 0) continue

    filesWithReads += 1
    readsFound += reads.length
    const guards = indexesOf(code, `${PREDICATE}(`)
    const starts = functionStarts(code)

    for (const at of reads) {
      // The function this read sits in, and only that function. A guard in the
      // resolver above it protects that resolver, not this one.
      const enclosing = starts.filter((s) => s < at).pop() ?? 0
      const guarded = guards.some((g) => g > enclosing && g < at)
      if (!guarded) {
        const line = code.slice(0, at).split('\n').length
        failures.push(
          `${rel}:${line}: filters on ${TOKEN_COLUMN} with no ${PREDICATE}() above it. ` +
            `${TOKEN_COLUMN} is a uuid column, so a malformed token is 22P02 rather than no row, ` +
            `and readOrThrow raises it: the page answers 500 to somebody exercising a statutory right.`,
        )
      }
    }
  }
}

if (readsFound === 0) {
  failures.push(
    `no file anywhere filters on ${TOKEN_COLUMN}. Either the column was renamed or this guard is ` +
      `reading the wrong thing; either way it is no longer guarding the unsubscribe family.`,
  )
} else if (failures.length === 0) {
  passes.push(
    `all ${readsFound} read(s) of ${TOKEN_COLUMN}, across ${filesWithReads} file(s), test the token's shape first`,
  )
}

// ── CLAUSE TWO ───────────────────────────────────────────────────────────────
// The shape is spelled once. Three fixes for this defect were each written in
// one file and stayed there; a second copy of the shape is how the fourth one
// will be.

const INLINE_SHAPE = /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/i
const ONE_SOURCE_SCOPE = [
  join(ROOT, 'src', 'lib', 'consent'),
  join(ROOT, 'src', 'app', 'unsubscribe'),
  join(ROOT, 'src', 'app', 'waitlist', 'unsubscribe'),
  join(ROOT, 'src', 'app', 'marketing', 'preferences'),
]

const respellers = []
for (const root of ONE_SOURCE_SCOPE) {
  for (const file of sourceFiles(root)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    if (rel === PREDICATE_MODULE) continue
    if (INLINE_SHAPE.test(codeOnly(readFileSync(file, 'utf8')))) respellers.push(rel)
  }
}
if (respellers.length > 0) {
  failures.push(
    `the unsubscribe token shape is spelled again in ${respellers.join(', ')}. ` +
      `It belongs in ${PREDICATE_MODULE} and nowhere else: this defect has now been fixed four ` +
      `times, three of them in a single file that nobody else read.`,
  )
} else {
  passes.push('the token shape is spelled in exactly one module')
}

// ── CLAUSE THREE ─────────────────────────────────────────────────────────────
// The predicate itself. An unanchored shape accepts anything CONTAINING a uuid,
// and a `g` flag carries lastIndex between calls so the same live token
// alternates valid and invalid. Both look correct in a diff.

const predicateSrc = existsSync(join(ROOT, PREDICATE_MODULE))
  ? codeOnly(readFileSync(join(ROOT, PREDICATE_MODULE), 'utf8'))
  : null

if (!predicateSrc) {
  failures.push(`${PREDICATE_MODULE}: missing entirely. Nothing tells a mangled link from an outage.`)
} else {
  const shape = predicateSrc.match(/\/\^.*\$\/[a-z]*/)
  if (!shape) {
    failures.push(
      `${PREDICATE_MODULE}: the shape is no longer anchored with ^ and $, so it would accept any ` +
        `string CONTAINING a uuid, including a path traversal carrying one.`,
    )
  } else if (/\$\/[a-z]*g/.test(shape[0])) {
    failures.push(
      `${PREDICATE_MODULE}: the shape carries the g flag. A shared global RegExp keeps lastIndex ` +
        `between calls, so the same live token answers true, then false, then true.`,
    )
  } else {
    passes.push('the shape is anchored at both ends and carries no g flag')
  }

  if (!new RegExp(`export function ${PREDICATE}\\b`).test(predicateSrc)) {
    failures.push(`${PREDICATE_MODULE}: no longer exports ${PREDICATE}, so clause one is reading for a call that cannot exist`)
  } else {
    passes.push(`${PREDICATE_MODULE} exports the one predicate the family calls`)
  }
}

console.log(`[an-unsubscribe-link-never-500s] ${passes.length} structural guarantee(s) verified:`)
for (const p of passes) console.log(`    PASS  ${p}`)
console.log(
  '    NOTE  this guard reads CODE only. Whether the page then renders something useful is proven',
)
console.log(
  '          by scripts/verify/unsubscribe-mangled-link-drive.mjs at 390, 768 and 1440, and by the',
)
console.log('          route sweep in the push gate, which is what found the defect.')

if (failures.length > 0) {
  console.error(
    `\n[an-unsubscribe-link-never-500s] FAILED. ${failures.length} way(s) an unsubscribe link could answer 500.\n`,
  )
  for (const f of failures) console.error(`    ${f}`)
  console.error(
    '\n    The unsubscribe facility is a statutory remedy, not a feature. A person' +
      '\n    following a link out of their own inbox meets either a page that helps' +
      '\n    them or a server error, and a server error reads as a platform that will' +
      '\n    not let them leave. A value that cannot be a token is a fact ABOUT the' +
      '\n    token; a read that failed is not. Never confuse the two.\n',
  )
  process.exit(1)
}

console.log(
  '[an-unsubscribe-link-never-500s] PASS - every read of an unsubscribe token tests its shape first, the shape is written once, and the predicate is anchored.',
)
