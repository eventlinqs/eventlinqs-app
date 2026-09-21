/**
 * A READ THAT CANNOT BE READ DEFERS THE MESSAGE. IT NEVER DECIDES IT.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, driven on TEST on 21 September 2026 through
 * `scripts/verify/a-blink-is-not-a-preference-drive.mjs`: red reading 10 of 16,
 * green reading 16 of 16, on one person, with one table failing on cue.
 *
 * `src/lib/notifications/dispatch.ts` is the one function every lifecycle alert
 * goes through, and all four of its reads discarded their error, so all three
 * of its decisions were available to a dropped socket.
 *
 *   THE CHANNELS. `loadPrefs` fell through to `DEFAULT_PREFS`, which is
 *   `push_enabled: true, email_enabled: true`. Somebody who had switched every
 *   channel OFF was indistinguishable from somebody who had never opened the
 *   page. The drive watched the email being composed for them.
 *
 *   THE QUIET HOURS. `DEFAULT_PREFS` carries `quiet_hours_start: null`, and a
 *   null window is never quiet, so the same blinked read took the window away
 *   and sent inside it. /account/notifications promises the reader, in its own
 *   words, that nothing arrives in there.
 *
 *   THE DEDUPE. A blinked read of `notifications` answers "no row", which reads
 *   as "not sent yet". The unique index on (user_id, event_id, type) does not
 *   save it, because the row is written AFTER the send: the constraint stops the
 *   second ROW and not the second MESSAGE, and this cron runs every quarter hour.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A GUARD OF ITS OWN AND NOT A LINE IN THE SCOPE LIST NEXT DOOR.
 *
 * `src/lib/notifications` IS now in the SCOPE of
 * `a-failed-read-is-not-a-fact-about-a-person`, and that is the mechanical half:
 * every read in the directory binds its error or goes through a door. This file
 * holds the five things that guard cannot see, each of which was a separate
 * piece of the same fix:
 *
 *   CLAUSE 1, THE CALLER'S HALF OF THE BARGAIN. Making the dispatcher RAISE is
 *   only half a fix. Something has to absorb the refusal, and if nothing does,
 *   the first flaky read reaches the cron's outer handler, the response is a
 *   500, and every recipient and every event left in the pass is dropped. The
 *   catch is per RECIPIENT and it is narrow on purpose. No read-guard can see
 *   this, because the property is in a DIFFERENT FILE from the reads.
 *
 *   CLAUSE 2, THE VOCABULARY. A notifier that cannot throw, because it runs
 *   inside the Stripe webhook, has to say something instead, and what it used to
 *   say was `not_found` about an order that exists or `no_recipient` about an
 *   organiser with an address on file. Both are facts about somebody, written
 *   into a warning line an operator reads. `read_failed` is the reason that is
 *   true, and clause 2 keeps it declared.
 *
 *   CLAUSE 3, THE THIRD SPELLING. `const { count } = await ...` reads neither
 *   `data` nor `error`, so NEITHER matcher next door can see it: not
 *   `awaitedDestructures`, which needs `data` in the binding, and not
 *   `wholeResultBindings`, which needs the whole response bound to a name. It
 *   was live in `organiser-sale-notify.ts` and it was the sharpest of the lot:
 *   `ticketCount ?? 0` tells an organiser that nought tickets sold, and
 *   `(confirmedCount ?? 0) <= 1` heads every message on a sold-out event
 *   "Your first sale".
 *
 *   CLAUSE 4, THE PREMISE. The whole argument above rests on DEFAULT_PREFS being
 *   PERMISSIVE. If somebody makes the defaults restrictive, a blinked preference
 *   read stops being a message to a person who refused it and becomes silence
 *   for a person who wanted it, which is a different defect needing a different
 *   answer. The premise is asserted so a change to it cannot pass quietly.
 *
 *   CLAUSE 5, THE ORDER, and it was found by the adversarial pass over this very
 *   item rather than by the scan: making reads RAISE is only safe where nothing
 *   irreversible has happened yet. The daily digest claims the day by appending
 *   to `organiser_sales_digest_sends` BEFORE it sends, on purpose, so a crash
 *   costs one digest instead of a duplicate money summary. Two reads sat AFTER
 *   that claim, so one dropped socket spent the day and the organiser never got
 *   that digest and never would: the next run finds the claim row and calls it
 *   already sent. A position, not a pattern, which is why no matcher sees it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS GUARD CANNOT SEE, stated rather than implied.
 *
 * Clause 1 asks whether the recipient loop CONTAINS a catch that names
 * ReadFailed and whether the counter it feeds is reported. It cannot prove the
 * catch is correct, only that it is there. The behaviour itself is pinned by
 * tests/unit/cron/notify-just-announced.test.ts, which runs the route with one
 * recipient raising and asserts the other four are still reached, that the
 * deferred one is retried on the next pass, and that a fault which is NOT a read
 * still takes the run down with a 500. This clause is the cheap, blunt half that
 * catches the catch being deleted.
 *
 * Clause 3 is scoped to this directory rather than to the tree. The count
 * spelling is invisible to the shared matchers everywhere, not just here, and
 * widening those matchers is an edit to a file two other lanes build on. That is
 * raised in C:\dev\REVIEW-QUEUE-C.md as a BORDER rather than taken quietly.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[a-blink-defers-the-message]'

const ROUTER_DIR = 'src/lib/notifications'
const CRON = 'src/app/api/cron/notify-just-announced/route.ts'
const POLICY = 'src/lib/notifications/policy.ts'

/** The error every read in this family raises. Named once. */
const RAISED = 'ReadFailed'

