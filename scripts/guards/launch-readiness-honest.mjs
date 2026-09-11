/**
 * THE LAUNCH READINESS REPORT CANNOT SAY SOMETHING THE EVIDENCE DOES NOT.
 *
 * Close-out L5 asks for docs/verification/LAUNCH-READINESS.md, one row per L1
 * item, "with PASS or FAIL, the evidence path, and the date driven", and it is
 * the document the owner reads to decide whether the platform launches.
 *
 * WHY IT NEEDS A GUARD RATHER THAN A GOOD INTENTION. A readiness report is the
 * single most tempting document in the repository to improve by hand. It is
 * sixteen claims about whether journeys work, written on one day, and every
 * incentive afterwards points at editing a row rather than driving it again. A
 * markdown file cannot resist that; a build that fails can.
 *
 * WHAT IT JUDGES:
 *
 *   1. THE FILE IS THE JUDGEMENT. scripts/verify/launch-readiness.mjs holds the
 *      adjudication in code and renders the markdown from it. This guard renders
 *      it again and compares byte for byte, so a row edited in the file and not
 *      in the adjudication fails the build. The report is a rendering, never a
 *      second place where a claim can live.
 *
 *   2. A PASS ROW RESTS ON SOMETHING. It must cite at least one evidence path,
 *      every path must still exist in this repository, and it must carry the date
 *      it was driven. A citation that rots into a reference to a deleted file is
 *      worse than no citation, because it reads like proof.
 *
 *   3. A PASS ROW DOES NOT ALSO NAME A BLOCKER. That is the exact shape close-out
 *      C10.4's roast caught in the scope audit: the owner's blocker written into a
 *      note while the state beside it claimed the work was done. Here it is a
 *      fault.
 *
 *   4. AN OWNER BLOCKED ROW NAMES WHAT IS NEEDED, IN ONE SENTENCE. C10.4's rule,
 *      applied for the same reason: a paragraph is where a blocker goes to be
 *      ignored.
 *
 *   5. ALL SIXTEEN ARE THERE, AND ONLY THOSE SIXTEEN. A missing row is a journey
 *      nobody adjudicated, and an extra row is a journey L1 does not contain.
 *
 * WHERE IT RUNS, and this paragraph is the THIRD version of itself, because the
 * first was wrong and blocked a deployment and the second only stopped it
 * happening again.
 *
 * IT NOW RUNS EVERYWHERE, INCLUDING ON VERCEL. Close-out F1.9.2 PART ONE:
 * .vercelignore re-includes docs/verification/LAUNCH-READINESS.md and the
 * launch-readiness/ folder of artefacts beside it, so the report and its evidence
 * arrive on the build host and this guard judges them there for real instead of
 * standing aside.
 *
 * THE HISTORY, kept because it is the reason the determination below is not a
 * test somebody invented. The guard used to ask whether the docs/verification
 * DIRECTORY existed, on the assumption that an ignored directory does not arrive.
 * IT ARRIVES. Vercel deletes the matched FILES and leaves the directory tree
 * standing, which its own build log says in as many words: .vercelignore names
 * `.git`, and the removal enumerated /.git/config, /.git/description and the hook
 * samples INSIDE it. So on 8 September 2026 the deployment of 7564b40 found
 * docs/verification present and empty, read that as "somebody deleted the
 * report", and blocked the build.
 *
 * MISSING IS NOW DETERMINED, NEVER GUESSED. scripts/guards/lib/stripped-or-deleted.mjs
 * answers the only two questions that decide it: does .vercelignore exclude this
 * exact path, evaluated with the same evaluator the ignore guard uses, and is
 * this the Vercel build host. Excluded AND on Vercel is STRIPPED, and the guard
 * says so by name. Anything else missing was DELETED, and that fails, which is
 * the whole point of the guard. Since PART ONE the path is not excluded at all,
 * so on Vercel a missing report is a deletion there too.
 *
 * Run: node scripts/guards/launch-readiness-honest.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { callersOf, stateOf } from './lib/stripped-or-deleted.mjs'
import {
  ITEMS,
  REPORT_PATH,
  judgeLaunchReadiness,
  renderMarkdown,
} from '../verify/launch-readiness.mjs'

const ROOT = process.cwd()
const TAG = '[launch-readiness-honest]'

const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

/*
 * THE DETERMINATION, before anything else is judged. A STRIPPED report is a
 * guard that cannot see and says so; a DELETED one is evidence that has gone and
 * the build must fail. The shared module answers which, from .vercelignore and
 * the build scope, rather than from the shape of a directory.
 */
const report = stateOf(REPORT_PATH, { root: ROOT })
const sharing = callersOf(ROOT)
console.log(
  `${TAG} ${REPORT_PATH} is ${report.state.toUpperCase()}: ${report.why}. ` +
    `(${sharing.length} build-time script(s) share this determination.)`,
)
if (report.state === 'stripped') {
  console.log(`${TAG} SKIP - the report was never uploaded to this host, so there is nothing here to judge.`)
  console.log(`${TAG}   This guard is a real gate on the pre-push gate and in CI, where the whole tree is present.`)
  process.exit(0)
}

const evidenceExists = (p) => existsSync(join(ROOT, p))
const { faults: judgementFaults, counts, launchReady } = judgeLaunchReadiness({ items: ITEMS, evidenceExists })
for (const f of judgementFaults) fail(f)

if (report.state === 'deleted') {
  fail(
    `${REPORT_PATH} is DELETED, not stripped: ${report.why}. ` +
      'Close-out L5 requires it. Run: node scripts/verify/launch-readiness.mjs --write',
  )
} else {
  const onDisk = readFileSync(join(ROOT, REPORT_PATH), 'utf8')
  const rendered = renderMarkdown({ items: ITEMS, counts, launchReady })
  if (onDisk !== rendered) {
    fail(
      `${REPORT_PATH} does not match what the adjudication renders, so the file and the judgement have parted company. ` +
        'The report is generated, never hand-edited. Change scripts/verify/launch-readiness.mjs, then run it with --write.',
    )
  }
}

console.log(
  `${TAG} ${ITEMS.length} L1 rows: ${counts.PASS} PASS, ${counts['OWNER BLOCKED']} OWNER BLOCKED, ${counts.FAIL} FAIL. Verdict: ${launchReady ? 'LAUNCH READY' : 'NOT LAUNCH READY'}`,
)

declareWork('launch-readiness-honest', {
  did: {
    'L1 row adjudicated': ITEMS.length,
    'evidence path checked': ITEMS.flatMap((i) => i.evidence ?? []).length,
  },
  found: { fault: faults.length },
  zeroIsFine: {
    fault: 'a report that matches its own judgement and cites evidence that is still there is the goal state, not a missed check',
  },
  exitOnZero: false,
})

if (faults.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${faults.length} fault(s). Close-out L5: every row PASS, or it is not launch ready.`)
  process.exit(1)
}

console.log(`${TAG} PASS - the report is the judgement, and every PASS row cites evidence that is still on disk.`)
