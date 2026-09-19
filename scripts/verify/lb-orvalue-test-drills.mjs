/**
 * THE POSTGREST `or()` ESCAPE TESTS, DRILLED RED.
 *
 * A test that has only ever been seen green proves nothing about the thing it
 * names. Each drill below puts the escape back into a real broken state, runs
 * the test file, and requires the NAMED test to fail. Then it restores from a
 * byte snapshot taken before the mutation and verifies the restore is
 * byte-identical.
 *
 * THE SECOND DRILL IS THE ONE WORTH READING. It does not remove the escaping.
 * It reverses the ORDER of the two replacements, escaping the quote before the
 * backslash, which looks identical at a glance and is wrong: the backslash
 * added in front of a quote is then itself doubled, so the quoting ends in the
 * wrong place and the value can close its own quotes. Every simple input still
 * passes.
 *
 * NO LITERAL BACKSLASH APPEARS IN THIS FILE. A drill anchor carrying one is the
 * exact shape the drill harness has lost twice to escaping, so the broken
 * implementations below are built from String.fromCharCode.
 *
 * Run: node scripts/verify/lb-orvalue-test-drills.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const TEST = 'tests/unit/supabase/or-filter.test.ts'
const DOOR = 'src/lib/supabase/or-filter.ts'
const TARGETS = 'src/app/admin/(authed)/pricing/targets/route.ts'

const SIGNATURE = 'export function escapeOrValue(value: string): string {'
/** Quote first, backslash second: the plausible wrong order. */
const WRONG_ORDER =
  SIGNATURE +
  ' const B = String.fromCharCode(92); const Q = String.fromCharCode(34);' +
  ' return Q + value.split(Q).join(B + Q).split(B).join(B + B) + Q; }' +
  ' function unusedEscapeOrValue(value: string): string {'

const DRILLS = [
  {
    name: 'the escape stops quoting and hands the value back as typed',
    file: DOOR,
    find: SIGNATURE,
    replace: SIGNATURE + ' return value;' + ' } function unusedEscapeOrValue(value: string): string {',
    expect: 'wraps the value in quotes',
  },
  {
    name: 'the escape runs its two replacements in the wrong order',
    file: DOOR,
    find: SIGNATURE,
    replace: WRONG_ORDER,
    expect: 'escapes a backslash BEFORE a quote',
  },
  {
    name: 'ilikeAnyOf stops escaping and interpolates the term raw',
    file: DOOR,
    find: 'const value = escapeOrValue(`%${term}%`)',
    replace: 'const value = `%${term}%`',
    expect: 'still produces exactly one clause per column',
  },
  {
    name: 'the fee-override picker goes back to interpolating a raw search term',
    file: TARGETS,
    find: ".or(ilikeAnyOf(['title', 'slug'], q))",
    replace: '.or(`title.ilike.${term},slug.ilike.${term}`)',
    expect: 'sends one clause per column, with the comma inside the value',
  },
]

function runTest() {
  try {
    const out = execFileSync('npx', ['vitest', 'run', TEST, '--project', 'node', '--reporter=verbose'], {
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

console.log('=== LB-ORVALUE: the tests, drilled red ===\n')

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
