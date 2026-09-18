/**
 * GUARD: the initial JavaScript bundle, per route, against Scope v5 10.3 and
 * against its own recorded high-water mark.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHY A LIGHTHOUSE FLOOR WAS NOT ENOUGH
 * ============================================================================
 *
 * This repository already ratchets the Lighthouse SCORE
 * (scripts/guards/lighthouse-floor-ratchet.mjs, close-out P0.7). A score is a
 * lagging, noisy, environment-sensitive reading: the founder's own ruling of
 * 25 August 2026 made the Lighthouse gate ADVISORY precisely because the same
 * bytes measured 0.76 on the CI runner and 0.88 from a warmed real client.
 *
 * Bytes are none of those things. `next build` writes exactly one answer for
 * exactly one tree, on any machine, in any mood. So the thing the close-out
 * actually asks for, "an initial JavaScript bundle under 200KB", can be a hard
 * gate in a way the score cannot, and C8B.4's "every change reports BOTH total
 * script bytes and the critical path timing" finally has the half nothing was
 * enforcing.
 *
 * Before this guard, the 144.2 KB that H3 cut out of the event route on
 * 8 September could have been spent again by any feature commit, and the first
 * anybody would have known was a Lighthouse median drifting down weeks later on
 * an advisory gate nobody is obliged to obey.
 *
 * ============================================================================
 * TWO MODES, BECAUSE THE THING THAT MATTERS ONLY EXISTS AFTER A BUILD
 * ============================================================================
 *
 *   node scripts/guards/initial-bundle-budget.mjs           prebuild, registered
 *       in run-guards.mjs. Judges the CONTRACT: perf-budget.json exists, is
 *       well formed, carries the Scope number, and the postbuild half is still
 *       wired up. It cannot weigh anything, and it says so rather than passing
 *       quietly.
 *
 *   node scripts/guards/initial-bundle-budget.mjs --built   postbuild, from
 *       package.json. Weighs every route in the build that just finished and
 *       judges it. This is the proof; the prebuild half is a promise.
 *
 * The same shape as scripts/guards/card-raster-traced.mjs, for the same reason:
 * a pin is a promise and the build output is the proof.
 *
 * ============================================================================
 * THE FIVE CLAUSES
 * ============================================================================
 *
 * 1. NO PUBLIC ROUTE MAY EXCEED THE SCOPE BUDGET. 200 KB gzip of first-load
 *    JavaScript. PUBLIC is everything outside /dashboard and /admin, which
 *    deliberately includes checkout, the order confirmation, the queue, the
 *    short link and the door scanner: see scripts/perf/lib/route-audience.mjs
 *    for why the indexing policy's own `never` set was the wrong reading and
 *    would have exempted exactly the pages this budget exists for.
 *
 * 2. NO ROUTE MAY EXCEED ITS RECORDED MARK, ON A BUILD THE MARK CAN JUDGE.
 *    Every route, public and internal. This is the ratchet: whatever the
 *    organiser console weighs today it may never weigh more, and every
 *    improvement locks itself in the moment the mark is rewritten. It is what
 *    holds the 29 internal routes that are over the Scope budget and cannot be
 *    brought under it in one item.
 *
 *    THE QUALIFIER IS NOT A LOOPHOLE AND IT WAS ADDED THE DAY THE RATCHET FIRST
 *    RAN. A mark is a gzip byte count of what one toolchain emitted, so the
 *    comparison is a fair one against a build from the same toolchain and a
 *    category error against a different one. `postbuild` runs this guard, npm
 *    runs `postbuild` after `build`, and `build` is what VERCEL runs, so a mark
 *    written on win32 would otherwise have judged a Linux production build and
 *    failed the deployment on a difference that says nothing about the code.
 *    perf-budget.json therefore records `_measuredOn`, the ratchet FAILS where
 *    that matches and REPORTS where it does not, and clauses 1, 1b, 3, 4 and 5
 *    block on every host regardless. The conditions are checked in the contract
 *    half too, so the field cannot be quietly dropped to disarm the ratchet.
 *
 * 3. THE MARKS MUST DESCRIBE THE PLATFORM. Every route the build emits has a
 *    mark and every mark names a route that exists. A budget file that has
 *    stopped describing the tree is the kind of gate that goes green because it
 *    is looking at nothing.
 *
 * 4. NO DEAD ATTRIBUTION MARKER. A marker declaring its feature ALWAYS present
 *    that matches no chunk in the build has gone blind, and the table that
 *    "decides the work order" then ranks a chunk nobody can name. Three of them
 *    had already gone dead before this guard existed; the 30.5 KB App Router
 *    runtime sat at rank 4 of the event page reading `unattributed`.
 *
 * 5. THE TWO READINGS OF "INTERNAL" MUST AGREE. Every route this calls internal
 *    must be classified `never` by src/lib/seo/indexing-policy.ts. A prefix rule
 *    that nothing checks is a second list waiting to disagree with the first.
 *
 * ============================================================================
 * WHAT IS NOT CLAIMED, SAID HERE RATHER THAN LEFT TO BE DISCOVERED
 * ============================================================================
 *
 * Clause 1 is the Scope target and it is MET FOR PUBLIC ROUTES ONLY. Twenty
 * nine routes under /dashboard are over it, the heaviest at 276.4 KB, and this
 * guard does not pretend otherwise: it PRINTS them on every run with their
 * weights, under the words "over the Scope budget", and clause 2 stops them
 * growing. Making them blocking today would fail the build on work no single
 * item can finish, and a gate that cannot go green is a gate somebody switches
 * off. That is the same reasoning, and the same honesty, as the bounded
 * effective date in scripts/guards/no-ai-authorship.mjs.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { SCOPE_10_3_BUDGET_BYTES, kb, identityMismatch } from '../perf/lib/first-load.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[initial-bundle-budget]'
const BASELINE_FILE = 'perf-budget.json'
const BUILT_FLAG = '--built'

function readBaseline() {
  const p = join(ROOT, BASELINE_FILE)
  if (!existsSync(p)) return { error: `${BASELINE_FILE} is missing. Create it with: node scripts/perf/first-load-budget.mjs --write-baseline` }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(p, 'utf8'))
  } catch (cause) {
    return { error: `${BASELINE_FILE} does not parse: ${cause instanceof Error ? cause.message : String(cause)}` }
  }
  if (!parsed || typeof parsed.marks !== 'object' || parsed.marks === null) {
    return { error: `${BASELINE_FILE} carries no \`marks\` object.` }
  }
  return { baseline: parsed }
}

/** Whether the build emitted a route at all, kept separate so clause 1b reads plainly. */
function built_hasRoute(result, route) {
  return result.routes.some((r) => r.route === route)
}

