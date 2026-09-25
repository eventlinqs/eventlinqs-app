/**
 * GUARD: A GUARD NOBODY HAS EVER SEEN FAIL IS NOT A GUARD.
 *
 * Lane B, 18 September 2026.
 *
 * WHY THIS EXISTS, and the evidence is written in so it cannot be argued away.
 *
 * `scripts/verify/guard-failure-drills.mjs` opens with that sentence and has
 * been right about it three times inside its own file: a drill pinned to a
 * superseded migration verified nothing while reporting green (20 August), the
 * same thing happened again to three inventory drills (6 September), and on
 * 18 September lane A shipped a guard whose matcher was built in a template
 * literal, where `\s` is not a recognised escape, so the pattern compiled to
 * `from s*` and the guard printed PASS about a file that violated it. Only the
 * red half of a drill found that one.
 *
 * Counting the registrations on 18 September 2026 found that 74 of the 148
 * entry points in run-guards.mjs had no drill at all. Eleven of them were lane
 * B's own, each "proven red and green" once, by hand, in the session that wrote
 * it, with the output pasted into an evidence file. That is a claim about a
 * session nobody can replay, and drilling those eleven properly found three
 * real defects in two hours:
 *
 *   - consent-ledger-is-evidence never checked the campaigner's own runner,
 *     the module that decides who receives a marketing message, because it
 *     reaches the transport one hop away through './sink'.
 *   - forecast-reads-every-number accepted an IMPORT of getLivePublicFee as
 *     proof the fee was read, so FT1's own "proven red by hard coding the fee"
 *     could not have gone red.
 *   - founding-offer-matches-configuration accepted the same, and then
 *     accepted a COMMENT containing "getLivePublicFee (displayed == charged)"
 *     as the call itself.
 *
 * None of those was visible from a green run. All three were visible the
 * instant something tried to make the guard fail.
 *
 * WHAT THIS FAILS ON. A guard registered in run-guards.mjs, therefore blocking
 * on prebuild, with no entry in the drill harness, and not named in the
 * baseline below.
 *
 * WHAT IT DOES NOT DO, stated so nobody mistakes its silence for approval: it
 * cannot judge whether a drill is a GOOD one. A drill that plants a fault the
 * guard was always going to catch, aimed at a clause nobody cares about,
 * satisfies this. It answers one question only, and it is the question 74
 * registered guards could not answer at all: has anybody ever watched this
 * thing fail.
 *
 * THE BASELINE, AND WHY IT IS DATED. 63 entry points registered before this
 * guard was written have no drill. They belong to work this lane does not own,
 * and failing the build on all 63 would produce a gate somebody switches off
 * within the hour, which is the outcome CLAUDE.md names by hand in Law 8 when
 * it explains why the authorship guard is bounded by a date. So they are listed
 * here, with the reason, as DEBT THAT IS VISIBLE rather than as approval. Every
 * guard registered from today needs a drill.
 *
 * ROT IS REPORTED, NOT FAILED, and the choice is deliberate. A baseline entry
 * that has since been drilled, or that names a guard no longer registered, is
 * printed in a banner naming the exact line to delete. It does not fail the
 * build, because the other two lanes share this machine and a push costs 48
 * minutes: refusing one over a line somebody has already made obsolete by doing
 * the right thing would teach the wrong lesson. This follows the behaviour
 * CLAUDE.md records for scripts/guards/sourced-specifications.mjs, which
 * "prints its reviewed baseline on every run, and reports baseline entries that
 * no longer match anything, so the allowlist cannot rot into an unexamined
 * list."
 *
 * Run: node scripts/guards/every-guard-has-been-seen-to-fail.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { registeredEntryPoints, drilledGuards } from './lib/guard-drill-coverage.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[every-guard-has-been-seen-to-fail]'

const RUN_GUARDS = 'scripts/guards/run-guards.mjs'
const DRILLS = 'scripts/verify/guard-failure-drills.mjs'

/**
 * The date this guard was written. Everything registered before it and still
 * undrilled is in the baseline below; everything registered after it is not
 * eligible for one.
 */
