/**
 * STRIPPED IS NOT DELETED, AND BOTH VERDICTS ARE DRIVEN HERE.
 *
 * Close-out F1.9.2 PART THREE: "Prove both verdicts: a genuinely stripped tree
 * SKIPS naming the reason, a genuinely deleted file FAILS." A unit test can drive
 * the determination in isolation; this drives the whole thing, in a real
 * materialised Vercel upload, with the real guard, which is the only place the
 * fourth lost deployment could have been caught.
 *
 * Four cases, each a tree that actually exists on disk while it is judged:
 *
 *   1. PRESENT   the upload as .vercelignore builds it today. The report was
 *                re-included by PART ONE, so it arrives and the guard JUDGES it
 *                on the build host instead of standing aside.
 *   2. STRIPPED  the upload as commit 7564b40's .vercelignore built it, which is
 *                the tree that lost the deployment. The guard must SKIP, naming
 *                the reason, and exit 0.
 *   3. DELETED, on Vercel. Case 1's tree with the report removed. Nothing
 *                excluded it, so it cannot have been stripped: it must FAIL.
 *   4. DELETED, on a laptop. The same removal with no Vercel variables. It must
 *                FAIL there too, which is the whole point of the guard.
 *
 * Run: node scripts/verify/stripped-or-deleted-drill.mjs
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { materialiseVercelUpload, removeUpload } from '../guards/lib/vercel-upload.mjs'
import { gitEnv } from '../lib/git-env.mjs'
import { callersOf } from '../guards/lib/stripped-or-deleted.mjs'

const ROOT = process.cwd()
const GUARD = join(ROOT, 'scripts/guards/launch-readiness-honest.mjs')
const REPORT = 'docs/verification/LAUNCH-READINESS.md'
const IGNORE = join(ROOT, '.vercelignore')

const VERCEL_ENV_VARS = { VERCEL: '1', VERCEL_ENV: 'preview' }

/** Build an upload from the repository, optionally with a different ignore file. */
function upload(ignoreTextFrom) {
  const dest = mkdtempSync(join(tmpdir(), 'strip-drill-'))
  let restore = null
  if (ignoreTextFrom) {
    restore = mkdtempSync(join(tmpdir(), 'ignore-keep-'))
    copyFileSync(IGNORE, join(restore, 'kept'))
    writeFileSync(IGNORE, ignoreTextFrom)
  }
  try {
    const shape = materialiseVercelUpload({ root: ROOT, dest })
    /*
     * THE UPLOAD'S OWN .vercelignore, and this cost the first run of this drill.
     * materialiseVercelUpload HARD LINKS the files it keeps, so the copy in the
     * upload IS the repository's file: restoring the repository's version below
     * changed the upload's version too, and the tree ended up holding rules that
     * disagreed with the rules it had been built from. Vercel does not ship that
     * tree, so neither does this: the ignore file is replaced by a real copy of
     * the text the upload was built from, breaking the link first.
     */
    if (ignoreTextFrom) {
      rmSync(join(dest, '.vercelignore'), { force: true })
      writeFileSync(join(dest, '.vercelignore'), ignoreTextFrom)
    }
    return { dest, shape }
  } finally {
    if (restore) {
      copyFileSync(join(restore, 'kept'), IGNORE)
      rmSync(restore, { recursive: true, force: true })
    }
  }
}

function run(cwd, env) {
  const r = spawnSync(process.execPath, [GUARD], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// env: gitEnv() - inside a hook, GIT_DIR is set and an inheriting child ignores
// cwd when choosing a repository. no-inherited-git-env.mjs caught this one.
const at7564b40 = spawnSync('git', ['show', '7564b40b:.vercelignore'], {
  encoding: 'utf8',
  cwd: ROOT,
  env: gitEnv(),
})
if (at7564b40.status !== 0) {
  console.error('[strip-drill] could not read .vercelignore at 7564b40; the drill cannot aim.')
  process.exit(1)
}

const cases = []
let dest1 = ''
let dest2 = ''
try {
  const one = upload(null)
  dest1 = one.dest
  cases.push({
    name: '1. PRESENT: the report is re-included, so the guard judges it on the build host',
    ...run(dest1, VERCEL_ENV_VARS),
    wantCode: 0,
    wantText: `${REPORT} is PRESENT`,
  })

  const two = upload(at7564b40.stdout)
  dest2 = two.dest
  cases.push({
    name: "2. STRIPPED: commit 7564b40's ignore file, on Vercel. SKIP, naming the reason",
    ...run(dest2, VERCEL_ENV_VARS),
    wantCode: 0,
    wantText: `${REPORT} is STRIPPED`,
  })

  rmSync(join(dest1, REPORT), { force: true })
  cases.push({
    name: '3. DELETED on Vercel: nothing excluded it, so it cannot have been stripped',
    ...run(dest1, VERCEL_ENV_VARS),
    wantCode: 1,
    wantText: `${REPORT} is DELETED`,
  })
  cases.push({
    name: '4. DELETED on a developer machine: it fails there too',
    ...run(dest1, { VERCEL: '', VERCEL_ENV: '', CI: '', GITHUB_ACTIONS: '' }),
    wantCode: 1,
    wantText: `${REPORT} is DELETED`,
  })
} finally {
  removeUpload(dest1)
  removeUpload(dest2)
}

console.log('\n=== STRIPPED IS NOT DELETED: four driven cases ===\n')
let failed = 0
for (const c of cases) {
  const codeOk = c.code === c.wantCode
  const textOk = c.out.includes(c.wantText)
  const line = c.out.split('\n').find((l) => l.includes(REPORT))?.trim() ?? '(no verdict line)'
  if (codeOk && textOk) {
    console.log(`  OK    ${c.name}`)
    console.log(`        exit ${c.code}: ${line}\n`)
  } else {
    failed += 1
    console.error(`  WRONG ${c.name}`)
    console.error(`        wanted exit ${c.wantCode} and "${c.wantText}"`)
    console.error(`        got    exit ${c.code}: ${line}\n`)
  }
}

const sharing = callersOf(ROOT)
console.log(`Build-time scripts sharing the determination: ${sharing.length}`)
for (const s of sharing) console.log(`  ${s}`)

if (failed > 0) {
  console.error(`\n${failed} of ${cases.length} case(s) behaved wrongly.`)
  process.exit(1)
}
console.log(`\n${cases.length}/${cases.length} cases behaved correctly.`)
