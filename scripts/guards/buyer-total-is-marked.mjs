/**
 * THE DRIVEN PROOF MUST BE ABLE TO FIND ITS SUBJECT (close-out UX6, requirement 3).
 *
 * ------------------------------------------------------------------------
 * WHAT IT DEFENDS. UX6.1 is the owner unable to see the total they were about to
 * pay, at 390, because the figure sat past the right edge of the screen. The
 * assertion that stops that returning is driven, in a browser, by
 * scripts/verify/ux6-checkout-viewport-proof.mjs, and it finds the figure by one
 * attribute:
 *
 *     data-order-total
 *
 * A driven check that cannot find its subject does not fail. It passes, in
 * silence, for ever. This repository has been caught by that exact shape before
 * (close-out C19.4: 488 pages emitting an ItemList with an empty
 * itemListElement, under a check that read the @type and stopped). So the
 * attribute is not a convenience for the test, it is part of the surface, and
 * this guard is what makes removing it impossible.
 *
 * THE RULE, stated so it cannot drift. On the BUYER's own surfaces, every
 * element that labels a payable total must be answered by an element carrying
 * `data-order-total` in the same file. The labels are matched literally, and the
 * count must match: three "Total" labels and two attributes is a total nobody is
 * measuring.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER. Organiser and admin surfaces show totals
 * too, and they are not what UX6 is about: an organiser reading a payout report
 * is not a buyer three seconds from abandoning a checkout on a phone. The scope
 * is the buyer path and it is listed below rather than inferred, because a
 * silently widening scope is how a guard becomes something people switch off.
 *
 * WHAT THIS HALF CANNOT SEE, said rather than implied. Deleting the label AND
 * the mark together leaves nothing for a counter to compare. That case is held
 * by the OTHER half: scripts/verify/ux6-checkout-viewport-proof.mjs requires a
 * marked total on ticket selection (paid), on both checkout steps and on the
 * confirmation, and goes red when a surface that must show a total shows none.
 * Static and driven together, neither alone.
 *
 * Registered in scripts/guards/run-guards.mjs, so it blocks on prebuild.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const TAG = '[buyer-total-is-marked]'
const ROOT = process.cwd()

/** The buyer's own surfaces. Nothing else is in scope, on purpose. */
const BUYER_PATHS = [
  join('src', 'components', 'checkout'),
  join('src', 'app', 'checkout'),
  join('src', 'app', 'orders'),
  join('src', 'app', 't'),
  join('src', 'app', 'tickets'),
]

/**
 * A label that promises a payable total. `Total price includes GST` is a
 * SENTENCE about the total rather than a label beside a figure, so the match is
 * anchored to the whole text of the element.
 */
const TOTAL_LABEL = /<(span|dt|th|p)\b[^>]*>\s*(Total|Total paid|Total due|Amount due|Total charged)\s*<\/\1>/g
/*
 * THE MARK MUST BE AN ATTRIBUTE, NOT A MENTION. The first draft matched the bare
 * name, and its own drill caught it: this guard's explanatory comment inside
 * checkout-summary.tsx NAMES data-order-total, so the file counted two marks for
 * one attribute, and stripping the real attribute still left the count level.
 * The guard went green on the exact edit it exists to refuse. Comments are
 * removed before counting, and the attribute is matched only inside an opening
 * tag, so prose about the mark can never stand in for the mark.
 */
const MARK = /<[a-zA-Z][^<>]*\sdata-order-total(?:[\s=>])/g

/** JSX block comments and line comments, gone before anything is counted. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/*
 * A MISSING BUYER PATH IS A FINDING, NOT A SHRUG. The first draft swallowed the
 * readdir error and returned an empty list, which is how a guard reports PASS on
 * a directory that has been renamed out from under it. The build's own
 * no-silent-catch guard refused it, correctly. The error is recorded and the
 * caller turns it into a fault.
 */
const unreadable = []

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (error) {
    unreadable.push(`${relative(ROOT, dir).split(sep).join('/')}: ${error.code ?? error.message}`)
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const files = BUYER_PATHS.flatMap((p) => walk(join(ROOT, p)))
const faults = []
let labelled = 0
let marked = 0
let filesWithTotals = 0

for (const file of files) {
  const source = withoutComments(readFileSync(file, 'utf8'))
  const labels = source.match(TOTAL_LABEL) ?? []
  const marks = source.match(MARK) ?? []
  labelled += labels.length
  marked += marks.length
  if (labels.length === 0 && marks.length === 0) continue
  filesWithTotals += 1
  const rel = relative(ROOT, file).split(sep).join('/')
  if (labels.length > marks.length) {
    faults.push(
      `${rel}: ${labels.length} buyer total label(s) but only ${marks.length} data-order-total mark(s). ` +
        `The driven proof at scripts/verify/ux6-checkout-viewport-proof.mjs would not measure ${labels.length - marks.length} of them.`,
    )
  }
}

for (const missing of unreadable) {
  faults.push(
    `a buyer path this guard is pointed at could not be read (${missing}). Either the surface moved ` +
      `and BUYER_PATHS is stale, or it is gone. Both leave a buyer total nobody is measuring.`,
  )
}

if (filesWithTotals === 0) {
  faults.push(
    'no buyer total label was found anywhere on the buyer path. Either the surfaces moved out of ' +
      BUYER_PATHS.join(', ') +
      ' and this guard is now looking at nothing, or the total stopped being shown. Both are faults.',
  )
}

console.log(`${TAG} did ${files.length} buyer-path file(s) read, ${filesWithTotals} carrying a total`)
console.log(`${TAG} found ${labelled} total label(s), ${marked} data-order-total mark(s), ${faults.length} fault(s)`)
for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
if (faults.length > 0) {
  console.error(
    `${TAG} FAIL - a buyer total the driven viewport proof cannot see. Mark it with data-order-total on the element that carries the figure.`,
  )
  process.exit(1)
}
console.log(`${TAG} PASS - every buyer-facing total is marked, so the driven proof can measure all of them.`)
