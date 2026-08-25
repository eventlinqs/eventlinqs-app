// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * PRINT WHAT THE GATE IS ACTUALLY JUDGING, ON EVERY RUN.
 *
 * LHCI prints run values only when an assertion FAILS. On a pass it prints
 * nothing, so the only number anyone ever sees is a single figure with no
 * indication of how it was derived. On 2026-08-05 that produced hours of wasted
 * work: CI reported "found 0.74" from values 0.72, 0.74, 0.71, the 0.74 was read
 * as a median when it is the maximum, and a regression was chased on a branch
 * that had changed zero bytes of runtime code on the failing route.
 *
 * This runs after `lhci collect` and before `lhci assert`, and prints for every
 * gated URL: all run scores, the value the category floor will actually use, and
 * the median alongside it for contrast. A future reader cannot mistake one
 * number for the other, because both are on the page.
 *
 * It NEVER fails the build. It is a reporter, not a gate; the gate is `lhci
 * assert`, and this must not be able to mask or pre-empt it.
 *
 * Run: node scripts/ci/lighthouse-aggregation-report.mjs [lighthouseciDir]
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const dir = process.argv[2] || '.lighthouseci'

if (!existsSync(dir)) {
  console.log(`[lh-aggregation] no ${dir} directory; nothing collected, nothing to report.`)
  process.exit(0)
}

const files = readdirSync(dir).filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
if (files.length === 0) {
  console.log(`[lh-aggregation] no lhr-*.json in ${dir}.`)
  process.exit(0)
}

// The declared contract, so this report and the config can never disagree about
// what the gate does. tests/unit/ci/lighthouse-aggregation-contract.test.ts
// binds the config to its own prose; this binds the printout to the config.
let categoryMethod = 'optimistic'
try {
  const rc = JSON.parse(readFileSync('lighthouserc.json', 'utf8'))
  categoryMethod = rc?.ci?.assert?._aggregationContract?.categoryFloors ?? categoryMethod
} catch (error) {
  console.warn('[scripts/ci/lighthouse-aggregation-report:49]', error instanceof Error ? error.message : error)
  // Fall back to the LHCI default rather than guessing something friendlier.
}

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

const byUrl = new Map()
for (const file of files) {
  let lhr
  try {
    lhr = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  } catch (error) {
    console.warn('[scripts/ci/lighthouse-aggregation-report:61]', error instanceof Error ? error.message : error)
    continue
  }
  const url = lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || '(unknown)'
  if (!byUrl.has(url)) byUrl.set(url, [])
  byUrl.get(url).push(lhr)
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor((sorted.length - 1) / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid] + sorted[mid + 1]) / 2
}

/**
 * What LHCI will use for a minScore assertion under the configured method.
 * Mirrors getValueForAggregationMethod in @lhci/utils/src/assertions.js:
 * under 'optimistic', a 'min'-prefixed assertion resolves to Math.max.
 */
const gateValueForMinScore = (values, method) => {
  if (method === 'median') return median(values)
  if (method === 'pessimistic') return Math.min(...values)
  return Math.max(...values)
}

console.log('')
console.log('='.repeat(78))
console.log('LIGHTHOUSE AGGREGATION REPORT')
console.log('='.repeat(78))
console.log(`Category floors aggregate with: ${categoryMethod.toUpperCase()}`)
if (categoryMethod === 'optimistic') {
  console.log('For a minScore assertion, optimistic means Math.max: THE BEST RUN.')
  console.log('The median is printed beside it for contrast. They are NOT the same number.')
} else if (categoryMethod === 'median') {
  console.log('For a minScore assertion, median means the middle run.')
}
console.log('')

for (const [url, lhrs] of [...byUrl.entries()].sort()) {
  let path
  try {
    path = new URL(url).pathname
  } catch {
    path = url
  }
  console.log(`${path}   (${lhrs.length} run${lhrs.length === 1 ? '' : 's'})`)

  for (const category of CATEGORIES) {
    const values = lhrs
      .map((l) => l.categories?.[category]?.score)
      .filter((v) => typeof v === 'number')
    if (values.length === 0) {
      console.log(`  ${category.padEnd(15)} no score in any run`)
      continue
    }
    const gateValue = gateValueForMinScore(values, categoryMethod)
    const med = median(values)
    const all = values.map((v) => v.toFixed(2)).join(', ')
    const flag = Math.abs(gateValue - med) > 0.001 ? '   <-- gate value differs from median' : ''
    console.log(
      `  ${category.padEnd(15)} gate uses ${gateValue.toFixed(2)}   median ${med.toFixed(2)}   ` +
        `all runs: ${all}${flag}`,
    )
  }
  console.log('')
}

declareWork('lh-aggregation', {
  did: { 'lhr file read': files.length, 'URL reported': byUrl.size },
})
console.log('='.repeat(78))
console.log('This is a REPORT, not a gate. `lhci assert` decides pass or fail.')
console.log('='.repeat(78))
console.log('')
