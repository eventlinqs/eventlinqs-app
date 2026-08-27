/**
 * GUARD: every script a CI step runs must say how much work it did.
 *
 * FOUNDER RULING, 25 August 2026:
 *
 *   "The warm step was named 'Warm ISR + the next/image optimiser' and warmed no
 *   images at all, for weeks. Your own replacement then reported 40 variants on
 *   four pages, which was a silent cap. Every CI step and every script that
 *   CLAIMS to do work must PRINT HOW MUCH IT DID, and a zero must read as a
 *   failure rather than a pass. Sweep them, fix them, guard it."
 *
 * THE TWO INCIDENTS ARE DIFFERENT AND BOTH ARE COVERED. One step did nothing and
 * said nothing, printing a tidy list of 200s for weeks. Its replacement did some
 * of the work and reported it as all of it: four pages sitting on exactly 40
 * variants was the CAP printed as though it were the finding.
 *
 * WHAT THIS READS. It parses `.github/workflows/*.yml`, harvests every script
 * named in a `run:` block, and requires each one to call `declareWork` from
 * scripts/lib/work-report.mjs. That list is DERIVED from the workflows on every
 * run rather than written down here, so adding a step to CI puts its script
 * under this contract automatically. A hand-maintained list would have to be
 * remembered, and the thing being guarded against is exactly what happens when
 * something has to be remembered.
 *
 * WHAT IT DELIBERATELY DOES NOT READ, with the reason beside each, printed on
 * every run:
 *
 *  - Vendor commands (npm ci, npm run build, npm test, npx lhci). They already
 *    print their own counts and this repository does not own their output.
 *  - Shell blocks written inline in a workflow. A `run: |` block of curl and
 *    grep cannot import a module. Those are covered by the shape of what they
 *    do rather than by this guard, and the ones that matter here already print
 *    an HTTP status per request.
 *  - `scripts/guards/run-guards.mjs`, which is not invoked by a workflow `run:`
 *    but by `prebuild`, and which already prints "all N guards PASS".
 *
 * WHAT IT CANNOT SEE. That a declared count is TRUE. `declareWork` prints
 * whatever it is handed, and a script that hands it a constant would pass this
 * guard while lying. What stops that is the same thing that caught the 40: a
 * number that never moves is visible in a log, and a number that is absent is
 * not.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { stripComments } from '../lib/js-source.mjs'
import { join } from 'node:path'

const SEP = String.fromCharCode(92)
const WORKFLOWS = '.github/workflows'
const CONTRACT = 'work-report.mjs'

/**
 * REVIEWED EXEMPTIONS, printed with their reason on every run.
 */
const EXEMPT = [
  {
    script: 'scripts/check-types-drift.sh',
    why: 'a bash script; it cannot import an ES module. It prints the generated diff or nothing, and an empty diff IS its pass',
  },
  {
    script: 'scripts/seed-purchase-fixture.mjs',
    why: 'writes its fixture ids to stdout for the next step to consume; an empty stdout fails that step immediately',
  },
]

function workflowFiles() {
  if (!existsSync(WORKFLOWS)) return []
  return readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => join(WORKFLOWS, f))
}

