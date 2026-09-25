/**
 * A SCREEN-READER LABEL MAY NOT ESCAPE THE BOX THAT SCROLLS IT. A build-failing
 * guard.
 *
 * ===========================================================================
 * THE DEFECT, MEASURED, 19 September 2026
 * ===========================================================================
 *
 * `sr-only` is `position: absolute`. An absolutely positioned element is clipped
 * by an ancestor's `overflow` ONLY when that ancestor is its CONTAINING BLOCK,
 * and `overflow` alone does not create one: the container needs `position:
 * relative` (or a transform, a filter, or `contain`).
 *
 * So a label inside a horizontally scrolling table is laid out at its position
 * in the FULL table width, outside the scroller, against the initial containing
 * block. On /admin/users at 390:
 *
 *     the scroller               clientWidth 340, scrollWidth 720, overflow-x auto
 *     the sr-only label          left 568, right 569, position absolute
 *     documentElement.scrollWidth 569 against an innerWidth of 390
 *     the same page with `relative` on the scroller -> 390
 *
 * /admin/events, whose rows carry a "Reason for ..." label per action, had 65 of
 * them and measured 594; /admin/organisers 605. Under mobile emulation the
 * layout viewport grows to fit the document, so the whole screen renders at
 * about 69 per cent and every label, row and control shrinks with it.
 * /admin/orders, with byte-identical table markup and no sr-only inside it,
 * measured 390 and is the control that turned a suspicion into a cause.
 *
 * The accessibility affordance broke the layout, which is why nobody looks for
 * it there, and why a guard is worth more than the nine edits.
 *
 * ===========================================================================
 * THE RULE, AND WHY ITS TRIGGER IS THE FILE RATHER THAN THE SUBTREE
 * ===========================================================================
 *
 * In any .tsx file that renders an `sr-only` anywhere, every element whose
 * className carries a horizontal containment token (`overflow-x-auto`,
 * `overflow-auto`, `overflow-x-scroll`, `overflow-x-hidden`, `overflow-x-clip`,
 * `overflow-hidden`, `overflow-clip`) must ALSO carry a containing-block token
 * (`relative`, `absolute`, `fixed`, `sticky`, `transform`, `contain-*`).
 *
 * THE FIRST VERSION BOUNDED THE CONTAINER'S JSX SUBTREE AND WAS BLIND TO BOTH
 * PAGES THE DEFECT WAS FOUND ON. It is recorded here because the failure is the
 * interesting part: on /admin/users the label is on line 165, inside a `UserRow`
 * function further down the same file, rendered into the table by
 * `{rows.map(...)}`. It is not lexically inside the container at all. The guard
 * reported OK, and only the RED half of its own drill found it: "guard PASSED on
 * a violating tree. It is not actually guarding."
 *
 * So the trigger is the FILE, and the guard says plainly what that costs: it
 * asks for `relative` on some containers that hold no label. That is accepted
 * rather than argued away, because the remedy cannot change a painted pixel. A
 * container that clips its overflow and is not a containing block is letting
 * absolutely positioned descendants escape the clip, which is essentially never
 * what anybody wanted. Seven containers were in that position when this shipped
 * and all seven were read before being changed: six wrap a table, and the
 * seventh is a figure whose only absolute child already sits in its own
 * `relative` wrapper.
 *
 * WHY `sr-only` RATHER THAN "any absolute". Tailwind's `absolute` places a
 * badge, a scrim or a caret DELIBERATELY all over this tree, and a guard that
 * fired on every one would be a guard somebody switches off.
 *
 * ===========================================================================
 * THE PREMISE IS CHECKED, NOT ASSUMED
 * ===========================================================================
 *
 * The whole rule rests on `sr-only` being absolutely positioned. If a future
 * stylesheet redefines it as `clip-path` on a static element the rule stops
 * being true and this guard would keep failing builds for no reason. So it reads
 * src/app/globals.css and fails LOUDLY if `sr-only` is redefined there, rather
 * than carrying on with a premise that has quietly moved.
 *
 * WHAT IT CANNOT SEE, said plainly: a container in one file and the sr-only in
 * another. The runtime instrument for that is
 * scripts/verify/mobile-viewport-width-drive.mjs, which measures
 * documentElement.scrollWidth against the viewport on every route and names the
 * escapees. This guard is the half that can run without a server.
 *
 * NO SHEBANG (a leading #! breaks Vite when a test imports this module) and no
 * git call (the build host has no git).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[sr-only-scroller]'
const ROOT = process.cwd()

/** Regex LITERALS. A pattern built in a template literal is how a guard here shipped blind. */
const CONTAINS_HORIZONTALLY =
  /\b(overflow-x-auto|overflow-auto|overflow-x-scroll|overflow-x-hidden|overflow-x-clip|overflow-hidden|overflow-clip)\b/
const IS_A_CONTAINING_BLOCK = /\b(relative|absolute|fixed|sticky|transform|contain-(layout|paint|strict|content))\b/
const SR_ONLY = /\bsr-only\b/
const CLASSNAME = /className=/

const failures = []
const notes = []
let filesSwept = 0
let filesWithSrOnly = 0
let containersJudged = 0
let containersAlreadyPositioned = 0

function walk(dir, out) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/* --------------------------------------------------------------------------
 * Clause 1: the premise. sr-only is absolutely positioned.
 * ------------------------------------------------------------------------ */
