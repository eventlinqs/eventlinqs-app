/**
 * A NARROW DRILL RUN FOR ONE GUARD, SO THE FULL HARNESS IS NOT RUN TWENTY TIMES
 * WHILE A DRILL IS BEING WRITTEN.
 *
 * `scripts/verify/guard-failure-drills.mjs` is the authority and runs every
 * drill in the repository; it mutates the tree for minutes at a time and
 * re-verifies every guard afterwards, which is exactly what it should do and is
 * far too slow a loop for getting one `find` string right.
 *
 * This runs ONLY the drills whose guard path contains the argument, using the
 * SAME drill definitions out of that file, so a drill proven here is the drill
 * the harness will run. It is a lens on the authority, never a second copy of
 * it.
 *
 * Run: node scripts/verify/seo5-drill-check.mjs no-false-urgency
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const needle = process.argv[2]
if (!needle) {
  console.error('usage: node scripts/verify/seo5-drill-check.mjs <substring of the guard path>')
  process.exit(2)
}

// The drill list is DATA in that file, between `const DRILLS = [` and the line
// that closes it. Importing the module would run the whole harness, so the
// definitions are read out rather than executed.
// Normalised to LF first. The repository has CRLF files, and searching for a
// bare "\n]\n" in a CRLF buffer silently finds nothing, which presents as "no
// drills match" rather than as a parse failure.
const harness = readFileSync(
  join(ROOT, 'scripts', 'verify', 'guard-failure-drills.mjs'),
  'utf8',
).replace(/\r\n/g, '\n')
const open = harness.indexOf('const DRILLS = [')
if (open < 0) {
  console.error('could not find `const DRILLS = [` in guard-failure-drills.mjs')
  process.exit(2)
}
const close = harness.indexOf('\n]\n', open)
const body = harness.slice(open + 'const DRILLS = ['.length, close + 1)
const GUARDS = join(ROOT, 'scripts', 'guards')

/*
 * The drill list references module constants other than GUARDS (a deployment
 * AIM, for one), and this lens has no business reproducing them. A `with` over
 * a Proxy that claims to hold every name resolves any identifier the list
 * mentions to a harmless stub, so the literals parse and the fields this tool
 * actually reads (file, find, replace, expect, guard) come through untouched.
 */
const anything = new Proxy(
  {},
  {
    has: () => true,
    get: (_t, key) => (key === 'GUARDS' ? GUARDS : key === Symbol.unscopables ? undefined : {}),
  },
)
const DRILLS = new Function('scope', `with (scope) { return [${body}] }`)(anything)

const selected = DRILLS.filter(d => String(d.guard).includes(needle))
if (selected.length === 0) {
  console.error(`no drills match ${needle}`)
  process.exit(2)
}

/**
 * The harness's own anchor rule, copied because it is the thing that makes a
 * drill portable.
 *
 * A plain `includes` was used first and reported BAD FIND STRING on a drill the
 * real harness runs perfectly: the target file has CRLF line endings and the
 * drill's `find` is written with LF. The harness escapes the anchor and matches
 * `\r?\n` for every newline. A lens that judges differently from the thing it is
 * a lens on is worse than no lens.
 */
function anchorRegex(anchor) {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped.replace(/\r?\n/g, '\\r?\\n'))
}

let failed = 0
for (const drill of selected) {
  const path = join(ROOT, drill.file)
  const original = readFileSync(path, 'utf8')
  const anchor = anchorRegex(drill.find)
  if (!anchor.test(original)) {
    console.log(`  BAD FIND STRING  ${drill.name}\n      not present in ${drill.file}`)
    failed += 1
    continue
  }
  try {
    writeFileSync(path, original.replace(anchor, drill.replace))
    let code = 0
    let out = ''
    try {
      out = execFileSync(process.execPath, [drill.guard], { encoding: 'utf8', stdio: 'pipe' })
    } catch (error) {
      code = error.status ?? 1
      out = `${error.stdout ?? ''}${error.stderr ?? ''}`
    }
    if (code === 0) {
      console.log(`  DID NOT FAIL  ${drill.name}`)
      failed += 1
    } else if (!out.includes(drill.expect)) {
      console.log(`  WRONG REASON  ${drill.name}\n      expected: ${drill.expect}`)
      failed += 1
    } else {
      console.log(`  FAILS AS EXPECTED  ${drill.name}`)
    }
  } finally {
    writeFileSync(path, original)
  }
}

// The tree must be clean and the guard green again, or this lens left damage.
try {
  execFileSync(process.execPath, [selected[0].guard], { stdio: 'pipe' })
  console.log('\n  the guard passes again on the restored tree')
} catch {
  console.log('\n  THE GUARD DOES NOT PASS ON THE RESTORED TREE')
  failed += 1
}

process.exit(failed === 0 ? 0 : 1)