/** Every `scripts/...` path named after node/bash/tsx in any run: block. */
function scriptsInvokedByCi() {
  const found = new Map()
  for (const file of workflowFiles()) {
    const yaml = readFileSync(file, 'utf8')
    const re = /(?:^|[\s|&;(])(?:node|bash|sh|npx\s+tsx|tsx)\s+(scripts\/[A-Za-z0-9/._-]+)/g
    let m
    while ((m = re.exec(yaml)) !== null) {
      const path = m[1]
      if (!found.has(path)) found.set(path, new Set())
      found.get(path).add(file.replaceAll(SEP, '/'))
    }
  }
  return found
}

const invoked = scriptsInvokedByCi()
const missing = []
const honouring = []
const absent = []

for (const [script, whichWorkflows] of [...invoked.entries()].sort()) {
  if (EXEMPT.some((e) => e.script === script)) continue
  if (!existsSync(script)) {
    absent.push({ script, whichWorkflows: [...whichWorkflows] })
    continue
  }
  /*
   * COMMENTS STRIPPED BEFORE THE CHECK, and this is not tidiness.
   *
   * On 27 August 2026 scripts/check-env-stores.mjs carried a declareWork call
   * that had been inserted INSIDE a block comment. It never ran. This guard read
   * the raw source, found the text, and reported the script as declaring its
   * work, so the claim contract passed on a script that claimed nothing.
   *
   * That is the same family as the detector that matched an image path instead
   * of a link and the warmer that counted its own cap: a reader that cannot tell
   * code from prose. eslint caught it, as an unused import, which is the only
   * reason anybody found out.
   */
  const src = stripComments(readFileSync(script, 'utf8'))
  if (src.includes('work-report.mjs') && /declareWork\s*\(/.test(src)) honouring.push(script)
  else missing.push({ script, whichWorkflows: [...whichWorkflows] })
}

console.log(
  `steps-declare-work: ${workflowFiles().length} workflow file(s) read, ${invoked.size} script(s) invoked by a run: step`,
)
console.log(`  ${honouring.length} declare what they did through ${CONTRACT}`)
for (const s of honouring) console.log(`    ok  ${s}`)
console.log(`  reviewed exemptions (${EXEMPT.length}):`)
for (const e of EXEMPT) {
  console.log(`    ${e.script}`)
  console.log(`      ${e.why}`)
}

// A reviewed exemption for a script CI no longer runs is rot, and rot in an
// allowlist is how an allowlist stops being reviewed.
const staleExemptions = EXEMPT.filter((e) => !invoked.has(e.script))
if (staleExemptions.length > 0) {
  console.error('')
  console.error('FAIL: exemption(s) for scripts no CI step invokes any more:')
  for (const e of staleExemptions) console.error(`  ${e.script}`)
  console.error('Delete the entry. An allowlist nobody prunes is an allowlist nobody reads.')
  process.exit(1)
}

if (absent.length > 0) {
  console.error('')
  console.error(`FAIL: ${absent.length} CI step(s) invoke a script that does not exist:`)
  for (const a of absent) console.error(`  ${a.script}   (${a.whichWorkflows.join(', ')})`)
  process.exit(1)
}

if (missing.length > 0) {
  console.error('')
  console.error(`FAIL: ${missing.length} CI step(s) claim work without declaring how much:`)
  for (const m of missing) console.error(`  ${m.script}   (${m.whichWorkflows.join(', ')})`)
  console.error('')
  console.error("Import declareWork from scripts/lib/work-report.mjs and call it before the pass line:")
  console.error("  declareWork('label', { did: { 'page warmed': pages }, found: { failure: n } })")
  console.error('A `did` count of zero exits 1, which is the whole point.')
  process.exit(1)
}

/* ------------------------------------------------------------------------ */
/* CHECK 2: every guard the runner runs must print a number that moves.      */
/*                                                                          */
/* A guard is the same shape of claim as a CI step, and it fails the same    */
/* way. `[x] PASS` on a run that scanned nothing is indistinguishable from   */
/* `[x] PASS` on a run that scanned everything, and the first one is how a   */
/* guard keeps passing after its walk stops finding files.                   */
/*                                                                          */
/* This check is looser than check 1 ON PURPOSE. It accepts declareWork OR   */
/* any printed interpolation that moves with the work, because 38 of the 49  */
/* guards already print their own tally in their own voice and rewriting all */
/* of them to one helper would be churn against working code. What it        */
/* refuses is a guard that prints no number at all.                          */

const RUNNER = 'scripts/guards/run-guards.mjs'
const runnerSrc = stripComments(readFileSync(RUNNER, 'utf8'))
const registryBlock = new RegExp('const GUARDS = \\[([\\s\\S]*?)\\n\\]').exec(runnerSrc)
if (!registryBlock) {
  console.error(`FAIL: could not read the GUARDS array out of ${RUNNER}.`)
  process.exit(1)
}
const registered = [...registryBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])

// A number that moves with the work: a length, a size, a counter, a tally.
/*
 * The interpolation may sit SEVERAL LINES below the `console.log(` that carries
 * it, because a long message is wrapped by the formatter. The first version of
 * this pattern required them on one line and reported 22 mute guards, five of
 * which were printing a perfectly good tally two lines down. A detector with a
 * false-negative rate like that would have sent this pass rewriting working
 * output.
 */
const MOVING_NUMBER = new RegExp(
  'console\\.(log|error)\\([\\s\\S]{0,300}?\\$\\{[^}]*' +
    '(\\.length|\\.size|[Cc]ount|[Tt]otal|rows|files|pages|scanned|checked|matched)',
)

const mute = []
const counting = []
for (const guard of registered) {
  if (!existsSync(guard)) continue
  const src = stripComments(readFileSync(guard, 'utf8'))
  if (/declareWork\s*\(/.test(src) || MOVING_NUMBER.test(src)) counting.push(guard)
  else mute.push(guard)
}

console.log('')
console.log(`  ${registered.length} guard(s) registered in ${RUNNER}`)
console.log(`  ${counting.length} print a number that moves with what they scanned`)

if (mute.length > 0) {
  console.error('')
  console.error(`FAIL: ${mute.length} registered guard(s) announce a pass without printing how much they scanned:`)
  for (const g of mute) console.error(`  ${g}`)
  console.error('')
  console.error('A guard that scanned nothing prints the same PASS as a guard that scanned everything.')
  console.error("Add declareWork from scripts/lib/work-report.mjs, or print a tally of your own.")
  process.exit(1)
}

console.log('')
console.log('PASS: every script a CI step runs, and every registered guard, prints how much work it did.')
