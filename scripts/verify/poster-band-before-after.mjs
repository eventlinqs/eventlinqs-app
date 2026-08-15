/**
 * poster-band-before-after.mjs
 *
 * Renders the six arrivals WITH artwork on the pre-change renderer and on the
 * working tree, keeps both sets of PDFs so a human can look at them side by
 * side, and asserts the two properties the founder's ruling requires:
 *
 *   1. the ARTWORK posters MUST change  (the band now sizes itself to content)
 *   2. the NO-ARTWORK posters MUST NOT  (that composition was not in scope)
 *
 * Usage: node scripts/verify/poster-band-before-after.mjs [beforeRef]
 * Default beforeRef is HEAD, i.e. the last commit before the band change.
 */
import { execFileSync } from 'node:child_process'

import { gitEnv } from '../lib/git-env.mjs'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'

const BEFORE_REF = process.argv[2] || 'HEAD'
const TARGET = 'src/lib/broadcast/poster.ts'
const OUT = 'docs/design/poster-band'
const HASHES = `${OUT}/hashes.json`

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
}

function render(label) {
  run('npx', ['vitest', 'run', 'tests/unit/poster-band.test.ts'])
  mkdirSync(`${OUT}/${label}`, { recursive: true })
  // File by file, top level only. cpSync of the directory into its own
  // subdirectory is an ERR_FS_CP_EINVAL.
  for (const name of readdirSync(OUT)) {
    const src = `${OUT}/${name}`
    if (statSync(src).isDirectory()) continue
    copyFileSync(src, `${OUT}/${label}/${name}`)
  }
  return JSON.parse(readFileSync(HASHES, 'utf8'))
}

// Snapshot and restore from the snapshot, never from git: `git checkout --`
// would discard uncommitted work, which has already bitten once on this branch.
const snapshot = readFileSync(TARGET, 'utf8')

let after
let before
try {
  console.log('\n[band] 1/2 rendering the working tree (after)...')
  after = render('after')

  console.log(`\n[band] 2/2 rendering ${BEFORE_REF} (before)...`)
  writeFileSync(TARGET, execFileSync('git', ['show', `${BEFORE_REF}:${TARGET}`], { encoding: 'utf8', env: gitEnv() }))
  before = render('before')
} finally {
  writeFileSync(TARGET, snapshot)
}

console.log('\n[band] restoring current-renderer artefacts...')
render('after')

const rows = []
let artworkChanged = 0
let noArtworkMoved = 0
for (const key of Object.keys(after)) {
  const changed = before[key] !== after[key]
  const isArtwork = key.endsWith('-artwork')
  if (isArtwork && changed) artworkChanged += 1
  if (!isArtwork && changed) noArtworkMoved += 1
  rows.push(`${key.padEnd(26)} ${changed ? 'CHANGED' : 'identical'}`)
}

console.log('\n---------------------------------------------------------')
for (const r of rows) console.log(r)
console.log('---------------------------------------------------------')
console.log(`artwork posters changed      : ${artworkChanged} (must be 6)`)
console.log(`no-artwork posters that moved: ${noArtworkMoved} (must be 0)`)
console.log('---------------------------------------------------------\n')

if (artworkChanged !== 6) {
  console.error('[band] FAILED: the band change did not reach every artwork poster.')
  process.exit(1)
}
if (noArtworkMoved !== 0) {
  console.error('[band] FAILED: the typographic composition moved. It was not in scope.')
  process.exit(1)
}
console.log('[band] PASS')
