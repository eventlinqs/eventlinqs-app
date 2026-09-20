/**
 * GUARD: THE ABANDONED-CHECKOUT SENDER KNOWS EVERYBODY WHO SAID STOP, AND KNOWS
 * IT WITHOUT READING A CONSENT TABLE.
 *
 * ---------------------------------------------------------------------------
 * THE TWO DEFECTS THIS EXISTS TO STOP, both measured on TEST on 20 September
 * 2026 before a line was changed.
 *
 * ONE. THE SENDER NEVER ASKED THE CONSENT LEDGER. A person who unsubscribes is
 * told, and `suppression_events` holds as the evidence behind the sentence,
 * that the withdrawal covers "every EventLinqs facilitated message on every
 * channel" (src/lib/consent/purposes.ts, scopesForPurpose, both branches). The
 * recovery sender decided who to mail from `recovery_suppressions` and nothing
 * else, so no withdrawal ever reached it: not from the preferences page, not
 * from the digest unsubscribe page, not from the Gmail one-click button.
 *
 *     147 distinct people carried a suppression event
 *      19 rows sat in recovery_suppressions
 *
 * What was still going out is commercial mail by the sender's own account of
 * itself: `deliver()` refuses to send one without an unsubscribe link because
 * "The Spam Act 2003 (Cth) requires a functional unsubscribe on every
 * commercial message".
 *
 * TWO. THE LIST STOPPED AT A THOUSAND NAMES. Both reads of
 * `recovery_suppressions` carried no bound, and Supabase caps one response at a
 * fixed number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * The cap is silent: HTTP 200, `error` null, a full-looking array. Measured
 * against this project the same day:
 *
 *     Content-Range: 0-999/14364
 *
 * On a suppression list a short read FAILS OPEN, which is the opposite of every
 * other truncation in this engine: the 1,001st person who asked not to be
 * written to gets written to. `src/lib/matching/run.ts` already pages this very
 * table and says why in its own comment; this read simply never got the same
 * treatment.
 *
 * ---------------------------------------------------------------------------
 * WHY A GUARD RATHER THAN THE TESTS ALONE.
 *
 * The tests pin the behaviour of the functions as they are written today. They
 * cannot see somebody deleting the reconciliation from the cron route, which
 * would leave every test passing and every withdrawal ignored again, and they
 * cannot see a NEW unbounded read of the suppression table added next to the
 * paged one. Both are one-line regressions with no visible symptom: the sweep
 * still runs, still reports, still sends. The only person who finds out is the
 * one who unsubscribed and got another message.
 *
 * WHY IT ALSO GUARDS THE BOUNDARY IT COULD HAVE BROKEN. The obvious fix was to
 * teach the engine to read `suppression_events`, and close-out D2 forbids it:
 * "The engine reads the ledger and nothing else ... If it cannot be pointed at
 * a gym's ledger rows tomorrow with only a new adapter, it is built wrong."
 * `fillrate-reads-only-the-ledger` would have refused that, correctly. Clause 4
 * below fails if the bridge is ever moved inside the engine, so the fix cannot
 * drift into the defect the other guard exists to stop.
 *
 * FOUR CLAUSES.
 *   1. every read of a table the engine OWNS is bounded: `recovery_suppressions`,
 *      and since 20 September 2026 `recovery_sends` and `recovery_holds` too.
 *      All three under-report what has already been done when they are short,
 *      so the engine does it again, and the send log is the one closest to the
 *      cliff: 452 rows on one slot against a ceiling of 1,000. The slot ledger
 *      is deliberately excluded and the reason is at ENGINE_OWN_TABLES.
 *   2. the bridge exists, reads the consent ledger, and writes through the
 *      engine's own suppression writer.
 *   3. the sweep calls the bridge, and calls it BEFORE it sweeps.
 *   4. the bridge lives outside the engine, and the engine does not import it.
 *
 * Run standalone:  node scripts/guards/the-recovery-stop-list-is-whole.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceFiles } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-recovery-stop-list-is-whole]'

/** The engine, which owns the suppression table and may read nothing else. */
const ENGINE_DIR = 'src/lib/fillrate'
/** The table clauses 2 to 4 are about, and the reason this guard exists. */
const STOP_TABLE = 'recovery_suppressions'