/**
 * The notifiers that cannot throw, because their caller is the Stripe webhook
 * and a throw would make Stripe redeliver work that is already done. Each one
 * answers with a REASON instead, so each one needs the reason that is true.
 *
 * Checked to still exist for the same reason the sibling guard checks its
 * scope: a file renamed away would otherwise be judged for nothing and reported
 * as a pass, which is how a scanner lies.
 */
const NEVER_THROW = [
  ['src/lib/notifications/organiser-money-notify.ts', 'the refund, dispute and payment-setup notices'],
  ['src/lib/notifications/organiser-sale-notify.ts', 'the sale notice'],
  ['src/lib/notifications/organiser-event-notify.ts', 'the event-published notice'],
]

const failures = []
let filesScanned = 0
let countsJudged = 0
let reasonsJudged = 0
let readsBeforeClaim = 0

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

/**
 * Source with COMMENTS removed. Strings are KEPT, because two of these clauses
 * judge a string literal: `read_failed` is a reason a notifier declares, and it
 * is spelled as a string wherever it appears.
 *
 * The first run of this guard stripped string bodies as well and reported three
 * faults against the three files that carry the reason correctly. A guard that
 * fires on correct code is the failure mode this family's own header warns
 * about, and it was caught only because the run was watched rather than assumed.
 */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function filesUnder(dir) {
  const out = []
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...filesUnder(rel))
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(rel)
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* CLAUSE 1. The cron absorbs the refusal, per recipient, and reports it.      */
/* -------------------------------------------------------------------------- */

