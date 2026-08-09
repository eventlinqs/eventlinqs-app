/**
 * poster-parity.mjs - guards the poster renderer against ACCIDENTAL drift.
 *
 * ---------------------------------------------------------------------------
 * THE BASELINE MOVED ON 9 AUGUST 2026, ON A FOUNDER RULING. READ THIS BEFORE
 * TREATING A CHANGED HASH AS A REGRESSION.
 *
 * This proof originally compared the artwork poster against commit 96a5a22,
 * the pre-split renderer, because the condition on splitting poster.ts into two
 * compositions was that the artwork path must not move at all.
 *
 * The founder then ruled that the artwork path SHOULD move: its information
 * band sat at a flat 45% of the page whatever it held, so a short title left
 * about a third of it as empty navy, and that was the single thing standing
 * between the poster and a promoter forwarding it. The band now sizes itself to
 * its content and the photograph takes the space it does not need.
 *
 * So the artwork hashes below are DELIBERATELY different from 96a5a22. That was
 * authorised, it was rendered before and after and looked at, and the
 * no-artwork composition was proven not to move by a single byte in the same
 * pass (scripts/verify/poster-band-before-after.mjs: 6 artwork posters changed,
 * 0 no-artwork posters moved).
 *
 * What this proof does NOW is the job it was always meant to do afterwards:
 * hold the renderer still between deliberate decisions. A changed hash here
 * means somebody edited the renderer without intending to, which is exactly the
 * failure the original proof existed to catch.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node scripts/verify/poster-parity.mjs               check against baseline
 *   node scripts/verify/poster-parity.mjs --rebaseline  record a NEW baseline
 *
 * Re-baselining is a deliberate act and should accompany a deliberate change,
 * with the reason in the commit message.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const PARITY = 'docs/design/poster-composition/parity.json'
const BASELINE = 'docs/design/poster-composition/parity-baseline.json'
const REBASELINE = process.argv.includes('--rebaseline')

execFileSync('npx', ['vitest', 'run', 'tests/unit/poster-parity.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

const current = JSON.parse(readFileSync(PARITY, 'utf8'))

if (REBASELINE || !existsSync(BASELINE)) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        note: 'Baseline for the poster renderer. Moved 9 August 2026 on a founder ruling: the artwork band now sizes itself to its content. See the header of scripts/verify/poster-parity.mjs.',
        withArtwork: current.withArtwork,
        noArtwork: current.noArtwork,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`\n[parity] baseline written to ${BASELINE}`)
  console.log(`  withArtwork ${current.withArtwork.sha256}`)
  console.log(`  noArtwork   ${current.noArtwork.sha256}`)
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))

const artworkSame = baseline.withArtwork.sha256 === current.withArtwork.sha256
const noArtworkSame = baseline.noArtwork.sha256 === current.noArtwork.sha256

console.log('\n---------------------------------------------------------')
console.log(`artwork    ${artworkSame ? 'unchanged' : 'CHANGED'}`)
console.log(`  baseline ${baseline.withArtwork.sha256}`)
console.log(`  current  ${current.withArtwork.sha256}`)
console.log(`no-artwork ${noArtworkSame ? 'unchanged' : 'CHANGED'}`)
console.log(`  baseline ${baseline.noArtwork.sha256}`)
console.log(`  current  ${current.noArtwork.sha256}`)
console.log('---------------------------------------------------------\n')

if (!artworkSame || !noArtworkSame) {
  console.error('[parity] FAILED: the poster renderer moved.')
  console.error('  If this was DELIBERATE, render before and after, look at both,')
  console.error('  then re-run with --rebaseline and say why in the commit message.')
  process.exit(1)
}
console.log('[parity] PASS - the renderer is where it was left.')