const EFFECTIVE_FROM = '2026-09-18'

/**
 * Registered and undrilled on 2026-09-18, measured rather than remembered.
 * Not one of these is approved: each is a guard whose ability to fail has never
 * been demonstrated, and the honest description of the list is a debt register.
 *
 * FIVE OF THESE WERE INVISIBLE TO THE FIRST COUNT, and they are marked below,
 * because how they hid is the reason this guard parses instead of searching.
 * The count that found the other 58 asked whether the harness's text CONTAINED
 * each guard's name. cron-routes-scheduled, no-ai-authorship, no-ambiguous-embed,
 * no-control-characters and no-inherited-git-env are all NAMED in the harness,
 * in its header or in a comment explaining a neighbouring drill, and not one of
 * them is aimed at by a drill. A mention read as a drill. The parse below reads
 * the `guard:` field of each entry and found all five on its first run.
 */
const BASELINE = [
  'scripts/guards/alert-routing.mjs',
  // The five that a substring count read as drilled because the harness names them in prose.
  'scripts/guards/cron-routes-scheduled.mjs',
  'scripts/guards/no-ai-authorship.mjs',
  'scripts/guards/no-ambiguous-embed.mjs',
  'scripts/guards/no-control-characters.mjs',
  'scripts/guards/no-inherited-git-env.mjs',
  'scripts/guards/busy-region-names-itself.mjs',
  'scripts/guards/buyer-total-is-marked.mjs',
  'scripts/guards/canonical-host-runtime.mjs',
  'scripts/guards/canonical-host.mjs',
  'scripts/guards/community-editorial-reachable.mjs',
  'scripts/guards/curated-categories-exist.mjs',
  'scripts/guards/door-live-published.mjs',
  'scripts/guards/event-lifecycle-installed.mjs',
  'scripts/guards/gate-fields-complete.mjs',
  'scripts/guards/gate-servers-carry-a-limiter.mjs',
  'scripts/guards/geocoding-key-posture.mjs',
  'scripts/guards/grid-track-cannot-blow-out.mjs',
  'scripts/guards/ledger-append-only.mjs',
  'scripts/guards/ledger-speaks-no-industry.mjs',
  'scripts/guards/ledger-writes-through-the-adapter.mjs',
  'scripts/guards/migration-needs-sale-gate-fix.mjs',
  'scripts/guards/mutation-revalidates.mjs',
  'scripts/guards/no-deprecated-runtime.mjs',
  'scripts/guards/no-display-time-exclusion.mjs',
  'scripts/guards/no-external-checkout.mjs',
  'scripts/guards/no-glassmorphism.mjs',
  'scripts/guards/no-native-submit-guard.mjs',
  'scripts/guards/no-partial-builds.mjs',
  'scripts/guards/no-plaintext-credential.mjs',
  'scripts/guards/no-unguarded-credential-form.mjs',
  'scripts/guards/offline-door-integrity.mjs',
  'scripts/guards/one-contact-domain.mjs',
  'scripts/guards/one-db-read-door.mjs',
  'scripts/guards/one-door-to-the-requirement-watch.mjs',
  'scripts/guards/one-platform-entity.mjs',
  'scripts/guards/one-refund-path.mjs',
  'scripts/guards/one-sellability-source.mjs',
  'scripts/guards/one-venue-address-format.mjs',
  'scripts/guards/organiser-prose-one-rule.mjs',
  'scripts/guards/platform-notifications-installed.mjs',
  'scripts/guards/price-history-integrity.mjs',
  'scripts/guards/proper-nouns-intact.mjs',
  'scripts/guards/publish-requires-cover.mjs',
  'scripts/guards/push-arming-cannot-fail-silently.mjs',
  'scripts/guards/scannable-instruction-has-a-qr.mjs',
  'scripts/guards/schema-ahead-of-code.mjs',
  'scripts/guards/shared-log-is-opened-for-append.mjs',
  'scripts/guards/short-link-namespace.mjs',
  'scripts/guards/sourced-specifications.mjs',
  'scripts/guards/statement-descriptor-premise-holds.mjs',
  'scripts/guards/stream-link-never-public.mjs',
  'scripts/guards/tier-identity-preserved.mjs',
  'scripts/guards/trigger-columns-exist.mjs',
  'scripts/guards/zoned-event-times.mjs',
  'scripts/pricing-derive.mjs',
  'scripts/security/entrypoint-authz-audit.mjs',
  'scripts/security/rls-exposure-scan.mjs',
  'scripts/verify/migration-collision-guard.mjs',
  'scripts/verify/payment-critical-doctrine.mjs',
]