if (!existsSync(join(ROOT, CRON))) {
  failures.push(`${CRON} is gone. This guard judges it by name; widen the guard or restore the file.`)
} else {
  const src = read(CRON)
  const code = codeOnly(src)

  /*
   * THERE IS NO FILE-WIDE "DOES IT MENTION ReadFailed" CHECK HERE, AND THE DRILL
   * IS WHY IT WAS DELETED RATHER THAN FIXED.
   *
   * This clause was written first and read `code.includes('ReadFailed')`. The
   * drill that renames the import to `ReadFailedRenamed` walked straight past
   * it, because the renamed word contains the original. A word boundary fixed
   * that one spelling and still passed, because renaming the IMPORT leaves
   * `err instanceof ReadFailed` in the catch, which is a mention.
   *
   * Every state that would trip a file-wide check also trips the loop-body check
   * below, and that one is drilled. A clause nobody can make fail is not a
   * clause, so it is gone instead of being reworded until the drill stops
   * complaining.
   */

  /*
   * The catch has to be INSIDE the per-recipient loop. A catch around the whole
   * loop would compile, would pass a test that only checks the response is 200,
   * and would still abandon the run at the first blink, which is the exact
   * defect. So the loop is located and the catch is required within it.
   */
  const loop = code.indexOf('for (const userId of recipients)')
  if (loop === -1) {
    failures.push(
      `${CRON} no longer has the recipient loop this guard locates ` +
        `(\`for (const userId of recipients)\`). It was renamed or restructured, and clause 1 cannot ` +
        `tell a per-recipient catch from a per-run one without it. Update the guard deliberately.`,
    )
  } else {
    const after = code.slice(loop)
    const body = after.slice(0, after.indexOf('return NextResponse.json'))
    if (!new RegExp(`catch\\s*\\([\\s\\S]{0,40}\\)\\s*\\{[\\s\\S]{0,400}?\\b${RAISED}\\b`).test(body)) {
      failures.push(
        `${CRON}: the recipient loop does not catch ${RAISED}. One recipient whose read blinked must be ` +
          `deferred and counted, not allowed to end the pass for everybody behind them.`,
      )
    }
    if (!/blinked\s*\+=\s*1/.test(body)) {
      failures.push(
        `${CRON}: nothing increments \`blinked\` inside the recipient loop. A run that held four hundred ` +
          `alerts because the database was blinking and a run that held them because it was midnight must ` +
          `never read the same from outside.`,
      )
    }
  }

  if (!/\bblinked,/.test(code)) {
    failures.push(
      `${CRON}: \`blinked\` is counted but never reported in the response. A counter nobody can read is ` +
        `not instrumentation.`,
    )
  }
}

/* -------------------------------------------------------------------------- */
/* CLAUSE 2. The notifiers that cannot throw say the thing that is true.       */
/* -------------------------------------------------------------------------- */

for (const [rel, what] of NEVER_THROW) {
  if (!existsSync(join(ROOT, rel))) {
    failures.push(`${rel} is gone, and clause 2 judges ${what} by name. Widen the guard or restore it.`)
    continue
  }
  reasonsJudged += 1
  const code = codeOnly(read(rel))
  /*
   * IN A `reason:` UNION, not merely somewhere in the file. The first version
   * asked whether `'read_failed'` appeared at all, and the drill that removes it
   * from the RESULT TYPE walked past, because the helper that classifies the
   * error still names it in its own return type. What callers can actually
   * receive is the union, so that is what this asks about.
   */
  if (!/reason:[^\n}]*'read_failed'/.test(code)) {
    failures.push(
      `${rel} (${what}) does not declare a \`read_failed\` reason on its result type. It runs where it ` +
        `cannot throw, so a read it could not make has to be SAID, and the reasons that were here before ` +
        `all state something about the order or the organiser that a dropped socket is in no position ` +
        `to state.`,
    )
  }
  // A word boundary here too, for the reason clause 1 records: a rename that
  // merely lengthens the name must not read as the name still being used.
  if (!new RegExp(`\\b${RAISED}\\b`).test(code)) {
    failures.push(
      `${rel} (${what}) never mentions ${RAISED}, so whatever it returns for a failed read, it is not ` +
        `distinguishing one. The reads raise; this file has to classify the raise.`,
    )
  }
}

/* -------------------------------------------------------------------------- */
/* CLAUSE 3. The count spelling, which neither shared matcher can see.         */
/* -------------------------------------------------------------------------- */