/**
 * THE TABLES THE ENGINE OWNS, which clause 1 judges. Widened from the one
 * above on 20 September 2026.
 *
 * All three answer the same question, "has this person already had this from
 * us", and all three fail the same way when a read is short: they under-report
 * what has already been done, so the engine does it again.
 *
 *   recovery_suppressions   who said stop. Short, the 1,001st person who asked
 *                           not to be written to is written to.
 *   recovery_sends          what was already sent. Short, somebody gets the
 *                           same message a second time. MEASURED: the busiest
 *                           slot on TEST already carries 452 of these against a
 *                           ceiling of 1,000, so this one is close.
 *   recovery_holds          who is holding a seat off the waiting list. Short,
 *                           a held unit looks free and is offered twice, or an
 *                           expiry never passes down the list.
 *
 * THE SLOT LEDGER IS DELIBERATELY NOT HERE. `ledger_entries` and `ledger_slots`
 * belong to another lane under the three-lane brief, they are enumerated by
 * file and line in REVIEW-QUEUE-B.md, and a guard that went red on somebody
 * else's unfixed work would be switched off rather than obeyed.
 *
 * THE FILE NAME IS NARROWER THAN CLAUSE 1 AND THAT IS SAID OUT LOUD HERE rather
 * than left for a reader to notice: the guard is named for the stop list
 * because that is the defect it was written for and what clauses 2 to 4 hold.
 */
const ENGINE_OWN_TABLES = ['recovery_suppressions', 'recovery_sends', 'recovery_holds']
/** EventLinqs' side of the boundary: the file that keeps that table true. */
const BRIDGE = 'src/lib/recovery/consent-stops.ts'
/** The consent authority the bridge reads. */
const LEDGER_READER = 'addressesStoppedForFacilitatedMail'
/** The engine's own writer, which the bridge must go through. */
const ENGINE_WRITER = 'suppress'
/** The only thing that reads the list. */
const SWEEP_ROUTE = 'src/app/api/cron/recovery-sweep/route.ts'
const BRIDGE_FN = 'syncConsentStopsIntoRecovery'
const SWEEP_FN = 'sweepAbandonedCheckouts'

const failures = []
const notes = []
const work = { reads: 0, bounded: 0, stopReads: 0, clauses: 0, files: 0 }

function read(relative) {
  const absolute = resolve(ROOT, relative)
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null
}

// --------------------------------------------------------------------------
// CLAUSE 1. Every read of a table the ENGINE OWNS is bounded. See ENGINE_OWN_TABLES.
//
// Judged with the same shared machinery `no-silent-row-ceiling` uses, so the
// two guards cannot disagree about what "bounded" means. That guard's scope
// does not include the engine, which is exactly why this defect survived it.
// --------------------------------------------------------------------------
if (!existsSync(resolve(ROOT, ENGINE_DIR))) {
  failures.push(
    `the scope names ${ENGINE_DIR} and it does not exist; a scope that scans nothing reports PASS, so fix the list rather than the symptom`,
  )
} else {
  const files = sourceFiles(ROOT, { subdir: ENGINE_DIR }).filter(f => /\.tsx?$/.test(f))
  work.files = files.length
  for (const file of files) {
    const absolute = resolve(ROOT, file)
    if (!existsSync(absolute)) continue
    const heads = headOnlySelectLines(absolute)
    for (const chain of selectChainsIn(absolute)) {
      if (!chain.methods.includes('select')) continue
      if (!ENGINE_OWN_TABLES.includes(chain.table)) continue
      work.reads += 1
      if (chain.table === STOP_TABLE) work.stopReads += 1
      const how = boundednessOf(chain, { headSelects: heads })
      if (how) {
        work.bounded += 1
        continue
      }
      failures.push(
        `${file}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows ` +
          'silently (HTTP 200, no error), and every one of the engine\'s own tables fails OPEN when ' +
          'it is short: it under-reports what has already been done, so the engine does it again. ' +
          'A missing suppression writes to somebody who said stop; a missing send writes to somebody ' +
          'twice; a missing hold offers a held seat to a second person. Page it through readEveryRow ' +
          'with an .order(), the way suppressedAddresses() does.',
      )
    }
  }
  if (work.stopReads === 0) {
    failures.push(
      `no read of ${STOP_TABLE} was found anywhere in ${ENGINE_DIR}. Either the table was renamed ` +
        'and this guard now judges nothing, or the sender has stopped consulting its suppression ' +
        'list altogether. Both are worse than the defect this guard was written for.',
    )
  } else {
    notes.push(
      `${work.bounded} of ${work.reads} read(s) of the engine's own tables are bounded ` +
        `(${ENGINE_OWN_TABLES.join(', ')}), ${work.stopReads} of them on ${STOP_TABLE}`,
    )
  }
}