function read(rel) {
  const file = join(ROOT, rel)
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8')
}

const runGuardsSource = read(RUN_GUARDS)
const drillsSource = read(DRILLS)

const faults = []
if (!runGuardsSource) faults.push(`${RUN_GUARDS} is not on disk, so nothing can say which guards are registered`)
if (!drillsSource) faults.push(`${DRILLS} is not on disk, so nothing can say which guards have ever been seen to fail`)

let registered = []
let drilled = []
let undrilled = []
const rot = []

if (runGuardsSource && drillsSource) {
  registered = registeredEntryPoints(runGuardsSource).filter(p => p !== RUN_GUARDS)
  drilled = drilledGuards(drillsSource)
  const drilledSet = new Set(drilled)
  const baselineSet = new Set(BASELINE)

  undrilled = registered.filter(p => !drilledSet.has(p))

  for (const path of undrilled) {
    if (baselineSet.has(path)) continue
    faults.push(
      `${path} is registered in ${RUN_GUARDS}, so it blocks every build, and no drill in ${DRILLS} has ever made it fail. ` +
        `Add a drill: plant the real regression it exists to catch, name the reason it must print, and run ` +
        `node scripts/verify/guard-failure-drills.mjs --only ${path.split('/').pop().replace('.mjs', '')} to watch it go red.`,
    )
  }

  const registeredSet = new Set(registered)
  for (const path of BASELINE) {
    if (!registeredSet.has(path)) rot.push({ path, why: 'is no longer registered in run-guards.mjs' })
    else if (drilledSet.has(path)) rot.push({ path, why: 'now has a drill, which is the whole point' })
  }
}

declareWork('every-guard-has-been-seen-to-fail', {
  did: {
    'registered entry point read': registered.length,
    'guard with a drill in the harness': drilled.length,
    'baseline entry checked': BASELINE.length,
  },
  found: { 'blocking guard with no drill': faults.length },
  zeroIsFine: {
    'blocking guard with no drill':
      'zero is the goal state: every guard registered since ' + EFFECTIVE_FROM + ' has a drill',
  },
  exitOnZero: false,
})

console.log(
  `${TAG} ${registered.length} registered entry point(s), ${drilled.length} with a drill, ` +
    `${undrilled.length} without, of which ${BASELINE.length} are the baseline of ${EFFECTIVE_FROM}`,
)

if (rot.length > 0) {
  console.log('')
  console.log(`${TAG} THE BASELINE HAS ${rot.length} LINE(S) TO DELETE. This does not fail the build.`)
  for (const entry of rot) console.log(`${TAG}   ${entry.path}  ${entry.why}`)
  console.log(`${TAG} Delete them from BASELINE in ${'scripts/guards/every-guard-has-been-seen-to-fail.mjs'},`)
  console.log(`${TAG} so the list keeps describing the debt that is actually there.`)
  console.log('')
}

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} blocking guard(s) that nobody has ever seen fail.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(
  `${TAG} PASS - every guard registered since ${EFFECTIVE_FROM} has been watched to fail, and the ` +
    `${BASELINE.length} older ones that have not are named rather than hidden.`,
)
