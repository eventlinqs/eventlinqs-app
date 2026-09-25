/**
 * GUARD: A DRIVE DELETES AN ACCOUNT IN ONE PLACE, AND THAT PLACE CANNOT REPORT
 * A SUCCESS IT DID NOT HAVE.
 *
 * ============================================================================
 * WHAT THIS IS FOR
 * ============================================================================
 *
 * On 19 September 2026 AQ3's second run could not build its fixture: "A user
 * with this email address has already been registered". EIGHTEEN lane B
 * accounts had accumulated on TEST while every run printed a clean tear-down.
 *
 * `auth.admin.deleteUser` had been failing for EVERY account on the platform
 * since that morning, including account closure in the product, because AQ1's
 * `decided_by ... on delete set null` issued an UPDATE into a table whose every
 * UPDATE is refused by a statement-level trigger, and a statement-level trigger
 * fires on an update of nothing. `evidence-outlives-the-account.mjs` guards that
 * cause.
 *
 * THIS GUARDS THE BLINDFOLD, which is the more general fault and the reason the
 * cause survived five days. Every teardown in this repository was written:
 *
 *     await db.auth.admin.deleteUser(userId).catch(() => {})
 *     const { data: gone } = await db.from('profiles').select('id')...
 *     check('teardown.left-as-found', !gone, '... is removed')
 *
 * The catch discards the only signal that the deletion failed, and the check
 * that follows asks about `profiles`, which the line above has already deleted.
 * The assertion is TRUE whether or not the account still exists. A check that
 * cannot fail is not a check.
 *
 * ============================================================================
 * THE RULE
 * ============================================================================
 *
 * `auth.admin.deleteUser` is called in exactly ONE file,
 * `scripts/verify/lib/teardown-account.mjs`, which asks "is it gone" rather
 * than "did my call succeed" (an already-absent account is gone; a REFUSED
 * deletion is not), reports the refusal by name and makes the run fail.
 * Everything else calls `tearDownAccountOrFailTheRun`.
 *
 * ============================================================================
 * WHY THERE IS A BASELINE, AND WHY IT CANNOT ROT
 * ============================================================================
 *
 * Twenty-four files still call the API directly and THEY BELONG TO OTHER LANES
 * OR TO NO ITEM AT ALL: eight to lane A's money proofs, eight to lane C's
 * notification, enrolment and SEO proofs, eight to shared journeys and
 * utilities that no single item owns. The three-lane protocol says a lane does not
 * edit another lane's territory, and failing the build on their files would be
 * exactly that, with interest: it would refuse their pushes for a defect they
 * have not been told about.
 *
 * So each is listed below with its owning lane, the guard PRINTS the whole list
 * on every run, and it FAILS when a listed file no longer matches, so the line
 * is deleted on the day the lane converts it rather than left as an unexamined
 * permission. The list can only shrink.
 *
 * Proven red and green: C:\\dev\\EVIDENCE\\AN1\\teardown-drills.txt.
 *
 * Run: node scripts/guards/one-way-to-delete-an-account.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const TAG = '[one-way-to-delete-an-account]'

/** The one file allowed to call the API, because it is the implementation. */
const THE_ONE_PLACE = 'scripts/verify/lib/teardown-account.mjs'

/** What every other file calls instead. */
const THE_HELPER = 'tearDownAccountOrFailTheRun'

/**
 * NOT YET CONVERTED, each with the lane that owns it. Lane B converted its own
 * fifteen call sites on 19 September 2026 and stopped at the border.
 *
 * A line here is a debt, not a permission. Delete it the moment the file stops
 * matching: the guard fails until you do.
 */