/**
 * THE MATCHER IS ASKED A QUESTION IT KNOWS THE ANSWER TO, BEFORE IT IS TRUSTED
 * WITH THE DIRECTORY.
 *
 * Clause 3 can come back zero for two entirely different reasons: the directory
 * holds no count destructures, or the pattern stopped matching. The second has
 * no natural symptom, because a blind matcher prints "every one binds its error"
 * over a file whose every count drops it, and this tree has shipped exactly that
 * before (a guard with an unrecognised escape in a template literal, 18
 * September 2026). So the probe carries one of each spelling and the guard
 * REFUSES rather than reporting on a directory it cannot see.
 *
 * It also fixes the live reading in place: on the day this was written the two
 * real occurrences were both in `platform-send.ts` and both bind their error, so
 * clause 3 passes over genuine matches rather than over nothing.
 */
const COUNT_PROBE = [
  ['const { count } = await admin.from("t").select("id", { count: "exact", head: true })', true],
  ['const { count, error } = await admin.from("t").select("id", { count: "exact", head: true })', false],
]
for (const [sample, shouldFault] of COUNT_PROBE) {
  const hits = [...sample.matchAll(/(?:const|let|var)\s*\{([^{}]*\bcount\b[^{}]*)\}\s*=\s*await\b/g)]
  const faults = hits.filter((m) => !/\berror\b/.test(m[1]))
  if (hits.length !== 1 || faults.length !== (shouldFault ? 1 : 0)) {
    console.error(
      `${TAG} the count matcher failed its own calibration on: ${sample}. It found ${hits.length} ` +
        `binding(s) and ${faults.length} fault(s) where ${shouldFault ? 1 : 0} was expected. Refusing to ` +
        `report on ${ROUTER_DIR} with a matcher that cannot see it.`,
    )
    process.exit(1)
  }
}

for (const rel of filesUnder(ROUTER_DIR)) {
  filesScanned += 1
  const src = read(rel)
  const code = codeOnly(src)
  for (const m of code.matchAll(/(?:const|let|var)\s*\{([^{}]*\bcount\b[^{}]*)\}\s*=\s*await\b/g)) {
    countsJudged += 1
    if (!/\berror\b/.test(m[1])) {
      const line = src.slice(0, m.index).split('\n').length
      failures.push(
        `${rel}:${line} destructures { ${m[1].trim()} } from an await and never binds \`error\`. A count ` +
          `is the third spelling of a discarded read error and NEITHER matcher in ` +
          `a-failed-read-is-not-a-fact-about-a-person can see it: one needs \`data\` in the binding and the ` +
          `other needs the whole response bound to a name. \`count ?? 0\` cannot tell a failure from a real ` +
          `zero, and a real zero here is a sentence in somebody's email. Hand the response to countOrRaise, ` +
          `or bind \`error\` and answer it.`,
      )
    }
  }
}

/* -------------------------------------------------------------------------- */
/* CLAUSE 4. The premise the whole argument rests on.                          */
/* -------------------------------------------------------------------------- */

