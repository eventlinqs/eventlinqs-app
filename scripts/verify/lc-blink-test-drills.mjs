/**
 * LC-BLINK. THE RED HALF OF THE UNIT TESTS.
 *
 * A test that has never been seen to fail is a test nobody has checked. This
 * plants each defect that was actually LIVE back into the tree, one at a time,
 * runs ONLY the test file that covers it, and asserts it goes RED with the
 * expected assertion named in the output. The tree is restored in a finally
 * whether the run passes, fails or throws.
 *
 * FOUR PLANTINGS OF THE LIVE DEFECT and one of the mistake a careless fix
 * makes. The last one matters more than it looks. The obvious way to stop a
 * blinked read deciding anything is to make the dispatcher raise, and if the
 * caller does not absorb that, the first flaky read answers 500 and abandons
 * every recipient and every event left in the pass. That is WORSE than the
 * defect it replaced, and a fix that passes the first three and fails the last
 * is a regression wearing a fix's clothes.
 *
 * WHY THE EXPECTED TEXT IS CHECKED AND NOT ONLY THE EXIT CODE. A file that goes
 * red for an unrelated reason, or that fails to COLLECT at all, also exits
 * non-zero. Naming the assertion that must appear is what separates "the tests
 * caught it" from "something broke".
 *
 * WHAT IS DELIBERATELY NOT DRILLED, because it must pass on BOTH trees: the
 * over-correction guard ("still uses the permissive defaults for somebody who
 * has genuinely never set any") and the narrow-catch test ("does not swallow a
 * fault that is not a read"). An unfixed tree satisfies both, and a drill that
 * demanded otherwise would be asserting the old behaviour was wrong about
 * something it was right about.
 *
 * RUN IT:
 *   node scripts/verify/lc-blink-test-drills.mjs
 *
 * IT MUTATES src/ FOR THE LENGTH OF THE RUN. Three lanes share this machine, so
 * it is quick and it restores in a finally, exactly as
 * scripts/verify/guard-failure-drills.mjs and its lane B sibling do.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const DISPATCH_TEST = 'tests/unit/notifications/a-blink-defers-the-message.test.ts'
const CRON_TEST = 'tests/unit/cron/notify-just-announced.test.ts'
const DISPATCH = 'src/lib/notifications/dispatch.ts'
const CRON = 'src/app/api/cron/notify-just-announced/route.ts'
const DIGEST = 'src/lib/notifications/organiser-sales-digest.ts'
const DIGEST_TEST = 'tests/unit/notifications/organiser-sales-digest.test.ts'

const EVIDENCE = 'C:/dev/EVIDENCE/LC-BLINK'
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
     * THE LIVE DEFECT, restored exactly. DEFAULT_PREFS is permissive, so this
     * one line is the whole of it: somebody who switched every channel off
     * becomes somebody who never opened the page, and the platform mails them.
     * The same line takes away the quiet hours, which is why two assertions
     * catch it.
     */
    name: 'the preference read goes back to answering DEFAULT_PREFS for a blink',
    file: DISPATCH,
    tests: DISPATCH_TEST,
    find: "  const data = await readOrThrow('notification-prefs', () =>\n    admin\n      .from('notification_prefs')\n      .select('push_enabled, email_enabled, quiet_hours_start, quiet_hours_end, timezone')\n      .eq('user_id', userId)\n      .maybeSingle(),\n  )\n  return data ?? DEFAULT_PREFS",
    replace:
      "  const { data } = await admin\n    .from('notification_prefs')\n    .select('push_enabled, email_enabled, quiet_hours_start, quiet_hours_end, timezone')\n    .eq('user_id', userId)\n    .maybeSingle()\n  return data ?? DEFAULT_PREFS",
    expect: 'sends nothing to somebody who switched every channel off',
  },
  {
    /*
     * THE DEDUPE, restored. The unique index does not save it: the row is
     * written AFTER the send, so the constraint stops the second ROW and not the
     * second MESSAGE.
     */
    name: 'the dedupe read goes back to reading a blink as "not sent yet"',
    file: DISPATCH,
    tests: DISPATCH_TEST,
    find: "  const existing = await readOrThrow('notification-dedupe', () =>\n    admin\n      .from('notifications')\n      .select('id')\n      .eq('user_id', userId)\n      .eq('event_id', eventId)\n      .eq('type', type)\n      .maybeSingle(),\n  )",
    replace:
      "  const { data: existing } = await admin\n    .from('notifications')\n    .select('id')\n    .eq('user_id', userId)\n    .eq('event_id', eventId)\n    .eq('type', type)\n    .maybeSingle()",
    expect: 'is not sent a second time because the dedupe read blinked',
  },
  {
    /*
     * THE QUIET DEMOTION. This one never produced a wrong message, only a
     * message down a channel the person did not choose, which is why it is the
     * easiest of the four to argue away and the one most likely to be undone.
     */
    name: 'the device read goes back to moving a push person onto email in silence',
    file: DISPATCH,
    tests: DISPATCH_TEST,
    find: "  const subs = await readOrThrow('notification-push-subscriptions', () =>\n    admin\n      .from('push_subscriptions')\n      .select('endpoint, p256dh, auth')\n      .eq('user_id', userId)\n      .limit(MAX_PUSH_ENDPOINTS_PER_USER),\n  )",
    replace:
      "  const { data: subs } = await admin\n    .from('push_subscriptions')\n    .select('endpoint, p256dh, auth')\n    .eq('user_id', userId)\n    .limit(MAX_PUSH_ENDPOINTS_PER_USER)",
    expect: 'does not silently move a push person onto email',
  },
  {
    /*
     * THE CARELESS FIX. The dispatcher raising is only half a bargain, and this
     * is what the other half costs when it is missing.
     */
    name: 'the cron stops absorbing the refusal and one blink abandons the run',
    file: CRON,
    tests: CRON_TEST,
    find: '          if (!(err instanceof ReadFailed)) throw err',
    replace: '          if (true) throw err',
    expect: 'defers the one recipient whose read blinked and still reaches everybody else',
  },
  {
    /*
     * THE LIVE DEFECT THE ADVERSARIAL PASS FOUND, not the scan. The daily digest
     * claimed the day before it resolved who to send it to, and both of the
     * reads after the claim raise. So one dropped socket spent the day and the
     * organiser never got that digest and never would.
     */
    name: 'the digest goes back to claiming the day before it knows who to send it to',
    file: DIGEST,
    tests: DIGEST_TEST,
    find: "      const recipient = await resolveOrganisationOwnerEmail(admin, org.id as string)\n      if (!recipient) {\n        summary.skippedNoRecipient += 1\n        continue\n      }\n\n      const titles = await loadEventTitles(\n        admin,\n        orders.map((o) => o.event_id as string),\n      )\n\n      const gross",
    replace: '      const gross',
    expect: 'leaves the day unclaimed, so the next run can still send it',
  },
]

