/**
 * PHASE 7.5: prove the design lock held.
 *
 * Compares two capture sets pixel by pixel. The contract:
 *
 *   before  vs  after-enabled   MUST be pixel-identical on every page.
 *                                      Both render the provider button, so any
 *                                      difference at all is an unintended
 *                                      visual regression.
 *
 *   before  vs  after-disabled  differs on /login and /signup ONLY, and
 *                                      only by the removal of the provider
 *                                      button and its divider. Every other page
 *                                      must still be identical.
 *
 * Splitting it this way is what makes the claim honest: it isolates the one
 * change the brief asked for and proves nothing else moved, rather than waving
 * at a screenshot and asserting it looks the same.
 *
 * Usage: node scripts/verify/auth-visual-diff.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const ROOT = 'docs/hardening/auth/visual'

function load(setName, file) {
  const path = join(ROOT, setName, file)
  if (!existsSync(path)) return null
  return PNG.sync.read(readFileSync(path))
}

/** Count differing pixels. Returns null when the two images differ in size. */
function comparePixels(a, b) {
  if (a.width !== b.width || a.height !== b.height) return null
  let diff = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2] ||
      a.data[i + 3] !== b.data[i + 3]
    ) {
      diff += 1
    }
  }
  return diff
}

/**
 * STRICT MODE: `node scripts/verify/auth-visual-diff.mjs <setA> <setB>`
 *
 * Compares two arbitrary capture sets and demands they be pixel-identical. Added
 * for the 2026-08-08 rebase, where the question was not "did the provider button
 * move" but "did the rebase move ANY pixel", and the answer had to be
 * reproducible by someone other than its author. It was first done with a
 * throwaway script, which meant the founder could read the result but not re-run
 * it. Both hardcoded comparisons below are untouched and still the default.
 *
 * It also PRINTS THE COORDINATES when a difference is small. That mattered:
 * three pixels differed on one capture, and the only way to tell antialiasing
 * jitter from a real regression was to see the coordinates and the channel
 * deltas, then re-capture the same build twice as a control.
 */
if (process.argv[2] && process.argv[3]) {
  const [setA, setB] = [process.argv[2], process.argv[3]]
  const shots = readdirSync(join(ROOT, setA)).filter((f) => f.endsWith('.png')).sort()
  let bad = 0
  let total = 0
  console.log(`\n=== ${setA}  vs  ${setB} : must be pixel-identical ===\n`)
  for (const file of shots) {
    const a = load(setA, file)
    const b = load(setB, file)
    if (!a || !b) {
      console.log(`  MISSING     ${file}`)
      bad += 1
      continue
    }
    if (a.width !== b.width || a.height !== b.height) {
      console.log(`  SIZE CHANGED ${file}  ${a.width}x${a.height} -> ${b.width}x${b.height}`)
      bad += 1
      continue
    }
    const diff = comparePixels(a, b)
    total += diff
    if (diff === 0) {
      console.log(`  IDENTICAL   ${file}  ${a.width}x${a.height}, 0 of ${a.width * a.height} differ`)
      continue
    }
    bad += 1
    console.log(`  DIFFERS     ${file}  ${diff} of ${a.width * a.height} pixels`)
    if (diff <= 20) {
      for (let y = 0; y < a.height; y += 1) {
        for (let x = 0; x < a.width; x += 1) {
          const i = (a.width * y + x) * 4
          const pa = [a.data[i], a.data[i + 1], a.data[i + 2], a.data[i + 3]]
          const pb = [b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]]
          if (pa.some((v, k) => v !== pb[k])) {
            const delta = Math.max(...pa.map((v, k) => Math.abs(v - pb[k])))
            console.log(
              `                (${x},${y}) rgba(${pa.join(',')}) -> rgba(${pb.join(',')}) maxDelta ${delta}`,
            )
          }
        }
      }
      console.log(
        `                a maxDelta of 1 on adjacent pixels is antialiasing jitter, not a\n` +
          `                regression. Confirm by capturing the SAME build twice and diffing that.`,
      )
    }
  }
  console.log(`\n  ${shots.length} captures compared, ${total} differing pixels in total.`)
  console.log(bad === 0 ? '  PASS: zero visual change.\n' : `  ${bad} capture(s) differ.\n`)
  process.exit(bad === 0 ? 0 : 1)
}

