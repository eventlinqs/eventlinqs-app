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
 * WHERE IT DOES NOT RUN, said plainly. The report lives under docs/, which
 * .vercelignore strips from the deployment upload, so on the Vercel build host
 * the file is legitimately absent. An ABSENT docs/verification DIRECTORY is that
 * environment and is a SKIP by name; a present directory with the report missing
 * is the file having been deleted, and is a FAIL. This file is therefore
 * registered as TOLERANT in vercelignore-covers-guard-reads.mjs rather than
 * re-included, because the fault it catches is committed on a developer machine
 * and caught by the pre-push gate and by CI, both of which have the whole tree.
 * Vercel would add nothing and could only fail for a file it was never sent.
 *
 * Run: node scripts/guards/launch-readiness-honest.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import {
  ITEMS,
  REPORT_PATH,
  judgeLaunchReadiness,
  renderMarkdown,
} from '../verify/launch-readiness.mjs'

const ROOT = process.cwd()
const TAG = '[launch-readiness-honest]'
const DOCS_DIR = 'docs/verification'

const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

if (!existsSync(join(ROOT, DOCS_DIR))) {
  console.log(
    `${TAG} SKIP - ${DOCS_DIR} is not on this machine, which is the Vercel build host: .vercelignore strips docs/ from the upload.`,
  )
  console.log(`${TAG}   This guard is a real gate on the pre-push gate and in CI, where the whole tree is present.`)
  process.exit(0)
}

const evidenceExists = (p) => existsSync(join(ROOT, p))
const { faults: judgementFaults, counts, launchReady } = judgeLaunchReadiness({ items: ITEMS, evidenceExists })
for (const f of judgementFaults) fail(f)

if (!existsSync(join(ROOT, REPORT_PATH))) {
  fail(
    `${REPORT_PATH} is missing, and ${DOCS_DIR} is present, so it was deleted rather than stripped. ` +
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
