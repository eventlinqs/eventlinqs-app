/**
 * NO GUARD BYPASS IS EVER SET ON A MACHINE THAT BUILDS FOR OTHER PEOPLE.
 *
 * Close-out F1.4: "scripts/check-pricing-lock.mjs offers ALLOW_PRICING_DRIFT=1 as
 * an emergency bypass. Register a blocking guard that fails if that variable is
 * set in CI or in any Vercel environment, and prove it fails as well as passes."
 *
 * WHY A BYPASS IS DIFFERENT FROM A WRONG VALUE. A wrong value produces a failure
 * somebody investigates. A bypass produces SILENCE, and silence is
 * indistinguishable from correctness. ALLOW_PRICING_DRIFT=1 does not merely skip
 * a check: it lets a build ship whose live fee disagrees with docs/PRICING.md,
 * which is the single authority every fee figure on the platform derives from.
 * Used once in an emergency and never removed, it is a lock that has quietly
 * stopped being a lock, and nothing anywhere would say so.
 *
 * WHAT IT JUDGES.
 *
 *   1. The subject list is DERIVED from src/lib/env/manifest.mjs, never retyped:
 *      every entry forbidden on all three Vercel scopes whose name begins with
 *      ALLOW_. A bypass declared in the manifest tomorrow is covered today.
 *   2. The derived list must still contain ALLOW_PRICING_DRIFT, the one F1.4
 *      names. A rename or a deletion that silently emptied the list would
 *      otherwise leave this guard passing while guarding nothing, which is the
 *      failure class close-out F1.9.1 exists to end.
 *   3. On a CONFIGURED machine (Vercel or a CI runner, per the one shared
 *      resolver in src/lib/health/build-scope.mjs), any of them set to a
 *      non-empty value FAILS the build, naming the variable.
 *
 * WHERE IT DELIBERATELY DOES NOT FAIL. A developer machine. These exist to be
 * set inline, for one command, on one laptop, to ship a fix; that is the whole
 * design and the manifest says so. It is still REPORTED there, so a bypass left
 * exported in a shell is visible rather than silent.
 *
 * The manifest also forbids each of them on every Vercel STORE, which the env
 * locks check. That is the configuration half. This is the EXECUTED half: it
 * reads the process environment the build actually has, so an inline
 * `ALLOW_PRICING_DRIFT=1 vercel build` is caught as well as a stored record.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs: the variable set
 * with a CI environment, and the derived list emptied of the variable F1.4 names.
 *
 * Run: node scripts/guards/no-build-guard-bypass.mjs
 */
import { declareWork } from '../lib/work-report.mjs'
import { ENV_MANIFEST } from '../../src/lib/env/manifest.mjs'
import { describeBuildScope, resolveBuildScope } from '../../src/lib/health/build-scope.mjs'

const TAG = '[no-build-guard-bypass]'
const VERCEL_SCOPES = ['production', 'preview', 'development']

/** The one F1.4 names. Its absence from the derived list is itself a fault. */
const MUST_BE_COVERED = 'ALLOW_PRICING_DRIFT'

const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

const bypasses = ENV_MANIFEST.filter(
  (e) => e.name.startsWith('ALLOW_') && VERCEL_SCOPES.every((s) => (e.forbiddenOn ?? []).includes(s)),
)

const { scope, blocks } = resolveBuildScope(process.env)
console.log(`${TAG} ${describeBuildScope(process.env)}`)
console.log(`${TAG} bypasses derived from the manifest (printed so the list cannot rot unexamined):`)
for (const e of bypasses) console.log(`${TAG}   ${e.name}  ${e.describe}`)

if (!bypasses.some((e) => e.name === MUST_BE_COVERED)) {
  fail(
    `${MUST_BE_COVERED} is not in the derived list, so this guard is guarding nothing. ` +
      'Close-out F1.4 names it specifically. Either it was renamed in src/lib/env/manifest.mjs, ' +
      'or it stopped being forbidden on all three Vercel scopes; fix the manifest, not this guard.',
  )
}

const set = bypasses.filter((e) => (process.env[e.name] ?? '').trim() !== '')

for (const e of set) {
  if (blocks) {
    fail(
      `${e.name} is set on a ${scope} build. ${e.describe}. ` +
        'A bypass switched on where other people consume the result does not report a problem, it removes the report. ' +
        'Unset it in the workflow or in the Vercel environment, then rebuild.',
    )
  } else {
    console.warn(
      `${TAG} WARNING: ${e.name} is set on this developer machine. That is legitimate for one command ` +
        'to ship a fix, and it would BLOCK on Vercel and in CI. Unset it before you forget it is there.',
    )
  }
}

declareWork('no-build-guard-bypass', {
  did: {
    'manifest entry scanned': ENV_MANIFEST.length,
    'bypass variable derived': bypasses.length,
  },
  found: { 'bypass set on a configured machine': faults.length },
  zeroIsFine: {
    'bypass set on a configured machine':
      'no bypass switched on is the goal state, and on a developer machine one that IS set is reported as a warning rather than counted here',
  },
  exitOnZero: false,
})

if (faults.length > 0) {
  console.error(`${TAG} ${faults.length} fault(s). Build blocked.`)
  process.exit(1)
}

console.log(
  `${TAG} PASS - ${bypasses.length} declared bypass(es), none set on a ${scope} build` +
    `${blocks ? '' : ' (a developer machine, where they are reported rather than refused)'}.`,
)