/**
 * The contract half. Runs on every commit, weighs nothing, and refuses to be
 * mistaken for the proof.
 */
function judgeContract() {
  const failures = []
  // Counted BEFORE the read, because looking for the file IS a check. Reporting
  // zero here made scripts/lib/work-report.mjs exit on "DID NOTHING" before this
  // guard could say what it had found, and a guard whose own message never
  // reaches the reader has failed for an unexplained reason.
  let judged = 1

  const { baseline, error } = readBaseline()
  if (error) return { judged, failures: [error] }

  judged += 1
  if (baseline._budgetBytes !== SCOPE_10_3_BUDGET_BYTES) {
    failures.push(
      `${BASELINE_FILE} declares a budget of ${baseline._budgetBytes} bytes; Scope v5 section 10.3 is ` +
        `${SCOPE_10_3_BUDGET_BYTES} (200 KB). The number in the file is not the authority and may not disagree ` +
        `with SCOPE_10_3_BUDGET_BYTES in scripts/perf/lib/first-load.mjs.`,
    )
  }

  /*
   * THE MARKS MUST SAY WHAT THEY WERE MEASURED ON.
   *
   * Without this field `identityMismatch` reads the baseline as un-comparable
   * and the ratchet reports everywhere, which is a ratchet that has silently
   * stopped ratcheting. It is checked in the CONTRACT half, which runs on every
   * commit and weighs nothing, so dropping the field fails on the next push
   * rather than on the next build that happens to grow.
   */
  judged += 1
  const identity = baseline._measuredOn
  if (!identity || typeof identity !== 'object') {
    failures.push(
      `${BASELINE_FILE} carries no \`_measuredOn\`. A mark is a gzip byte count of what one toolchain emitted, ` +
        `and without the conditions it was taken under the ratchet cannot tell a fair comparison from a ` +
        `cross-toolchain one, so it reports everywhere and holds nothing. Rewrite with ` +
        `\`node scripts/perf/first-load-budget.mjs --write-baseline\`.`,
    )
  } else {
    for (const field of ['platform', 'arch', 'node', 'next']) {
      judged += 1
      if (typeof identity[field] !== 'string' || identity[field].length === 0) {
        failures.push(
          `${BASELINE_FILE}: \`_measuredOn.${field}\` is ${JSON.stringify(identity[field] ?? null)} rather than a ` +
            `non-empty string. Every field is compared exactly, so a missing one would match nothing for ever.`,
        )
      }
    }
  }

  const marks = Object.entries(baseline.marks)
  judged += 1
  if (marks.length === 0) failures.push(`${BASELINE_FILE} records no route marks at all.`)
  for (const [route, mark] of marks) {
    judged += 1
    if (!Number.isInteger(mark) || mark <= 0) {
      failures.push(`${BASELINE_FILE}: ${route} has a mark of ${JSON.stringify(mark)}, which is not a byte count.`)
    }
  }

  // The wiring clause. The prebuild half cannot weigh anything, so if the
  // postbuild half is ever unhooked this guard would go on passing for ever
  // while nothing was measured. Same shape as workflows-skip-drafts and
  // pre-push-gate-wired (close-out C2.3).
  judged += 1
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const postbuild = pkg.scripts?.postbuild ?? ''
  if (!postbuild.includes('initial-bundle-budget.mjs') || !postbuild.includes(BUILT_FLAG)) {
    failures.push(
      `package.json postbuild does not run this guard with ${BUILT_FLAG}. Without it nothing ever weighs the ` +
        `build and this half passes on a promise nobody keeps. postbuild is currently: ${postbuild || '(absent)'}`,
    )
  }

  return { judged, failures }
}