// --------------------------------------------------------------------------
// CLAUSE 2. The bridge exists, reads the ledger, writes through the engine.
// --------------------------------------------------------------------------
const bridge = read(BRIDGE)
if (bridge === null) {
  failures.push(
    `${BRIDGE} does not exist. It is the only thing that carries a marketing withdrawal to the ` +
      'abandoned-checkout sender; without it the sentence every unsubscriber is shown, that the ' +
      'withdrawal covers every EventLinqs facilitated message on every channel, is false again.',
  )
} else {
  /*
   * THE CALL, NEVER THE MENTION. `includes(LEDGER_READER)` was satisfied by the
   * import line alone, so a bridge that imported the reader and then returned an
   * empty set would have passed. Its own drill is what said so.
   */
  if (!bridge.includes(LEDGER_READER + '(')) {
    failures.push(
      `${BRIDGE} does not call ${LEDGER_READER}, so it is not reading the consent ledger and ` +
        'cannot know who has withdrawn.',
    )
  } else {
    work.clauses += 1
  }
  if (!bridge.includes(ENGINE_WRITER + '(')) {
    failures.push(
      `${BRIDGE} does not write through the engine's own ${ENGINE_WRITER}(). Writing the row by ` +
        'hand from here would put a second writer on a table the engine owns.',
    )
  } else {
    work.clauses += 1
  }
}

// --------------------------------------------------------------------------
// CLAUSE 3. The sweep reconciles BEFORE it sweeps.
//
// Order is the whole clause. Reconciling after the sweep is a sweep that mailed
// the people it was about to learn had unsubscribed.
// --------------------------------------------------------------------------
const route = read(SWEEP_ROUTE)
if (route === null) {
  failures.push(`${SWEEP_ROUTE} does not exist, so this guard cannot see whether the sweep reconciles at all`)
} else {
  const callsBridge = route.indexOf(BRIDGE_FN + '(')
  const callsSweep = route.indexOf(SWEEP_FN + '(')
  if (callsBridge === -1) {
    failures.push(
      `${SWEEP_ROUTE} never calls ${BRIDGE_FN}(). The bridge can exist and be perfect and still ` +
        'never run, which looks exactly like the defect it was written to close.',
    )
  } else if (callsSweep !== -1 && callsBridge > callsSweep) {
    failures.push(
      `${SWEEP_ROUTE} calls ${BRIDGE_FN}() AFTER ${SWEEP_FN}(). A sweep that reconciles afterwards ` +
        'has already mailed the people it was about to learn had unsubscribed.',
    )
  } else {
    work.clauses += 1
    notes.push(`${SWEEP_ROUTE} reconciles before it sweeps`)
  }
}

// --------------------------------------------------------------------------
// CLAUSE 4. The bridge is outside the engine, and the engine does not import it.
// --------------------------------------------------------------------------
if (BRIDGE.startsWith(ENGINE_DIR + '/')) {
  failures.push(
    `${BRIDGE} has been moved inside ${ENGINE_DIR}. Close-out D2: "The engine reads the ledger and ` +
      'nothing else ... If it cannot be pointed at a gym\'s ledger rows tomorrow with only a new ' +
      'adapter, it is built wrong."',
  )
} else if (existsSync(resolve(ROOT, ENGINE_DIR))) {
  const importers = sourceFiles(ROOT, { subdir: ENGINE_DIR })
    .filter(f => /\.tsx?$/.test(f))
    .filter(f => (read(f) ?? '').includes('@/lib/recovery/consent-stops'))
  if (importers.length > 0) {
    failures.push(
      `${importers.join(', ')} imports the bridge. The engine must not reach back across its own ` +
        'boundary; EventLinqs calls the bridge, the engine never does.',
    )
  } else {
    work.clauses += 1
    notes.push('the bridge sits outside the engine and the engine does not import it')
  }
}

// --------------------------------------------------------------------------
for (const note of notes) console.log(TAG + ' ' + note)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(TAG + ' FAIL: ' + f)
  console.error(TAG + ' ' + failures.length + ' failure(s).')
}

declareWork('the-recovery-stop-list-is-whole', {
  did: {
    'engine file judged': work.files,
    'engine-owned table read judged': work.reads,
    'clause satisfied': work.clauses,
  },
  found: { 'read that could be short, or a stop list unasked': failures.length },
})

if (failures.length > 0) process.exit(1)

console.log(TAG + ' OK - every withdrawal reaches the sender, and the list is read whole.')
