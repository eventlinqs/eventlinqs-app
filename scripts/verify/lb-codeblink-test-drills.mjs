/**
 * LB-CODEBLINK. THE RED HALF OF THE UNIT TESTS.
 *
 * A test that has never been seen to fail is a test nobody has checked. This
 * plants each of the SEVEN defects that were actually live back into the tree,
 * one at a time, runs ONLY the LB-CODEBLINK test file, and asserts it goes RED
 * with the expected assertion named in the output. The tree is restored in a
 * finally whether the run passes, fails or throws.
 *
 * FOUR ON THE BUYER SIDE and three on the organiser side. The organiser three
 * are the same defect pointed at the other user: a read whose error was
 * discarded, whose empty answer became "Event not found" or "Discount code not
 * found", plus a delete refusal that counted confirmed uses and not held ones,
 * so a code a buyer was holding mid-checkout could be deleted out from under
 * them.
 *
 * WHY THE EXPECTED TEXT IS CHECKED AND NOT ONLY THE EXIT CODE. A file that goes
 * red for an unrelated reason, or that fails to COLLECT at all, also exits
 * non-zero. Naming the assertion that must appear is what separates "the tests
 * caught it" from "something broke".
 *
 * RUN IT:
 *   node scripts/verify/lb-codeblink-test-drills.mjs
 *
 * IT MUTATES src/ FOR THE LENGTH OF THE RUN. Three lanes share this machine, so
 * it is quick and it restores in a finally, exactly as
 * scripts/verify/guard-failure-drills.mjs does.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TEST = 'tests/unit/pricing/a-discount-code-a-buyer-can-actually-use.test.ts'
const READER = 'src/lib/pricing/discount-validation.ts'
const ACTION = 'src/app/actions/discount-codes.ts'

const EVIDENCE = 'C:/dev/EVIDENCE/LB-CODEBLINK'
mkdirSync(EVIDENCE, { recursive: true })
const LOG = join(EVIDENCE, 'test-drills.txt')
writeFileSync(LOG, '')
function log(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

const DRILLS = [
  {
    name: 'the per-user cap discards its error again (the read that failed OPEN)',
    file: READER,
    find: '    const spend = (await withBuildRetry(',
    replace: [
      '    const spend = { error: null, count: (await (supabase',
      "      .from('discount_code_usages')",
      "      .select('*', { count: 'exact', head: true })",
      "      .eq('discount_code_id', dc.id)",
      "      .eq('user_id', user_id) as unknown as Promise<{ count: number | null }>)).count }",
      '    const unusedSpend = (await withBuildRetry(',
    ].join('\n'),
    expect: 'a blinked cap read refuses rather than granting the spent discount again',
  },
  {
    name: 'the code lookup collapses a failed read into Invalid discount code again',
    file: READER,
    find: '  if (error) {',
    replace: '  if (false as boolean) {',
    expect: 'a blinked lookup does not call a live code invalid',
  },
  {
    name: 'the action believes the browser about who the buyer is',
    file: ACTION,
    find: '    user_id: user?.id ?? null,',
    replace: '    user_id: _ignored_user_id,',
    expect: 'hands the reader the service-role client and the SESSION user',
  },
  {
    name: 'the action hands the reader the session client again (every code dead)',
    file: ACTION,
    find: '  return validateDiscountCodeWith(createAdminClient(), {',
    replace: '  return validateDiscountCodeWith(session, {',
    expect: 'hands the reader the service-role client and the SESSION user',
  },
  {
    name: 'the update lookup tells an organiser their own code is not there (organiser side)',
    file: ACTION,
    find: "    console.error('[discount-codes] could not read the code before updating it:', dcError)",
    replace: "    return { error: 'Discount code not found' }",
    expect: 'a blinked read never tells an organiser their own code is not there',
  },
  {
    name: 'the create lookup tells an organiser their own event does not exist',
    file: ACTION,
    find: "    console.error('[discount-codes] could not read the event, so no verdict is given about it:', eventError)",
    replace: "    return { error: 'Event not found' }",
    expect: 'a blinked read never tells an organiser their own event does not exist',
  },
  {
    name: 'the delete refusal counts confirmed uses only, so a HELD code can be deleted',
    file: ACTION,
    find: '  if ((dc.current_uses ?? 0) + (dc.reserved_uses ?? 0) > 0) {',
    replace: '  if ((dc.current_uses ?? 0) > 0) {',
    expect: 'a code a buyer is HOLDING right now cannot be deleted',
  },
]

function runTests() {
  try {
    const out = execFileSync(
      process.execPath,
      [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', TEST],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return { code: 0, out }
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}\n${err.stderr ?? ''}` }
  }
}

let fired = 0
const problems = []

log(`LB-CODEBLINK test drills, ${new Date().toISOString()}`)
log(`Each drill plants a defect that was LIVE, runs ${TEST}, and restores the file.`)
log('')

for (const drill of DRILLS) {
  const path = join(ROOT, drill.file)
  const original = readFileSync(path, 'utf8')
  if (!original.includes(drill.find)) {
    problems.push(`${drill.name}: anchor text not found in ${drill.file}. The drill is stale.`)
    log(`  STALE  ${drill.name}`)
    continue
  }
  try {
    writeFileSync(path, original.replace(drill.find, drill.replace))
    const { code, out } = runTests()
    if (code === 0) {
      problems.push(`${drill.name}: the tests PASSED on a tree carrying the defect. They are not guarding it.`)
      log(`  DID NOT FAIL  ${drill.name}`)
      continue
    }
    if (!out.includes(drill.expect)) {
      problems.push(
        `${drill.name}: the tests went red, but not on "${drill.expect}". Red for another reason is not proof.`,
      )
      log(`  RED FOR THE WRONG REASON  ${drill.name}`)
      continue
    }
    fired += 1
    log(`  RED AS EXPECTED  ${drill.name}`)
    log(`      caught by: ${drill.expect}`)
  } finally {
    writeFileSync(path, original)
  }
}

log('')
const clean = runTests()
if (clean.code !== 0) {
  problems.push('the restored tree does not pass. The drills did not put something back.')
  log('  THE RESTORED TREE IS RED')
} else {
  log('  the restored tree is GREEN again')
}

log('')
log(`=== ${fired}/${DRILLS.length} test drills fired correctly ===`)
for (const p of problems) log(`  PROBLEM: ${p}`)
if (problems.length) process.exit(1)