/** The proof half. Needs a build. */
async function judgeBuilt() {
  const failures = []
  const notes = []
  let judged = 1

  const { baseline, error } = readBaseline()
  if (error) return { judged, failures: [error], notes, weighed: 0 }

  // Imported here rather than at the top: the prebuild half must not pay for a
  // module that reads .next, and must not fail to load when .next is absent.
  const { collect } = await import('../perf/first-load-budget.mjs')
  let result
  try {
    result = collect(ROOT)
  } catch (cause) {
    return {
      judged,
      failures: [`could not measure the build: ${cause instanceof Error ? cause.message : String(cause)}`],
      notes,
      weighed: 0,
    }
  }

  const register = baseline.overBudget ?? {}
  const overScope = []
  const registered = []

  /*
   * CAN THIS HOST JUDGE THAT MARK? Asked once, before the loop, because the
   * answer is the same for all 133 routes and because a per-route message would
   * print the same sentence 133 times.
   *
   * The reasoning lives in scripts/perf/lib/first-load.mjs beside
   * `measurementIdentity`. In one line: a mark is a gzip byte count of what one
   * toolchain emitted, the ratchet is a fair comparison only against a build
   * from the same one, and `postbuild` runs this guard on the VERCEL BUILD HOST
   * as well as here. Nothing else is relaxed by a mismatch.
   */
  const notComparable = identityMismatch(baseline._measuredOn, ROOT)
  const grew = []

  for (const row of result.routes) {
    judged += 1
    const mark = baseline.marks[row.route]

    // Clause 3, first half: a route with no mark.
    if (mark === undefined) {
      failures.push(
        `${row.route} is in the build and has no mark in ${BASELINE_FILE} (${kb(row.gzip)} KB gzip). ` +
          `Add it with: node scripts/perf/first-load-budget.mjs --write-baseline`,
      )
    } else if (row.gzip > mark) {
      // Clause 2, the ratchet. Collected rather than reported here so the
      // comparability question is answered once, below, for all of them.
      grew.push({ route: row.route, gzip: row.gzip, mark })
    }

    // Clause 1, the Scope budget, blocking for a public route unless the breach
    // is registered with a date and a reason.
    if (row.gzip > SCOPE_10_3_BUDGET_BYTES) {
      overScope.push(row)
      if (row.audience === 'public') {
        const entry = register[row.route]
        if (!entry) {
          failures.push(
            `${row.route} is a PUBLIC route at ${kb(row.gzip)} KB gzip of first-load JavaScript, over the ` +
              `Scope v5 10.3 budget of ${kb(SCOPE_10_3_BUDGET_BYTES)} KB by ${kb(row.gzip - SCOPE_10_3_BUDGET_BYTES)} KB, ` +
              `and it is not in the overBudget register in ${BASELINE_FILE}. Find what it carries with: ` +
              `node scripts/perf/first-load-budget.mjs --route "${row.route}"`,
          )
        } else {
          for (const field of ['since', 'why', 'fix']) {
            if (!entry[field]) {
              failures.push(
                `${BASELINE_FILE}: the overBudget entry for ${row.route} has no \`${field}\`. An undated or ` +
                  `unexplained exception is an inventory line, not a decision.`,
              )
            }
          }
          registered.push(row)
        }
      }
    }
  }

  /*
   * CLAUSE 2's VERDICT, once, for every route that grew.
   *
   * IN BYTES AS WELL AS KB, and that is not a detail. The message this replaces
   * read "grew: 175.5 KB gzip against a recorded mark of 175.5 KB (+0.0 KB)" on
   * 132 routes: a growth report naming no growth, because every figure was
   * rounded to a tenth of a kilobyte and the real difference was 4 to 16 bytes.
   * A reader could not tell a rounding artefact from a regression, and the only
   * move the message offered was to rewrite the mark.
   */
  if (grew.length) {
    const worst = [...grew].sort((a, b) => b.gzip - b.mark - (a.gzip - a.mark))
    const lines = worst.map(
      (g) =>
        `${g.route}: ${g.gzip} bytes gzip (${kb(g.gzip)} KB) against a mark of ${g.mark} ` +
        `(${kb(g.mark)} KB), +${g.gzip - g.mark} bytes`,
    )
    if (notComparable) {
      notes.push(
        `${grew.length} route(s) measure more than their mark, and this host CANNOT JUDGE THAT. ${notComparable}.`,
      )
      notes.push(
        '    A mark is a gzip byte count of what one toolchain emitted. Comparing it to a build from a ' +
          'different one is not a stricter gate, it is a different measurement, and failing a deployment on ' +
          'it would teach everybody to reach for --write-baseline, which is how a ratchet becomes a rubber ' +
          'stamp. The absolute Scope budget, the unmarked-route clause and the stale-mark clause all still ' +
          'blocked this build.',
      )
      for (const l of worst.slice(0, 5).map((g) => `    ${g.route}: +${g.gzip - g.mark} bytes`)) notes.push(l)
      if (worst.length > 5) notes.push(`    ... and ${worst.length - 5} more.`)
    } else {
      for (const l of lines) {
        failures.push(
          `${l}. First-load JavaScript may only ever go down. If the growth is intended and justified, say so ` +
            `in the commit and rewrite the mark with \`node scripts/perf/first-load-budget.mjs --write-baseline\`.`,
        )
      }
    }
  } else if (notComparable) {
    notes.push(
      `the marks were taken elsewhere and no route exceeds them anyway (${notComparable}), so the ratchet had ` +
        'nothing to say on this host either way.',
    )
  }

  // Clause 1b: an entry whose route is no longer over budget. The register must
  // not outlive the defect it describes, which is the same discipline
  // scripts/guards/sourced-specifications.mjs applies to its reviewed baseline.
  const overNow = new Set(result.routes.filter((r) => r.gzip > SCOPE_10_3_BUDGET_BYTES).map((r) => r.route))
  for (const route of Object.keys(register)) {
    judged += 1
    if (!built_hasRoute(result, route)) {
      failures.push(`${BASELINE_FILE}: the overBudget register names ${route}, which this build does not emit.`)
    } else if (!overNow.has(route)) {
      const row = result.routes.find((r) => r.route === route)
      failures.push(
        `${BASELINE_FILE}: the overBudget register still names ${route}, but it now measures ${kb(row.gzip)} KB ` +
          `and is UNDER the ${kb(SCOPE_10_3_BUDGET_BYTES)} KB budget. The debt is paid; delete the entry so the ` +
          `register cannot outlive the defect.`,
      )
    }
  }

  // Clause 3, second half: a mark naming a route the build does not emit.
  const built = new Set(result.routes.map((r) => r.route))
  for (const route of Object.keys(baseline.marks)) {
    judged += 1
    if (!built.has(route)) {
      failures.push(
        `${BASELINE_FILE} carries a mark for ${route}, which this build does not emit. A budget file that has ` +
          `stopped describing the tree is a gate looking at nothing. Rewrite it with --write-baseline.`,
      )
    }
  }

  // Clause 4, dead markers.
  judged += 1
  for (const feature of result.coverage.dead) {
    failures.push(
      `the attribution marker for "${feature}" is declared always present and matched no chunk in this build. ` +
        `See scripts/perf/lib/chunk-attribution.mjs: a dead marker is how the cost table goes blind while still ` +
        `reading confidently.`,
    )
  }

  // Clause 5, the two readings of internal.
  judged += 1
  for (const d of result.disagreements) failures.push(d)

  // The debt, printed on every run rather than hidden behind a passing guard.
  const internalOver = overScope.filter((r) => r.audience === 'internal')
  if (internalOver.length) {
    notes.push(
      `${internalOver.length} INTERNAL route(s) are over the Scope v5 10.3 budget of ` +
        `${kb(SCOPE_10_3_BUDGET_BYTES)} KB and are held only by their marks, heaviest first:`,
    )
    for (const r of internalOver.sort((a, b) => b.gzip - a.gzip).slice(0, 5)) {
      notes.push(`    ${kb(r.gzip).padStart(7)} KB gzip  ${r.route}`)
    }
    if (internalOver.length > 5) notes.push(`    ... and ${internalOver.length - 5} more, all under /dashboard or /admin.`)
  }
  if (result.coverage.absent.length) {
    notes.push(`in no route's first load, declared conditional: ${result.coverage.absent.join('; ')}`)
  }
  if (registered.length) {
    notes.push(
      `${registered.length} PUBLIC route(s) are over the Scope budget and REGISTERED, which is a named debt and ` +
        `not a pass. They cannot grow (clause 2) and the entry dies when the route comes under (clause 1b):`,
    )
    for (const r of registered.sort((a, b) => b.gzip - a.gzip)) {
      const entry = register[r.route]
      notes.push(`    ${kb(r.gzip).padStart(7)} KB gzip  ${r.route}  (since ${entry.since})`)
      notes.push(`             why: ${entry.why}`)
      notes.push(`             fix: ${entry.fix}`)
    }
  }
  notes.push(
    `${result.routes.length} routes weighed; public routes over budget: ` +
      `${overScope.filter((r) => r.audience === 'public').length}, of which ${registered.length} registered.`,
  )

  return { judged, failures, notes, weighed: result.routes.length, ratchetHeld: !notComparable }
}

