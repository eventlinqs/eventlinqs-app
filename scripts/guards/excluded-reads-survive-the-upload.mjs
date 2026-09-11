/**
 * EVERY PREBUILD ENTRY POINT THAT READS UNDER docs/ IS RUN INSIDE THE UPLOAD,
 * HERE, BEFORE THE PUSH.
 *
 * WHY THIS EXISTS. .vercelignore removes most of docs/ from the deployment
 * upload, so a prebuild script that reads a docs/ path passes locally and blocks
 * every Vercel build. It has happened FOUR times. The answer after the third was
 * vercelignore-covers-guard-reads.mjs, which judges the declared reads
 * statically, and for anything else it accepted a WRITTEN RATIONALE saying the
 * script coped when docs/ was gone.
 *
 * On 8 September 2026 a rationale was wrong and it blocked the deployment of
 * 7564b40. launch-readiness-honest.mjs was reviewed as "SKIPS by name when
 * docs/verification is absent, which is exactly the stripped upload". It is not
 * the stripped upload: Vercel deletes the matched FILES and leaves the DIRECTORY
 * tree, so the directory arrived present and empty, the guard read that as a
 * deletion, and the build died. The guard built for the first three failures
 * watched the fourth walk past, because it read a sentence where it should have
 * run a program.
 *
 * SO THERE IS NO REVIEW LIST LEFT (close-out F1.9.2 PART TWO, which says in as
 * many words: "Then DELETE the TOLERANT review list"). The subject is DERIVED:
 * every prebuild entry point whose own code, or the code of anything it imports,
 * names a docs/ path. A guard that starts reading under docs/ tomorrow joins this
 * set without anybody remembering to add it, and there is no second list to rot
 * out of step with the first.
 *
 * WHAT IT DOES NOT CHECK, said plainly rather than implied:
 *   - It does not judge whether a script's OUTPUT is right in the upload, only
 *     that the script does not FAIL there. That is the claim being tested.
 *   - It reproduces the upload by WALKING THE FILESYSTEM and applying every
 *     .gitignore governing the tree, so it needs no git and works in a shallow
 *     clone, a worktree or an unzipped directory (close-out F2.2). Where the
 *     index IS readable it is used as a correction, because being force-added is
 *     a fact only the index holds and 16 shipped rasters under public/ are
 *     force-added. Both deltas are printed rather than folded away.
 *
 * THE CHILD RUNS IN THE BUILD HOST'S ENVIRONMENT, NOT THIS PROCESS'S. VERCEL=1 is
 * set, deliberately: the tree the child runs in IS the Vercel upload, so a script
 * asking "am I on the build host" must get the same answer it would get there.
 * Without it, a script that distinguishes a STRIPPED file from a DELETED one
 * would be tested in a state that exists nowhere. And since 12 September 2026
 * the CI identity, the credentials and every CLI login are REMOVED as well
 * (buildHostEnv in lib/vercel-upload.mjs): on 11 September this guard, in CI,
 * handed preview-deployment-state the VERCEL_TOKEN and the pull request
 * payload, the child judged the real deployment of 0fe8c238 (in ERROR for a
 * reason of its own), and this guard reported a SECOND fault that blamed
 * .vercelignore for it and told the reader to re-include a file. "No token" is
 * this header's own promise, and the environment is where a token lives.
 *
 * WHEN A CHILD IS RED, THE MESSAGE SAYS WHICH FAULT IT IS. The same script is run
 * once more from the real tree under the same build-host environment. Red there
 * too means the files .vercelignore strips are not the cause, and the message
 * says so instead of sending the reader to the ignore file.
 *
 * WHERE IT DOES NOT RUN: ON VERCEL, BY SCOPE, NEVER AS A SIDE EFFECT.
 *
 * Close-out F2.2: "Its purpose is to predict what Vercel will see. Running it on
 * Vercel is circular: the thing it simulates is the thing it is running inside."
 *
 * It used to stand aside there for a DIFFERENT reason - it could not find a git
 * repository - and that is an accident, not a decision. The accident broke: the
 * predicate was `existsSync('.git')`, .vercelignore names `.git`, Vercel strips
 * the FILES and leaves the DIRECTORY, so the guard believed it was on a laptop,
 * called git, threw, and killed the preview build of ffded236. Now that the
 * enumeration no longer needs git at all, that accident would have SILENTLY
 * REVERSED: the guard would have started running on Vercel, simulating Vercel,
 * inside Vercel.
 *
 * So the test is the build scope, from the shared resolver, and it is a decision:
 * this guard is a real gate on the pre-push gate and in CI, where the whole tree
 * exists and the comparison is possible, and it does not execute on the build
 * host at all.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/excluded-reads-survive-the-upload.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { entriesThatReadThroughTheIgnore, excludedTopLevels } from './lib/build-time-scripts.mjs'
import { readVercelIgnore } from './lib/vercelignore.mjs'
import { buildHostEnv, filesForUpload, materialiseVercelUpload, removeUpload } from './lib/vercel-upload.mjs'
import { describeBuildScope, resolveBuildScope } from '../../src/lib/health/build-scope.mjs'
import { DECLARED } from './lib/build-host-needs.mjs'

const ROOT = process.cwd()
const TAG = '[excluded-reads-survive-the-upload]'

const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

/*
 * ONE QUESTION, AND IT IS A DECISION RATHER THAN AN ACCIDENT: WHICH MACHINE IS
 * THIS? Close-out F2.2.
 *
 * The previous test asked whether git worked here, which stood aside on Vercel
 * only because Vercel happens to have no usable repository. That is a side
 * effect, and the whole of F2.2 is that this guard must not run on Vercel FOR A
 * REASON: it exists to predict what the build host will see, and running it
 * there means simulating a tree from inside that tree. Now that the enumeration
 * needs no git, the old test would have quietly started saying yes.
 */
