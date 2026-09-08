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
 * WHERE IT DOES NOT RUN, said plainly, and this paragraph is the second version
 * of itself because the first one was wrong and blocked a deployment.
 *
 * The report lives under docs/, which .vercelignore strips from the deployment
 * upload, so on the Vercel build host the file is legitimately absent. The test
 * used to be "is the docs/verification DIRECTORY absent", on the assumption that
 * an ignored directory does not arrive. IT DOES ARRIVE. Vercel deletes the
 * matched FILES and leaves the directory tree standing, which its own build log
 * says in as many words: .vercelignore names `.git`, and the removal enumerated
 * /.git/config, /.git/description and the hook samples INSIDE it. So on 8
 * September 2026 the deployment of 7564b40 found docs/verification present and
 * empty, read that as "somebody deleted the report", and blocked the build.
 *
 * The test is now the two facts that actually distinguish the two environments,
 * neither of them inferred:
 *   - the tree is not a git checkout (the Vercel host unpacks a tarball with no
 *     .git; every git-reading guard printed "fatal: not a git repository" in that
 *     same build log), AND
 *   - docs/verification holds no file at any depth (the stripped shape).
 * Both together are the upload and nothing else. A developer or a CI runner
 * deleting the report still has a .git, so it still FAILS there, which is the
 * whole point of the guard.
 *
 * This file is registered as TOLERANT in vercelignore-covers-guard-reads.mjs
 * rather than re-included, because the fault it catches is committed on a
 * developer machine and caught by the pre-push gate and by CI, both of which
 * hold the whole tree. Vercel would add nothing and could only fail for a file
 * it was never sent. That claim is no longer prose: it is executed against a
 * materialised upload by tolerant-guards-survive-the-upload.mjs.
 *
 * Run: node scripts/guards/launch-readiness-honest.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { holdsNoFile, isGitCheckout } from './lib/vercel-upload.mjs'
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

if (!isGitCheckout(ROOT) && holdsNoFile(join(ROOT, DOCS_DIR))) {
  console.log(
    `${TAG} SKIP - this tree is not a git checkout and ${DOCS_DIR} holds no file at any depth, which is the Vercel build host: .vercelignore strips docs/ from the upload and leaves the empty directories behind.`,
  )
  console.log(`${TAG}   This guard is a real gate on the pre-push gate and in CI, where the whole tree is present.`)
  process.exit(0)
}

const evidenceExists = (p) => existsSync(join(ROOT, p))
const { faults: judgementFaults, counts, launchReady } = judgeLaunchReadiness({ items: ITEMS, evidenceExists })
for (const f of judgementFaults) fail(f)

if (!existsSync(join(ROOT, REPORT_PATH))) {
  fail(
    `${REPORT_PATH} is missing from a tree the strip test did not excuse, so it was deleted rather than stripped. ` +
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
