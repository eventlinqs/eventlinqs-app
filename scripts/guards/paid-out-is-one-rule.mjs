/**
 * PAID OUT IS ONE RULE (V3 item 8, the ledger; WINDOW 4's class of 1 November 2026, 06:40).
 *
 * A payout claim that fails is voided by a compensating +adjustment (reference_type 'payout'), and a transfer pulled
 * back for a refund by a +adjustment marked reversal_of_transfer. Three readers summed reason 'payout' alone and never
 * netted those (the organiser money summary, the admin venue ledger and the venue dashboard), so MKLStudios' 448
 * voided hourly claims read as about A$22,019 paid out when A$54.00 was.
 *
 * What a ledger row says about money paid out is decided in src/lib/payouts/paid-out.ts (paidOutCents) and nowhere
 * else. This fails the build where src/ judges a 'payout' row by hand: a comparison of reason with 'payout', a filter
 * on reason 'payout', or a reason list made only of 'payout'. Comments are stripped first.
 *
 * WHAT THIS CANNOT SEE, said so it is not mistaken for coverage: SQL. The ledger's own SQL (the available balance,
 * disburse_transfer) sums every delta, so a void nets there by arithmetic; a SQL reader that ever reports paid out on
 * its own nets voids itself and is named here. scripts/verify/money-b7-proof.mjs keeps an independent second reading.
 *
 * Run: node scripts/guards/paid-out-is-one-rule.mjs
 */
import { relative, resolve } from 'node:path'
import { readSource, sourceFiles } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[paid-out-is-one-rule]'
const ROOT = process.cwd()
const THE_RULE = 'src/lib/payouts/paid-out.ts'
const BY_HAND = [
  { re: /reason\s*[!=]==?\s*['"`]payout['"`]/g, what: "compares reason with 'payout'" },
  { re: /['"`]payout['"`]\s*[!=]==?\s*[\w.?]*reason\b/g, what: "compares 'payout' with reason" },
  { re: /['"`]reason['"`]\s*,\s*['"`]payout['"`]/g, what: "filters ledger rows on reason 'payout'" },
  { re: /\[\s*['"`]payout['"`]\s*\]/g, what: "keeps a reason list of 'payout' alone" },
]

const files = sourceFiles(ROOT)
const failures = []
let ruleSeen = false
for (const file of files) {
  const rel = relative(ROOT, resolve(ROOT, file)).split('\\').join('/')
  if (rel === THE_RULE) { ruleSeen = true; continue }
  const code = readSource(resolve(ROOT, file)).withStrings
  for (const { re, what } of BY_HAND) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code)) !== null) {
      const line = code.slice(0, m.index).split('\n').length
      failures.push(`${rel}:${line} ${what}. A void or a reversal would read as paid; use paidOutCents from ${THE_RULE}.`)
    }
  }
}
if (!ruleSeen) failures.push(`${THE_RULE} is missing: the one rule for paid out is gone.`)

declareWork('paid-out-is-one-rule', {
  did: { 'source file': files.length },
  found: { failure: failures.length },
})
if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${failures.length} place(s) judge a payout row by hand.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${files.length} source files; paid out is decided only in ${THE_RULE}.`)