const scope = resolveBuildScope(process.env)
console.log(`${TAG} ${describeBuildScope(process.env)}`)
if (scope.scope === 'vercel') {
  console.log(
    `${TAG} SKIP - this IS the build host. Simulating the upload from inside the upload is circular: ` +
      `the tree it would materialise is the tree it is already running in.`,
  )
  console.log(
    `${TAG}   This guard is a real gate on the pre-push gate and in CI, where the whole tree exists and the comparison is possible.`,
  )
  process.exit(0)
}

/*
 * THE SUBJECTS: EVERY SCRIPT THAT DECLARES A BUILD-HOST NEED, NOT ONLY THE ONES
 * THAT NAME A STRIPPED PATH.
 *
 * Close-out F2.1 made every build-time script declare which of docs, git and a
 * token it needs. This is what makes that declaration cost something instead of
 * being bookkeeping: a script that declares ANY of the three is RUN here, on a
 * tree with no docs, no usable git and no token, and must exit 0. The docs-literal
 * scan stays as well, so a script that reads a stripped path without declaring it
 * is still executed rather than slipping through on a missing declaration.
 */
const byLiteral = entriesThatReadThroughTheIgnore(ROOT, excludedTopLevels(readVercelIgnore(ROOT).rules))
const byDeclaration = Object.entries(DECLARED).map(([entry, needs]) => ({
  entry,
  because: `declares ${Object.keys(needs).sort().join(' and ')} (close-out F2.1)`,
}))
const subjects = [...byLiteral]
for (const d of byDeclaration) {
  if (!subjects.some((s) => s.entry === d.entry)) subjects.push(d)
}
subjects.sort((a, b) => a.entry.localeCompare(b.entry))
let dest = ''
/** @type {{ kept: number, stripped: number, directories: number, ignoreErrors: string[] }} */
let shape = { kept: 0, stripped: 0, directories: 0, ignoreErrors: [] }
const results = []

