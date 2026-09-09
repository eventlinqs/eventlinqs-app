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
 *   - It reproduces the upload from `git ls-files`, which is what Vercel clones.
 *     An untracked file a script depends on would not be seen here and would not
 *     be on Vercel either, so that is fidelity rather than a gap.
 *
 * VERCEL=1 IS SET IN THE CHILD ENVIRONMENT, deliberately. The tree the child runs
 * in IS the Vercel upload, so a script asking "am I on the build host" must get
 * the same answer it would get there. Without it, a script that distinguishes a
 * STRIPPED file from a DELETED one would be tested in a state that exists nowhere.
 *
 * WHERE IT DOES NOT RUN. On the Vercel build host itself, where there is nothing
 * to simulate and no git to enumerate from. It skips by name there.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/excluded-reads-survive-the-upload.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { entriesThatReadThroughTheIgnore, excludedTopLevels } from './lib/build-time-scripts.mjs'
import { readVercelIgnore } from './lib/vercelignore.mjs'
import { isGitCheckout, materialiseVercelUpload, removeUpload } from './lib/vercel-upload.mjs'

const ROOT = process.cwd()
const TAG = '[excluded-reads-survive-the-upload]'

const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

/*
 * ONE FACT, AND IT IS THE RIGHT ONE. This guard's whole method is to enumerate
 * the tracked files with git and rebuild the tree from them, so the only
 * question that decides whether it can run is whether git can work here. Nothing
 * about docs/ enters into it.
 *
 * The first version of this test asked TWO questions, the second of which was
 * whether an excluded docs/ directory held no file, and the preview build of
 * ffded236 died on it: `isGitCheckout` was `existsSync('.git')`, `.vercelignore`
 * names `.git`, and Vercel strips the FILES inside a matched directory and leaves
 * the DIRECTORY. So `.git` was present and empty, the guard believed it was on a
 * developer machine, called `git ls-files`, and got "fatal: not a git repository".
 * The predicate is fixed in lib/vercel-upload.mjs and this test is now the single
 * fact it always should have been.
 */
if (!isGitCheckout(ROOT)) {
  console.log(
    `${TAG} SKIP - this tree is not a git checkout, so it is already the stripped upload: there is nothing to simulate and no git to enumerate from.`,
  )
  console.log(`${TAG}   This guard is a real gate on the pre-push gate and in CI, where the whole tree is present.`)
  process.exit(0)
}

const subjects = entriesThatReadThroughTheIgnore(ROOT, excludedTopLevels(readVercelIgnore(ROOT).rules))
let dest = ''
/** @type {{ kept: number, stripped: number, directories: number, ignoreErrors: string[] }} */
let shape = { kept: 0, stripped: 0, directories: 0, ignoreErrors: [] }
const results = []

try {
  dest = mkdtempSync(join(tmpdir(), 'vercel-upload-'))
  shape = materialiseVercelUpload({ root: ROOT, dest })
  for (const e of shape.ignoreErrors) fail(`.vercelignore ${e}`)

  console.log(
    `${TAG} materialised the upload at a temporary root: ${shape.kept} file(s) kept, ${shape.stripped} stripped, ${shape.directories} directories left standing.`,
  )

  for (const { entry, because } of subjects) {
    const run = spawnSync(process.execPath, [join(ROOT, entry)], {
      cwd: dest,
      encoding: 'utf8',
      env: { ...process.env, VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_UPLOAD_SIMULATION: '1' },
      maxBuffer: 32 * 1024 * 1024,
    })
    const status = run.status ?? -1
    results.push({ entry, because, status })
    if (status !== 0) {
      const tail = `${run.stdout ?? ''}${run.stderr ?? ''}`
        .split('\n')
        .filter((l) => l.trim() !== '')
        .slice(-6)
        .join('\n      ')
      fail(
        `${entry} reads through .vercelignore (${because}) and exits ${status} in the stripped upload. ` +
          `Every Vercel build will fail on it while the local gate stays green. Either re-include what it reads in ` +
          `.vercelignore (vercelignore-covers-guard-reads.mjs prints the exact lines), or make it cope with the file ` +
          `being absent. Its last lines were:\n      ${tail}`,
      )
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
  `${TAG} PASS - ${results.length} prebuild entry point(s) that read through .vercelignore, run in a materialised Vercel upload, every one exiting 0. The subject list is derived from the import graph, not reviewed.`,
)
