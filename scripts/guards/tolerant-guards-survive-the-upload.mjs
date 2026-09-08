/**
 * EVERY BUILD-TIME SCRIPT DECLARED TOLERANT OF A STRIPPED docs/ IS RUN IN A
 * STRIPPED docs/, HERE, BEFORE THE PUSH.
 *
 * WHY THIS EXISTS. .vercelignore removes docs/ from the deployment upload, so a
 * prebuild script that reads a docs/ path passes locally and blocks every Vercel
 * build. It happened three times, and the answer was
 * scripts/guards/vercelignore-covers-guard-reads.mjs, which judges the REQUIRED
 * reads statically. For the scripts that merely NAME a docs/ path and are
 * supposed to cope when it is gone, that guard accepts a written rationale.
 *
 * On 8 September 2026 a rationale was wrong, and it blocked the deployment of
 * 7564b40. launch-readiness-honest.mjs was reviewed as "SKIPS by name when
 * docs/verification is absent, which is exactly the stripped upload". It is not
 * the stripped upload. Vercel deletes the matched FILES and leaves the DIRECTORY
 * tree, so the directory arrives present and empty, the guard read that as a
 * deletion, and the build died. Four occurrences of one defect, and the fourth
 * got past a guard built for the first three, because the guard read a sentence
 * where it should have run a program.
 *
 * So this one runs the program. It materialises the upload shape on this machine
 * (scripts/guards/lib/vercel-upload.mjs), executes each TOLERANT script inside
 * it, and fails on any non-zero exit. A rationale is now a claim with a test
 * behind it.
 *
 * WHAT IT DOES NOT CHECK, said plainly rather than implied:
 *   - It does not judge whether a script's OUTPUT is right in the stripped tree,
 *     only that the script does not fail there. Tolerance is exactly that claim.
 *   - It does not run the REQUIRED reads' guards. Those are judged statically by
 *     vercelignore-covers-guard-reads.mjs against the ignore rules, and several
 *     of them query a database, which a shadow tree does not change.
 *   - It reproduces the upload from `git ls-files`, which is what Vercel clones.
 *     An untracked file a script depends on would not be seen here, and would
 *     not be on Vercel either, so that is fidelity rather than a gap.
 *
 * WHERE IT DOES NOT RUN. On the Vercel build host itself, where there is nothing
 * to simulate and no git to enumerate from. It skips by name there, on the same
 * two observable facts launch-readiness-honest.mjs uses.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/tolerant-guards-survive-the-upload.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { TOLERANT_FILES } from './lib/vercelignore-registry.mjs'
import { holdsNoFile, isGitCheckout, materialiseVercelUpload, removeUpload } from './lib/vercel-upload.mjs'

const ROOT = process.cwd()
const TAG = '[tolerant-guards-survive-the-upload]'

const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

if (!isGitCheckout(ROOT) && holdsNoFile(join(ROOT, 'docs/verification'))) {
  console.log(
    `${TAG} SKIP - this tree is already the stripped upload (no git checkout, docs/ holds no file), so there is nothing to simulate and no git to enumerate from.`,
  )
  console.log(`${TAG}   This guard is a real gate on the pre-push gate and in CI, where the whole tree is present.`)
  process.exit(0)
}

const scripts = Object.keys(TOLERANT_FILES)
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

  for (const script of scripts) {
    if (!existsSync(join(ROOT, script))) {
      fail(`the TOLERANT entry ${script} names a file that is not in the tree; remove the rotted entry`)
      continue
    }
    const run = spawnSync(process.execPath, [join(ROOT, script)], {
      cwd: dest,
      encoding: 'utf8',
      env: { ...process.env, VERCEL_UPLOAD_SIMULATION: '1' },
      maxBuffer: 32 * 1024 * 1024,
    })
    const status = run.status ?? -1
    results.push({ script, status })
    if (status !== 0) {
      const tail = `${run.stdout ?? ''}${run.stderr ?? ''}`
        .split('\n')
        .filter((l) => l.trim() !== '')
        .slice(-6)
        .join('\n      ')
      fail(
        `${script} is reviewed as TOLERANT of an absent docs/, and it exits ${status} in the stripped upload. ` +
          `Every Vercel build will fail on it while the local gate stays green. Its last lines were:\n      ${tail}`,
      )
    }
  }
} finally {
  removeUpload(dest)
}

for (const { script, status } of results) {
  console.log(`${TAG}   exit ${status}  ${script}`)
}

declareWork('tolerant-guards-survive-the-upload', {
  did: {
    'tolerant script executed': results.length,
    'upload file kept': shape.kept,
    'upload file stripped': shape.stripped,
  },
  found: { 'upload failure': faults.length },
  zeroIsFine: {
    'upload failure':
      'every reviewed-tolerant script surviving the upload is the goal state, and it is the state four failed deployments were spent reaching',
  },
  exitOnZero: false,
})

if (faults.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${faults.length} fault(s). A rationale that has not been executed is not evidence.`)
  process.exit(1)
}
console.log(
  `${TAG} PASS - ${results.length} reviewed-tolerant script(s) run in a materialised Vercel upload, every one exiting 0.`,
)