if (!existsSync(join(ROOT, POLICY))) {
  failures.push(`${POLICY} is gone and clause 4 has nothing to check its premise against.`)
} else {
  const defaults = codeOnly(read(POLICY)).match(/DEFAULT_PREFS[^=]*=\s*\{([\s\S]*?)\}/)
  if (!defaults) {
    failures.push(
      `${POLICY}: DEFAULT_PREFS could not be located. It is the premise of this whole family: a blinked ` +
        `preference read falls back to it, and the fix is built on it being permissive.`,
    )
  } else {
    const body = defaults[1]
    for (const field of ['push_enabled', 'email_enabled']) {
      if (!new RegExp(`${field}\\s*:\\s*true`).test(body)) {
        failures.push(
          `${POLICY}: DEFAULT_PREFS.${field} is no longer \`true\`. That inverts the argument this family ` +
            `is built on. With permissive defaults a blinked preference read MAILS somebody who refused; ` +
            `with restrictive ones it SILENCES somebody who agreed. Both are defects and they need ` +
            `different answers, so re-argue the fix rather than editing this line out.`,
        )
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* CLAUSE 5. Nothing that can raise sits between the claim and the send.       */
/* -------------------------------------------------------------------------- */

/**
 * THE DAILY DIGEST SPENDS THE DAY BEFORE IT SENDS, ON PURPOSE, and that is why
 * the order of everything around the claim matters.
 *
 * `organiser_sales_digest_sends` is appended to BEFORE the message goes, so that
 * a crash costs one digest instead of sending a duplicate money summary. That
 * ordering is right and this clause does not touch it. What was wrong, until
 * 21 September 2026, is that two READS sat AFTER it: the owner's address and the
 * event titles. Both raise when a read cannot be made, so one dropped socket
 * spent the day, landed in the per-organisation catch, and the organiser never
 * received that digest and never would, because the next run finds the claim row
 * and counts it as already sent.
 *
 * Nothing is lost by reading first: a read writes nothing, so a run that gives
 * up before the claim leaves the day unclaimed. This is judged by POSITION
 * because that is exactly what the defect was, and a reordering is the single
 * most likely way for it to come back.
 */
const DIGEST = 'src/lib/notifications/organiser-sales-digest.ts'
const CLAIM = ".from('organiser_sales_digest_sends')"
const BEFORE_THE_CLAIM = [
  ['resolveOrganisationOwnerEmail(admin', "the owner's address"],
  ['loadEventTitles(', 'the event titles'],
]

if (!existsSync(join(ROOT, DIGEST))) {
  failures.push(`${DIGEST} is gone, and clause 5 judges the digest's claim ordering by name.`)
} else {
  const code = codeOnly(read(DIGEST))
  const claimAt = code.indexOf(CLAIM)
  if (claimAt === -1) {
    failures.push(
      `${DIGEST}: the claim on \`organiser_sales_digest_sends\` could not be found, so clause 5 cannot ` +
        `tell what comes before it. The idempotency claim was renamed or removed; update this guard ` +
        `deliberately rather than letting the clause pass over nothing.`,
    )
  } else {
    for (const [needle, what] of BEFORE_THE_CLAIM) {
      readsBeforeClaim += 1
      const at = code.indexOf(needle)
      if (at === -1) {
        failures.push(
          `${DIGEST}: ${what} is no longer read here (\`${needle}\`), so clause 5 cannot place it ` +
            `against the claim. Update the guard deliberately.`,
        )
      } else if (at > claimAt) {
        failures.push(
          `${DIGEST}: ${what} is read AFTER the day is claimed. That read raises when it cannot be ` +
            `made, and the claim is already written by then, so one dropped socket spends the day and ` +
            `the organiser never gets that digest: the next run sees the claim row and calls it ` +
            `already sent. Move every read above the claim. The claim still goes before the SEND.`,
        )
      }
    }
  }
}

/* -------------------------------------------------------------------------- */

declareWork('a-blink-defers-the-message', {
  did: {
    'router file scanned for the count spelling': filesScanned,
    'count destructure judged': countsJudged,
    'notifier judged for its read_failed reason': reasonsJudged,
    'digest read placed against the claim': readsBeforeClaim,
  },
  found: {
    'message that a dropped socket could decide': failures.length,
  },
})

if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} ${f}`)
  console.error(`${TAG} FAIL - ${failures.length} fault(s).`)
  process.exit(1)
}

console.log(
  `${TAG} PASS: the alert cron defers a blinked recipient and reports it, ${reasonsJudged} notifier(s) ` +
    `can say \`read_failed\`, ${countsJudged} count destructure(s) across ${filesScanned} file(s) bind ` +
    `their error, ${readsBeforeClaim} digest read(s) happen before the day is claimed, and ` +
    `DEFAULT_PREFS is still permissive`,
)
