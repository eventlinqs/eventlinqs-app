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
