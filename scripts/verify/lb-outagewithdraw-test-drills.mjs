/**
 * LB-OUTAGEWITHDRAW. THE RED HALF OF THE UNIT TESTS.
 *
 * A test that has never been seen to fail is a test nobody has checked. This
 * plants each defect that was actually LIVE back into the tree, one at a time,
 * runs ONLY the LB-OUTAGEWITHDRAW test file, and asserts it goes RED with the
 * expected assertion named in the output. The tree is restored in a finally
 * whether the run passes, fails or throws.
 *
 * FIVE PLANTINGS OF THE LIVE DEFECT and two of the mistake a careless fix makes.
 * The second pair matters more than it looks: the obvious way to stop an outage
 * being written down is to stop writing anything, and that silently deletes a
 * real rule (a genuine decline IS evidence that the question was put and
 * answered, and it is the denominator of the opt-in rate GA1 is measured on).
 * A fix that passes the first four and fails the last two is a regression
 * wearing a fix's clothes.
 *
 * WHY THE EXPECTED TEXT IS CHECKED AND NOT ONLY THE EXIT CODE. A file that goes
 * red for an unrelated reason, or that fails to COLLECT at all, also exits
 * non-zero. Naming the assertion that must appear is what separates "the tests
 * caught it" from "something broke".
 *
 * RUN IT:
 *   node scripts/verify/lb-outagewithdraw-test-drills.mjs
 *
 * IT MUTATES src/ FOR THE LENGTH OF THE RUN. Three lanes share this machine, so
 * it is quick and it restores in a finally, exactly as
 * scripts/verify/guard-failure-drills.mjs does.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TEST = 'tests/unit/consent/an-outage-is-not-a-withdrawal.test.ts'
const ANSWER = 'src/lib/consent/checkout-answer.ts'
const RECORD = 'src/lib/consent/record.ts'
const RESOLVER = 'src/lib/consent/resolver.ts'
const CITY = 'src/lib/consent/digest-city.ts'
const SENTENCES = 'src/lib/consent/sentences.ts'

const EVIDENCE = 'C:/dev/EVIDENCE/LB-OUTAGEWITHDRAW'
mkdirSync(EVIDENCE, { recursive: true })
const LOG = join(EVIDENCE, 'test-drills.txt')
writeFileSync(LOG, '')
function log(line) {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

const DRILLS = [
  {
    /*
     * THE LIVE DEFECT, restored exactly: an untouched checkbox over an
     * unreadable ledger takes the decline branch, and the ledger's
     * latest-event rule revokes a live consent that cannot be restored.
     */
    name: 'the checkout answer writes a decline over an unreadable ledger again',
    file: ANSWER,
    find: '    if (!live.ledgerWasRead) {',
    replace: '    if (false) {',
    expect: 'writes NOTHING when the ledger could not be read',
  },
  {
    name: 'the second call site writes a decline over an unreadable ledger again',
    file: RECORD,
    find: '    if (!live.ledgerWasRead) return false',
    replace: '    if (false) return false',
    expect: 'writes NOTHING when the ledger could not be read',
  },
  {
    /*
     * THE DISTINCTION ITSELF. With the resolver reporting a blinked read as a
     * decided answer, both call sites behave exactly as they did before the
     * fix, and no change at either of them would help.
     */
    name: 'the resolver calls an unreadable ledger a decided answer',
    file: RESOLVER,
    find: "      reason: 'the consent ledger could not be read, so the message is refused',\n      decidingEventId: null,\n      ledgerWasRead: false,",
    replace: "      reason: 'the consent ledger could not be read, so the message is refused',\n      decidingEventId: null,\n      ledgerWasRead: true,",
    expect: 'reports the ledger as UNREAD when a read gives up',
  },
  {
    /*
     * THE CITY, restored to the shape that filed somebody who chose Geelong as
     * having chosen nowhere: one read, no retry, error discarded.
     */
    name: 'the cookie city goes back to one read with its error discarded',
    file: CITY,
    find: "      const city = await readOrThrow('the digest consent city, chosen', () =>\n        adminClient.from('cities').select('slug').eq('slug', cookieCity).maybeSingle(),\n      )\n      if (city?.slug) return { city: city.slug, unresolved: false }",
    replace: "      const { data: city } = await adminClient.from('cities').select('slug').eq('slug', cookieCity).maybeSingle()\n      if (city?.slug) return { city: city.slug, unresolved: false }",
    expect: 'keeps that city when the cities table cannot be read',
  },
  {
    /*
     * THE CARELESS FIX, HALF ONE. Refusing to write anything when the ledger is
     * unreadable is the fix; refusing to write anything at all deletes a real
     * rule. A decline is evidence the question was put and answered.
     */
    name: 'the fix over-reaches and stops recording genuine declines',
    file: ANSWER,
    find: '    const ok = await recordConsentEvent(admin, {\n      ...consentFieldsFromWording(wording),\n      email: params.email,\n      decision: \'declined\',',
    replace: '    const ok = false && await recordConsentEvent(admin, {\n      ...consentFieldsFromWording(wording),\n      email: params.email,\n      decision: \'declined\',',
    expect: 'still records a genuine decline',
  },
  {
    /*
     * THE CARELESS FIX, HALF TWO. The other over-reach is to treat an
     * unresolved city as a reason not to write the GRANT. Losing a consent
     * somebody gave is worse than scoping it to nowhere, and it is the exact
     * fear the guard exception used to rest on, so it is pinned.
     */
    name: 'the fix over-reaches and drops a grant whose city could not be read',
    file: ANSWER,
    find: '      if (!ok) return { recorded: \'none\', reason: \'the grant could not be written\' }',
    replace: '      if (!ok || city.unresolved) return { recorded: \'none\', reason: \'the grant could not be written\' }',
    expect: 'records the grant even when the city could not be read',
  },
  {
    /*
     * THE SENTENCE THE PERSON READS. The preferences page exists so somebody can
     * see and change their own marketing state, and it printed "Right now,
     * EventLinqs sends you no marketing" on a read that had failed. Somebody who
     * reads that stops pressing, which is the same harm as a live unsubscribe
     * link called spent.
     */
    name: 'the one sentence stops telling an outage from an answer',
    file: SENTENCES,
    find: '  if (!verdict.ledgerWasRead) {',
    replace: '  if (false) {',
    expect: 'does NOT state their marketing position when the ledger could not be read',
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

log(`LB-OUTAGEWITHDRAW test drills, ${new Date().toISOString()}`)
log(`Each drill plants a defect, runs ${TEST}, and restores the file.`)
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
