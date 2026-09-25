/**
 * THE CONSENT-LEDGER DATE TESTS, DRILLED RED.
 *
 * A test that has only ever been seen green proves nothing about the thing it
 * names. Each drill below puts the ledger back into a real broken state, runs
 * the affected test file, and requires the NAMED test to fail. Then it restores
 * from a byte snapshot taken before the mutation and verifies the restore is
 * byte-identical.
 *
 * THE SECOND DRILL IS THE ONE WORTH READING. It does not go back to UTC. It
 * applies a FIXED +10 hour offset, which is what a plausible wrong fix looks
 * like: it gets the measured case right, passes a test written only around that
 * case, and is still wrong for five months of every year, because Australian
 * eastern time is UTC+11 under daylight saving. The zone has to be NAMED.
 *
 * Run: node scripts/verify/lb-ledgerdate-test-drills.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const TEST = 'tests/unit/consent/ledger-dates-are-australian.test.ts'
const LEDGER = 'src/lib/consent/sentences.ts'

const DRILLS = [
  {
    name: 'the ledger goes back to assembling the date from UTC getters',
    file: LEDGER,
    find: '  return formatPlatformDateLong(iso)',
    replace:
      "  const M = ['January','February','March','April','May','June','July','August','September','October','November','December']\n" +
      '  return `${at.getUTCDate()} ${M[at.getUTCMonth()]} ${at.getUTCFullYear()}`',
    expect: 'shows the day it happened in Melbourne, not the day it was in London',
  },
  {
    name: 'the zone is guessed as a fixed +10 offset rather than named',
    file: LEDGER,
    find: '  return formatPlatformDateLong(iso)',
    replace:
      "  const M = ['January','February','March','April','May','June','July','August','September','October','November','December']\n" +
      '  const shifted = new Date(at.getTime() + 10 * 60 * 60 * 1000)\n' +
      '  return `${shifted.getUTCDate()} ${M[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()}`',
    expect: 'is right through daylight saving, when the offset is UTC+11',
  },
  {
    name: 'the date is shifted unconditionally, which breaks the days that were already right',
    file: LEDGER,
    find: '  return formatPlatformDateLong(iso)',
    replace:
      '  const next = new Date(at.getTime() + 24 * 60 * 60 * 1000)\n' +
      '  return formatPlatformDateLong(next.toISOString())',
    expect: 'does not move a date that was already the same in both zones',
  },
  {
    name: 'the sentence builds its own date instead of using the corrected one',
    file: LEDGER,
    find: '  const when = readableDate(row.occurredAt)',
    replace: '  const when = new Date(row.occurredAt).toISOString().slice(0, 10)',
    expect: 'carries the corrected date into the sentence the person actually reads',
  },
  {
    name: 'a malformed date starts echoing the raw input back at a member of the public',
    file: LEDGER,
    find: "  if (Number.isNaN(at.getTime())) return 'an unrecorded date'",
    replace: '',
    expect: 'still answers a malformed date in words rather than echoing the input',
  },
]

function runTest() {
  try {
    const out = execFileSync('npx', ['vitest', 'run', TEST, '--reporter=verbose'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
    return { ok: true, out }
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

let fired = 0
const problems = []

console.log('=== LB-LEDGERDATE: the tests, drilled red ===\n')

for (const drill of DRILLS) {
  const before = readFileSync(drill.file)
  const text = before.toString('utf8')

  if (!text.includes(drill.find)) {
    problems.push(`STALE: ${drill.name}: the anchor is no longer in ${drill.file}`)
    console.log(`  STALE             ${drill.name}`)
    continue
  }

  writeFileSync(drill.file, text.replace(drill.find, drill.replace))
  let verdict
  try {
    const result = runTest()
    if (result.ok) {
      verdict = 'DID NOT FAIL'
      problems.push(`${drill.name}: the suite stayed green with the defect in place`)
    } else if (!result.out.includes(drill.expect)) {
      verdict = 'WRONG TEST'
      problems.push(
        `${drill.name}: tests failed, but "${drill.expect}" was not among them. The drill may be ` +
          'breaking something other than the thing it names.',
      )
    } else {
      verdict = 'FAILS AS EXPECTED'
      fired += 1
    }
  } finally {
    writeFileSync(drill.file, before)
    if (Buffer.compare(before, readFileSync(drill.file)) !== 0) {
      problems.push(`RESTORE FAILED for ${drill.file}. The tree is dirty and must be checked by hand.`)
    }
  }
  console.log(`  ${verdict.padEnd(18)}${drill.name}`)
}

console.log('')
console.log(`=== ${fired}/${DRILLS.length} drills fired correctly ===`)

const restored = runTest()
console.log(`  restored: ${restored.ok ? 'GREEN' : 'STILL RED'}`)
if (!restored.ok) problems.push(`${TEST} does not pass on the restored tree`)

if (problems.length > 0) {
  console.error('')
  for (const p of problems) console.error(`  PROBLEM: ${p}`)
  process.exit(1)
}

console.log('\nEvery drill fired and the tree is byte-identical to where it started.')