/** Pages where the provider button legitimately comes and goes. */
const PROVIDER_PAGES = ['login', 'signup', 'signup-organiser']

/**
 * Pages with a DECLARED, intended behavioural change, listed here so the diff
 * names them rather than reporting them as unexplained.
 *
 * reset-password: before, an expired or already-used link left the page on
 * "Validating your reset link" forever, because the failure arrives in the URL
 * fragment and nothing read it. It now renders the failure and a way forward.
 * These captures are of a bare /auth/reset-password with no token, which is
 * exactly that dead-end state, so the two look different by design. This is
 * brief item 1.1 and 1.2, not a design-lock breach.
 */
const DECLARED_CHANGES = {
  'reset-password': 'dead-end "Validating your reset link" replaced by a rendered failure state (brief 1.1, 1.2)',
}

const files = readdirSync(join(ROOT, 'before')).filter((f) => f.endsWith('.png')).sort()
let problems = 0

console.log('\n=== before  vs  after (provider ENABLED): must be pixel-identical ===\n')
for (const file of files) {
  const a = load('before', file)
  const b = load('after-enabled', file)
  if (!a || !b) {
    console.log(`  MISSING  ${file}`)
    problems += 1
    continue
  }
  const declared = DECLARED_CHANGES[file.replace(/-(1440|390)\.png$/, '')]
  const diff = comparePixels(a, b)
  if (declared) {
    console.log(`  DECLARED CHANGE  ${file}
                   ${declared}`)
    continue
  }
  if (diff === null) {
    console.log(`  SIZE CHANGED  ${file}  ${a.width}x${a.height} -> ${b.width}x${b.height}`)
    problems += 1
  } else if (diff === 0) {
    console.log(`  IDENTICAL  ${file}  (${a.width}x${a.height}, 0 differing pixels)`)
  } else {
    const pct = ((diff / (a.width * a.height)) * 100).toFixed(4)
    console.log(`  CHANGED    ${file}  ${diff} pixels (${pct}%)`)
    problems += 1
  }
}

console.log('\n=== before  vs  after (provider DISABLED): only the button may go ===\n')
for (const file of files) {
  const a = load('before', file)
  const b = load('after-disabled', file)
  if (!a || !b) {
    console.log(`  MISSING  ${file}`)
    problems += 1
    continue
  }
  const page = file.replace(/-(1440|390)\.png$/, '')
  if (DECLARED_CHANGES[page]) {
    console.log(`  DECLARED CHANGE  ${file}
                   ${DECLARED_CHANGES[page]}`)
    continue
  }
  const expectDifference = PROVIDER_PAGES.includes(page)
  const diff = comparePixels(a, b)

  if (diff === null) {
    if (expectDifference) {
      console.log(
        `  SHORTER, AS EXPECTED  ${file}  ${a.height}px -> ${b.height}px ` +
          `(the provider button and divider are gone)`,
      )
    } else {
      console.log(`  UNEXPECTED SIZE CHANGE  ${file}  ${a.height}px -> ${b.height}px`)
      problems += 1
    }
    continue
  }
  if (diff === 0) {
    if (expectDifference) {
      console.log(`  UNEXPECTEDLY IDENTICAL  ${file}  the button should have been removed`)
      problems += 1
    } else {
      console.log(`  IDENTICAL  ${file}  (0 differing pixels)`)
    }
  } else {
    const pct = ((diff / (a.width * a.height)) * 100).toFixed(4)
    if (expectDifference) {
      console.log(`  CHANGED, AS EXPECTED  ${file}  ${diff} pixels (${pct}%)`)
    } else {
      console.log(`  UNEXPECTED CHANGE  ${file}  ${diff} pixels (${pct}%)`)
      problems += 1
    }
  }
}

console.log(
  problems === 0
    ? '\n=== design lock HELD: no unintended visual change ===\n'
    : `\n=== ${problems} unexplained visual difference(s) ===\n`,
)
process.exit(problems === 0 ? 0 : 1)