async function main() {
  const built = process.argv.includes(BUILT_FLAG)
  const { judged, failures, notes = [], weighed = 0, ratchetHeld = true } = built ? await judgeBuilt() : judgeContract()

  declareWork('initial-bundle-budget', {
    did: built
      ? { 'weighed route': weighed, 'check made': judged }
      : { 'contract check made': judged },
    found: { 'over-budget or grown route': failures.length },
  })

  for (const n of notes) console.log(`${TAG} ${n}`)

  if (failures.length) {
    for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
    console.error(`${TAG} FAIL - ${failures.length} fault(s) across ${judged} check(s) in ${built ? '--built' : 'contract'} mode.`)
    process.exit(1)
  }

  if (built) {
    // Deliberately NOT "no public route over the budget". Three are, they are
    // registered, and a pass line that rounded that away would be the exact
    // reporting C8B.6 forbids.
    //
    // And deliberately NOT "no route is above its mark" when the ratchet only
    // REPORTED. It said that once, on a host it had already told the reader it
    // could not judge, and a summary that contradicts the note three lines above
    // it is worse than no summary. Drilled: C:\dev\EVIDENCE\MONEY\bundle-guard-drills.txt.
    console.log(
      `${TAG} PASS - ${judged} check(s) on the build output: every public route over ` +
        `${kb(SCOPE_10_3_BUDGET_BYTES)} KB gzip is registered with a date and a reason, ` +
        `${ratchetHeld ? 'no route is above its mark' : 'the ratchet REPORTED rather than judged (see the note above)'}, ` +
        `every route is marked, and no always-present attribution marker is dead.`,
    )
  } else {
    console.log(
      `${TAG} PASS - ${judged} contract check(s). THIS HALF WEIGHS NOTHING: the proof is ` +
        `\`node scripts/guards/initial-bundle-budget.mjs ${BUILT_FLAG}\`, which npm's postbuild runs on every build.`,
    )
  }
}

// pathToFileURL, never a hand-built `file://` string: on Windows the hand-built
// form is missing a slash and the comparison silently fails, which leaves a
// guard that runs nothing and exits 0.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