const NOT_YET_CONVERTED = [
  { path: 'scripts/verify/lib/refund-proof-fixture.mjs', lane: 'A', why: 'the shared refund fixture; refunds are lane A' },
  { path: 'scripts/verify/refund-dashboard-e2e.mjs', lane: 'A', why: 'refunds' },
  { path: 'scripts/verify/oversell-concurrency-drill.mjs', lane: 'A', why: 'the slot ledger' },
  { path: 'scripts/verify/payouts-read-parity.mjs', lane: 'A', why: 'payouts' },
  { path: 'scripts/verify/unfulfilled-order-drill.mjs', lane: 'A', why: 'orders and money' },
  { path: 'scripts/verify/s1-account-health-proof.mjs', lane: 'A', why: 'connected accounts' },
  { path: 'scripts/verify/sweep-fallback-drill.mjs', lane: 'A', why: 'the payment sweep' },
  { path: 'scripts/verify/d1-slot-ledger-proof.mjs', lane: 'A', why: 'the slot ledger, which CLOSE-OUT D1 gives to lane A by name' },
  { path: 'scripts/verify/quiet-hours-proof.mjs', lane: 'C', why: 'the notification router' },
  { path: 'scripts/verify/seo1-structured-data-drive.mjs', lane: 'C', why: 'SEO1 v2, whose body reads "P0 FOR LANE C"' },
  { path: 'scripts/seed-ticket-fixture.mjs', lane: 'shared', why: 'a seeding utility, owned by no single item' },
  { path: 'scripts/verify/door-realtime-verify.mjs', lane: 'shared', why: 'the door app, owned by no single item' },
  { path: 'scripts/verify/offline-door-schema-verify.mjs', lane: 'shared', why: 'the door app, owned by no single item' },
  { path: 'scripts/verify/event-lifecycle-proof.mjs', lane: 'shared', why: 'the event lifecycle state machine, owned by no single item' },
  { path: 'scripts/verify/user-suspend-e2e.mjs', lane: 'shared', why: 'admin user suspension, owned by no single item' },
  { path: 'scripts/verify-tickets-rls.mjs', lane: 'shared', why: 'a row-level-security check, owned by no single item' },
  { path: 'scripts/verify/ux3-admin-feed-proof.mjs', lane: 'C', why: 'the owner digest' },
  { path: 'scripts/verify/ux3-day-boundary-proof.mjs', lane: 'C', why: 'the owner digest' },
  { path: 'scripts/verify/ux3-digest-carryover-proof.mjs', lane: 'C', why: 'the owner digest' },
  { path: 'scripts/verify/ux3-digest-retry-proof.mjs', lane: 'C', why: 'the owner digest' },
  { path: 'scripts/verify/ux3-push-escalation-proof.mjs', lane: 'C', why: 'push escalation' },
  { path: 'scripts/verify/ux5-enrol-2fa-proof.mjs', lane: 'C', why: '2FA enrolment' },
  { path: 'scripts/verify/auth-journey-e2e.mjs', lane: 'shared', why: 'the generic auth journey, owned by no single item' },
  { path: 'scripts/verify-event-media-cleanup.ts', lane: 'shared', why: 'a media cleanup utility, owned by no single item' },
  /*
   * ADDED BY LANE B ON 20 SEPTEMBER 2026, AT A MERGE, AND NOT BY LANE B'S
   * CHOICE. Both arrived on the verify line while this guard was on lane B's,
   * so the two together are red and neither lane's own tree was. They are lane
   * C's files and lane B does not edit another lane's drives, which is exactly
   * the case this register was built for: name the owner rather than convert
   * it silently or switch the guard off. Raised as a BORDER line in
   * REVIEW-QUEUE-B.md the same day.
   */
  { path: 'scripts/verify/admin-search-comma-drive.mjs', lane: 'C', why: 'the admin search fix, lane C, merged 20 September 2026' },
  { path: 'scripts/verify/mobile-viewport-width-drive.mjs', lane: 'C', why: 'the mobile viewport sweep, lane C, merged 20 September 2026' },
]

/**
 * THE ONE FILE WHOSE JOB IS TO HOLD THE BROKEN LINE.
 *
 * `guard-failure-drills.mjs` stores each planted regression as DATA: a `find`
 * and a `replace` string it writes into another file and then takes back out.
 * The drill that proves THIS guard works necessarily carries
 * `deleteUser(id).catch(() => {})` as a string literal, and the first run of
 * that drill ended with the harness's own restored-tree check failing on this
 * guard, pointing at the harness.
 *
 * It is exempted by name rather than baselined, because it is not a debt and it
 * will never be converted: a drill that could not name the broken shape could
 * not plant it. This is the same distinction clause 6 of
 * no-analytics-before-consent had to learn on the same day, between an
 * instruction and a description of one.
 */