function runTests(file) {
  try {
    const out = execFileSync(
      process.execPath,
      [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', file],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return { code: 0, out }
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}\n${err.stderr ?? ''}` }
  }
}

let fired = 0
const problems = []

log(`LC-BLINK test drills, ${new Date().toISOString()}`)
log('Each drill plants a defect that was live, runs the test file, and restores it.')
log('')

for (const drill of DRILLS) {
  const path = join(ROOT, drill.file)
  const original = readFileSync(path, 'utf8')
  /*
   * The anchors are written with LF and this tree checks out with CRLF, so the
   * comparison is made on a normalised copy and the ORIGINAL bytes are what get
   * written back. A drill that "restored" a file with different line endings
   * would leave every line of it modified in git.
   */
  const LF = String.fromCharCode(10)
  const CRLF = String.fromCharCode(13) + LF
  const crlf = original.includes(CRLF)
  const flat = crlf ? original.split(CRLF).join(LF) : original
  if (!flat.includes(drill.find)) {
    problems.push(`${drill.name}: anchor text not found in ${drill.file}. The drill is stale.`)
    log(`  STALE  ${drill.name}`)
    continue
  }
  try {
    const planted = flat.split(drill.find).join(drill.replace)
    writeFileSync(path, crlf ? planted.split(LF).join(CRLF) : planted)
    const { code, out } = runTests(drill.tests)
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
let restored = true
for (const file of [DISPATCH_TEST, CRON_TEST, DIGEST_TEST]) {
  const clean = runTests(file)
  if (clean.code !== 0) {
    restored = false
    problems.push(`the restored tree does not pass ${file}. The drills did not put something back.`)
  }
}
log(restored ? '  the restored tree is GREEN again on all three files' : '  THE RESTORED TREE IS RED')

log('')
log(`=== ${fired}/${DRILLS.length} test drills fired correctly ===`)
for (const p of problems) log(`  PROBLEM: ${p}`)
if (problems.length) process.exit(1)
