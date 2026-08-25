/**
 * Regenerates or verifies the derived fee figures in docs/PRICING.md.
 *
 *   node scripts/pricing-derive.mjs --write   rewrite the derived block
 *   node scripts/pricing-derive.mjs --check   fail if it is out of date
 *
 * `--check` is what runs in the guard suite. See scripts/lib/pricing-derive.mjs
 * for why the worked examples are computed rather than written down.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  parseLockedValues,
  renderDerived,
  readDoc,
  spliceDerived,
  currentDerived,
} from './lib/pricing-derive.mjs'
import { declareWork } from './lib/work-report.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = 'docs/PRICING.md'
const write = process.argv.includes('--write')

const locked = parseLockedValues(ROOT)
const rendered = renderDerived(locked)
const text = readDoc(ROOT)
const current = currentDerived(text)

if (current === null) {
  console.error(`[pricing-derive] FAIL - ${DOC} has no PRICING-DERIVED block.`)
  process.exit(1)
}

if (write) {
  fs.writeFileSync(path.join(ROOT, DOC), spliceDerived(text, rendered), 'utf8')
  console.log(`[pricing-derive] wrote the derived block into ${DOC}.`)
  process.exit(0)
}

if (current.trim() !== rendered.trim()) {
  console.error(
    `\n[pricing-derive] FAIL - the worked figures in ${DOC} do not match the` +
      ' PRICING-LOCK block they are supposed to be derived from.\n' +
      '\n    The lock block is the single source of the fee. Every worked example,' +
      '\n    every all-in total and the margin table are COMPUTED from it, so this' +
      '\n    failure means the document is asserting a fee the platform does not' +
      '\n    charge. That is exactly how the deleted processing fee survived in' +
      '\n    prose for as long as it did.\n' +
      '\n    Fix it by regenerating, never by editing the text:' +
      '\n        node scripts/pricing-derive.mjs --write\n',
  )
  process.exit(1)
}

declareWork('pricing-derive', {
  did: { 'derived line recomputed from the lock block': rendered.trim().split(String.fromCharCode(10)).length },
  found: { 'line disagreeing with the lock block': 0 },
})
console.log(
  `[pricing-derive] PASS - the worked figures in ${DOC} match the lock block` +
    ` (${locked.platform_fee_percentage}% + ${locked.platform_fee_fixed}c, one fee).`,
)