try {
  dest = mkdtempSync(join(tmpdir(), 'vercel-upload-'))
  const enumerated = filesForUpload(ROOT)
  shape = materialiseVercelUpload({ root: ROOT, dest, files: enumerated.files })
  for (const e of shape.ignoreErrors) fail(`.vercelignore ${e}`)
  // The build host's environment: no CI identity, no credential, no CLI login.
  const hostEnv = buildHostEnv(process.env, dest)
  const lastLines = (run) =>
    `${run.stdout ?? ''}${run.stderr ?? ''}`
      .split('\n')
      .filter((l) => l.trim() !== '')
      .slice(-6)
      .join('\n      ')

  console.log(`${TAG} enumerated ${enumerated.files.length} file(s) from ${enumerated.source}.`)
  if (enumerated.addedByIndex.length > 0 || enumerated.droppedAsUntracked.length > 0) {
    // PRINTED, NEVER FOLDED AWAY. The walk alone cannot see a force-added file,
    // and 16 of those are shipped rasters under public/. Saying how far the two
    // disagreed is the only way that limit stays visible.
    console.log(
      `${TAG}   the index corrected the walk by ${enumerated.addedByIndex.length} force-added file(s) it cannot see, ` +
        `and ${enumerated.droppedAsUntracked.length} untracked file(s) Vercel would not clone.`,
    )
  }
  console.log(
    `${TAG} materialised the upload at a temporary root: ${shape.kept} file(s) kept, ${shape.stripped} stripped, ${shape.directories} directories left standing.`,
  )

  for (const { entry, because } of subjects) {
    /*
     * RUN FROM INSIDE THE UPLOAD, NOT FROM THE REAL TREE WITH cwd POINTED AT IT.
     *
     * Close-out F2, found while auditing this guard's own claims. It used to
     * launch `join(ROOT, entry)` - the script at its REAL path - with `cwd` set
     * to the materialised upload. That works for a script whose root is
     * `process.cwd()`, and does NOTHING AT ALL for one whose root is
     * `path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')`,
     * which resolves to the real repository no matter what cwd says.
     *
     * SEVEN OF THIS GUARD'S NINETEEN SUBJECTS resolve their root that way:
     * no-plaintext-credential, one-fee-copy, one-pull-request-at-a-time,
     * positioning-lock, pre-push-gate-wired, sourced-specifications and
     * pricing-derive. Every one of them was being scanned against the whole tree
     * while this guard reported it had been run in the stripped upload. The
     * simulation was hollow for more than a third of its subjects, and it
     * reported PASS the entire time.
     *
     * Vercel runs the scripts that are IN the upload, so the simulation does the
     * same. `scripts/` is not stripped, so the upload carries them, and both root
     * styles now resolve to the upload rather than one of them escaping it.
     */
    const inside = join(dest, entry)
    if (!existsSync(inside)) {
      fail(
        `${entry} is a prebuild entry point and .vercelignore strips it from the upload, so the Vercel build ` +
          `cannot run it at all. Re-include it, or stop registering it in the prebuild chain.`,
      )
      continue
    }
    const run = spawnSync(process.execPath, [inside], {
      cwd: dest,
      encoding: 'utf8',
      env: hostEnv,
      maxBuffer: 32 * 1024 * 1024,
    })
    const status = run.status ?? -1
    results.push({ entry, because, status })
    if (status !== 0) {
      const tail = lastLines(run)
      /*
       * WHICH FAULT IS IT? A script can be red in the upload because a file it
       * reads was stripped, which is what this guard exists to catch, or because
       * it is red on any build host, which is a fault of its own and nothing to
       * do with .vercelignore. On 11 September 2026 the second was reported as
       * the first. So the script is run once more from the REAL tree, under the
       * SAME build-host environment, and the message names the fault it found.
       */
      const full = spawnSync(process.execPath, [join(ROOT, entry)], {
        cwd: ROOT,
        encoding: 'utf8',
        env: hostEnv,
        maxBuffer: 32 * 1024 * 1024,
      })
      const fullStatus = full.status ?? -1
      if (fullStatus !== 0) {
        fail(
          `${entry} (${because}) exits ${status} in the stripped upload AND exits ${fullStatus} in the full tree under ` +
            `the same build-host environment (no CI identity, no credential, no CLI login), so the files .vercelignore ` +
            `strips are NOT the cause: the script is red on any build host. Read its own lines, not the ignore file. ` +
            `Its last lines in the upload were:\n      ${tail}\n      ` +
            `and in the full tree:\n      ${lastLines(full)}`,
        )
      } else {
        fail(
          `${entry} reads through .vercelignore (${because}) and exits ${status} in the stripped upload, and exits 0 ` +
            `in the full tree under the same build-host environment, so a stripped file is the cause. ` +
            `Every Vercel build will fail on it while the local gate stays green. Either re-include what it reads in ` +
            `.vercelignore (vercelignore-covers-guard-reads.mjs prints the exact lines), or make it cope with the file ` +
            `being absent. Its last lines were:\n      ${tail}`,
        )
      }
    }
  }
} finally {
  removeUpload(dest)
}

for (const { entry, because, status } of results) {
  console.log(`${TAG}   exit ${status}  ${entry}`)
  console.log(`${TAG}            ${because}`)
}

declareWork('excluded-reads-survive-the-upload', {
  did: {
    'entry point executed in the upload': results.length,
    'upload file kept': shape.kept,
    'upload file stripped': shape.stripped,
  },
  found: { 'upload failure': faults.length },
  zeroIsFine: {
    'upload failure':
      'every entry point that reads through .vercelignore surviving the upload is the goal state, and it is the state four failed deployments were spent reaching',
  },
  exitOnZero: false,
})

if (faults.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${faults.length} fault(s). A rationale that has not been executed is not evidence.`)
  process.exit(1)
}
console.log(
  `${TAG} PASS - ${results.length} prebuild entry point(s) that read through .vercelignore or declare a build-host need, ` +
    `run in a materialised Vercel upload, every one exiting 0. The subject list is derived from the import graph and the ` +
    `needs registry, never reviewed.`,
)
