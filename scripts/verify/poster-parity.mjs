/**
 * poster-parity.mjs - proves the poster split did not move the artwork path.
 *
 * src/lib/broadcast/poster.ts was split into drawCoverPoster (the previous
 * renderer, lifted) and drawTypographicPoster (new). The founder's condition
 * was that an event WITH artwork renders identically before and after, because
 * that surface is owned by another branch and a silent change to it would be a
 * regression nobody asked for.
 *
 * Method: render on the working tree, check out the pre-split renderer, render
 * again, compare. The hash normalises /CreationDate and /ModDate because
 * pdf-lib stamps the current time, so two identical renders always differ by
 * those two strings and by nothing else.
 *
 * The no-artwork hash MUST differ. That composition is the whole point of the
 * work; if it matched, nothing was built.
 *
 * Usage: node scripts/verify/poster-parity.mjs
 * Exit 0 only when the artwork hash is identical AND the no-artwork hash moved.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The commit holding the pre-split renderer. */
const BEFORE_REF = process.env.POSTER_PARITY_REF || '96a5a22'
const TARGET = 'src/lib/broadcast/poster.ts'
const PARITY = 'docs/design/poster-composition/parity.json'
const WORK = join(tmpdir(), 'poster-parity')

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
}

function render(label) {
  run('npx', ['vitest', 'run', 'tests/unit/poster-parity.test.ts'])
  const parsed = JSON.parse(readFileSync(PARITY, 'utf8'))
  writeFileSync(join(WORK, `${label}.json`), JSON.stringify(parsed, null, 2))
  return parsed
}

mkdirSync(WORK, { recursive: true })

// Snapshot the working-tree file BEFORE swapping it, and restore from that
// snapshot rather than from git. `git checkout -- <file>` would discard any
// uncommitted edits, which is not a theoretical risk: an earlier version of
// this script silently reverted a fix that had just been made and not yet
// committed, and the only symptom was tests failing again for no visible
// reason.
const snapshot = readFileSync(TARGET, 'utf8')

let after
let before
try {
  console.log('\n[parity] 1/2 rendering on the working tree...')
  after = render('after')

  console.log(`\n[parity] 2/2 rendering against ${BEFORE_REF} (pre-split renderer)...`)
  const old = execFileSync('git', ['show', `${BEFORE_REF}:${TARGET}`], { encoding: 'utf8' })
  writeFileSync(TARGET, old)
  before = render('before')
} finally {
  // Always restore, even on a thrown render, so a failed proof never leaves the
  // old renderer sitting in the working tree.
  writeFileSync(TARGET, snapshot)
}

// Re-render so the PDFs left on disk are the CURRENT renderer's, not the old
// one's. They are opened and looked at by a human, so they must be the truth.
console.log('\n[parity] restoring current-renderer artefacts...')
render('after-restored')

const artworkIdentical = before.withArtwork.sha256 === after.withArtwork.sha256
const noArtworkChanged = before.noArtwork.sha256 !== after.noArtwork.sha256

console.log('\n---------------------------------------------------------')
console.log(`artwork identical: ${artworkIdentical}`)
console.log(`  before ${before.withArtwork.sha256} (${before.withArtwork.bytes} bytes)`)
console.log(`  after  ${after.withArtwork.sha256} (${after.withArtwork.bytes} bytes)`)
console.log(`no-artwork changed: ${noArtworkChanged}`)
console.log(`  before ${before.noArtwork.sha256} (${before.noArtwork.bytes} bytes)`)
console.log(`  after  ${after.noArtwork.sha256} (${after.noArtwork.bytes} bytes)`)
console.log('---------------------------------------------------------\n')

if (!artworkIdentical) {
  console.error('[parity] FAILED: the artwork path moved. The lift was not verbatim.')
  process.exit(1)
}
if (!noArtworkChanged) {
  console.error('[parity] FAILED: the no-artwork path is unchanged, so nothing was built.')
  process.exit(1)
}
console.log('[parity] PASS')