const GLOBALS = 'src/app/globals.css'
const globalsPath = join(ROOT, GLOBALS)
if (!existsSync(globalsPath)) {
  failures.push(`${GLOBALS} is missing, so the premise behind this rule cannot be checked.`)
} else {
  const css = readFileSync(globalsPath, 'utf8')
  if (/\.sr-only\s*\{/.test(css)) {
    failures.push(
      `${GLOBALS} redefines .sr-only. This guard's whole rule rests on sr-only being ` +
        `position:absolute (Tailwind's own definition). Read the new rule and either ` +
        `update this guard or delete it, but do not leave it judging a premise that moved.`,
    )
  } else {
    notes.push("sr-only is Tailwind's own utility (position:absolute); globals.css does not redefine it")
  }
}

/* --------------------------------------------------------------------------
 * Clause 2: in a file that paints an sr-only, a horizontal container is a
 * containing block.
 * ------------------------------------------------------------------------ */
/*
 * THE SCAN ROOT IS OVERRIDABLE so the test beside this guard can point it at a
 * synthetic tree and watch it go red and green on markup nobody has to ship.
 * It defaults to src/ and takes an absolute path, because the test writes its
 * fixture OUTSIDE the repository: a fixture written inside would be visible to
 * every other guard and to the copy gate for as long as it existed, which is the
 * trap tests/helpers/safe-walk.ts was written for.
 */
const SCAN_ROOT = process.env.SR_ONLY_SCAN_ROOT ?? join(ROOT, 'src')

for (const abs of walk(isAbsolute(SCAN_ROOT) ? SCAN_ROOT : join(ROOT, SCAN_ROOT), [])) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  filesSwept += 1
  const text = readFileSync(abs, 'utf8')
  if (!SR_ONLY.test(text)) continue
  filesWithSrOnly += 1

  const lines = text.split(String.fromCharCode(10))
  for (let i = 0; i < lines.length; i += 1) {
    if (!CLASSNAME.test(lines[i]) || !CONTAINS_HORIZONTALLY.test(lines[i])) continue
    containersJudged += 1

    /*
     * THE OPENING TAG IS NOT ALWAYS THE LINE THE CLASS IS ON: Prettier breaks a
     * long element so the className sits a level deeper than its `<div`. The
     * class itself can also be split across those lines, so all of them are
     * judged together.
     */
    let open = i
    while (open >= 0 && !lines[open].trimStart().startsWith('<')) open -= 1
    const openingTag = lines.slice(open < 0 ? i : open, i + 1).join(' ')
    if (IS_A_CONTAINING_BLOCK.test(openingTag)) {
      containersAlreadyPositioned += 1
      continue
    }

    failures.push(
      `${rel}:${i + 1} clips or scrolls horizontally in a file that paints an sr-only, but is ` +
        `not a containing block, so an absolutely positioned descendant escapes the clip and is ` +
        `laid out at its position in the FULL scroll width. /admin/users measured a 569px ` +
        `document against a 390px viewport that way. Add \`relative\` to this className.`,
    )
  }
}

if (filesSwept === 0) {
  failures.push('the sweep matched no files at all, which is a broken sweep rather than a clean tree.')
}

/*
 * THE MATCHERS PROVE THEMSELVES, on every run, for the reason recorded in
 * scripts/guards/consent-dates-are-zoned.mjs: a guard in this tree shipped with
 * a pattern that compiled to nonsense and reported PASS over the thing it
 * banned, and only the red half of a drill found it.
 */
const PROBES = [
  { pattern: CONTAINS_HORIZONTALLY, sample: 'className="overflow-x-auto rounded-xl"', shouldMatch: true },
  { pattern: CONTAINS_HORIZONTALLY, sample: 'className="overflow-y-auto rounded-xl"', shouldMatch: false },
  { pattern: IS_A_CONTAINING_BLOCK, sample: 'className="relative overflow-x-auto"', shouldMatch: true },
  { pattern: IS_A_CONTAINING_BLOCK, sample: 'className="overflow-x-auto rounded-xl"', shouldMatch: false },
  { pattern: SR_ONLY, sample: '<span className="sr-only">Save</span>', shouldMatch: true },
  { pattern: SR_ONLY, sample: '<span className="notsr-onlyish">Save</span>', shouldMatch: false },
]
for (const probe of PROBES) {
  if (probe.pattern.test(probe.sample) !== probe.shouldMatch) {
    failures.push(
      `REFUSING: the matcher ${probe.pattern} no longer ${probe.shouldMatch ? 'matches' : 'refuses'} ` +
        `${JSON.stringify(probe.sample)}. This guard cannot be trusted until that is true again.`,
    )
  }
}

for (const n of notes) console.log(`${TAG} ${n}`)
console.log(
  `${TAG} ${filesSwept} file(s) swept, ${filesWithSrOnly} painting an sr-only, ` +
    `${containersJudged} horizontal container(s) in them judged, ` +
    `${containersAlreadyPositioned} already a containing block`,
)

declareWork('sr-only-cannot-escape-a-scroller', {
  did: {
    'source file swept': filesSwept,
    'file painting an sr-only': filesWithSrOnly,
    'horizontal container judged': containersJudged,
    'container that is already a containing block': containersAlreadyPositioned,
    'matcher self-probe run': PROBES.length,
  },
  found: { 'horizontal container that is not a containing block': failures.filter(f => f.includes('containing block, so')).length },
  zeroIsFine: {
    'horizontal container that is not a containing block':
      'nine were fixed on 19 September 2026 and the goal state is none; the runtime instrument is scripts/verify/mobile-viewport-width-drive.mjs',
  },
  exitOnZero: false,
})

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${failures.length} problem(s).`)
  process.exit(1)
}

console.log(`${TAG} OK`)