const PLANTS_REGRESSIONS_AS_DATA = [
  {
    path: 'scripts/verify/guard-failure-drills.mjs',
    why: 'the drill harness stores planted regressions as find/replace strings; naming the broken shape is how it plants it',
  },
]

const faults = []
const checks = { 'script swept': 0, 'baseline entry judged': 0 }

/** Every call of the API, in CODE. Comments describe the fault on purpose. */
const CALLS = /auth\s*\.\s*admin\s*\.\s*deleteUser\s*\(/

function* walk(dir) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) yield* walk(rel)
    else if (/\.(ts|mjs|js)$/.test(entry.name)) yield rel
  }
}

const baseline = new Set(NOT_YET_CONVERTED.map(e => e.path))
const exemptPaths = new Set(PLANTS_REGRESSIONS_AS_DATA.map(e => e.path))
const stillCalling = []

for (const rel of walk('scripts')) {
  checks['script swept'] += 1
  if (rel === THE_ONE_PLACE) continue
  if (exemptPaths.has(rel)) continue
  const code = stripComments(readFileSync(join(ROOT, rel), 'utf8'))
  if (!CALLS.test(code)) continue
  stillCalling.push(rel)
  if (baseline.has(rel)) continue
  faults.push(
    `${rel} calls auth.admin.deleteUser directly. There is one place that deletes an account, ${THE_ONE_PLACE}, because it is the only one that can tell an account that was already gone from a deletion that was REFUSED. Call ${THE_HELPER}(db, id) instead, or add this file to NOT_YET_CONVERTED with the lane that owns it`,
  )
}

/* ------------------------------ the baseline can only shrink */

for (const entry of NOT_YET_CONVERTED) {
  checks['baseline entry judged'] += 1
  if (!existsSync(join(ROOT, entry.path))) {
    faults.push(
      `${entry.path} is in NOT_YET_CONVERTED and does not exist. Delete the line: a baseline nobody prunes becomes a list nobody reads`,
    )
    continue
  }
  if (!stillCalling.includes(entry.path)) {
    faults.push(
      `${entry.path} is in NOT_YET_CONVERTED and no longer calls auth.admin.deleteUser directly. Lane ${entry.lane} has converted it. Delete the line`,
    )
  }
}

/* ---------------------------- the one place still does the job it was given */

const implementation = existsSync(join(ROOT, THE_ONE_PLACE))
  ? readFileSync(join(ROOT, THE_ONE_PLACE), 'utf8')
  : null
if (!implementation) {
  faults.push(`${THE_ONE_PLACE} is missing, so every caller below is calling nothing`)
} else {
  for (const needed of ['export function accountIsGone', `export async function ${THE_HELPER}`]) {
    checks['baseline entry judged'] += 1
    if (!implementation.includes(needed)) {
      faults.push(
        `${THE_ONE_PLACE} no longer has "${needed}". The whole point of one place is that the judgement lives there; without it every teardown is back to reporting a success it did not have`,
      )
    }
  }
  checks['baseline entry judged'] += 1
  if (!stripComments(implementation).includes('process.exitCode = 1')) {
    faults.push(
      `${THE_ONE_PLACE} no longer fails the run on a refused deletion. Printing alone is what the repository already had: eighteen accounts accumulated while every run printed a clean tear-down and exited 0`,
    )
  }
}

declareWork('one-way-to-delete-an-account', {
  did: { ...checks, 'file still calling the API directly': stillCalling.length },
  found: { 'teardown that could report a success it did not have': faults.length },
})

console.log(`${TAG} one place deletes an account: ${THE_ONE_PLACE}`)
console.log(`${TAG} ${PLANTS_REGRESSIONS_AS_DATA.length} file(s) exempt because they hold the broken shape as data:`)
for (const entry of PLANTS_REGRESSIONS_AS_DATA) console.log(`${TAG}   ${entry.path}  ${entry.why}`)
console.log(`${TAG} ${NOT_YET_CONVERTED.length} file(s) not yet converted, and this list can only shrink:`)
for (const entry of NOT_YET_CONVERTED) console.log(`${TAG}   lane ${entry.lane}  ${entry.path}  ${entry.why}`)

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} teardown(s) that could report a success they did not have.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(`${TAG} PASS - every account deletion outside the baseline goes through the one place that reports a refusal.`)
