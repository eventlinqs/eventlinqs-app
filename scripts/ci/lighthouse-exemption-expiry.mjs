// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * No exemption without a clock.
 *
 * A warn-level relaxation in lighthouserc.json is a promise to come back. In
 * practice nobody does, because a warn never fails anything and so never asks
 * to be revisited. Two such waivers (the homepage and /culture/*) had been
 * sitting at warn-level for months with a "restore when Issue #42 closes" note
 * and no mechanism to make that happen.
 *
 * This guard makes the clock real. Every assertMatrix entry that downgrades a
 * category to "warn" MUST carry an `_expiresOn` date (YYYY-MM-DD). The build
 * FAILS if:
 *   - a warn-level category assertion has no `_expiresOn`, or
 *   - the `_expiresOn` date has passed.
 *
 * Failing on expiry is the point. When the date arrives the team either fixes
 * the underlying issue and restores the assertion to error-level, or makes a
 * deliberate, dated decision to extend it. What it can no longer do is drift.
 *
 * Run: node scripts/ci/lighthouse-exemption-expiry.mjs
 * Override "today" for testing with LH_EXEMPTION_TODAY=YYYY-MM-DD.
 */

import fs from 'node:fs'
import path from 'node:path'

const CONFIG = path.join(process.cwd(), 'lighthouserc.json')
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))

const todayStr = process.env.LH_EXEMPTION_TODAY || new Date().toISOString().slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(todayStr)) {
  console.error(`Invalid LH_EXEMPTION_TODAY: ${todayStr}. Expected YYYY-MM-DD.`)
  process.exit(1)
}

const matrix = config?.ci?.assert?.assertMatrix ?? []
const failures = []
const active = []
const permanent = []

for (const entry of matrix) {
  const pattern = entry.matchingUrlPattern ?? '(no pattern)'

  // Which category assertions are downgraded to warn (or switched off)?
  const relaxed = Object.entries(entry.assertions ?? {})
    .filter(([name, value]) => {
      if (!name.startsWith('categories:')) return false
      if (value === 'off') return true
      return Array.isArray(value) && value[0] === 'warn'
    })
    .map(([name]) => name)

  if (!relaxed.length) continue

  const expires = entry._expiresOn

  // A PERMANENT exemption is a design decision, not a deferred fix, and giving
  // it an invented far-future date would be a lie told to this guard. It must
  // instead say so explicitly and carry a reason. Permanent exemptions are
  // reprinted on every run so they stay visible rather than forgotten, which is
  // the actual risk they carry.
  if (entry._permanent === true) {
    if (!entry._expiryReason) {
      failures.push(
        `NO REASON   ${pattern}\n` +
        `            declares _permanent: true but records no _expiryReason.\n` +
        `            A permanent exemption must justify itself in writing.`,
      )
    } else {
      permanent.push(`  ${pattern}  relaxes ${relaxed.join(', ')}  PERMANENT: ${entry._expiryReason}`)
    }
    continue
  }

  if (!expires) {
    failures.push(
      `NO EXPIRY   ${pattern}\n` +
      `            relaxes ${relaxed.join(', ')} but carries no _expiresOn.\n` +
      `            Every warn-level or disabled category assertion needs a date it\n` +
      `            comes back. Add "_expiresOn": "YYYY-MM-DD" and "_expiryReason".`,
    )
    continue
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    failures.push(`BAD EXPIRY  ${pattern}\n            _expiresOn "${expires}" is not YYYY-MM-DD.`)
    continue
  }

  // String comparison is correct and timezone-free for ISO dates.
  if (expires < todayStr) {
    failures.push(
      `EXPIRED     ${pattern}\n` +
      `            relaxes ${relaxed.join(', ')}\n` +
      `            _expiresOn ${expires}, today is ${todayStr}.\n` +
      `            Reason given: ${entry._expiryReason ?? '(none recorded)'}\n` +
      `            Either restore the assertion to error-level, or make a\n` +
      `            deliberate decision to extend the date and say why.`,
    )
  } else {
    active.push(`  ${pattern}  relaxes ${relaxed.join(', ')}  until ${expires}`)
  }
}

if (failures.length) {
  console.error('\nLIGHTHOUSE EXEMPTION EXPIRY FAILED\n')
  for (const f of failures) console.error(f + '\n')
  process.exit(1)
}

console.log(`lighthouse exemption expiry: OK (today ${todayStr})`)
if (permanent.length) {
  console.log('PERMANENT exemptions (design decisions, reviewed not expiring):')
  for (const p of permanent) console.log(p)
}
if (active.length) {
  console.log('active, dated exemptions:')
  for (const a of active) console.log(a)
} else {
  console.log('  no relaxations in force')
}
