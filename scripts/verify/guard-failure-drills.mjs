/**
 * GUARD FAILURE DRILLS.
 *
 * "A guard never seen to fail is not a guard." This harness introduces each
 * violation the guards exist to catch, runs the guard, asserts it exits
 * non-zero with the expected reason, and restores the file - every time, on
 * demand, rather than once by hand in a session nobody can replay.
 *
 * Every drill is a real regression that has actually happened or is one edit
 * away:
 *   - an ungated <GoogleButton />                 the 2026-08-02 production defect
 *   - a provider button in an unregistered file   a new provider added carelessly
 *   - an optional gate prop                       a refactor weakening the contract
 *   - a page that never resolves provider state   a new auth page copied wrongly
 *   - auth.resetPasswordForEmail() returning      the "Error sending recovery email" defect
 *   - a sender address literal                    the five-file domain sprawl
 *   - autocomplete="email" on a sign-in field     the "Chrome offered nothing" defect
 *   - a missing name attribute                    same defect, other half
 *
 * Files are restored in a `finally`, the restore is then OBSERVED rather than
 * assumed, and the harness re-verifies a clean pass at the end.
 *
 * THIS PARAGRAPH USED TO CLAIM THAT THE `finally` MEANT "an interrupted run
 * cannot leave a mutated tree behind". It did not, and the false assurance cost
 * two sessions: a power loss on 16 September 2026 committed `process.exit(1)`
 * into no-control-characters.mjs, and a usage-limit kill on 17 September left
 * `<LoginForm googleEnabled={true} />` in the login page. A `finally` runs when
 * a block exits and never when a process is killed. Crash safety comes from the
 * on-disk journal instead (scripts/verify/lib/drill-journal.mjs): the original
 * bytes are recorded BEFORE each mutation, an interrupted run therefore leaves
 * an entry behind, and scripts/guards/no-drill-residue.mjs fails the build while
 * any entry exists.
 *
 * Usage: node scripts/verify/guard-failure-drills.mjs
 *        node scripts/verify/guard-failure-drills.mjs --restore   (undo an
 *        interrupted run, in one command, from the bytes in the journal)
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { resolveVercelToken } from '../lib/vercel-login.mjs'
import * as journal from './lib/drill-journal.mjs'

const ROOT = process.cwd()
// A single backslash, built rather than typed, because a drill anchor that must
// contain one is the exact shape this file has lost twice to escaping.
const BSL = String.fromCharCode(92)
const GUARDS = 'scripts/guards'

/*
 * `--restore` RUNS BEFORE ANYTHING ELSE IN THIS FILE, and that placement is the
 * point rather than tidiness.
 *
 * It is the repair command for a tree a killed drill left mutated, so it is
 * reached exactly when things have already gone wrong. Everything below this
 * block resolves an effective migration, asks Vercel for a deployment held in
 * ERROR, reads the CLI login and lists open pull requests. A repair that needs a
 * token and a network is a repair that is unavailable on the aeroplane, on a
 * flat battery, and on the machine whose power just failed, which is the only
 * kind of machine that ever needs it.
 *
 * It reads nothing but the journal and the files the journal names.
 */
if (process.argv.includes('--restore')) {
  const { restored, stuck } = journal.restoreAll(ROOT)
  for (const f of restored) console.log(`[drills] restored ${f}`)
  for (const s of stuck) console.error(`[drills] COULD NOT RESTORE ${s.entryPath}: ${s.why}`)
  if (restored.length === 0 && stuck.length === 0) {
    console.log('[drills] the journal is empty: no drill was interrupted, nothing to restore.')
  }
  process.exit(stuck.length > 0 ? 1 : 0)
}

/*
 * THE EFFECTIVE MIGRATION. A guard reads the LAST migration that defines a
 * function, so a drill has to mutate that same file. A drill pinned to a
 * superseded definition verifies nothing while still looking green, which is why
 * this is computed rather than written down.
 *
 * DERIVED, NOT PINNED, since 2026-08-20. Naming the file once was an improvement
 * on naming it four times, but it still had to be edited by hand every time a
 * function was redefined, and on 20 August it was not: 20260820000001 and
 * 20260820000003 redefined reconcile_refund and these constants still pointed at
 * 20260819000004. Three drills went on reporting green while mutating a
 * superseded definition, which is the precise failure this harness exists to
 * catch, occurring inside the harness itself.
 *
 * The effective definition is now computed the same way the guards compute it -
 * the LAST migration in version order that defines the function - so a new
 * migration cannot leave a drill pointing at a dead target.
 */
function effectiveDefinitionOf(fnName) {
  const dir = 'supabase/migrations'
  const re = new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+(public\\.)?${fnName}\\s*\\(`, 'i')
  const hits = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => re.test(readFileSync(join(dir, f), 'utf8')))
  if (hits.length === 0) throw new Error(`no migration defines ${fnName}; the drill harness cannot aim`)
  return `${dir}/${hits[hits.length - 1]}`
}

const NEW_EFFECTIVE_CONFIRM = effectiveDefinitionOf('confirm_order')
const NEW_EFFECTIVE_RECONCILE = effectiveDefinitionOf('reconcile_refund')
/*
 * create_reservation joined the derived set on 6 September 2026 (close-out
 * C13), the day 20260906000002 redefined it with the event status gate and the
 * three inventory drills below went on mutating 20260704000005, reporting
 * "DID NOT FAIL" three times over: the harness's own failure, again, one
 * migration later. Derived now, so the next redefinition cannot repeat it.
 */
const NEW_EFFECTIVE_RESERVATION = effectiveDefinitionOf('create_reservation')

/*
 * THE LOCKED FEE, DERIVED, so a drill cannot pin the founder's own number.
 *
 * founding-offer-matches-configuration builds the literals it FORBIDS out of
 * the PRICING-LOCK block, which is the right design: changing the fee changes
 * what may not be typed. A drill for that clause has to plant the current
 * forbidden literal, and writing "3.5" into this file would mean the day the
 * founder edits the fee in /admin/pricing and the lock block, this drill stops
 * firing and reports DID NOT FAIL about a guard that is working perfectly.
 *
 * It is read out of src/lib/pricing/public-fee.ts rather than out of
 * docs/PRICING.md, for two reasons. The fallback constant is under src/ and is
 * therefore in the Vercel upload, so nothing here acquires a docs read; and the
 * guard being drilled ASSERTS that constant equals the lock block, so if the
 * two ever disagree that guard fails on its own clause 4 before this matters.
 */
function lockedPercentFromFallback() {
  const file = 'src/lib/pricing/public-fee.ts'
  if (!existsSync(join(ROOT, file))) return null
  const m = readFileSync(join(ROOT, file), 'utf8').match(/percent:\s*([\d.]+)/)
  return m ? m[1] : null
}
const LOCKED_PERCENT = lockedPercentFromFallback()
console.log(`[drills] locked fee percentage, derived: ${LOCKED_PERCENT ?? '(unreadable)'}`)
console.log(`[drills] effective confirm_order:   ${NEW_EFFECTIVE_CONFIRM}`)
console.log(`[drills] effective reconcile_refund: ${NEW_EFFECTIVE_RECONCILE}`)
console.log(`[drills] effective create_reservation: ${NEW_EFFECTIVE_RESERVATION}`)

/*
 * THE ERROR DEPLOYMENT TO AIM AT. preview-deployment-state judges the deployment
 * of the commit under test, so its drill points GITHUB_SHA at a commit whose
 * deployment Vercel holds in ERROR, found live (GET /v7/deployments?state=ERROR)
 * rather than written down, for the same reason the effective migrations above
 * are computed: a sha pinned here rots the day retention deletes that
 * deployment, and a drill aimed at nothing reports "DID NOT FAIL" for ever.
 * Needs a Vercel login, as the guard does; without one, or with no ERROR
 * deployment on the project, the drill cannot aim and reports STALE with the
 * reason. Nothing is mutated on disk for this drill: the fault is real and
 * lives on Vercel.
 */
async function newestErrorDeployment() {
  const { token } = resolveVercelToken()
  if (!token) return { error: 'no VERCEL_TOKEN and no Vercel CLI login, so no ERROR deployment can be found to aim at' }
  let projectId = process.env.VERCEL_PROJECT_ID
  let teamId = process.env.VERCEL_ORG_ID
  const projectJson = join(ROOT, '.vercel', 'project.json')
  if ((!projectId || !teamId) && existsSync(projectJson)) {
    const cfg = JSON.parse(readFileSync(projectJson, 'utf8'))
    projectId = projectId || cfg.projectId
    teamId = teamId || cfg.orgId
  }
  if (!projectId || !teamId) return { error: 'no Vercel project and team id (VERCEL_PROJECT_ID, VERCEL_ORG_ID or .vercel/project.json)' }
  const url = `https://api.vercel.com/v7/deployments?projectId=${encodeURIComponent(projectId)}&teamId=${encodeURIComponent(teamId)}&state=ERROR&limit=1`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return { error: `Vercel answered HTTP ${res.status} listing ERROR deployments` }
  const d = (await res.json()).deployments?.[0]
  if (!d?.meta?.githubCommitSha) return { error: 'the project holds no deployment in ERROR to aim at' }
  return { sha: d.meta.githubCommitSha, ref: d.meta.githubCommitRef, url: d.inspectorUrl || d.url }
}
const AIM = await newestErrorDeployment()
console.log(`[drills] ERROR deployment for preview-deployment-state to judge: ${AIM.sha ? `${AIM.sha.slice(0, 7)} on ${AIM.ref} (${AIM.url})` : `NONE (${AIM.error})`}`)

/*
 * THE STORE FOR production-parity TO JUDGE. The environment half of
 * scripts/ops/production-parity.mjs (close-out C16.2.1, 7 September 2026)
 * reads the production scope of the Vercel store and judges it against
 * src/lib/env/manifest.mjs. The close-out asks for the gate to be watched
 * refusing a deliberately broken production-only value. Breaking one ON
 * VERCEL is a write to production, which no session holds approval for and
 * which would break the live site for real, so the fault is planted on the
 * other side of the comparison: the store is read for real, and the contract
 * it is judged against is what moves. From the judge's side the two are one
 * finding ('missing', 'forbidden-present'): the same lines a broken store
 * produces, from the same function, on the same live listing. Needs the
 * Vercel login, as the step does; without one the drills cannot aim and
 * report STALE with the reason.
 */
const PARITY_LOGIN = resolveVercelToken()
const PARITY_STALE = PARITY_LOGIN.token ? null : `${PARITY_LOGIN.reason}, so the production store cannot be read`
console.log(`[drills] production store for production-parity to judge: ${PARITY_STALE ? `NONE (${PARITY_STALE})` : `read with ${PARITY_LOGIN.source}`}`)

/*
 * THE LIVE PULL REQUEST LIST FOR one-pull-request-at-a-time TO JUDGE (close-out
 * PR5). Both of its drills mutate the reviewed parked record and let the guard
 * read the REAL open list, so they need the same credential the guard needs.
 * Without one the guard SKIPs, exit 0, and a drill against a skipping guard
 * reports "DID NOT FAIL" for ever, so the absence is declared STALE with the
 * reason instead.
 *
 * DERIVED, NOT PINNED, for the same reason the effective migrations above are:
 * the anchor is the LAST entry's number read out of the record itself, and the
 * closed pull request to point it at is found live. A number written down here
 * rots the day that entry is unparked, and a drill aimed at nothing is the
 * failure this harness exists to catch.
 */
function ghCanListPullRequests() {
  if (process.env.GITHUB_TOKEN) return true
  const probe = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' })
  return probe.status === 0
}
const PARKED_RECORD_PATH = 'scripts/guards/lib/parked-pull-requests.json'
const PARKED_RECORD = JSON.parse(readFileSync(join(ROOT, PARKED_RECORD_PATH), 'utf8'))
const LAST_PARKED = PARKED_RECORD.parked?.[PARKED_RECORD.parked.length - 1] ?? null
const PR_LIST_STALE = ghCanListPullRequests()
  ? LAST_PARKED
    ? null
    : `${PARKED_RECORD_PATH} holds no parked entry, so there is nothing for the rot drill to move`
  : 'no GITHUB_TOKEN and no gh login, so the open pull request list cannot be read and the guard would SKIP'

function newestClosedPullRequest() {
  if (!ghCanListPullRequests()) return { error: 'no credential to list pull requests' }
  const res = spawnSync('gh', ['api', 'repos/{owner}/{repo}/pulls?state=closed&per_page=1'], { encoding: 'utf8' })
  if (res.status !== 0) return { error: `gh could not list closed pull requests (${(res.stderr || '').trim().split('\n')[0]})` }
  const first = JSON.parse(res.stdout)[0]
  if (!first) return { error: 'the repository holds no closed pull request to point the drill at' }
  return { number: first.number }
}
const CLOSED_PR = PR_LIST_STALE ? { error: PR_LIST_STALE } : newestClosedPullRequest()
const CLOSED_PR_NUMBER = CLOSED_PR.number ?? null
const CLOSED_PR_STALE = CLOSED_PR.error ?? null
console.log(
  `[drills] open pull requests for one-pull-request-at-a-time to judge: ` +
    `${PR_LIST_STALE ? `NONE (${PR_LIST_STALE})` : `readable; rot drill moves #${LAST_PARKED.number} onto closed #${CLOSED_PR_NUMBER ?? '?'}`}`,
)

const DRILLS = [
  /*
   * preview-deployment-state (close-out C16, 7 September 2026), one drill: the
   * guard is run exactly as CI runs it on a push of a commit whose deployment
   * is in ERROR, and must refuse naming that deployment. This is the guard that
   * had been judging the previous commit's deployment; the drill asks about a
   * specific commit and expects the answer about that commit.
   */
  {
    name: 'the commit under test has a deployment in ERROR',
    guard: `${GUARDS}/preview-deployment-state.mjs`,
    env: AIM.sha ? { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: AIM.ref, GITHUB_SHA: AIM.sha, PREVIEW_STATE_WAIT_SECONDS: '60' } : null,
    stale: AIM.error ?? null,
    expect: 'FAILED: the deployment of',
  },
  /*
   * production-parity (close-out C16.2.1), two drills on the environment half,
   * each run against the REAL production store: a variable the manifest
   * requires on production that the store does not hold, and a variable the
   * store holds that the manifest forbids there. The finding must name the
   * record and its state; a bare "FAIL" would pass on the schema half alone,
   * which refuses whenever production is behind the tree.
   */
  {
    name: 'production parity: a variable REQUIRED on production that the store does not hold',
    guard: 'scripts/ops/production-parity.mjs',
    file: 'src/lib/env/manifest.mjs',
    find: 'export const ENV_MANIFEST = [\n',
    replace:
      'export const ENV_MANIFEST = [\n' +
      "  { name: 'A_RECORD_THE_DRILL_REQUIRES', describe: 'a record the drill requires on production and the store does not hold', requiredOn: ['production'], forbiddenOn: [], mustBeSensitive: false, previewBranchScoping: 'allowed', shape: SHAPES.anyNonEmpty, paymentCritical: false, githubActions: false, publicVar: false },\n",
    stale: PARITY_STALE,
    expect: 'A_RECORD_THE_DRILL_REQUIRES [missing]',
  },
  {
    name: 'production parity: a variable the store holds that the manifest FORBIDS on production',
    guard: 'scripts/ops/production-parity.mjs',
    file: 'src/lib/env/manifest.mjs',
    find: "    forbiddenOn: [],\n    optionalReason:\n      'getSiteUrl() resolves a correct branded origin",
    replace: "    forbiddenOn: ['production'],\n    optionalReason:\n      'getSiteUrl() resolves a correct branded origin",
    stale: PARITY_STALE,
    expect: 'NEXT_PUBLIC_SITE_URL [forbidden-present]',
  },
  /*
   * branch-protection-required (close-out C16.2.4), one drill: the guard is told
   * to require a context main does not require, and the live protection read
   * back from GitHub no longer satisfies it. Needs gh credentials, as the guard does.
   */
  {
    name: 'main is asked for a required check it does not carry',
    guard: `${GUARDS}/branch-protection-required.mjs`,
    file: 'scripts/guards/branch-protection-required.mjs',
    find: "export const REQUIRED_CONTEXTS = ['lint · typecheck · build', 'test (vitest)', 'production parity']",
    replace: "export const REQUIRED_CONTEXTS = ['lint · typecheck · build', 'test (vitest)', 'production parity', 'a check nobody configured']",
    expect: 'required status checks are missing',
  },
  /*
   * one-pull-request-at-a-time (close-out PR5), two drills, both aimed at the
   * REAL live list of open pull requests rather than at a fixture, because the
   * unit tests already drive every shape and what cannot be tested offline is
   * that the guard is pointed at the right repository and reads it correctly.
   *
   * The first empties the reviewed parked record, so the three pull requests
   * held on purpose all become unaccounted for and the count rule fires. The
   * second leaves the count alone and moves one entry's number onto a pull
   * request that is closed, which is the record outliving its subject: the rot
   * check, in isolation, with the count still legal.
   */
  {
    name: 'the reviewed parked record is emptied and the held pull requests become unaccounted for',
    guard: `${GUARDS}/one-pull-request-at-a-time.mjs`,
    file: 'scripts/guards/lib/parked-pull-requests.json',
    find: '"parked": [',
    replace: '"parked": [], "_parkedDuringTheDrill": [',
    stale: PR_LIST_STALE,
    expect: 'are open and unaccounted for',
  },
  {
    name: 'a parked entry outlives the pull request it explains',
    guard: `${GUARDS}/one-pull-request-at-a-time.mjs`,
    file: 'scripts/guards/lib/parked-pull-requests.json',
    find: LAST_PARKED ? `"number": ${LAST_PARKED.number},` : '"number": 0,',
    replace: `"number": ${CLOSED_PR_NUMBER ?? 0},`,
    stale: PR_LIST_STALE ?? CLOSED_PR_STALE,
    expect: 'is not open any more',
  },
  /*
   * launch-readiness-honest (close-out L5, 9 September 2026), five drills, one
   * per way the readiness report can be made to say something the evidence does
   * not. The first is the one that matters and is the reason the guard exists: a
   * report whose verdict is edited in the markdown. The others are the shapes
   * C10.4's roast found in the scope audit, aimed at this document instead.
   */
  {
    name: 'the launch readiness verdict is edited by hand in the markdown',
    guard: `${GUARDS}/launch-readiness-honest.mjs`,
    file: 'docs/verification/LAUNCH-READINESS.md',
    find: '## VERDICT: NOT LAUNCH READY',
    replace: '## VERDICT: LAUNCH READY',
    expect: 'does not match what the adjudication renders',
  },
  {
    name: 'a PASS row cites evidence that is not in the repository',
    guard: `${GUARDS}/launch-readiness-honest.mjs`,
    file: 'scripts/verify/launch-readiness.mjs',
    find: 'route-sweep-2026-09-09.json',
    replace: 'route-sweep-that-somebody-deleted.json',
    expect: 'which is not in the repository',
  },
  {
    name: 'a PASS row also names something the owner has to supply',
    guard: `${GUARDS}/launch-readiness-honest.mjs`,
    file: 'scripts/verify/launch-readiness.mjs',
    find: '    n: 14,\n',
    replace: "    n: 14,\n    needs: 'test-account',\n",
    expect: 'also names an owner need',
  },
  {
    name: 'an OWNER BLOCKED need grows a second sentence',
    guard: `${GUARDS}/launch-readiness-honest.mjs`,
    file: 'scripts/verify/launch-readiness.mjs',
    find: 'L1 requires them driven there rather than on TEST.',
    replace: 'L1 requires them driven there rather than on TEST. It would also be convenient.',
    expect: 'C10.4 says one',
  },
  {
    name: 'an L1 row is renumbered out of the sixteen and nobody adjudicates it',
    guard: `${GUARDS}/launch-readiness-honest.mjs`,
    file: 'scripts/verify/launch-readiness.mjs',
    find: '    n: 15,\n',
    replace: '    n: 17,\n',
    expect: 'L1 item 15 has no row',
  },
  /*
   * vercelignore-covers-guard-reads (close-out C18 FINAL, rewritten for F1.9.2),
   * three drills: the approved record's re-inclusion lost, THE FOURTH LOST
   * DEPLOYMENT RESTORED EXACTLY (commit 7564b40 had no docs/verification lines at
   * all), and a required entry that has rotted away from any reader.
   */
  {
    name: 'the approved record is excluded from the Vercel upload again',
    guard: `${GUARDS}/vercelignore-covers-guard-reads.mjs`,
    file: '.vercelignore',
    find: '!docs/scope/community-layer-approved.json',
    replace: '!docs/scope/community-layer-approved.json.retired',
    expect: 'docs/scope/community-layer-approved.json does not survive .vercelignore',
  },
  {
    /*
     * THE FOURTH OCCURRENCE, put back byte for byte. These four lines are the
     * whole difference between this tree and 7564b40, whose preview build died
     * on launch-readiness-honest.mjs. The guard was separately run against
     * 7564b40's own .vercelignore, unchanged, as close-out F1.9.2 PART TWO asks:
     * C:\\dev\\EVIDENCE\\F1.9.2\\part-two-red-on-7564b40.txt
     */
    name: 'the launch readiness report is excluded from the upload again (commit 7564b40)',
    guard: `${GUARDS}/vercelignore-covers-guard-reads.mjs`,
    file: '.vercelignore',
    find: '!docs/verification/\ndocs/verification/*\n!docs/verification/LAUNCH-READINESS.md\n!docs/verification/launch-readiness/',
    replace: '# the four lines 7564b40 did not have',
    expect: 'docs/verification/LAUNCH-READINESS.md does not survive .vercelignore',
  },
  {
    name: 'a required docs read outlives every script that reads it',
    guard: `${GUARDS}/vercelignore-covers-guard-reads.mjs`,
    file: 'scripts/guards/lib/vercelignore-registry.mjs',
    find: 'export const REQUIRED_READS = {',
    replace:
      "export const REQUIRED_READS = {\n  'docs/EVENT-LIFECYCLE.md':\n    'a drill entry naming a real file that no build-time script reads',",
    expect: 'is named by no build-time script; the registry entry has rotted',
  },
  /*
   * excluded-reads-survive-the-upload (8 September 2026, derived for F1.9.2). The
   * regression is a prebuild entry point that reads a docs/ path the upload does
   * not carry: exactly what killed 7564b40's preview while the local gate stayed
   * green. Pointing the report at docs/verification/system-pass, which is NOT
   * re-included, reproduces it without touching the guard's own logic.
   */
  {
    name: 'a prebuild guard reads a docs path the upload does not carry',
    guard: `${GUARDS}/excluded-reads-survive-the-upload.mjs`,
    file: 'scripts/verify/launch-readiness.mjs',
    find: "export const REPORT_PATH = 'docs/verification/LAUNCH-READINESS.md'",
    replace: "export const REPORT_PATH = 'docs/verification/system-pass/LAUNCH-READINESS.md'",
    expect: 'in the stripped upload',
  },
  /*
   * community-layer-protected (close-out C18 FINAL), two drills: a faith page lost
   * from the source, and an approved community left unrecorded.
   */
  {
    name: 'a faith page leaves the source',
    guard: `${GUARDS}/community-layer-protected.mjs`,
    file: 'src/lib/faiths/data.ts',
    find: "    slug: 'jewish',",
    replace: "    slug: 'jewish-x',",
    expect: 'the approved jewish is missing',
  },
  {
    name: 'a community is shipped but not recorded in the approved file',
    guard: `${GUARDS}/community-layer-protected.mjs`,
    file: 'docs/scope/community-layer-approved.json',
    find: '    { "slug": "other-european", "name": "Other European", "tier": 1, "heritageOrder": 21 }',
    replace: '    { "slug": "other-european-recorded-elsewhere", "name": "Other European", "tier": 1, "heritageOrder": 21 }',
    expect: 'other-european is in src/lib/communities/data.ts but not recorded',
  },
  /*
   * indexing-policy (close-out C19), four drills, one per rule that was actually
   * broken on production: the root canonical coming back, an indexable page with
   * no canonical of its own, a private route losing its noindex, and the sitemap
   * publishing a templated family without the threshold gate.
   */
  {
    name: 'the root layout declares a canonical again, the defect that leaked onto 57 routes',
    guard: `${GUARDS}/indexing-policy.mjs`,
    file: 'src/app/layout.tsx',
    find: '  robots: {\n    index: true,',
    replace: "  alternates: { canonical: '/' },\n  robots: {\n    index: true,",
    expect: 'src/app/layout.tsx declares `alternates` again',
  },
  {
    name: 'an indexable page stops naming itself',
    guard: `${GUARDS}/indexing-policy.mjs`,
    file: 'src/app/help/[slug]/page.tsx',
    find: '    alternates: { canonical: `/help/${topic.slug}` },',
    replace: '',
    expect: '/help/[slug] is indexable and declares no canonical of its own',
  },
  {
    name: 'the door scanner loses its noindex',
    guard: `${GUARDS}/indexing-policy.mjs`,
    file: 'src/app/scan/[eventId]/page.tsx',
    find: '  ...noIndexMetadata(),',
    replace: '',
    expect: '/scan/[eventId] is classified never and nothing in its metadata chain declares noindex',
  },
  /*
   * RE-AIMED 15 September 2026. This drill had been STALE and therefore not
   * running: SEO3 step 2 made the discovery threshold owner-editable, so the
   * sitemap line grew a `, threshold` argument and the anchor stopped matching.
   * A drill that cannot aim reads in a summary exactly like a drill that passed,
   * which is the failure mode the harness exists to prevent, so it is fixed here
   * rather than left in the four-that-did-not-fire footnote of another report.
   */
  {
    name: 'the sitemap publishes a templated family without the threshold gate',
    guard: `${GUARDS}/indexing-policy.mjs`,
    file: 'src/app/sitemap.ts',
    // THE ANCHOR MOVED AND THIS DID NOT. The `, threshold` argument arrived with
    // close-out SEO3 step 2, when the number became the owner's rather than the
    // build's, and this anchor was not moved with it, so the drill stopped
    // aiming and the harness reported it STALE instead of firing. Both lanes
    // re-anchored it independently on 14 September 2026, which is itself the
    // point: the drill was not wrong and the guard was not wrong, so a stale
    // anchor reads as a passing gate until somebody checks. Kept in step with
    // the source it mutates.
    find: '    if (!isDiscoveryIndexable(countCommunity(discoveryRows, community.slug), threshold)) continue\n',
    replace: '',
    expect: 'publishes /community/[community] without an isDiscoveryIndexable() gate',
  },
  /*
   * discovery-indexability (close-out SEO3), FOUR DRILLS. The item asks for
   * three, "proven red three times", one per clause of its stated invariant:
   * no page carrying noindex may appear in the sitemap; no page meeting the
   * substance threshold may carry noindex; and no category may exist only as a
   * query string. The third clause has two independent ways to fail, a link and
   * a missing page, so it gets one drill each.
   */
  {
    name: 'the sitemap judges a family with a count its page never calls',
    guard: `${GUARDS}/discovery-indexability.mjs`,
    file: 'src/app/sitemap.ts',
    find: '    if (!isDiscoveryIndexable(countCategory(discoveryRows, [category.slug]), threshold)) continue',
    replace: '    if (!isDiscoveryIndexable(countCity(discoveryRows, category.slug), threshold)) continue',
    expect: 'src/app/sitemap.ts judges /categories/[slug] with countCity, which its page never calls',
  },
  {
    name: 'a templated discovery page hardcodes noindex over the threshold',
    guard: `${GUARDS}/discovery-indexability.mjs`,
    file: 'src/app/faith/[faith]/page.tsx',
    find: '  return {',
    replace: '  return {\n    robots: { index: false },',
    expect: '/faith/[faith] is a templated discovery page and hardcodes noindex',
  },
  {
    name: 'a category tile goes back to being a query string',
    guard: `${GUARDS}/discovery-indexability.mjs`,
    file: 'src/components/features/home/category-nav-rail.tsx',
    find: '                  href: `/categories/${t.slug}`,',
    replace: '                  href: `/events?category=${t.slug}`,',
    expect: 'navigates to a category through /events?category=',
  },
  {
    name: 'a live category loses the editorial that makes it a page',
    guard: `${GUARDS}/discovery-indexability.mjs`,
    file: 'src/lib/categories/category-editorial.ts',
    find: "    slug: 'comedy',",
    replace: "    slug: 'comedy-lane-c-drill',",
    expect: 'the category "comedy" exists in event_categories and has no editorial',
  },
  /*
   * sitemap-covers-the-catalogue (close-out SEO2), FOUR DRILLS, one per way the
   * comparison can go red. The item asks for it to be "proven red by
   * unpublishing one lane-C event while leaving it in the sitemap, then green",
   * which is the ORPHANED drill below expressed as the code that would leave it
   * there: the sitemap reads the database live, so an event cannot be absent
   * from the catalogue and present in the sitemap unless the sitemap has stopped
   * asking whether it is published. That is the second drill, and the literal
   * version of it (a real lane-C event set to draft while the predicate was
   * removed, with the guard naming that slug) is in the item's evidence.
   *
   * The other three cover the failure modes actually on record: a catalogue
   * silently truncating so pages go MISSING, a query error thrown away so a
   * whole family publishes NOTHING (the 42703 that hid the venue block for its
   * whole life), and a profile predicate dropped so pages that 404 are
   * advertised (the eight 'pending' organisations).
   */
  {
    name: 'the event catalogue truncates, so published pages are never advertised',
    guard: `${GUARDS}/sitemap-covers-the-catalogue.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: "      .order('slug', { ascending: true })\n      .limit(CATALOGUE_ROW_CAP)\n    if (error) return { rows: [], error: error.message }\n    const rows: CatalogueRow[] = []\n    for (const row of data ?? []) {\n      const slug = typeof row.slug === 'string' ? row.slug.trim() : ''\n      if (!slug) continue\n      rows.push({\n        path: `/events/${slug}`,",
    replace: "      .order('slug', { ascending: true })\n      .limit(5)\n    if (error) return { rows: [], error: error.message }\n    const rows: CatalogueRow[] = []\n    for (const row of data ?? []) {\n      const slug = typeof row.slug === 'string' ? row.slug.trim() : ''\n      if (!slug) continue\n      rows.push({\n        path: `/events/${slug}`,",
    expect: 'events page(s) the database holds are ABSENT from the sitemap',
  },
  {
    name: 'the sitemap stops asking whether an event is published, so unpublished events stay in it',
    guard: `${GUARDS}/sitemap-covers-the-catalogue.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: "      .select('slug, updated_at')\n      .match(PUBLIC_EVENT_MATCH)\n      .not('slug', 'is', null)",
    replace: "      .select('slug, updated_at')\n      .not('slug', 'is', null)",
    expect: 'events URL(s) in the sitemap have no row behind them and would answer 404',
  },
  {
    name: 'a catalogue query names a column that does not exist, and the error is thrown away again',
    guard: `${GUARDS}/sitemap-covers-the-catalogue.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: "      .select('venue_name, updated_at')",
    replace: "      .select('venue_slug, updated_at')",
    expect: 'the sitemap would publish NO venues URL at all and say nothing about it',
  },
  {
    name: 'the organiser block loses its status predicate, so pending profiles are advertised again',
    guard: `${GUARDS}/sitemap-covers-the-catalogue.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: "      .not('slug', 'is', null)\n      .eq('status', 'active')",
    replace: "      .not('slug', 'is', null)",
    expect: 'organisers URL(s) in the sitemap have no row behind them and would answer 404',
  },
  /*
   * all-in-pricing (close-out SEO4), THREE DRILLS, one per clause. The item asks
   * for the guard to be "proven red by displaying a ticket price without its
   * fee, then green", which is the second of these; the other two are the
   * clauses that would let the same defect back in by a different door.
   */
  {
    name: 'a ticket price is displayed without its fee',
    guard: `${GUARDS}/all-in-pricing.mjs`,
    file: 'src/components/checkout/ticket-selector.tsx',
    find: '                      {formatPrice(tierAllIn(tier).totalCents, currency)}',
    replace: '                      {formatPrice(tier.display_price_cents ?? tier.price, currency)}',
    expect: 'formats a raw tier price as the price a buyer reads',
  },
  {
    name: 'the fee is hardcoded into a second file',
    guard: `${GUARDS}/all-in-pricing.mjs`,
    file: 'src/lib/payments/all-in-price.ts',
    find: 'export function allInPriceForOneTicket(',
    replace:
      'const LANE_C_DRILL = { percent: 3.5, fixedCents: 99 }\nvoid LANE_C_DRILL\nexport function allInPriceForOneTicket(',
    expect: 'carries the platform fee',
  },
  {
    name: 'a cart total is a per-ticket total multiplied by the quantity',
    guard: `${GUARDS}/all-in-pricing.mjs`,
    file: 'src/lib/payments/all-in-price.ts',
    find: '  return paid.reduce((lowest, tier) => {',
    replace:
      '  const laneCDrill = allInPriceForOneTicket(paid[0].price, rates, feePassType).totalCents * 2\n  void laneCDrill\n  return paid.reduce((lowest, tier) => {',
    expect: 'multiplies a per-ticket all-in total to get a cart total',
  },
  /*
   * event-lifecycle-total clause 7 (close-out SEO5 step 5), THREE DRILLS.
   *
   * The clause exists because four of the eight statuses were answering a real
   * 404 on their own public page, against a document that says all four render
   * a full page with a banner, and nothing in the repository could see it. Each
   * drill is one of the three ways it comes back: the classification losing a
   * status, a caller losing the door, and the door losing a constraint.
   */
  {
    name: 'a status the document calls a full page drops out of the classification',
    guard: `${GUARDS}/event-lifecycle-total.mjs`,
    file: 'src/lib/event-lifecycle.ts',
    // A SINGLE LINE, deliberately. src/lib/event-lifecycle.ts has CRLF line
    // endings, so a multi-line `find` written with LF matches nothing and the
    // drill reports a bad find string instead of exercising the guard.
    find: "  'cancelled',",
    replace: '  /* lane-C drill: cancelled removed */',
    expect: 'cancelled is not in PUBLIC_AFTER_THE_FACT_STATUSES',
  },
  {
    name: 'the route existence guard stops consulting the after-the-fact door',
    guard: `${GUARDS}/event-lifecycle-total.mjs`,
    file: 'src/app/events/[slug]/layout.tsx',
    find: '  if (await afterTheFactEventExists(slug)) return children',
    replace: '  // lane-C drill: the door removed',
    expect: 'no longer consults the after-the-fact door',
  },
  {
    name: 'the after-the-fact door stops constraining visibility',
    guard: `${GUARDS}/event-lifecycle-total.mjs`,
    file: 'src/lib/events/after-the-fact-view.ts',
    // The EXISTENCE check's copy, because the guard judges every read in the
    // file rather than the file as a whole: removing the constraint from one of
    // two queries is exactly how this defect would return.
    find: "      .in('visibility', [...PUBLIC_VISIBILITIES])\n      .maybeSingle(),",
    replace: '      .maybeSingle(),',
    expect: 'has a read that does not constrain visibility',
  },
  /*
   * parity-spec-complete (close-out PARITY1), THREE DRILLS. The item asks for
   * it "proven red by adding a line with no check, then green", which is the
   * first. The other two are the ways a specification degrades without losing a
   * line: a check that passes on no evidence, and a line whose proof is gone.
   */
  {
    name: 'a table-stakes line is added with no check',
    guard: `${GUARDS}/parity-spec-complete.mjs`,
    file: 'scripts/lib/parity-spec.mjs',
    find: 'export const PARITY_LINES = [',
    replace:
      "export const PARITY_LINES = [\n  { id: 'lane-c-drill-no-check', line: 'a line nobody wired up', why: 'the drill for the guard that catches exactly this' },",
    expect: 'HAS NO CHECK',
  },
  {
    name: 'a table-stakes check reports PASS when it was shown nothing at all',
    guard: `${GUARDS}/parity-spec-complete.mjs`,
    file: 'scripts/lib/parity-spec.mjs',
    find: 'export const PARITY_LINES = [',
    replace:
      "export const PARITY_LINES = [\n  { id: 'lane-c-drill-always-green', line: 'a line that always says yes', why: 'the drill for a check that is not looking at anything', check: () => ({ state: 'pass', observation: 'fine', page: null }) },",
    expect: 'reports PASS against an empty snapshot',
  },
  {
    name: 'the disable switch is read inside the specification itself',
    guard: `${GUARDS}/parity-spec-complete.mjs`,
    file: 'scripts/lib/parity-spec.mjs',
    find: 'export const PARITY_LINES = [',
    replace:
      'const laneCDrill = process.env.PARITY_CHECK_DISABLED\nvoid laneCDrill\nexport const PARITY_LINES = [',
    expect: 'reads configuration',
  },
  {
    name: 'a table-stakes line loses the test that proves it goes red',
    guard: `${GUARDS}/parity-spec-complete.mjs`,
    file: 'tests/unit/parity/parity-spec.test.ts',
    find: "    id: 'past-event-state',",
    replace: "    id: 'lane-c-drill-renamed',",
    expect: 'is named nowhere in',
  },
  /*
   * no-false-urgency (close-out SEO5), FOUR DRILLS. The item asks for it
   * "proven red by hard coding a low stock message, then green", which is the
   * first two of these: one for the literal count, one for a scarcity sentence
   * in a file that has never counted a ticket. The other two are the
   * accessibility half of the same invariant, which has its own way of lying.
   */
  {
    name: 'a low stock message is hard coded',
    guard: `${GUARDS}/no-false-urgency.mjs`,
    file: 'src/components/checkout/ticket-selector.tsx',
    find: '                      <p className="mt-1 text-xs font-medium text-error-strong">Only {available} left</p>',
    replace: '                      <p className="mt-1 text-xs font-medium text-error-strong">Only 3 left</p>',
    expect: 'writes a scarcity COUNT as a literal',
  },
  {
    name: 'a scarcity sentence appears on a surface that never reads inventory',
    guard: `${GUARDS}/no-false-urgency.mjs`,
    file: 'src/lib/content/category-highlight-slides.ts',
    find: "    cardEyebrow: 'Most booked',",
    replace: "    cardEyebrow: 'Selling fast',",
    expect: 'is NOT reviewed',
  },
  {
    name: 'the accessibility section loses its refusal to render empty',
    guard: `${GUARDS}/no-false-urgency.mjs`,
    file: 'src/components/features/accessibility/accessibility-section.tsx',
    find: '  if (!hasAccessibilityInfo(info)) return null',
    replace: '  void hasAccessibilityInfo',
    expect: 'no longer refuses to render when there is nothing to say',
  },
  {
    name: 'the accessibility surface starts rendering a negative',
    guard: `${GUARDS}/no-false-urgency.mjs`,
    file: 'src/components/features/accessibility/accessibility-section.tsx',
    find: '        <p className="mt-5 flex items-start gap-3 text-xs leading-relaxed text-ink-500">',
    replace:
      '        <p className="text-xs">Not wheelchair accessible</p>\n        <p className="mt-5 flex items-start gap-3 text-xs leading-relaxed text-ink-500">',
    expect: 'renders an accessibility NEGATIVE',
  },
  {
    name: 'a governed surface stops consulting the reversal switch',
    guard: `${GUARDS}/no-false-urgency.mjs`,
    file: 'src/components/checkout/ticket-selector.tsx',
    find: '{showAvailability && !soldOut && !salePending && available <= 20 && (',
    replace: '{!soldOut && !salePending && available <= 20 && (',
    expect: 'the remaining-tickets line is no longer gated on the reversal switch',
  },
  {
    name: 'the calendar links are put behind the reversal switch, which the close-out forbids',
    guard: `${GUARDS}/no-false-urgency.mjs`,
    file: 'src/components/features/events/add-to-calendar.tsx',
    find: 'export function AddToCalendar({ event }: { event: CalendarEvent }) {',
    replace:
      'export function AddToCalendar({ event, showAvailability }: { event: CalendarEvent; showAvailability?: boolean }) {\n  void showAvailability',
    expect: 'is behind the reversal switch',
  },
  /*
   * event-structured-data (SEO1 v2), EIGHT DRILLS, one per clause and four
   * extra where a clause has more than one way to fail.
   *
   * SEO1 named two: "Proven red twice, once by removing the block from a
   * published lane-C event and once by emitting a hard coded price, each failure
   * naming the offending event slug." SEO1 v2 raised it to "Proven red four
   * times, once per clause" against its four clauses: the block resolves from
   * the database, no unpublished event emits, no listing page emits an Event
   * block, and the withdrawn attendance-mode property appears nowhere.
   *
   * The other four hold halves that would otherwise be silent: the page handing
   * the emitter the raw rows again (the price the buyer sees and the price
   * Google sees diverging), a seventeenth hand-rolled script tag opting itself
   * out of the one reversal flag, a draft event finding its way back into the
   * index, and an online event being described with an address it does not have.
   */
  {
    name: 'the block is removed from a published lane-C event',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/lib/seo/event-schema.ts',
    find: "  return status !== 'draft' && status !== 'scheduled' && status !== 'archived'",
    replace: "  return status !== 'draft' && status !== 'scheduled' && status !== 'archived' && status !== 'published'",
    expect: 'lane-c-guard-alpha: a PUBLISHED event emitted no structured data at all',
  },
  {
    name: 'the offer price is hard coded instead of read from the tier',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/lib/seo/event-schema.ts',
    find: '    price: (priceOf(tier) / 100).toFixed(2),',
    replace: "    price: '99.99',",
    expect: 'lane-c-guard-alpha: offers emit [99.99] and the tiers on the page are [18.00]',
  },
  {
    name: 'the event page hands the emitter the raw tiers again, so the markup loses the price the page shows',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/app/events/[slug]/page.tsx',
    find: '          ticketTiers={enrichedAllTiers}',
    replace: '          ticketTiers={allTiers}',
    expect: 'no longer passes `ticketTiers={enrichedAllTiers}`',
  },
  {
    name: 'a page hand-rolls its own ld+json script tag again, outside the one emitter',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/app/help/page.tsx',
    find: '      <JsonLd payload={itemList} />',
    replace: '      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />',
    expect: 'emit a raw application/ld+json script tag outside src/components/seo/json-ld.tsx',
  },
  {
    name: 'a draft event is described to Google again (SEO1 v2 clause 2)',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/lib/seo/event-schema.ts',
    find: "  return status !== 'draft' && status !== 'scheduled' && status !== 'archived'",
    replace: "  return status !== 'scheduled' && status !== 'archived'",
    expect: 'lane-c-guard-alpha-draft: an event with status "draft" emitted a structured data block',
  },
  {
    // The drill puts the node back exactly the way it actually shipped: nested
    // inside the venue's own Place payload, which is where twelve of them lived.
    name: 'a venue profile goes back to nesting Event nodes for the events it lists (SEO1 v2 clause 3)',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/components/features/venues/venue-schema-jsonld.tsx',
    find: '    maximumAttendeeCapacity: venue.capacity ?? undefined,',
    replace:
      '    maximumAttendeeCapacity: venue.capacity ?? undefined,\n' +
      "    event: upcomingEvents.map(e => ({ '@type': 'Event', name: e.title })),",
    expect: 'Event node(s) are built outside src/lib/seo/event-schema.ts',
  },
  {
    /*
     * THE PROPERTY NAME IS BUILT FROM TWO HALVES, and for the same reason the
     * guard builds it that way: clause 6 sweeps scripts/, and this file lives
     * there. A literal here would make the guard fail on the drill that proves
     * it, permanently, which reads as the guard working and is actually the
     * guard being unable to run.
     */
    name: 'the withdrawn attendance-mode property comes back (SEO1 v2 clause 4)',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/lib/seo/event-schema.ts',
    find: "    location: {\n      '@type': 'Place',",
    replace:
      `    ${'eventAttendance' + 'Mode'}: 'https://schema.org/OfflineEventAttendanceMode',\n` +
      "    location: {\n      '@type': 'Place',",
    expect: 'still name the withdrawn attendance-mode property in CODE',
  },
  {
    /*
     * The other half of the same withdrawal. An online event has no Place, so
     * describing it means publishing an address it does not have. This drill
     * makes the serialiser describe it anyway, which is what it did before.
     */
    name: 'an online event is described to Google again, with an address it does not have',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/lib/seo/event-schema.ts',
    find: "  return eventType !== 'virtual'",
    replace: '  return true',
    expect: 'a VIRTUAL event emitted a block',
  },

  // -------------------------------------------------------------------------
  // CLAUSE 7, NO EMPTY CLAIM AT ANY DEPTH (14 September 2026). The push gate
  // stopped at its indexing step with "Offer.name is an empty string" on a real
  // event whose tier is named ''. The serialiser DID compact; it compacted its
  // own top level only, so every nested Offer, Place and PostalAddress lay
  // outside the clean it reported. Three drills: the shallow walk restored, the
  // walk emptied out, and the one renderer every page type crosses serialising
  // without it.
  // -------------------------------------------------------------------------
  {
    name: 'the payload compaction goes back to the top level only (the defect itself)',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/lib/seo/event-schema.ts',
    find: '  return pruneJsonLd(obj) as Partial<T>',
    replace: [
      '  const out: Record<string, unknown> = {}',
      '  for (const [k, v] of Object.entries(obj)) {',
      '    if (v === null || v === undefined) continue',
      "    if (typeof v === 'string' && v.trim() === '') continue",
      '    out[k] = v',
      '  }',
      '  return out as Partial<T>',
    ].join('\n'),
    expect: 'empty claim',
  },
  {
    name: 'the walk stops recursing, so only the outermost node is cleaned',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/lib/seo/structured-data.ts',
    find: '      out[key] = pruneJsonLd(child)',
    replace: '      out[key] = child',
    expect: 'empty claim',
  },
  {
    name: 'the one renderer every page type crosses serialises without pruning',
    guard: `${GUARDS}/event-structured-data.mjs`,
    file: 'src/components/seo/json-ld.tsx',
    find: 'JSON.stringify(pruneJsonLd(payload))',
    replace: 'JSON.stringify(payload)',
    expect: 'without passing it through pruneJsonLd',
  },
  /*
   * geocoding-never-silent-null (close-out C9), two drills: the rule made to
   * allow the production case, and the create action's call removed.
   */
  {
    name: 'the save rule lets a typed address with no coordinates through on production',
    guard: `${GUARDS}/geocoding-never-silent-null.mjs`,
    file: 'src/lib/geo/venue-save-rule.ts',
    find: "  if (input.environment === 'development') return { ok: true, warning: reason }",
    replace: "  if (input.environment === 'development' || input.environment === 'production') return { ok: true, warning: reason }",
    expect: 'ALLOWED a typed address with no coordinates',
  },
  {
    name: 'the create action stops asking the save rule',
    guard: `${GUARDS}/geocoding-never-silent-null.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/actions.ts',
    find: '  const venueVerdict = judgeVenueSave({',
    replace: '  const venueVerdict = { ok: true, warning: null } as const; void ({',
    expect: 'judgeVenueSave is called 1 time(s)',
  },
  /*
   * homepage-hero-never-empty (close-out C17), two drills: the empty branch
   * painting a panel without HeroMedia, and a curated entry with no raster.
   */
  {
    name: 'the no-event hero paints a panel instead of a photograph',
    guard: `${GUARDS}/homepage-hero-never-empty.mjs`,
    file: 'src/components/features/home/FeaturedHero.tsx',
    find: '<HeroMedia image={curated.image} alt={curated.alt} priority />',
    replace: '<div aria-hidden className="absolute inset-0" />',
    expect: 'renders no HeroMedia',
  },
  {
    name: 'a curated hero entry names a raster that does not exist',
    guard: `${GUARDS}/homepage-hero-never-empty.mjs`,
    file: 'public/images/hero/homepage-hero-attribution.json',
    find: '"slug": "homepage-rooftop",',
    replace: '"slug": "homepage-rooftop-missing",',
    expect: 'has no raster at',
  },
  /*
   * one-priority-image (close-out C8), two drills: a grant that reaches past the
   * first item, and a new grant nobody listed.
   */
  {
    name: 'the category rail preloads its first four tiles again',
    guard: `${GUARDS}/one-priority-image.mjs`,
    file: 'src/components/features/home/category-nav-rail.tsx',
    find: '            priority: false,',
    replace: '            priority: i < 4,',
    expect: 'One LCP candidate per document',
  },
  {
    name: 'a rail card is given priority with no reason on the list',
    guard: `${GUARDS}/one-priority-image.mjs`,
    file: 'src/components/features/home/cards.tsx',
    find: 'priority={event.priority ?? false}',
    replace: 'priority={true}',
    expect: 'not on the reviewed list',
  },
  /*
   * lcp-preload-in-the-first-flush (close-out C8B.3), two drills.
   *
   * THE SECOND IS THE ONE WORTH READING. It reproduces the exact change that was
   * built, measured and reverted on 18 September 2026: the page component made
   * synchronous and its whole body, hero included, handed to a streamed child.
   * That shape wins 324 ms of time to first byte and loses 507 ms of hero
   * discovery, and it is a plausible refactor rather than an obvious mistake,
   * which is precisely why it needs a gate rather than a note.
   */
  {
    name: 'the homepage hero is wrapped in a streaming boundary',
    guard: `${GUARDS}/lcp-preload-in-the-first-flush.mjs`,
    file: 'src/app/page.tsx',
    find: '        <FeaturedHero events={upcoming} />',
    replace: '        <Suspense fallback={null}><FeaturedHero events={upcoming} /></Suspense>',
    expect: '<Suspense> boundary',
  },
  {
    name: 'the homepage hero moves into a streamed child (the measured, reverted shape)',
    guard: `${GUARDS}/lcp-preload-in-the-first-flush.mjs`,
    file: 'src/app/page.tsx',
    find: 'export default async function HomePage() {',
    replace:
      'export default function HomePage() {\n  return <Suspense fallback={null}><HomeDocument /></Suspense>\n}\n\nasync function HomeDocument() {',
    expect: 'does not render <FeaturedHero>',
  },
  /*
   * weak-network-contract (close-out C8B.5, Scope v5 10.3), five drills, one per
   * clause plus the silent-catch case.
   *
   * THE FIFTH IS THE ONE WORTH READING. Clause 1 could have been a grep for the
   * word "catch", and a grep would have gone green on a catch that swallows the
   * failure and shows the buyer nothing, which is a DIFFERENT defect rather than
   * a fix: a button that visibly does nothing. So the drill empties the catch
   * body instead of deleting the try, and the clause must still fire.
   */
  {
    name: 'the checkout submit stops catching a thrown server action',
    guard: `${GUARDS}/weak-network-contract.mjs`,
    file: 'src/app/checkout/[reservation_id]/checkout-form.tsx',
    find: '      let result: Awaited<ReturnType<typeof processCheckout>>\n      try {',
    replace: '      let result: Awaited<ReturnType<typeof processCheckout>>\n      if (true) {',
    expect: 'not inside a try/catch',
  },
  {
    name: 'the checkout catches the network failure and tells the buyer nothing',
    guard: `${GUARDS}/weak-network-contract.mjs`,
    file: 'src/app/checkout/[reservation_id]/checkout-form.tsx',
    find: '        setSubmitError(describeCheckoutSubmitFailure(browserIsOnline()).message)',
    replace: '        // swallowed',
    expect: 'does not call describeCheckoutSubmitFailure',
  },
  {
    name: 'the root service worker starts caching pages, so a buyer can be shown a stale price',
    guard: `${GUARDS}/weak-network-contract.mjs`,
    file: 'public/app-sw.js',
    find: '  if (url.pathname.indexOf(STATIC_PATH) === 0) {\n    event.respondWith(cacheFirst(request))\n  }',
    replace: '  event.respondWith(cacheFirst(request))',
    expect: 'without a STATIC_PATH test above it',
  },
  {
    name: 'the root service worker is never registered, so the offline page is dead weight',
    guard: `${GUARDS}/weak-network-contract.mjs`,
    file: 'src/app/layout.tsx',
    find: '          <RegisterAppWorker />',
    replace: '          {/* removed */}',
    expect: 'RegisterAppWorker is not rendered',
  },
  {
    name: 'the offline page becomes indexable, so "You are offline" can rank for EventLinqs',
    guard: `${GUARDS}/weak-network-contract.mjs`,
    file: 'src/lib/seo/indexing-policy.ts',
    find: "  { route: '/offline', klass: 'never',",
    replace: "  { route: '/offline', klass: 'always',",
    expect: "is not classified 'never'",
  },
  /*
   * no-hardcoded-spacing (close-out C14.12), three drills: an arbitrary
   * utility off the 4px grid, an inline style off it, and a CSS declaration
   * off it. A token or a multiple of 4px passes, so the guard only fires on a
   * value somebody typed by hand.
   */
  {
    name: 'a card body padded with an arbitrary 13px utility',
    guard: `${GUARDS}/no-hardcoded-spacing.mjs`,
    file: 'src/components/features/home/cards.tsx',
    find: '      <div className="flex flex-1 flex-col p-4">',
    replace: '      <div className="flex flex-1 flex-col p-[13px]">',
    expect: 'off the spacing scale',
  },
  {
    name: 'a card body padded with an inline 17px instead of the token',
    /*
     * RE-AIMED 19 September 2026. This drill anchored on `event-card.tsx`'s
     * inline `paddingTop: 'var(--space-card-padding-y)'`, and the browse card
     * collapse (close-out C8B.3) moved that declaration into the
     * `event-card-body` composite, so the anchor stopped existing and the
     * drill reported STALE - which is the harness doing its job. The same
     * shape lives in the organiser card, so the drill moves rather than dies:
     * what it proves is that the TSX branch of the spacing guard reads inline
     * style objects, and that is unchanged.
     */
    guard: `${GUARDS}/no-hardcoded-spacing.mjs`,
    file: 'src/components/features/home/featured-organisers-section.tsx',
    find: "        padding: 'var(--space-card-padding-x)',",
    replace: "        padding: '17px',",
    expect: 'off the spacing scale',
  },
  {
    name: 'a stylesheet declaration steps off the grid by a pixel',
    guard: `${GUARDS}/no-hardcoded-spacing.mjs`,
    file: 'src/app/globals.css',
    find: '  outline-offset: 2px;',
    replace: '  outline-offset: 2px;\n  margin-top: 5px;',
    expect: 'off the spacing scale',
  },
  /*
   * maintained-aggregates, three drills.
   *
   * The class: a number written down in a second place with nothing keeping it
   * in step. Four instances landed in one week, in four different mechanisms
   * (a cached rail, a cached file, a held-seat count, an addon count), and none
   * failed a test because in every case the code was correct.
   */
  {
    name: 'a cache tag is declared and nothing anywhere invalidates it',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'src/lib/redis/inventory-cache.ts',
    find: '  revalidateTag(INVENTORY_CACHE_TAG, { expire: 0 })',
    replace: '  void INVENTORY_CACHE_TAG',
    expect: 'nothing anywhere calls revalidateTag',
  },
  {
    name: 'a new stored counter is incremented with no registry entry',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'src/lib/payments/connect-ledger.ts',
    find: '    total_volume_cents: (orgRow.total_volume_cents as number) + params.grossRevenueCents,',
    replace:
      '    total_volume_cents: (orgRow.total_volume_cents as number) + params.grossRevenueCents,\n    lifetime_refund_cents: (orgRow.lifetime_refund_cents as number) + 1,',
    expect: 'is not in AGGREGATE_REGISTRY',
  },
  {
    /*
     * FOUNDER RULING 25 August 2026: "a guard that FAILS THE BUILD when a new
     * stored aggregate is added without a maintainer. Drill it by adding one."
     *
     * This is that drill, and it adds one the way it actually happens: a column
     * appears in the schema, and nothing has been written to touch it yet. Both
     * of the real instances arrived exactly like this. event_addons.sold_count
     * and tier_access_codes.current_uses each existed for months with no writer
     * at all, so a detector that looks for WRITES saw nothing while a checkout
     * enforced a cap against each of them.
     */
    name: 'a new stored aggregate column is added and nothing maintains it',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'src/types/database.ts',
    find: '          sold_count: number\n          sort_order: number',
    replace: '          refunded_count: number\n          sold_count: number\n          sort_order: number',
    expect: 'carries no verdict in scripts/lib/stored-aggregates.mjs',
  },
  {
    /*
     * The reverse rot. A registry that can point at nothing is worse than no
     * registry, because it reads as coverage.
     *
     * It ADDS a bogus entry rather than renaming a real one, and that is not
     * fussiness: renaming `tickets.scan_count` leaves the real column with no
     * verdict, so check 3's "carries no verdict" fires FIRST and the drill would
     * pass while proving the wrong thing. Caught on the first run of this drill.
     */
    name: 'the registry points at a column that does not exist',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'scripts/lib/stored-aggregates.mjs',
    find: "    column: 'tickets.scan_count',",
    replace: [
      "    column: 'ticket_tiers.ghost_count',",
      '    summarises: null,',
      "    maintenance: 'not-in-class',",
      "    maintainedBy: 'nothing at all, this entry is a drill',",
      '    reconciled: false,',
      '    caveat: null,',
      "    decision: 'drill',",
      '  },',
      '  {',
      "    column: 'tickets.scan_count',",
    ].join('\n'),
    expect: 'which does not exist in src/types/database.ts',
  },
  {
    name: 'a tag exemption is left behind after its cache is deleted',
    guard: `${GUARDS}/maintained-aggregates.mjs`,
    file: 'src/lib/images/suburb-photo.ts',
    find: "tags: ['pexels', 'pexels-suburb']",
    replace: "tags: ['pexels']",
    expect: "is no longer declared anywhere",
  },
  /*
   * no-silent-catch, two drills.
   *
   * The class: an error from outside the process, discarded, with the code
   * carrying on as though the call had succeeded and returned nothing. The
   * instance was a 42703 on venues.slug inside a bare catch {} in
   * src/app/sitemap.ts, which published zero venue URLs from the day it was
   * written. Nothing failed. The sitemap was simply shorter than it should
   * have been, and no gate in this repository could see it.
   */
  {
    /*
     * The incident itself, put back. Same shape, and since close-out SEO2 the
     * exact file is src/lib/seo/sitemap-catalogue.ts: the event query moved
     * there so a build-time guard could execute it, and the catch moved with it.
     * The catch there RETURNS the error rather than logging it, which is a voice
     * (the sitemap logs it, the guard fails the build on it); this drill takes
     * that voice away.
     */
    name: 'the sitemap event query is wrapped in a catch that says nothing',
    guard: `${GUARDS}/no-silent-catch.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: [
      '  } catch (err) {',
      '    return { rows: [], error: err instanceof Error ? err.message : String(err) }',
      '  }',
    ].join('\n'),
    // The FIRST version of this drill removed only the binding and left the
    // voice, and the guard passed, correctly: a catch that speaks is not silent
    // whatever its binding says. The drill has to remove the voice, not the name.
    replace: ['  } catch {', '    return { rows: [], error: null }', '  }'].join('\n'),
    expect: 'silent around I/O',
  },
  {
    /*
     * The same shape on a compliance path. recordOrganiserMarketingConsent
     * returns false either way, so a swallowed write failure is indistinguishable
     * from a consent that was recorded and then declined.
     */
    name: 'a consent write failure is swallowed and reported to nobody',
    guard: `${GUARDS}/no-silent-catch.mjs`,
    file: 'src/lib/consent/record.ts',
    find: [
      '  } catch (error) {',
      "    captureException(error, { where: 'lib/consent/record:56' })",
      '    return false',
    ].join('\n'),
    replace: ['  } catch {', '    return false'].join('\n'),
    expect: 'silent around I/O',
  },
  /*
   * no-client-sentry-import, one drill.
   *
   * The class: a client component reaching @sentry/nextjs through a value
   * import, which puts the whole SDK in the browser bundle. It has happened
   * once already, through the four error boundaries, and client-error-report.ts
   * was built to break the edge. The silent-catch sweep then very nearly
   * rebuilt it in src/lib/launch/bill-ref.ts, which THE BILL imports.
   */
  {
    name: 'a module a client component imports starts importing the Sentry SDK',
    guard: `${GUARDS}/no-client-sentry-import.mjs`,
    file: 'src/lib/launch/bill-ref.ts',
    find: "import { KIT_CODE_LENGTH, isKitCode } from './kit-code'",
    replace: [
      "import { KIT_CODE_LENGTH, isKitCode } from './kit-code'",
      "import { captureException } from '@/lib/observability/sentry'",
      'void captureException',
    ].join('\n'),
    expect: 'reach the Sentry SDK',
  },
  /*
   * steps-declare-work, two drills.
   *
   * The class: a step that claims work and never says how much. A CI step named
   * "Warm ISR + the next/image optimiser" warmed no images at all, for weeks,
   * printing a tidy list of 200s the whole time. Its replacement reported 40
   * variants across four pages, which was the cap printed as though it were the
   * finding.
   */
  {
    name: 'a CI step stops declaring how much work it did',
    guard: `${GUARDS}/steps-declare-work.mjs`,
    file: 'scripts/ci/warm-preview.mjs',
    find: "  declareWork('warm', {",
    replace: "  const declaredNothing = () => {} // drill\n  declaredNothing('warm', {",
    expect: 'claim work without declaring how much',
  },
  {
    /*
     * The reverse rot, matching the shape used for the aggregate registry: an
     * exemption outliving the step it excused. An allowlist nobody prunes is an
     * allowlist nobody reads, and this one carries the reason each entry is
     * there, so a stale entry is a reason for something that no longer happens.
     */
    /*
     * Check 2, the other half. A guard is the same shape of claim as a CI step
     * and fails the same way: `[x] PASS` on a run that scanned nothing reads
     * exactly like `[x] PASS` on a run that scanned everything, which is how a
     * guard keeps passing after its walk stops finding files.
     */
    name: 'a registered guard stops printing how much it scanned',
    guard: `${GUARDS}/steps-declare-work.mjs`,
    file: 'scripts/guards/no-ambiguous-embed.mjs',
    find: "declareWork('no-ambiguous-embed', {",
    replace: "const noTally = () => {} // drill\nnoTally('no-ambiguous-embed', {",
    expect: 'without printing how much they scanned',
  },
  {
    name: 'an exemption is left behind after CI stops running that script',
    guard: `${GUARDS}/steps-declare-work.mjs`,
    file: 'scripts/guards/steps-declare-work.mjs',
    find: "    script: 'scripts/check-types-drift.sh',",
    replace: "    script: 'scripts/no-such-step.mjs',",
    expect: 'no CI step invokes any more',
  },
  /*
   * one-fee-copy: the PLURAL. The rule matched "processing fee" and the
   * organiser's revenue summary said "Processing fees"; the trailing s satisfied
   * the word-boundary lookahead and a second fee sat on a product surface for
   * three weeks (found on the C1 drive, 5 September 2026).
   */
  {
    name: 'a second fee is named in the plural on an organiser surface',
    guard: `${GUARDS}/one-fee-copy.mjs`,
    file: 'src/components/orders/revenue-summary.tsx',
    find: '<span className="text-sm text-ink-400">Platform fee</span>',
    replace: '<span className="text-sm text-ink-400">Processing fees</span>',
    expect: 'describe a fee the platform does not charge',
  },
  /*
   * positioning-lock (owner ruling 2026-09-07): the three ways the retired
   * self-description comes back. On a page, where somebody would eventually
   * notice; in an EMAIL, where nobody would, which is why the strapline
   * survived in four email footers until it was swept; and as a fresh sentence
   * that never used the old strapline at all.
   */
  {
    name: 'the retired strapline returns to a shipped page',
    guard: `${GUARDS}/positioning-lock.mjs`,
    file: 'src/components/layout/site-footer.tsx',
    find: '                {BRAND_STRAPLINE}',
    replace: '                The ticketing platform built for every community.',
    expect: 'the retired strapline',
  },
  {
    name: 'the retired strapline returns to a transactional email, where nobody reads the diff',
    guard: `${GUARDS}/positioning-lock.mjs`,
    file: 'src/lib/email/order-confirmation.ts',
    find: 'The EventLinqs team. ${BRAND_STRAPLINE}</p>',
    replace: 'The EventLinqs team. The ticketing platform built for every community.</p>',
    expect: 'the retired strapline',
  },
  {
    name: 'a new sentence calls EventLinqs a ticketing platform in its own words',
    guard: `${GUARDS}/positioning-lock.mjs`,
    file: 'src/app/about/page.tsx',
    find: '                EventLinqs is a fan-first platform that takes every community',
    replace: '                EventLinqs is a fan-first ticketing platform that takes every community',
    expect: 'positioning lock forbids',
  },
  /*
   * workflows-skip-drafts and pre-push-gate-wired (close-out C2.3, 6 September
   * 2026): the four quiet ways "CI runs once, after the local gate" dies. A job
   * that loses its draft condition runs on every push again; a trigger that
   * loses ready_for_review never runs at all; a hook that stops invoking the
   * gate, or invokes a third of it, pushes unchecked code that looks gated.
   */
  {
    name: 'a workflow job loses its draft condition',
    guard: `${GUARDS}/workflows-skip-drafts.mjs`,
    file: '.github/workflows/ci.yml',
    find: "    name: lint · typecheck · build\n    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}",
    replace: '    name: lint · typecheck · build',
    expect: 'would run on a draft pull request',
  },
  {
    name: 'a pull_request trigger stops listing ready_for_review',
    guard: `${GUARDS}/workflows-skip-drafts.mjs`,
    file: '.github/workflows/ci.yml',
    find: 'types: [opened, synchronize, reopened, ready_for_review]',
    replace: 'types: [opened, synchronize, reopened]',
    expect: 'never runs this workflow',
  },
  {
    name: 'the pre-push hook stops invoking the gate',
    guard: `${GUARDS}/pre-push-gate-wired.mjs`,
    file: '.githooks/pre-push',
    find: 'node scripts/ops/pre-push-gate.mjs\nstatus=$?',
    replace: 'status=0',
    expect: 'never invokes scripts/ops/pre-push-gate.mjs',
  },
  {
    name: 'the pre-push hook runs a subset of the gate',
    guard: `${GUARDS}/pre-push-gate-wired.mjs`,
    file: '.githooks/pre-push',
    find: 'node scripts/ops/pre-push-gate.mjs\nstatus=$?',
    replace: 'node scripts/ops/pre-push-gate.mjs --only typecheck\nstatus=$?',
    expect: 'step selection',
  },
  /*
   * card-raster-traced (close-out C3, 6 September 2026): the resvg binary is
   * pinned into each rasterising route's lambda trace by hand, and the only
   * environment that shows a lost entry is Vercel. The drill removes the binary
   * from the public composer's card route and expects the guard to name it.
   */
  {
    name: 'a card route loses the resvg binary from its lambda trace',
    guard: `${GUARDS}/card-raster-traced.mjs`,
    file: 'next.config.ts',
    find: "    '/api/launch/[code]/card/[format]': [\n      './src/assets/fonts/*.ttf',\n      './node_modules/@resvg/resvg-wasm/index_bg.wasm',\n    ],",
    replace: "    '/api/launch/[code]/card/[format]': [\n      './src/assets/fonts/*.ttf',\n    ],",
    expect: "lacks './node_modules/@resvg/resvg-wasm/index_bg.wasm'",
  },
  /*
   * og-single-rasteriser (close-out C3, 6 September 2026). The share card that
   * dropped the connection did so because next/og came back into a route nobody
   * had driven. The drill puts it back into the one route whose failure is least
   * visible, the site-level card, and expects the guard to name the import.
   */
  {
    name: 'a metadata image goes back to next/og',
    guard: `${GUARDS}/og-single-rasteriser.mjs`,
    file: 'src/app/opengraph-image.tsx',
    find: "import { renderOgResponse, OG_DISPLAY_FAMILY, OG_BODY_FAMILY } from '@/lib/broadcast/og-response'",
    replace: "import { ImageResponse } from 'next/og'\nimport { OG_DISPLAY_FAMILY, OG_BODY_FAMILY } from '@/lib/broadcast/og-response'",
    expect: "imports from 'next/og'",
  },
  /*
   * og-single-rasteriser, the CSS half. satori ignores `inset`, so the scrim it
   * positions never draws and nothing anywhere reports a problem. Every scrim on
   * every share card had it. The drill puts it back on the event card's scrim.
   */
  {
    name: 'a share card positions its scrim with the inset shorthand satori ignores',
    guard: `${GUARDS}/og-single-rasteriser.mjs`,
    file: 'src/app/events/[slug]/opengraph-image.tsx',
    find: "          position: 'absolute',\n          top: 0,\n          right: 0,\n          bottom: 0,\n          left: 0,\n          display: 'flex',\n          background:\n            'linear-gradient(to top,",
    replace: "          position: 'absolute',\n          inset: 0,\n          display: 'flex',\n          background:\n            'linear-gradient(to top,",
    expect: 'uses the `inset` shorthand',
  },
  /*
   * no-banned-word-anywhere, two drills, one per blind spot the copy gate had.
   */
  {
    name: 'the banned word is planted in a STORAGE PATH',
    guard: `${GUARDS}/no-banned-word-anywhere.mjs`,
    file: 'src/lib/images/city-photo.ts',
    find: 'export',
    replace: [
      "const DRILL_PATH = 'stock/categories/arts-cult" + "ure/theatre.avif'",
      'void DRILL_PATH',
      'export',
    ].join('\n'),
    expect: 'with no reviewed exemption',
  },
  {
    name: 'the banned word is planted in a STRING COMPARISON',
    guard: `${GUARDS}/no-banned-word-anywhere.mjs`,
    file: 'src/lib/images/community-photo.ts',
    find: 'export',
    replace: [
      "const DRILL_SLUG = (s: string) => s === 'arts-cult" + "ure'",
      'void DRILL_SLUG',
      'export',
    ].join('\n'),
    expect: 'with no reviewed exemption',
  },
  /*
   * sitemap-resolves, four drills, one per check, because all four of these
   * failures were live in src/app/sitemap.ts at the same time on 25 August 2026
   * and every gate in the repository was green.
   *
   * The measurement that produced them: a sweep of all 586 URLs the PRODUCTION
   * sitemap published returned 48 hard 404s, and a per-slug drive of the
   * /categories namespace returned six 308s beside one 200. Both are in the
   * guard's header.
   */
  {
    name: 'the sitemap queries a column that does not exist (the 42703 class)',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    // The venue query lives in the catalogue module since close-out SEO2, and
    // the guard reads both files for exactly this reason.
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: "      .select('venue_name, updated_at')",
    replace: "      .select('venue_name, updated_at, nonexistent_column')",
    expect: 'does not exist in src/types/database.ts',
  },
  {
    /*
     * The failure mode this guard's subject moving created, and the clause added
     * to refuse it: a family stops being built and the guard goes QUIET rather
     * than red. Every sitemap defect on record is a family publishing nothing in
     * silence.
     */
    name: 'the catalogue stops building one of the three families',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: '      rows.push({ path: `/venues/${handle}`, lastModified: handles.get(handle) ?? null })',
    replace: '      rows.push({ path: `/nothing/${handle}`, lastModified: handles.get(handle) ?? null })',
    expect: 'no longer builds /venues/PARAM',
  },
  {
    name: 'the sitemap publishes a URL this repository permanently redirects',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: '      url: `${baseUrl}/pricing`,',
    replace: '      url: `${baseUrl}/cultures`,',
    expect: 'which permanent-redirects.ts redirects away',
  },
  {
    name: 'the sitemap templates over a redirected namespace without consulting the table',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: '    if (isRedirected(path)) continue',
    replace: '    if (false) continue',
    expect: 'never calls isRedirected()',
  },
  {
    name: 'the sitemap publishes a URL shape with no route behind it',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: '      url: `${baseUrl}/pricing`,',
    replace: '      url: `${baseUrl}/pricing-plans`,',
    expect: 'no App Router page matches it',
  },
  {
    name: 'a sitemap catch block swallows its error without reporting it',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    // The artists block is the last remaining try/catch in sitemap.ts; the three
    // row-derived families now return their error from the catalogue instead.
    file: 'src/app/sitemap.ts',
    find: "    console.error('[sitemap] artist block failed:', err)",
    replace: '    void err',
    expect: 'catch block that reports nothing',
  },
  /*
   * one-db-connection-source, four drills, one per banned shape.
   *
   * These exist because the guard they exercise was written after two hours were
   * lost to a 28P01 that nine private copies of the connection parser made
   * impossible to locate. A guard that cannot be shown to FAIL is a guard nobody
   * can trust to be doing anything, and this one's whole value is that it refuses
   * the tenth copy. Each drill reintroduces exactly one of the shapes that were
   * removed, into a file that currently passes.
   */
  /*
   * one-visibility-source, two drills, one per rule.
   *
   * Rule 1 reintroduces the hand-written publication predicate into a discovery
   * surface, which is the shape that let /events print a correct count of 2
   * beside a rail of 8 deleted events. Rule 2 declares a cached read carrying a
   * tag nothing invalidates, which is how those 8 survived the delete.
   */
  {
    /*
     * The defect that produced this rule: every organiser profile page returned
     * 404 to anonymous visitors for weeks, while /sitemap.xml advertised 38 of
     * those URLs to Google. The page selected only granted columns, which the
     * guard checked and approved, and then FILTERED on `status`, which anon
     * cannot select. Postgres refuses the whole query. Checking the select list
     * alone was checking half the query.
     */
    name: 'an anon query filters on a column revoked from anon',
    guard: 'scripts/security/revoked-column-reads.mjs',
    file: 'src/app/organisers/[handle]/page.tsx',
    find: "    .eq('id', row.id)",
    replace: "    .eq('id', row.id)\n    .eq('status', 'active')",
    expect: 'revoked',
  },
  {
    name: 'a discovery surface spells out the publication predicate again',
    guard: `${GUARDS}/one-visibility-source.mjs`,
    file: 'src/lib/events/home-queries.ts',
    find: '.match(PUBLIC_EVENT_MATCH)',
    replace: ".eq('status', 'published')\n    .eq('visibility', 'public')",
    expect: 'spells out the publication',
  },
  {
    name: 'a cached read declares a tag nothing invalidates',
    guard: `${GUARDS}/one-visibility-source.mjs`,
    file: 'src/lib/events/fetchers.ts',
    find: 'tags: [EVENT_DATA_CACHE_TAGS[1]]',
    replace: "revalidate: 1800, tags: ['events:orphan-cache']",
    expect: 'nothing invalidates',
  },
  {
    name: 'a script hands pg a connectionString again',
    guard: `${GUARDS}/one-db-connection-source.mjs`,
    file: 'scripts/verify/seeded-order-forensics.mjs',
    find: 'const db = await target.connect()',
    replace: 'const db = new pg.Client({ connectionString: "postgresql://x" })',
    expect: 'connectionString',
  },
  {
    name: 'a script reads SUPABASE_DB_URL out of the environment again',
    guard: `${GUARDS}/one-db-connection-source.mjs`,
    file: 'scripts/verify/seeded-order-forensics.mjs',
    find: 'const db = await target.connect()',
    replace: 'const raw = process.env.SUPABASE_DB_URL\nconst db = await target.connect()',
    expect: 'direct env read',
  },
  {
    name: 'a script parses the database URL with new URL() again',
    guard: `${GUARDS}/one-db-connection-source.mjs`,
    file: 'scripts/verify/seeded-order-forensics.mjs',
    find: 'const db = await target.connect()',
    replace: 'const u = new URL(SUPABASE_DB_URL)\nconst db = await target.connect()',
    expect: 'new URL on a database url',
  },
  {
    name: 'a script hardcodes the pooler host again',
    guard: `${GUARDS}/one-db-connection-source.mjs`,
    file: 'scripts/verify/seeded-order-forensics.mjs',
    find: 'const db = await target.connect()',
    replace:
      'const db = new pg.Client({ host: "aws-1-ap-southeast-2.pooler.supabase.com", port: 5432 })',
    expect: 'hardcoded supabase host',
  },
  {
    /*
     * RULE 2 of no-unowned-organisation-read. The check that matters most and the
     * one a lexical guard most easily misses: the publish gate's organisations read
     * lives in publish-gate.ts, so a call site that hands it the service-role client
     * contains no `.from('organisations')` of its own. Deleting the ownership check
     * here must still fail the build, because the service role bypasses RLS and an
     * unchecked call turns an exposure into a cross-tenant read.
     */
    name: 'publish gate handed the service role with no ownership check (createEvent)',
    guard: `${GUARDS}/no-unowned-organisation-read.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/actions.ts',
    find: "  const authority = await assertCallerMayActForOrganisation(user.id, input.organisationId, 'owner')\n  if (!authority.ok) return { error: 'Organisation not found or access denied' }",
    replace: '  // ownership check removed by the drill',
    expect: 'with no ownership check',
  },
  {
    /*
     * RULE 1: a direct service-role read of the five sale-posture columns in a file
     * that is not a reviewed admission. fetchers.ts is a public discovery module, so
     * a Stripe-posture read appearing there is exactly the shape this guard exists
     * to refuse.
     */
    name: 'service-role read of organisation sale posture in an unadmitted file',
    guard: `${GUARDS}/no-unowned-organisation-read.mjs`,
    file: 'src/lib/events/fetchers.ts',
    find: 'export',
    replace:
      "export async function rogueSalePostureRead(admin, orgId) {\n" +
      "  return admin.from('organisations').select('stripe_account_id, payout_status').eq('id', orgId)\n" +
      '}\nexport',
    expect: 'no ownership check in the same function',
  },
  {
    name: 'ungated provider button (the 2026-08-02 production defect)',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: '      {googleEnabled && (\n        <>\n          <GoogleButton label="Continue with Google" />\n          <AuthDivider label="or" />\n        </>\n      )}',
    replace: '      <GoogleButton label="Continue with Google" />\n      <AuthDivider label="or" />',
    expect: 'without the "googleEnabled &&" gate',
  },
  {
    name: 'provider button in an unregistered file',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/components/auth/auth-divider.tsx',
    find: 'export function AuthDivider',
    replace:
      'export function rogue() { return supabase.auth.signInWithOAuth({ provider: "apple" }) }\nexport function AuthDivider',
    expect: 'is not a registered provider button',
  },
  {
    name: 'gate prop weakened to optional',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/components/auth/signup-form.tsx',
    find: '  googleEnabled: boolean',
    replace: '  googleEnabled?: boolean',
    expect: 'as OPTIONAL',
  },
  {
    name: 'page renders a gated form without resolving provider state',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/app/(auth)/login/page.tsx',
    find: "  const googleEnabled = await isProviderEnabled('google')",
    replace: '  const googleEnabled = true',
    expect: 'never calls isProviderEnabled()',
  },
  {
    name: 'password reset back on Supabase SMTP (the recovery-email defect)',
    guard: `${GUARDS}/no-supabase-smtp.mjs`,
    file: 'src/components/auth/forgot-password-form.tsx',
    find: "      const res = await fetch('/api/auth/recover', {",
    replace:
      "      await supabase.auth.resetPasswordForEmail(email)\n      const res = await fetch('/api/auth/recover', {",
    expect: 'auth.resetPasswordForEmail()',
  },
  {
    name: 'magic link back on Supabase SMTP',
    guard: `${GUARDS}/no-supabase-smtp.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: "      const res = await fetch('/api/auth/magic-link', {",
    replace:
      "      await supabase.auth.signInWithOtp({ email })\n      const res = await fetch('/api/auth/magic-link', {",
    expect: 'auth.signInWithOtp()',
  },
  {
    name: 'verification resend back on Supabase SMTP',
    guard: `${GUARDS}/no-supabase-smtp.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: "      const res = await fetch('/api/auth/magic-link', {",
    replace:
      "      await supabase.auth.resend({ type: 'signup', email })\n      const res = await fetch('/api/auth/magic-link', {",
    expect: 'auth.resend()',
  },
  {
    name: 'admin invite back on Supabase SMTP',
    guard: `${GUARDS}/no-supabase-smtp.mjs`,
    file: 'src/lib/auth/dispatch-auth-link.ts',
    find: '      ? await admin.auth.admin.generateLink({',
    replace:
      '      ? await admin.auth.admin.inviteUserByEmail(email) ?? await admin.auth.admin.generateLink({',
    expect: 'auth.admin.inviteUserByEmail()',
  },
  {
    name: 'provider registries disagree (runtime knows a provider the guard does not)',
    guard: `${GUARDS}/auth-provider-guard.mjs`,
    file: 'src/lib/auth/providers.ts',
    find: "export const RENDERABLE_PROVIDERS = ['google'] as const",
    replace: "export const RENDERABLE_PROVIDERS = ['google', 'apple'] as const",
    expect: 'provider registries disagree',
  },
  {
    /*
     * REPOINTED 11 September 2026. These two were anchored on
     * src/lib/waitlist/promote.ts, which built its own mail client until
     * close-out D2 moved the waiting-list message into the recovery engine so
     * that one freed unit produces exactly one message. The anchor went with it.
     * They are repointed at a sender that still has that shape rather than
     * deleted: what they prove is unchanged.
     */
    name: 'sender address literal reintroduced',
    guard: `${GUARDS}/sender-single-source.mjs`,
    file: 'src/lib/payouts/email.ts',
    find: '      from: getNoReplyFrom(),',
    replace: "      from: 'EventLinqs <noreply@eventlinqs.com>',",
    expect: 'a literal sender address on a from/replyTo property',
  },
  {
    name: 'sender address hidden in a FROM constant',
    guard: `${GUARDS}/sender-single-source.mjs`,
    file: 'src/lib/payouts/email.ts',
    find: '      from: getNoReplyFrom(),',
    // The guard is a text scanner, so the intermediate need not compile; the
    // harness restores the file in a `finally` either way.
    replace:
      "      const MAIL_FROM = 'EventLinqs <noreply@eventlinqs.com>'\n      from: MAIL_FROM,",
    expect: 'a literal sender address assigned to a FROM constant',
  },
  {
    name: 'sign-in email field reverted to autocomplete="email"',
    guard: `${GUARDS}/auth-autocomplete-guard.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: '            autoComplete="username"',
    replace: '            autoComplete="email"',
    expect: 'must carry autoComplete="username"',
  },
  {
    name: 'name attribute dropped from the sign-in password field',
    guard: `${GUARDS}/auth-autocomplete-guard.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: '            name="password"\n',
    replace: '',
    expect: 'must carry a stable name="password"',
  },
  {
    name: 'hidden username field removed from the reset form',
    guard: `${GUARDS}/auth-autocomplete-guard.mjs`,
    file: 'src/components/auth/reset-password-form.tsx',
    find: '        id="username"',
    replace: '        id="username-removed-by-drill"',
    expect: 'no <input id="username"> found',
  },

  // -------------------------------------------------------------------------
  // node-version-contract. Every check, because the FIRST draft of this guard
  // could not fail at all: it scanned the string-blanked source view for a
  // module specifier, which is itself a string, so the pattern never matched
  // and it reported PASS on the very defect it was written for. These drills
  // are what caught that, and they are why each check now has one.
  // -------------------------------------------------------------------------
  {
    /*
     * REMOVED, not future. This drill used to import `globSync` from node:fs,
     * chosen when .nvmrc pinned Node 20 because globSync landed in 22. The
     * contract moved to 24 on 2026-08-13, Node 24 exports globSync, the guard
     * correctly stopped objecting, and the drill quietly stopped testing
     * anything: it reported "guard PASSED on a violating tree" because the tree
     * was no longer violating.
     *
     * The lesson is in the choice of API, not the wiring. A drill built on a
     * FUTURE addition rots the moment the contract catches up. A drill built on
     * a REMOVED export can never rot, because a removal is permanent. fs.F_OK
     * was removed in Node 24 (it lives on fs.constants now) and is absent from
     * the generated surface record, verified rather than assumed.
     */
    name: 'a named import Node 24 REMOVED (fs.F_OK, gone since 24)',
    guard: `${GUARDS}/node-version-contract.mjs`,
    file: 'scripts/guards/no-supabase-smtp.mjs',
    find: "import { join } from 'node:path'",
    replace: "import { F_OK } from 'node:fs'\nimport { join } from 'node:path'",
    expect: "imports { F_OK } from 'node:fs'",
  },
  {
    name: 'a built-in module that does not exist in Node 20 (node:sqlite)',
    guard: `${GUARDS}/node-version-contract.mjs`,
    file: 'scripts/guards/no-supabase-smtp.mjs',
    find: "import { join } from 'node:path'",
    replace: "import { DatabaseSync } from 'node:sqlite'\nimport { join } from 'node:path'",
    expect: "imports 'node:sqlite', which does not exist",
  },
  {
    // Same reasoning as the F_OK drill: a REMOVED export cannot come back, so this
    // cannot go stale when the contract moves again. util.isDate went with the
    // whole util.is* family in Node 24. Note util.isArray is STILL exported, so the
    // family was not removed wholesale and picking the wrong member would have
    // produced another silently-passing drill.
    name: 'a named import from the util.is* family Node 24 removed (util.isDate)',
    guard: `${GUARDS}/node-version-contract.mjs`,
    file: 'scripts/guards/no-supabase-smtp.mjs',
    find: "import { join } from 'node:path'",
    replace: "import { isDate } from 'node:util'\nimport { join } from 'node:path'",
    expect: "imports { isDate } from 'node:util'",
  },
  // NO PROTOTYPE-METHOD DRILL, deliberately, and this comment is the record of why.
  // node-version-contract's POST_CONTRACT_PROTOTYPE_METHODS list is EMPTY on the
  // Node 24 contract (founder ruling 2026-08-13): every entry it used to hold was a
  // Node 22 addition that Node 24 actually ships, so keeping them would have failed
  // builds over APIs the runtime has. An empty list is a working check with nothing
  // to report, so no drill can make it fire without first adding a fake entry to the
  // guard, which would fail the build for everyone. The check is therefore
  // UNEXERCISED until Node 26 adds a prototype method and an entry goes in; the drill
  // belongs here on that day. Removing this drill rather than leaving it red is the
  // honest option: it was reporting a guard defect that does not exist.
  {
    /*
     * The anchor was `node-version: 20`, written when .nvmrc pinned 20. The contract
     * moved to 24 on 2026-08-13 and every workflow pin moved with it, so the anchor
     * matched nothing and the harness reported "anchor text not found. The drill is
     * stale" rather than a guard defect. That is the harness distinguishing a broken
     * DRILL from a broken GUARD, which is worth more than either report alone.
     *
     * Anchored on 24 now. If the contract moves again this drill goes stale in the
     * same visible way, which is acceptable: unlike the API drills above there is no
     * version-independent way to express "one lower than the contract" in a static
     * find/replace, and a loudly stale drill is not a silently passing one.
     */
    name: 'a workflow pinned BELOW the .nvmrc contract',
    guard: `${GUARDS}/node-version-contract.mjs`,
    file: '.github/workflows/lighthouse.yml',
    find: 'node-version: 24',
    replace: 'node-version: 22',
    expect: 'below the .nvmrc contract',
  },

  // -------------------------------------------------------------------------
  // auth-provider-cost-guard. The reverse direction of auth-provider-guard:
  // every gate call must be on a route that renders a button. Each of the four
  // checks gets a drill, because a cost guard that cannot fail is worse than
  // none: it reads as proof that the cost is contained while containing nothing.
  // -------------------------------------------------------------------------
  {
    name: 'provider gate resolved on a page that renders no provider button',
    guard: `${GUARDS}/auth-provider-cost-guard.mjs`,
    file: 'src/app/(auth)/forgot-password/page.tsx',
    find: 'export default function ForgotPasswordPage() {',
    replace:
      "import { isProviderEnabled } from '@/lib/auth/providers'\n" +
      'export default async function ForgotPasswordPage() {\n' +
      "  await isProviderEnabled('google')",
    expect: 'renders no',
  },
  {
    name: 'provider gate reached from the root layout (every route pays)',
    guard: `${GUARDS}/auth-provider-cost-guard.mjs`,
    file: 'src/app/layout.tsx',
    find: "import { getSiteUrl } from '@/lib/site-url'",
    replace:
      "import { getSiteUrl } from '@/lib/site-url'\nimport { getEnabledProviders } from '@/lib/auth/providers'",
    expect: 'reaches the provider resolver',
  },
  {
    name: 'provider resolver pulled into a Client Component',
    guard: `${GUARDS}/auth-provider-cost-guard.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: "import { GoogleButton } from './google-button'",
    replace:
      "import { GoogleButton } from './google-button'\n" +
      "import { isProviderEnabled } from '@/lib/auth/providers'",
    expect: 'is a Client Component and imports',
  },
  {
    name: 'the gate hardcoded to true at the call site (fail-safe defeated)',
    guard: `${GUARDS}/auth-provider-cost-guard.mjs`,
    file: 'src/app/(auth)/login/page.tsx',
    find: '<LoginForm googleEnabled={googleEnabled} />',
    replace: '<LoginForm googleEnabled={true} />',
    expect: 'hardcodes "googleEnabled" to true',
  },

  // -------------------------------------------------------------------------
  // check-client-barrel-imports, from PR #111. Drilled HERE, through the same
  // harness as every other guard, because the rebase that merged the two build
  // chains is exactly when a guard goes quietly missing. It has its own drill
  // harness (scripts/verify/client-barrel-drills.mjs) which is kept and still
  // run; this single drill is the tripwire that proves the guard is still
  // REGISTERED and still fires from the shared runner's list.
  // -------------------------------------------------------------------------
  {
    name: 'a third-party namespace import back in client-reachable code (#111)',
    guard: 'scripts/check-client-barrel-imports.mjs',
    file: 'src/lib/observability/client-error-report.ts',
    find: 'type ClientErrorReport = {',
    replace: "import * as Sentry from '@sentry/nextjs'\ntype ClientErrorReport = {",
    // The guard prints the KIND and the SPECIFIER, not the source line, so the
    // expected text is its report format rather than the code that caused it.
    expect: "import * as '@sentry/nextjs'",
  },

  // -------------------------------------------------------------------------
  // REFUND INVENTORY (the 2026-08-18 leak). A refund that succeeds at Stripe and
  // does not return the seat is invisible to everybody: the buyer is refunded,
  // the ticket stops admitting, and the tier quietly keeps counting the seat as
  // sold. Reproduced with a real test-mode refund by
  // scripts/verify/refund-orphan-inventory-drill.mjs. These five drills are the
  // five ways back into it.
  // -------------------------------------------------------------------------
  {
    name: 'reconcile_refund stops returning inventory (the leak itself)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: NEW_EFFECTIVE_RECONCILE,
    find: 'GREATEST(0, tt.sold_count - sub.cnt)',
    replace: 'tt.sold_count',
    expect: 'no longer returns inventory',
  },
  {
    name: 'the ::public.order_status cast dropped again (the 20260621000002 defect)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: NEW_EFFECTIVE_RECONCILE,
    find: "END)::public.order_status",
    replace: 'END)',
    expect: 'casts the order status',
  },
  {
    name: 'an out-of-app refund no longer adopted (straight to the door-safety void)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: 'const adopted = await adoptOrphanRefund(adminClient, charge, r)',
    replace: 'const adopted = false',
    expect: 'no longer adopts an unmatched refund',
  },
  {
    name: 'a second ticket-void path appears (the leak returning under a new name)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: '  let matchedAnyRow = false',
    replace: "  let matchedAnyRow = false\n  const rogueVoid = { status: 'void' }\n  void rogueVoid",
    expect: 'void a ticket',
  },
  {
    name: 'adoption stops refusing an in-app refund (would double-restore the seat)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: '  const inAppRefundId = (stripeRefund.metadata as { refund_id?: string } | null | undefined)?.refund_id',
    replace: '  const inAppRefundId: string | undefined = undefined',
    expect: 'refuses a refund carrying metadata.refund_id',
  },

  // -------------------------------------------------------------------------
  // THE REFUND SUCCESS DOOR (close-out R1, 14 September 2026). The drills above
  // ask what happens once a refund is HEARD. These seven ask whether it is heard
  // at all. Until R1 the route reached its successful-refund handler from one
  // event, `charge.refunded`, and a refund issued from the Stripe Dashboard
  // arrived as `refund.created` and was dropped in silence.
  //
  // The last two are one violation drilled TWICE, deliberately. The first time
  // this clause was drilled, commenting the requirement out left the guard GREEN,
  // because a key inside `// 'refund.created': ...` still matched a quoted key
  // followed by a colon. Deleting it fired and commenting it out did not, so both
  // are kept: the disabled-but-present shape is the one that got through.
  // -------------------------------------------------------------------------
  {
    name: 'the refund.created case is gone from the route (the R1 defect itself)',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: "      case 'refund.created': {",
    replace: "      case 'refund.created.DRILL': {",
    expect: "has no `case 'refund.created':`",
  },
  {
    name: 'a successful refund routed to the FAILED and CANCELLED path',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: '        await handleRefundCreated(refund)',
    replace: '        await handleRefundNotCompleted(refund)',
    expect: 'routes to handleRefundNotCompleted',
  },
  {
    name: 'the declared set shrinks below the event Stripe names as the minimum',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'src/lib/payments/refund-events.ts',
    find: "export const REFUND_SUCCESS_EVENTS = ['refund.created', 'charge.refunded'] as const",
    replace: "export const REFUND_SUCCESS_EVENTS = ['charge.refunded'] as const",
    expect: 'does not contain refund.created',
  },
  {
    name: 'the reconcile failure throws a plain Error again (the retry that was a comment)',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: 'throw new WebhookProcessingError(`reconcile_refund failed',
    replace: 'throw new Error(`reconcile_refund failed',
    expect: 'maps ONLY WebhookProcessingError to HTTP 500',
  },
  {
    name: 'a deprecated Stripe event wired to the success path',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: "      case 'refund.created': {",
    replace: "      case 'charge.refund.updated':\n      case 'refund.created': {",
    expect: 'Stripe marks that event Deprecated',
  },
  {
    name: 'the endpoint subscription probe stops requiring refund.created (deleted)',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'scripts/probe/webhook-subscription-check.mjs',
    find: "  'refund.created': 'the second door to reconcile_refund, and the one Stripe names as the minimum',\n",
    replace: '',
    expect: 'subscription probe does not require refund.created',
  },
  {
    name: 'the endpoint subscription probe stops requiring refund.created (commented out)',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'scripts/probe/webhook-subscription-check.mjs',
    find: "  'refund.created': 'the second door",
    replace: "  // 'refund.created': 'the second door",
    expect: 'subscription probe does not require refund.created',
  },
  {
    name: 'a refund stops making the freed place visible again (the SOLD OUT page)',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: '      const invalidated = await revalidateEventSurfacesFromRouteHandlerById(adminClient, order.event_id as string)',
    replace: '      const invalidated: string[] = []',
    expect: 'no longer call revalidateEventSurfacesFromRouteHandlerById',
  },
  {
    name: 'the refund stops refreshing the inventory cache the ticket panel reads',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: '          refreshInventoryCache(tier, order.event_id as string).catch(err => {',
    replace: '          Promise.resolve(tier).catch(err => {',
    expect: 'no longer call refreshInventoryCache',
  },
  {
    name: 'the webhook reaches for the SERVER ACTION revalidation, which throws in a route handler',
    guard: `${GUARDS}/refund-success-door.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: '      const invalidated = await revalidateEventSurfacesFromRouteHandlerById(adminClient, order.event_id as string)',
    replace: '      const invalidated = await revalidateEventSurfacesById(adminClient, order.event_id as string)',
    expect: 'the SERVER ACTION form',
  },

  // -------------------------------------------------------------------------
  // OVERSELL (measured 2026-08-19). 50 simultaneous buyers against one seat:
  // with the row lock 1 won, with the lock removed 16 won and 15 people would
  // have been turned away at the door. These drills are the ways back in.
  // -------------------------------------------------------------------------
  {
    name: 'the reservation row lock removed (16 of 50 buyers won one seat without it)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: NEW_EFFECTIVE_RESERVATION,
    find: '      FOR UPDATE;',
    replace: '      ;',
    expect: 'no longer takes the row lock',
  },
  {
    name: 'availability arithmetic stops subtracting reserved_count',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: NEW_EFFECTIVE_RESERVATION,
    find: 'tt.total_capacity - tt.sold_count - tt.reserved_count AS available',
    replace: 'tt.total_capacity - tt.sold_count AS available',
    expect: 'computes availability as capacity minus sold minus reserved',
  },
  {
    name: 'reserved_count assigned instead of incremented (loses concurrent reservations)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: NEW_EFFECTIVE_RESERVATION,
    find: 'SET reserved_count = reserved_count + v_quantity',
    replace: 'SET reserved_count = v_quantity',
    expect: 'increments reserved_count rather than assigning it',
  },
  {
    name: 'the lapsed-hold re-acquire removed (2 tickets for 1 seat, both buyers charged)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: NEW_EFFECTIVE_CONFIRM,
    find: '              AND total_capacity - sold_count - reserved_count >= v_quantity;',
    replace: '              ;',
    expect: 're-acquires the seat when the hold has LAPSED',
  },
  {
    name: 'the sold-out refusal removed (would confirm a ticket for somebody else\'s seat)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: NEW_EFFECTIVE_CONFIRM,
    find: '            GET DIAGNOSTICS v_taken = ROW_COUNT;',
    replace: '            v_taken := 1;',
    expect: 'REFUSES when the lapsed seat is gone',
  },
  {
    name: 'the confirm whitelist removed (a refunded order confirms into a ticket)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: 'supabase/migrations/20260819000004_confirm_only_pending_orders.sql',
    find: "  IF v_order.status <> 'pending' THEN",
    replace: "  IF FALSE THEN",
    expect: 'WHITELISTS the statuses it will confirm',
  },
  {
    name: 'the phantom ledger reversal guard removed (debits an organiser for a sale never made)',
    guard: `${GUARDS}/refund-restores-inventory.mjs`,
    file: NEW_EFFECTIVE_RECONCILE,
    find: '  ) INTO v_sale_recorded;',
    replace: '  ) INTO v_unused_flag;',
    expect: 'does NOT reverse a sale that was never recorded',
  },
  {
    name: 'an application-level write to sold_count (a second owner of the counter)',
    guard: `${GUARDS}/inventory-lock-integrity.mjs`,
    file: 'src/app/actions/checkout.ts',
    find: "import { createClient } from '@/lib/supabase/server'",
    replace:
      "import { createClient } from '@/lib/supabase/server'\n"
      + 'async function rogueInventoryWrite(db: ReturnType<typeof createAdminClient>, id: string, n: number) {\n'
      + "  return db.from('ticket_tiers').update({ sold_count: n }).eq('id', id)\n"
      + '}\n'
      + 'void rogueInventoryWrite',
    expect: 'application-level write(s) to the inventory counters',
  },

  /*
   * LABELLED FORM CONTROLS. The founder ruling of 28 August 2026: a raw input,
   * select, textarea or checkbox on a form surface fails the build unless it
   * carries a programmatic label.
   *
   * The first drill is the obvious one. The four after it are the ones that
   * matter, and they assert the guard STAYS SILENT, because this guard is far
   * more likely to be switched off for crying wolf than for missing something.
   *
   * That is not hypothetical. On the day it was written, two separate static
   * detectors were run over seat-map-builder.tsx. One reported 20 of 48 controls
   * labelled; the true figure was 9, because it counted aria-labels belonging to
   * BUTTONS. The other reported 39 UNLABELLED; the true figure was 0, because
   * every one of them sits inside a <Field> wrapper that renders
   * <label><span>{label}</span>{children}</label> and is therefore implicitly
   * associated. axe over the running application confirmed zero violations in
   * all eleven states the builder can be driven into.
   *
   * So each legitimate way to name a control gets a drill of its own, and the
   * wrapper case uses the real <Field> that broke both detectors.
   */
  {
    name: 'a raw input is added with nothing naming it',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    file: 'src/components/orders/order-table.tsx',
    find: '        <select\n          aria-label="Filter orders by status"',
    replace:
      '        <input type="text" value="" onChange={() => {}} />\n'
      + '        <select\n          aria-label="Filter orders by status"',
    expect: 'nothing names it',
  },
  {
    name: 'NO FALSE POSITIVE: an input named by aria-label',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    expectPass: 'aria-label',
    file: 'src/components/orders/order-table.tsx',
    find: '        <select\n          aria-label="Filter orders by status"',
    replace:
      '        <input type="text" aria-label="Drill field" value="" onChange={() => {}} />\n'
      + '        <select\n          aria-label="Filter orders by status"',
  },
  {
    name: 'NO FALSE POSITIVE: an input nested inside its own label',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    expectPass: 'ancestor <label>',
    file: 'src/components/orders/order-table.tsx',
    find: '        <select\n          aria-label="Filter orders by status"',
    replace:
      '        <label>Drill field<input type="text" value="" onChange={() => {}} /></label>\n'
      + '        <select\n          aria-label="Filter orders by status"',
  },
  {
    name: 'NO FALSE POSITIVE: an input paired by htmlFor',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    expectPass: 'htmlFor',
    file: 'src/components/orders/order-table.tsx',
    find: '        <select\n          aria-label="Filter orders by status"',
    replace:
      '        <label htmlFor="drill-field">Drill field</label>\n'
      + '        <input id="drill-field" type="text" value="" onChange={() => {}} />\n'
      + '        <select\n          aria-label="Filter orders by status"',
  },
  /*
   * A LABEL THAT NAMES THE WRONG CONTROL. Drilled from both sides for the same
   * reason as its sibling: this guard reasons about MEANING, so a false positive
   * is the likelier death. The quiet-side drill uses the real ticket tier group,
   * where a label and two controls legitimately sit together.
   */
  {
    name: 'a label points at an element that cannot be labelled',
    guard: `${GUARDS}/labels-name-the-right-control.mjs`,
    file: 'src/components/waitlist/join-waitlist-modal.tsx',
    find: '<div id="waitlist-quantity-label" className="block text-sm font-medium text-ink-600 mb-1.5">',
    replace: '<label htmlFor="waitlist-quantity" className="block text-sm font-medium text-ink-600 mb-1.5">',
    expect: 'which cannot be labelled',
  },
  {
    name: 'a label names the control BESIDE the one it describes',
    guard: `${GUARDS}/labels-name-the-right-control.mjs`,
    file: 'src/components/features/events/event-form.tsx',
    /*
     * Take the id OFF the price input, which is exactly the shape of the
     * original defect: the "Price" label no longer resolves to the field it
     * describes, while that field still carries its own aria-label saying what
     * it is. An earlier version of this drill ADDED the id to the currency
     * select instead, which produced two elements sharing one id; the guard
     * matched the input and stayed quiet, and the drill proved nothing.
     */
    find: '                  id={`tier-price-${idx}`}\n                  type="number"',
    replace: '                  type="number"',
    expect: 'appears in a sibling',
  },
  {
    name: 'NO FALSE POSITIVE: the ticket tier group as it correctly stands',
    guard: `${GUARDS}/labels-name-the-right-control.mjs`,
    expectPass: 'Every label names the control it describes',
    file: 'src/components/features/events/event-form.tsx',
    find: '                  placeholder="0.00"',
    replace: '                  placeholder="0.00"\n                  inputMode="decimal"',
  },
  {
    name: 'NO FALSE POSITIVE: an input inside the Field wrapper that fooled two greps',
    guard: `${GUARDS}/labelled-form-controls.mjs`,
    expectPass: 'wrapper <Field>',
    file: 'src/app/(dashboard)/dashboard/venues/[id]/seat-maps/seat-map-builder.tsx',
    find: '        <Field label="Rows">',
    replace:
      '        <Field label="Drill field">\n'
      + '          <input type="number" value={1} onChange={() => {}} />\n'
      + '        </Field>\n'
      + '        <Field label="Rows">',
  },
  /*
   * no-silent-submit, three drills, one per shape the guard decides.
   *
   * The class: a control the user operates that completes with neither a
   * visible result nor a visible error. Journey 8, 29 August 2026.
   */
  {
    /*
     * THE ACTUAL DEFECT, restored. min="0.01" with step="1" means HTML steps
     * 0.01, 1.01, 2.01, ... so a person typing 20 produces a stepMismatch, the
     * browser refuses the submit, and no handler ever runs. Two sessions read
     * the handler and the server action looking for this.
     */
    name: 'a number input whose min and step make every round value unsubmittable',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    // Restores step="1" against the fixed_amount min of 0.01. The FIRST version
    // of this drill restored only the min and left step="any", and the guard
    // correctly stayed quiet: with no numeric step there is no arithmetic to be
    // wrong. The drill has to put back the step, which is where the defect was.
    find: '                step="any"',
    replace: '                step="1"',
    expect: 'stepMismatch',
  },
  {
    /*
     * The refusal read and dropped: the success branch applies and the error
     * branch does not exist. This is what the venue create and update handlers
     * did until 29 August 2026.
     */
    name: 'a server action refusal is read and then dropped on the floor',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/app/(dashboard)/dashboard/venues/venues-client.tsx',
    find: [
      '        if (result.error) {',
      '          setSaveError(result.error)',
      '          resolve()',
      '          return',
      '        }',
      '        setVenues(prev =>',
    ].join('\n'),
    replace: [
      '        if (!result.error) {',
      '        setVenues(prev =>',
    ].join('\n'),
    expect: 'has no else',
  },
  {
    /*
     * The refusal never read at all: the result is assigned and abandoned, so
     * nothing downstream can surface it.
     */
    name: 'a server action result is assigned and never referenced again',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/components/marketplace/requests-panel.tsx',
    find: [
      '      const result = await respondToRequestAction({ requestId, response })',
      '      if (!result.ok) {',
      "        setRespondError(result.error ?? 'That could not be saved. Try again.')",
      '        return',
      '      }',
    ].join('\n'),
    replace: '      const result = await respondToRequestAction({ requestId, response })',
    expect: 'never referenced again',
  },
  {
    /*
     * THE SAME ARITHMETIC WITH THE STEP LEFT OUT, added 29 August 2026.
     *
     * `step` defaults to 1 on <input type="number"> when the attribute is
     * absent (HTML Standard, the step attribute), so min="0.01" with NO step is
     * bit-for-bit the journey 8 defect. The first version of the guard required
     * BOTH a min and a step literal before it would judge anything, so it would
     * have walked straight past this one. The defect it was written for
     * happened to spell the step out; the next one need not.
     */
    name: 'a number input with a fractional min and NO step, which HTML reads as step=1',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    find: '                step="any"',
    replace: '                data-drill="no-step-attribute"',
    expect: 'NO step attribute',
  },
  {
    /*
     * A RANGE WITH NOTHING IN IT. min > max makes every entry out of range, so
     * checkValidity() is false and the submit never reaches a handler. Same
     * silence as the step defect, different constraint.
     */
    name: 'a number input whose min is greater than its max',
    guard: `${GUARDS}/no-silent-submit.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    find: '                step="any"',
    replace: '                step="any"\n                max="0"',
    expect: 'No value satisfies both',
  },
  /*
   * event-lifecycle-total, three drills (close-out C13, 6 September 2026).
   *
   * The class: a lifecycle table with a dead end compiles, tests green, and
   * strands an organiser. The founder found `cancelled: []` on production.
   */
  {
    name: 'cancelled loses its way out of the lifecycle (the production defect)',
    guard: `${GUARDS}/event-lifecycle-total.mjs`,
    file: 'src/lib/event-lifecycle.ts',
    find: "  cancelled: ['archived'],",
    replace: '  cancelled: [],',
    expect: 'dead end: cancelled',
  },
  {
    name: 'the events list stops rendering the archive, restore and delete controls',
    guard: `${GUARDS}/event-lifecycle-total.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/events-table.tsx',
    find: '      <EventLifecycleActions\n        variant="row"',
    replace: '      <EventLifecycleActionsGone\n        variant="row"',
    expect: 'events-table.tsx does not render <EventLifecycleActions>',
  },
  {
    name: 'the door starts refusing tickets on event status',
    guard: `${GUARDS}/event-lifecycle-total.mjs`,
    file: 'supabase/migrations/20260905000002_door_realtime.sql',
    find: '  WHERE e.id = p_event_id;',
    replace: "  WHERE e.id = p_event_id AND e.status = 'published';",
    expect: 'reads event status',
  },
  /*
   * machine-callers-reachable (close-out H2.1, 8 September 2026): the three
   * ways a caller that has already proved who it is ends up being refused
   * anyway, and the way the reviewed record rots.
   */
  {
    name: 'a signed Stripe webhook gains a rate limit',
    guard: `${GUARDS}/machine-callers-reachable.mjs`,
    file: 'src/app/api/webhooks/stripe/route.ts',
    find: "  const signature = request.headers.get('stripe-signature')",
    replace: "  const blocked = await applyRateLimit('checkout-reserve', request)\n  if (blocked) return blocked\n  const signature = request.headers.get('stripe-signature')",
    expect: 'applies a rate limit to a SIGNED webhook',
  },
  {
    name: "a cron's rate limiter becomes fail-closed, so no Upstash means no crons",
    guard: `${GUARDS}/machine-callers-reachable.mjs`,
    file: 'src/app/api/cron/aggregate-reconcile/route.ts',
    find: "  const blocked = await applyRateLimit('cron-job', request)",
    replace: "  const blocked = await applyRateLimit('checkout-reserve', request)",
    expect: 'which is failClosed',
  },
  {
    name: 'the reviewed record stops naming a route that exists',
    guard: `${GUARDS}/machine-callers-reachable.mjs`,
    file: 'scripts/guards/machine-callers-reachable.mjs',
    find: "  'src/app/api/webhooks/stripe/route.ts': {",
    replace: "  'src/app/api/webhooks/stripe/route.ts.moved': {",
    expect: 'has no row in the reviewed record',
  },
  {
    name: 'a secret-gated route falls out of both the record and the exclusions',
    guard: `${GUARDS}/machine-callers-reachable.mjs`,
    file: 'scripts/guards/machine-callers-reachable.mjs',
    find: "  'src/app/api/health/sentry-error/route.ts':",
    replace: "  'src/app/api/health/sentry-error/route.ts.retired':",
    expect: 'appears in neither the reviewed record nor the reviewed exclusions',
  },
  {
    name: 'a System Bypass rule appears on the project that the record does not list',
    guard: `${GUARDS}/machine-callers-reachable.mjs`,
    file: 'scripts/guards/lib/firewall-bypass-expected.json',
    find: '"expectedSourceIps": []',
    replace: '"expectedSourceIps": ["3.18.12.63"]',
    expect: 'not installed',
  },
  /*
   * sentry-off-the-paint-path (close-out P0.5, 8 September 2026): the four ways
   * the error-reporting SDK gets back into the paint window. Each is one edit
   * and each reads as a tidy-up in review; the measured cost of any of them is
   * 217.8 KB and 644 ms landing inside the Largest Contentful Paint.
   */
  {
    name: 'the SDK goes back to booting on the load event itself',
    guard: `${GUARDS}/sentry-off-the-paint-path.mjs`,
    file: 'instrumentation-client.ts',
    find: "  else window.addEventListener('load', armTimer, { once: true })",
    replace: "  else window.addEventListener('load', boot, { once: true })",
    expect: 'the load event does not boot the SDK directly',
  },
  {
    name: 'Session Replay goes back to arming on an idle callback',
    guard: `${GUARDS}/sentry-off-the-paint-path.mjs`,
    file: 'src/lib/observability/sentry-client-boot.ts',
    find: '  for (const name of REPLAY_INTERACTION_EVENTS) window.addEventListener(name, onFirstInteraction, { passive: true })',
    replace: '  window.requestIdleCallback(load, { timeout: 5000 })',
    expect: 'Session Replay is not armed on an idle callback',
  },
  {
    name: 'the @sentry/nextjs barrel is reached by a dynamic import again, which drags rrweb back in',
    guard: `${GUARDS}/sentry-off-the-paint-path.mjs`,
    file: 'src/lib/observability/sentry-client-boot.ts',
    find: "    import('./sentry-session-replay')",
    replace: "    import('@sentry/nextjs')",
    expect: 'no dynamic import of the @sentry/nextjs barrel',
  },
  {
    name: 'one interaction signal is quietly dropped from the scheduler',
    guard: `${GUARDS}/sentry-off-the-paint-path.mjs`,
    file: 'instrumentation-client.ts',
    find: "const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const",
    replace: "const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const",
    expect: 'schedules on wheel',
  },
  {
    name: 'a held error stops booting the SDK at once, so a report can be lost',
    guard: `${GUARDS}/sentry-off-the-paint-path.mjs`,
    file: 'instrumentation-client.ts',
    find: "  boot('error')\n}",
    replace: '  void 0\n}',
    expect: 'a held error boots the SDK at once',
  },
  /*
   * gate-names-the-instrument (close-out P0.7, 9 September 2026), six drills.
   * The guard holds the three call sites that let a red Lighthouse step say
   * WHICH of its two causes it was, the page or the laptop. Each of the three
   * is one line a tidy-up removes without noticing, and on 8 September their
   * absence cost a whole session: the gate refused main's own tree at 41% of
   * the machine speed the floors were confirmed at, and nothing in the output
   * could say so. The sixth drill is the important one: it makes a degraded
   * machine EXCUSE a failed floor, which is the one thing this diagnosis must
   * never become. Evidence: C:\dev\EVIDENCE\P0.7-D.
   */
  {
    name: 'the truth table stops reading benchmarkIndex out of the reports',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ci/lighthouse-truth-table.mjs',
    find: 'benchmarkIndex: median(runs.map((l) => l?.environment?.benchmarkIndex)),',
    replace: '',
    expect: 'summarise() carries environment.benchmarkIndex through to the row',
  },
  {
    name: 'machineLine is exported but never called',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ci/lighthouse-truth-table.mjs',
    find: 'console.log(machineLine(rows))',
    replace: 'void 0',
    expect: 'machineLine() is actually called when the table is rendered',
  },
  {
    name: 'the pre-push gate stops importing the calibration',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ops/pre-push-gate.mjs',
    find: "import { calibrationReport } from '../ci/lighthouse-calibration.mjs'",
    replace: "const calibrationReport = () => ''",
    expect: 'the pre-push gate imports scripts/ci/lighthouse-calibration.mjs',
  },
  {
    name: 'the gate imports the calibration and never calls it',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ops/pre-push-gate.mjs',
    find: 'console.error(calibrationReport(readCollectedReports()))',
    replace: "console.error('')",
    expect: 'the gate returns the assertion result unchanged after printing the calibration',
  },
  {
    name: 'the calibration reading loses the evidence path that lets it be judged',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ci/lighthouse-calibration.mjs',
    find: '  evidence:',
    replace: '  evidenceWasHere:',
    expect: 'CALIBRATION declares evidence',
  },
  {
    name: 'a degraded machine is made to EXCUSE a failed floor',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ops/pre-push-gate.mjs',
    find: '    return asserted',
    replace: "    if (verdict.state === 'degraded') return 0\n    return asserted",
    expect: 'no path turns a degraded machine into a pass',
  },
  /*
   * Four more on the same guard, added 13 September 2026 for the clause the
   * first six did not cover: the calibration judged the MEDIAN of all 65
   * readings and nothing else, so a collection at 2379 with a slowest run of
   * 1071 was reported as "this machine was fit to judge, so a failure above is
   * a statement about the product". It was not. Three URLs were under their
   * floors with zero product bytes changed since a tip whose own gate had
   * passed the same step four hours earlier.
   */
  {
    name: 'the calibration loses the state for a collection that straddles the floor',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ci/lighthouse-calibration.mjs',
    find: "      state: 'mixed',",
    replace: "      state: 'calibrated',",
    expect: 'the calibration judges how many runs fell below the floor, not only the median',
  },
  {
    name: 'the per-URL reading capability is renamed away',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ci/lighthouse-calibration.mjs',
    find: 'export function perUrlBands(',
    replace: 'export function perUrlBandsWasHere(',
    expect: 'the calibration can report the machine per URL, which is the unit a floor is asserted on',
  },
  {
    name: 'the per-URL block stops reaching the pasted report',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ci/lighthouse-calibration.mjs',
    find: 'return [...verdict.lines, ...perUrlLines(lhrs)].join(String.fromCharCode(10))',
    replace: 'return verdict.lines.join(String.fromCharCode(10))',
    expect: 'calibrationReport() actually includes the per-URL block',
  },
  {
    name: 'a NOT UNIFORM collection is made to EXCUSE a failed floor',
    guard: `${GUARDS}/gate-names-the-instrument.mjs`,
    file: 'scripts/ops/pre-push-gate.mjs',
    find: '    return asserted',
    replace: "    if (verdict.state === 'mixed') return 0\n    return asserted",
    expect: 'no path turns a NOT UNIFORM collection into a pass',
  },
  {
    name: 'Session Replay is deleted rather than deferred',
    guard: `${GUARDS}/sentry-off-the-paint-path.mjs`,
    file: 'src/lib/observability/sentry-session-replay.ts',
    find: '    replayIntegration({',
    replace: '    noRecorderAtAll({',
    expect: 'Session Replay is still wired at all',
  },
  /*
   * THE RUNNER ITSELF. Close-out F1.1 asks for the naming to be proved "by
   * making one guard fail on purpose and reading the name back out of the
   * output", and that is exactly what this drill does: a real registered guard
   * is made to exit 1, the REAL runner runs all of them, and the assertion is
   * that the runner's output contains the path of the guard that failed.
   *
   * It is the only drill whose `guard` is the runner, so it costs a full guard
   * pass (about eighty seconds). That is the price of driving the thing rather
   * than unit-testing a rendering function and calling the build log proved. The
   * rendering function is unit-tested as well, in
   * tests/unit/guards/guard-run-report.test.ts; this is the half that could not
   * be faked.
   */
  {
    name: 'a guard fails and the runner will not say which one',
    guard: `${GUARDS}/run-guards.mjs`,
    file: 'scripts/guards/no-control-characters.mjs',
    find: 'const ROOT = process.cwd()',
    replace: 'const ROOT = process.cwd()\nprocess.exit(1) // planted by the F1.1 drill, restored in the finally',
    expect: '[guards]   scripts/guards/no-control-characters.mjs  (exit 1)',
  },
  /*
   * THE SAME RUNNER, THE OTHER FAULT. Close-out F2.3: "Prove it by making one
   * guard throw deliberately and reading its name back."
   *
   * The drill above plants `process.exit(1)`, which is a guard DECIDING. This
   * one plants a throw, which is a guard BREAKING, and before F2.3 the runner
   * reported both as `exit 1` because it inherited the child's streams and so
   * could not read what the child had printed. The two demand opposite
   * responses, so the assertion here is the word that tells them apart plus the
   * exception's own message, attributed to the file that raised it.
   *
   * It plants the throw in the same guard as the drill above so the two are
   * comparable line for line, and it costs a second full guard pass for the
   * same reason that one does: the rendering is unit-tested, and this is the
   * half that cannot be faked.
   */
  {
    name: 'a guard throws and the runner will not say which one, or what it threw',
    guard: `${GUARDS}/run-guards.mjs`,
    file: 'scripts/guards/no-control-characters.mjs',
    find: 'const ROOT = process.cwd()',
    replace:
      "const ROOT = process.cwd()\nthrow new Error('planted by the F2.3 drill, restored in the finally')",
    expect: "it threw: Error: planted by the F2.3 drill, restored in the finally",
  },
  /*
   * CLOSE-OUT F2.1, FIVE DRILLS. "Prove it by adding an undeclared dependency
   * and watching the gate go red before a push."
   *
   * One per capability the build host lacks, because the five lost deployments
   * were four of one kind and one of another, and the fourth safeguard could
   * only see the first kind. Then two more for the registry rotting, which is
   * how a declaration stops being true without anybody editing it: a claim the
   * code no longer backs, and a claim about a script that no longer exists.
   *
   * The subject is a real registered guard rather than a scratch file, because
   * the scan walks the prebuild entry points and a scratch file is not one.
   */
  {
    name: 'a build-time script starts calling git and does not declare it',
    guard: `${GUARDS}/build-host-needs-declared.mjs`,
    file: 'scripts/guards/no-control-characters.mjs',
    find: 'const ROOT = process.cwd()',
    // The planted call carries an `env` option so it satisfies
    // no-inherited-git-env as well: this drill's own source would otherwise
    // read as an unguarded call site, and exempting a file is worse than
    // writing the safe version.
    replace: "const ROOT = process.cwd()\nconst _drill = () => execFileSync('git', ['status'], { env: {} })",
    expect: 'uses git and does not declare it',
  },
  {
    name: 'a build-time script starts reading a stripped path and does not declare it',
    guard: `${GUARDS}/build-host-needs-declared.mjs`,
    file: 'scripts/guards/no-control-characters.mjs',
    find: 'const ROOT = process.cwd()',
    replace: "const ROOT = process.cwd()\nconst _drill = 'docs/verification/LAUNCH-READINESS.md'",
    expect: 'uses docs and does not declare it',
  },
  {
    name: 'a build-time script starts reading a token and does not declare it',
    guard: `${GUARDS}/build-host-needs-declared.mjs`,
    file: 'scripts/guards/no-control-characters.mjs',
    find: 'const ROOT = process.cwd()',
    replace: 'const ROOT = process.cwd()\nconst _drill = process.env.VERCEL_TOKEN',
    expect: 'uses token and does not declare it',
  },
  {
    name: 'the needs registry declares a dependence the code no longer has',
    guard: `${GUARDS}/build-host-needs-declared.mjs`,
    file: 'scripts/guards/lib/build-host-needs.mjs',
    find: "  'scripts/check-pricing-lock.mjs': {\n",
    replace: "  'scripts/check-pricing-lock.mjs': {\n    git: 'planted by the F2.1 rot drill; nothing in that script calls git.',\n",
    expect: 'declares git and its code no longer uses it',
  },
  {
    name: 'the needs registry outlives the script it describes',
    guard: `${GUARDS}/build-host-needs-declared.mjs`,
    file: 'scripts/guards/lib/build-host-needs.mjs',
    find: 'export const DECLARED = {\n',
    replace: "export const DECLARED = {\n  'scripts/guards/renamed-away.mjs': { git: 'planted by the F2.1 rot drill; this file does not exist.' },\n",
    expect: 'which is not a prebuild entry point on disk',
  },
  /*
   * CLOSE-OUT F2.4. Seven build-time scripts read git, and on the build log of
   * ffded236 five of them degraded in five different sets of words for one fact.
   * Two claimed a missing REMOTE on a host with no repository at all. They now
   * share one sentence, and this drill is what stops the eighth writing a sixth:
   * a git-declaring script that does not reach the shared module fails the gate.
   */
  {
    name: 'a git-reading script stops sharing the one sentence and invents its own',
    guard: `${GUARDS}/build-host-needs-declared.mjs`,
    file: 'scripts/guards/no-ai-authorship.mjs',
    find: "import { noGitLine } from './lib/git-availability.mjs'",
    replace: "const noGitLine = (tag) => `${tag} something went wrong with git, probably`",
    expect: 'declares a git need and never reaches',
  },
  /*
   * CLOSE-OUT F1.2, F1.3 AND F1.4. Four drills for one property: a machine that
   * builds for other people judges what Vercel judges, and cannot excuse itself.
   */
  {
    name: 'a guard bypass is left switched on in CI',
    guard: `${GUARDS}/no-build-guard-bypass.mjs`,
    env: { ALLOW_PRICING_DRIFT: '1', GITHUB_ACTIONS: 'true' },
    expect: 'ALLOW_PRICING_DRIFT is set on a ci build',
  },
  {
    name: 'the bypass list rots until it no longer covers the pricing bypass',
    guard: `${GUARDS}/no-build-guard-bypass.mjs`,
    file: 'src/lib/env/manifest.mjs',
    find: `    describe: 'Bypass of the pricing lock, which holds the live fee to docs/PRICING.md',
    requiredOn: [],
    forbiddenOn: ['production', 'preview', 'development'],`,
    replace: `    describe: 'Bypass of the pricing lock, which holds the live fee to docs/PRICING.md',
    requiredOn: [],
    forbiddenOn: ['production', 'preview'],`,
    expect: 'is not in the derived list, so this guard is guarding nothing',
  },
  {
    name: 'CI calls itself a local build and waves through a malformed public key',
    guard: 'scripts/check-public-env.mjs',
    env: { GITHUB_ACTIONS: 'true', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ci-placeholder-anon-key' },
    expect: '[public-env] BUILD BLOCKED on ci',
  },
  {
    name: 'CI cannot read pricing_rules and calls the locked values verified anyway',
    guard: 'scripts/check-pricing-lock.mjs',
    /*
     * BOTH URL VARIABLES, and the first version of this drill got it wrong,
     * which is the harness doing its job. readLiveRules prefers
     * NEXT_PUBLIC_SUPABASE_URL_PREVIEW over the base name, .env.local holds one,
     * and a drill that overrode only the base name changed nothing: the guard
     * read the real TEST project, passed, and the drill reported DID NOT FAIL.
     */
    env: {
      GITHUB_ACTIONS: 'true',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_URL_PREVIEW: 'https://example.supabase.co',
    },
    expect: '[pricing-lock] BUILD BLOCKED',
  },
  /*
   * CLOSE-OUT F1.6. The dangerous failure here is the FALSE NEGATIVE: the clause
   * cannot see, says so in whatever words it feels like, and three machines
   * produce three sentences nobody can line up. So this drill asserts the guard
   * STAYS GREEN (it cannot see, which is not a fault) while reporting the named
   * code, which is what makes the three machines comparable.
   *
   * It calls Vercel for real, with a token Vercel will refuse, because the whole
   * point is what the guard does with a refusal. Offline, the code becomes
   * network-error and this drill fails saying so, which is correct: the harness
   * should not report a network-shaped pass as proof of an http-shaped one.
   */
  {
    name: 'a refused Vercel read is reported as a bare status again',
    guard: `${GUARDS}/machine-callers-reachable.mjs`,
    env: {
      GITHUB_ACTIONS: 'true',
      VERCEL_TOKEN: 'not_a_real_token',
      VERCEL_PROJECT_ID: 'prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ',
      VERCEL_ORG_ID: 'team_yPo8T18zSl5VczJfWIIrNqly',
    },
    expectPass: 'NOT JUDGED [http-',
  },
  /*
   * CLOSE-OUT F2.2, BOTH DIRECTIONS. "Prove both: it runs and judges in CI, and
   * it does not execute on Vercel."
   *
   * The guard predicts what the build host will see. Running it ON the build
   * host is circular, and it used to stand aside there only because Vercel
   * happens to have no usable git - an accident, not a decision. Removing the
   * git dependence would have silently reversed that accident, so the skip is
   * now keyed on the build scope and both halves are drilled.
   */
  {
    name: 'the upload simulation runs on the build host, simulating the tree it is inside',
    guard: `${GUARDS}/excluded-reads-survive-the-upload.mjs`,
    env: { VERCEL: '1', VERCEL_ENV: 'preview' },
    expectPass: 'SKIP - this IS the build host',
  },
  {
    name: 'the upload simulation stands aside in CI, where it is a real gate',
    guard: `${GUARDS}/excluded-reads-survive-the-upload.mjs`,
    env: { GITHUB_ACTIONS: 'true' },
    expectPass: 'scope=ci (decided by GITHUB_ACTIONS)',
  },

  /*
   * CLOSE-OUT D2, THE RECOVERY ENGINE. Six drills across two guards, and each
   * one breaks the thing the guard exists for rather than something adjacent.
   *
   * The engine is the part of this platform with value outside ticketing, and
   * every line it holds is invisible: an import that couples it to this domain
   * breaks nothing on the day it is typed, and a send with no receipt looks
   * exactly like a send with one until somebody complains to their provider.
   */
  {
    name: 'the recovery engine imports this platform domain code',
    guard: `${GUARDS}/fillrate-reads-only-the-ledger.mjs`,
    file: 'src/lib/fillrate/read.ts',
    find: "import { createAdminClient } from '@/lib/supabase/admin'",
    replace:
      "import { createAdminClient } from '@/lib/supabase/admin'\nimport { LEDGER_EVENT_COLUMNS } from '@/lib/ledger/adapter'\nvoid LEDGER_EVENT_COLUMNS",
    expect: 'is not on the engine',
  },
  {
    name: 'the recovery engine queries a table belonging to the source system',
    guard: `${GUARDS}/fillrate-reads-only-the-ledger.mjs`,
    file: 'src/lib/fillrate/read.ts',
    find: "    .from('recovery_suppressions')\n    .select('contact_email')",
    replace: "    .from('profiles')\n    .select('contact_email')",
    expect: 'which is not the ledger',
  },
  {
    name: 'a user facing string in the engine names one industry',
    guard: `${GUARDS}/fillrate-reads-only-the-ledger.mjs`,
    file: 'src/lib/fillrate/message.ts',
    find: '  const subject = `A ${noun} just opened up for ${facts.slotName}`',
    replace: '  const subject = `A ticket just opened up for ${facts.slotName}`',
    expect: 'The engine speaks no industry',
  },
  {
    name: 'a recovery message is recorded without naming what authorised it',
    guard: `${GUARDS}/recovery-only-writes-to-people-who-asked.mjs`,
    file: 'src/lib/fillrate/read.ts',
    find: '    demand_entry_id: send.demandEntryId,',
    replace: '    unit_amount_cents: send.unitAmountCents,',
    expect: 'without naming demand_entry_id',
  },
  {
    name: 'the database stops requiring a receipt on every recovery message',
    guard: `${GUARDS}/recovery-only-writes-to-people-who-asked.mjs`,
    file: 'supabase/migrations/20260910000003_recovery_engine.sql',
    find: '  demand_entry_id bigint not null references public.ledger_entries(id),',
    replace: '  demand_entry_id bigint references public.ledger_entries(id),',
    expect: 'no longer declares recovery_sends.demand_entry_id',
  },
  {
    name: 'the sequence stops refusing somebody whose money already came back',
    guard: `${GUARDS}/recovery-only-writes-to-people-who-asked.mjs`,
    file: 'src/lib/fillrate/due.ts',
    find: "      refuse(row, 'their money came back, so chasing them would be the worst message we could send')",
    replace: "      refuse(row, 'not written to')",
    expect: 'no longer refuses somebody whose money came back',
  },
  {
    /*
     * CLOSE-OUT D2, THE DEFECT NOTHING ELSE COULD SEE. The join dialog painted
     * correctly, centred, over the page, and could not be clicked: it was
     * trapped in the stacking context of an ancestor carrying a transform. The
     * drill removes the portal from one real dialog, which is exactly how it
     * was written before 11 September 2026.
     */
    name: 'a full-page dialog goes back to rendering where it sits',
    guard: `${GUARDS}/overlays-are-portalled.mjs`,
    file: 'src/components/waitlist/join-waitlist-modal.tsx',
    find: "import { createPortal } from 'react-dom'",
    replace: "const createPortal = (node: unknown) => node",
    expect: 'never reaches react-dom',
  },
  {
    /*
     * AND THE REVIEWED LIST CANNOT ROT. An exception that outlives the file it
     * describes is a statement nobody can check.
     */
    name: 'the reviewed exception list outlives the file it describes',
    guard: `${GUARDS}/overlays-are-portalled.mjs`,
    file: 'scripts/guards/overlays-are-portalled.mjs',
    find: "    'src/components/admin/admin-mobile-nav.tsx',",
    replace: "    'src/components/admin/renamed-away.tsx',",
    expect: 'is not on disk any more',
  },
  {
    name: 'a recovery message is allowed to go with no working way to stop it',
    guard: `${GUARDS}/recovery-only-writes-to-people-who-asked.mjs`,
    file: 'src/lib/fillrate/engine.ts',
    find: "    count('no unsubscribe link could be minted, so nothing was sent')",
    replace: "    count('no link, carrying on anyway')",
    expect: 'unsubscribe link in 1 of its 2 send path(s)',
  },
  /*
   * types-cover-migrations (11 September 2026), three drills, one per kind of
   * object that was actually missing when the first push after the founder's
   * migrations was refused with 285 unexplained differences: a table, an enum
   * and a column, each added to the newest migration and never regenerated
   * into src/types/database.ts. The guard must name the object AND the
   * migration, because "285 differences" was the shape of the finding that
   * took a session to read.
   */
  {
    name: 'a migration creates a table that was never regenerated into the committed types',
    guard: `${GUARDS}/types-cover-migrations.mjs`,
    file: 'supabase/migrations/20260911000001_connect_requirement_watch.sql',
    find: "-- THE MONITOR'S OWN MEMORY. Close-out S1, the one clause that needs a clock.\n",
    replace:
      "-- THE MONITOR'S OWN MEMORY. Close-out S1, the one clause that needs a clock.\n" +
      'create table public.a_table_the_drill_adds (id uuid primary key);\n',
    expect:
      'table public.a_table_the_drill_adds is created by 20260911000001_connect_requirement_watch.sql and public.Tables.a_table_the_drill_adds is not in src/types/database.ts',
  },
  {
    name: 'a migration creates an enum that was never regenerated into the committed types',
    guard: `${GUARDS}/types-cover-migrations.mjs`,
    file: 'supabase/migrations/20260911000001_connect_requirement_watch.sql',
    find: "-- THE MONITOR'S OWN MEMORY. Close-out S1, the one clause that needs a clock.\n",
    replace:
      "-- THE MONITOR'S OWN MEMORY. Close-out S1, the one clause that needs a clock.\n" +
      "create type public.an_enum_the_drill_adds as enum ('a');\n",
    expect: 'enum public.an_enum_the_drill_adds is created by 20260911000001_connect_requirement_watch.sql',
  },
  {
    name: 'a migration adds a column that was never regenerated into the committed types',
    guard: `${GUARDS}/types-cover-migrations.mjs`,
    file: 'supabase/migrations/20260911000001_connect_requirement_watch.sql',
    find: "-- THE MONITOR'S OWN MEMORY. Close-out S1, the one clause that needs a clock.\n",
    replace:
      "-- THE MONITOR'S OWN MEMORY. Close-out S1, the one clause that needs a clock.\n" +
      'alter table public.connect_requirement_watch add column a_column_the_drill_adds text;\n',
    expect:
      'column public.connect_requirement_watch.a_column_the_drill_adds is created by 20260911000001_connect_requirement_watch.sql and public.Tables.connect_requirement_watch.Row.a_column_the_drill_adds is not in src/types/database.ts',
  },
  /*
   * read-failure-is-not-not-found, three drills, one per fault. 12 September
   * 2026, the fourth occurrence of the class: the events layout's existence read
   * discarded its error and a real event answered 404 to the gate's own drive.
   * Each drill puts one of the three shapes back exactly as it stood on a real
   * route and the guard has to name it.
   */
  {
    name: 'the events layout discards the error of the read that decides existence (the incident)',
    guard: `${GUARDS}/read-failure-is-not-not-found.mjs`,
    file: 'src/app/events/[slug]/layout.tsx',
    find:
      "  const row = await readOrThrow('event-route', () =>\n" +
      "    supabase.from('events').select('id').eq('slug', slug).maybeSingle(),\n" +
      '  )\n' +
      '\n' +
      '  if (row) return children',
    replace:
      '  const { data } = await supabase\n' +
      "    .from('events')\n" +
      "    .select('id')\n" +
      "    .eq('slug', slug)\n" +
      '    .maybeSingle()\n' +
      '\n' +
      '  if (data) return children',
    expect: 'discards the error of the read that decides if (data) return children',
  },
  {
    name: 'a dashboard page folds the read error into the notFound() condition',
    guard: `${GUARDS}/read-failure-is-not-not-found.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/pricing/page.tsx',
    find:
      "  const event = await readOrThrow('dashboard event pricing', () =>\n" +
      "    supabase.from('events').select('id, title, organisation_id').eq('id', eventId).single(),\n" +
      '  )\n' +
      '\n' +
      '  if (!event) notFound()',
    replace:
      '  const { data: event, error: eventError } = await supabase\n' +
      "    .from('events')\n" +
      "    .select('id, title, organisation_id')\n" +
      "    .eq('id', eventId)\n" +
      '    .single()\n' +
      '\n' +
      '  if (eventError || !event) notFound()',
    expect: 'folds the read error `eventError` into notFound()',
  },
  {
    name: 'a dashboard page logs the read error and 404s anyway',
    guard: `${GUARDS}/read-failure-is-not-not-found.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx',
    find:
      "  const event = await readOrThrow('dashboard event orders', () =>\n" +
      '    supabase\n' +
      "      .from('events')\n" +
      "      .select('id, title, organisation_id, waitlist_enabled, ticket_tiers(id, name, total_capacity, sold_count)')\n" +
      "      .eq('id', eventId)\n" +
      '      .single(),\n' +
      '  )\n' +
      '\n' +
      '  if (!event) notFound()',
    replace:
      '  const { data: event, error } = await supabase\n' +
      "    .from('events')\n" +
      "    .select('id, title, organisation_id, waitlist_enabled, ticket_tiers(id, name, total_capacity, sold_count)')\n" +
      "    .eq('id', eventId)\n" +
      '    .single()\n' +
      "  if (error) console.error('[orders] event read failed:', error)\n" +
      '\n' +
      '  if (!event) notFound()',
    expect: 'binds the error as `error` and never throws it',
  },
  /*
   * platform-day-boundary-is-zone-correct (close-out UX3.3, 13 September 2026),
   * two drills. The first restores the implementation that actually shipped, so
   * the drill is the regression rather than a caricature of it. The second is
   * aimed at the guard itself: a sweep window with no daylight-saving transition
   * inside it would pass against the broken code, so narrowing the window has to
   * fail loudly instead of quietly retiring the guard.
   */
  {
    name: 'the day boundary goes back to subtracting the wall clock from the instant',
    guard: `${GUARDS}/platform-day-boundary-is-zone-correct.mjs`,
    file: 'src/lib/notifications/platform-policy.ts',
    find:
      '  const date = new Intl.DateTimeFormat(\'en-CA\', {\n' +
      '    timeZone: PLATFORM_TIME_ZONE,\n' +
      "    year: 'numeric',\n" +
      "    month: '2-digit',\n" +
      "    day: '2-digit',\n" +
      '  }).format(now)\n' +
      '  return new Date(fromZonedInputValue(`${date}T00:00`, PLATFORM_TIME_ZONE))',
    replace:
      '  const parts = new Intl.DateTimeFormat(\'en-CA\', {\n' +
      '    timeZone: PLATFORM_TIME_ZONE,\n' +
      "    year: 'numeric',\n" +
      "    month: '2-digit',\n" +
      "    day: '2-digit',\n" +
      "    hour: '2-digit',\n" +
      "    minute: '2-digit',\n" +
      "    second: '2-digit',\n" +
      '    hour12: false,\n' +
      '  }).formatToParts(now)\n' +
      "  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')\n" +
      "  const secondsIntoDay = get('hour') * 3600 + get('minute') * 60 + get('second')\n" +
      '  return new Date(now.getTime() - secondsIntoDay * 1000 - now.getMilliseconds())',
    expect: 'a different date',
  },
  {
    /*
     * Narrowed to a single year, which still crosses two transitions. A window
     * with ZERO in it is already refused a step earlier by the work-report
     * contract ("DID NOTHING"), so aiming there would have proven that rule
     * rather than this one. Two out of eight is the case only MIN_TRANSITIONS
     * can catch: real work performed, on a window too small to see the fault.
     */
    name: 'the sweep is narrowed to a window that crosses too few daylight-saving transitions',
    guard: `${GUARDS}/platform-day-boundary-is-zone-correct.mjs`,
    file: 'scripts/guards/platform-day-boundary-is-zone-correct.mjs',
    find: 'export const SWEEP_TO_UTC = Date.UTC(2029, 0, 1)',
    replace: 'export const SWEEP_TO_UTC = Date.UTC(2026, 0, 1)',
    expect: 'fewer than the 8 it must cross',
  },
  /*
   * notification-paths-retry-before-they-give-up (close-out UX3.2, 13 September
   * 2026), two drills. The first takes the retry back out of the digest, which
   * is precisely the code that shipped, so the drill is the regression itself.
   * The second aims at the guard's own vacuity clause: rename one delivery path
   * past the scan and the guard must say it can no longer see it rather than
   * quietly judging one path and passing.
   */
  {
    name: 'the digest goes back to escalating on its first refusal',
    guard: `${GUARDS}/notification-paths-retry-before-they-give-up.mjs`,
    file: 'src/lib/notifications/platform-send.ts',
    find:
      '    const attempt = Math.max(...rows.map((r) => r.attempts)) + 1\n' +
      '    if (attempt < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS) {',
    replace: '    const attempt = Math.max(...rows.map((r) => r.attempts)) + 1\n    if (false) {',
    expect: 'sendHeldDigest() writes a terminal delivery state and never consults',
  },
  {
    name: 'a delivery path is nested past the scan, so the guard can see only one',
    guard: `${GUARDS}/notification-paths-retry-before-they-give-up.mjs`,
    file: 'scripts/guards/notification-paths-retry-before-they-give-up.mjs',
    find: "const DECLARATION = /^(?:export\\s+)?(?:async\\s+)?function\\s+([A-Za-z0-9_]+)/",
    replace: "const DECLARATION = /^(?:export\\s+)?(?:async\\s+)?function\\s+(sendHeldDigest)/",
    expect: 'fewer than the 2 this guard must judge',
  },
  /*
   * digest-attempts-are-the-digests-own (close-out UX3.2 and UX3.3, 13 September
   * 2026), two drills, one per clause, because either clause alone is
   * defeatable. The first restores the hold EXACTLY as it shipped, a bare state
   * literal, which is how a row carried its individual-email attempts into the
   * digest. The second leaves the caller alone and breaks the decision itself,
   * returning the spent count from the pure function: a guard that only read the
   * call site would pass a function that had stopped resetting anything.
   */
  {
    name: 'the hold goes back to writing the state literal, so the digest inherits the attempts',
    guard: `${GUARDS}/digest-attempts-are-the-digests-own.mjs`,
    file: 'src/lib/notifications/platform-send.ts',
    find: '      await recordOutcome(admin, row.id, holdForDigestPatch(row))',
    replace: "      await recordOutcome(admin, row.id, { delivery_state: 'held_for_digest' })",
    expect: 'writes the held state as a literal',
  },
  {
    name: 'the hold keeps the attempts it was written to reset',
    guard: `${GUARDS}/digest-attempts-are-the-digests-own.mjs`,
    file: 'src/lib/notifications/platform-policy.ts',
    find: "    delivery_state: 'held_for_digest',\n    attempts: 0,",
    replace: "    delivery_state: 'held_for_digest',\n    attempts: spent as 0,",
    expect: 'enters the digest queue carrying',
  },
  /*
   * quiet-hours-are-honoured (13 September 2026), two drills, one per clause.
   * The first restores the shipped state exactly: the dispatcher reads the
   * window and never asks about it. The second leaves the caller alone and
   * breaks the decision, reading the PLATFORM clock instead of the user's, which
   * is the mistake a reader of this code is most likely to make next and which
   * only a sweep across zones and transitions can see.
   */
  {
    name: 'the dispatcher goes back to reading the quiet-hours window and never asking',
    guard: `${GUARDS}/quiet-hours-are-honoured.mjs`,
    file: 'src/lib/notifications/dispatch.ts',
    find: "  if (isQuietNow(prefs, now)) return { status: 'skipped', reason: 'quiet_hours' }",
    replace: "  void isQuietNow",
    expect: 'never consults isQuietNow()',
  },
  {
    name: 'the quiet-hours decision reads the platform clock instead of the user one',
    guard: `${GUARDS}/quiet-hours-are-honoured.mjs`,
    file: 'src/lib/notifications/policy.ts',
    find: '  return isWithinQuietHours(prefs, localHourFor(prefs.timezone, now))',
    replace: '  return isWithinQuietHours(prefs, now.getUTCHours())',
    expect: 'window answered',
  },
  /*
   * the-daily-state-cannot-go-silent (close-out UX4.1 and UX4.2, 13 September
   * 2026), two drills. The first restores the give-up the composer shipped with:
   * a failed read ends the whole report instead of becoming a named blind spot.
   * The second silences the blind stall check, which is the more dangerous half,
   * because a check that goes quiet when it cannot see looks exactly like one
   * that looked and found everything healthy.
   */
  {
    name: 'a failed read ends the daily report again instead of being named on it',
    guard: `${GUARDS}/the-daily-state-cannot-go-silent.mjs`,
    file: 'scripts/ops/state-report.mjs',
    find: '      const why = err instanceof Error ? err.message : String(err)\n      unreadable.push({ what, why })\n      return fallback(why)',
    replace: '      throw err',
    expect: 'no message was produced at all',
  },
  {
    name: 'the stall check goes quiet again when it cannot see the repository',
    guard: `${GUARDS}/the-daily-state-cannot-go-silent.mjs`,
    file: 'scripts/lib/state-report.mjs',
    find: '  if (unreadable) {\n    return {\n      stalled: false,\n      blind: true,',
    replace: '  if (false) {\n    return {\n      stalled: false,\n      blind: true,',
    expect: 'not BLIND and not alerting',
  },
  /*
   * The third, and the one the driven render at 390 found after the guard was
   * already green: a section that answers a FAILED read with an ABSENCE. "No
   * push could be found" sends the reader hunting a stalled build when the truth
   * is that nobody could see the repository.
   */
  {
    name: 'the last-push section answers a failed read with "no push could be found" again',
    guard: `${GUARDS}/the-daily-state-cannot-go-silent.mjs`,
    file: 'scripts/lib/state-report.mjs',
    find:
      '      lastPushUnread\n' +
      '        ? `Could not be read: ${lastPushUnread}. Whether anything has been pushed is therefore unknown, and this is NOT a report that nothing has.`\n' +
      '        : state.lastPush?.when',
    replace: '      state.lastPush?.when',
    expect: 'No push to a working branch could be found',
  },
  /*
   * drive-usage-names-what-it-needs, two drills, one per requirement it can
   * judge. Each removes the flag from a header that legitimately needs it and
   * expects the guard to name that drive, because a guard that says only FAIL
   * sends the reader through 28 files.
   *
   * The requirement is real in both cases and was established by running the
   * command rather than by reading it: without the alias loader node cannot
   * resolve the @/ imports the src module reaches, and without the server-only
   * shim it throws ERR_MODULE_NOT_FOUND on a package that exists only inside
   * Next.
   */
  {
    name: 'a drive that needs the alias loader stops naming it',
    guard: `${GUARDS}/drive-usage-names-what-it-needs.mjs`,
    file: 'scripts/verify/ft1-forecast-drive.mjs',
    find: ' *        --import ./scripts/lib/src-alias-loader.mjs',
    replace: ' *        (the loader flag removed by the drill)',
    expect: 'ft1-forecast-drive.mjs: the header never names src-alias-loader',
  },
  {
    name: 'a drive that needs the server-only shim stops naming it',
    guard: `${GUARDS}/drive-usage-names-what-it-needs.mjs`,
    file: 'scripts/verify/ga3-attribution-drive.mjs',
    find: ' *     node --import ./scripts/lib/server-only-shim.mjs',
    replace: ' *     node (the shim flag removed by the drill)',
    expect: 'ga3-attribution-drive.mjs: the header never names server-only-shim',
  },
  /*
   * The third requirement, added 14 September 2026. ft1-forecast-drive run
   * exactly as its header then read reported the fee as $68.50 three times over
   * a configuration change, which says the displayed fee does not follow
   * pricing_rules. It does. The drive's own invalidation was a no-op because
   * its process had no cache store, and the store is not a guess: the drive
   * IMPORTS an invalidate function out of src/.
   */
  {
    name: 'a drive that clears a cache stops naming the store it lives in',
    guard: `${GUARDS}/drive-usage-names-what-it-needs.mjs`,
    file: 'scripts/verify/ft1-forecast-drive.mjs',
    find: ' *   UPSTASH_REDIS_REST_URL=http://127.0.0.1:8179 UPSTASH_REDIS_REST_TOKEN=local',
    replace: ' *   (the store removed by the drill)',
    expect: 'ft1-forecast-drive.mjs: the header never names UPSTASH_REDIS_REST_URL',
  },
  /*
   * lane-tagged-privilege-writes. The drill takes the lane filter out of the
   * FO1 offer drive's own selection, which is EXACTLY the state the file was in
   * on the morning of 14 September 2026 when it was found granting founding
   * windows on lane A's refund fixtures and lane C's events.
   *
   * The anchor is `isLaneB`, which is the file's ONLY lane PREDICATE. Its other
   * ten lane tags are names it gives rows it creates, and the guard does not
   * accept those, for the reason written in the guard: this very file named
   * every row lane-b on the morning it was granting windows to lane A's.
   */
  {
    name: 'a drive that grants a founding window stops saying whose row it is',
    guard: `${GUARDS}/lane-tagged-privilege-writes.mjs`,
    file: 'scripts/verify/fo1-founding-offer-drive.mjs',
    find: "return /lane-b/i.test(`${org?.name ?? ''} ${org?.slug ?? ''}`)",
    replace: 'return true',
    expect: 'fo1-founding-offer-drive.mjs: calls admin_set_founding_waiver and never restricts its',
  },
  /*
   * fixtures-are-not-published, four drills, because the guard makes four
   * distinct claims and three of them had never been seen failing.
   *
   * The first two are the incident itself: on 14 September 2026 PL1's fixture
   * carried exactly these two literals and its deleted rows refused lane A's
   * push with two RULE 2 faults on URLs lane A had never heard of.
   *
   * The third is this guard's own blind spot, deliberately made loud. A row
   * built as a variable and inserted by name is a write the static reader cannot
   * judge, and the first version of the guard passed one silently:
   * community-threshold-drive builds its rows that way and was reported clean.
   *
   * The fourth is the premise. The rule is only true while the sitemap still
   * selects on those literals, and a guard whose premise has moved keeps passing
   * while the thing it protects stops being protected.
   */
  {
    name: 'a drive fixture event goes back to being publicly visible',
    guard: `${GUARDS}/fixtures-are-not-published.mjs`,
    file: 'scripts/verify/pl1-loops-drive.mjs',
    find: "      visibility: 'unlisted',",
    replace: "      visibility: 'public',",
    expect: "writes visibility: 'public', which publishes /events/<slug>",
  },
  {
    name: 'a drive fixture organisation goes back to being active',
    guard: `${GUARDS}/fixtures-are-not-published.mjs`,
    file: 'scripts/verify/pl1-loops-drive.mjs',
    find: "owner_id: fixture.organiserId, status: 'pending' })",
    replace: "owner_id: fixture.organiserId, status: 'active' })",
    expect: "inserts organisations with status: 'active'",
  },
  {
    name: 'a fixture organisation is built as a variable, where no static reader can judge it',
    guard: `${GUARDS}/fixtures-are-not-published.mjs`,
    file: 'scripts/verify/pl1-loops-drive.mjs',
    find: ".insert({ name: `Lane B PL1 ${STAMP}`, slug: `${LANE}-org-${STAMP}`, owner_id: fixture.organiserId, status: 'pending' })",
    replace: '.insert(organisationRow)',
    expect: 'inserts organisations from a variable, so this guard cannot see',
  },
  {
    /*
     * RE-AIMED 18 September 2026, and the drift is the point.
     *
     * This drill pointed at `src/app/sitemap.ts`, where the organiser
     * predicate used to live. On 16 September the three catalogue reads moved
     * into `src/lib/seo/sitemap-catalogue.ts`, the guard's PREMISES list was
     * re-derived to follow them, and this drill was not: it went on naming a
     * file that no longer carries the anchor.
     *
     * The harness caught it as STALE the first time the whole array was run
     * after the eleven undrilled guards were drilled, which is the behaviour
     * its own header promises and the third time this file has recorded it.
     * A drill that cannot aim is reported, never skipped.
     *
     * BOTH LANES FOUND THIS INDEPENDENTLY ON THE SAME DAY and fixed it to the
     * same three lines, which is why only the notes conflicted when the branches
     * met: lane A's commit 36fb1817 records it as defect 2 of the four it found
     * on the way to the recipient matrix. Two lanes arriving at one answer is
     * the harness reporting a stale drill loudly enough that neither could miss
     * it, which is the argument for reporting rather than skipping.
     */
    name: "the organiser catalogue stops selecting on 'active', and the guard's rule stops being true",
    guard: `${GUARDS}/fixtures-are-not-published.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: ".eq('status', 'active')",
    replace: ".eq('status', 'approved')",
    expect: "THIS GUARD'S PREMISE HAS MOVED",
  },
  /*
   * proof-reads-never-discard-their-error, two drills, one per way a read on
   * that surface can stop telling a failure from an absence.
   *
   * Both are the state src/lib/proof/read.ts was actually in on the morning of
   * 15 September 2026, when a ConnectTimeoutError to Supabase made the campaign
   * proof page answer 404 for a campaign that exists. The orders read was the
   * same shape and would have printed zero revenue instead.
   */
  {
    name: 'a ledger read on the proof page stops binding its error',
    guard: `${GUARDS}/proof-reads-never-discard-their-error.mjs`,
    file: 'src/lib/proof/read.ts',
    find: '  const { data: slot, error: slotError } = await admin',
    replace: '  const { data: slot } = await admin',
    expect: 'destructures { data } from an await and never binds',
  },
  {
    name: 'a figure read on the proof page stops going through mustRead',
    guard: `${GUARDS}/proof-reads-never-discard-their-error.mjs`,
    file: 'src/lib/proof/read.ts',
    // Re-anchored 19 September 2026: the sends read became a PAGED read
    // (mustReadEvery) when the 1,000-row ceiling was closed, and this drill
    // reported itself STALE rather than quietly verifying nothing. The channel
    // costs read is the one that still goes through mustRead directly.
    find: "  const channelRows = await mustRead('the channel costs', () =>",
    replace: '  const { data: channelRows } = await (async () =>',
    expect: 'never binds `error`',
  },
  /*
   * no-published-lane-b-fixture-on-test. The drill removes the FO1 exemption,
   * and the guard then names the four fixtures it was allowing: real rows, on
   * the real database, through the real fetch.
   *
   * WHAT THIS DRILL DELIBERATELY DOES NOT DO is create a published fixture to
   * be caught. That would mean putting a real organiser page into the sitemap of
   * a database three lanes share, for as long as the drill runs, which is
   * precisely the incident the guard exists to prevent. The catching half is
   * driven over synthetic rows in
   * tests/unit/guards/no-published-lane-b-fixture-on-test.test.ts, including the
   * exact leftover that started this: lane-b-ga5-event-202609131728 at all three
   * of its URLs.
   */
  {
    name: 'the persistent-fixture exemption is removed, and the published rows are named',
    guard: `${GUARDS}/no-published-lane-b-fixture-on-test.mjs`,
    file: 'scripts/guards/no-published-lane-b-fixture-on-test.mjs',
    find: "    prefix: 'lane-b-fo1-',",
    replace: "    prefix: 'lane-b-fo1-NOT-THIS-ONE-',",
    expect: 'are PUBLISHED on the database three lanes share',
  },
  /*
   * every-order-carries-its-attribution, three drills, one per way an order can
   * come to exist with no stored attribution decision.
   *
   * The first two are the write-time half and they are the realistic ones: a new
   * checkout path that forgets the capture entirely, and an existing file that
   * grows a second insert and keeps its one call. The second is the nastier
   * shape, because the file still looks correct at a glance and a grep for the
   * function name finds it.
   *
   * The third is the heal-time half. It removes the schedule rather than the
   * route, because a route that exists and is never invoked is the exact defect
   * cron-routes-scheduled was written for, and it is the one a reader is most
   * likely to reintroduce by editing vercel.json.
   */
  {
    name: 'an order-creating path stops calling the write-time attribution capture',
    guard: `${GUARDS}/every-order-carries-its-attribution.mjs`,
    file: 'src/app/actions/register-free.ts',
    find: '  await recordClickSignalForOrder(order_id)',
    replace: '  void order_id',
    expect: 'never calls recordClickSignalForOrder',
  },
  {
    name: 'a file grows a second order insert and keeps its single capture call',
    guard: `${GUARDS}/every-order-carries-its-attribution.mjs`,
    file: 'src/app/actions/register-free.ts',
    find: "  const { error: orderError } = await adminClient.from('orders').insert({",
    replace:
      "  if (false as boolean) await adminClient.from('orders').insert({ id: order_id })\n  const { error: orderError } = await adminClient.from('orders').insert({",
    expect: 'calls recordClickSignalForOrder only 1 time(s)',
  },
  {
    name: 'the attribution backstop is left in the tree with no schedule behind it',
    guard: `${GUARDS}/every-order-carries-its-attribution.mjs`,
    file: 'vercel.json',
    find: '      "path": "/api/cron/attribution-backstop",',
    replace: '      "path": "/api/cron/attribution-backstop-NOT-THIS-ONE",',
    expect: 'has no entry in vercel.json crons, so it never runs',
  },
  /*
   * The resolution grace is declared once, in the product, and both the healer
   * and the invariant guard read that one declaration. This drills the reader
   * rather than the number: move the constant and the guard must refuse to run
   * rather than quietly fall back to a window of its own.
   */
  {
    name: 'the resolution grace window stops being readable, and the guard refuses rather than assuming one',
    guard: `${GUARDS}/attribution-one-record-per-order-never-billable-when-reversed.mjs`,
    file: 'src/lib/attribution/backstop.ts',
    find: 'export const RESOLUTION_GRACE_MS = 5 * 60 * 1000',
    replace: 'export const RESOLUTION_GRACE_MS = graceFromSomewhereElse()',
    expect: 'no longer exports RESOLUTION_GRACE_MS as a literal',
  },
  /*
   * MONEY FIX A1.7, the six drills for funds-reach-the-organiser.
   *
   * The first is the defect itself, and it is the one that matters: the charge
   * precondition refusing a deliberately waived fee meant every paid ticket for
   * a founding organiser was refused at checkout, silently, for as long as the
   * waiver lasted. It is drilled by restoring the exact line that did it.
   */
  {
    name: 'the charge precondition refuses a deliberately waived zero fee again (the A1.7 defect)',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/application-fee.ts',
    find: '  if (inclusiveKeep < 0) {',
    replace: '  if (inclusiveKeep <= 0) {',
    expect: 'every paid ticket for a founding organiser is refused at checkout',
  },
  {
    name: 'the zero-fee refusal stops consulting the waiver',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/application-fee.ts',
    find: '  if (inclusiveKeep === 0 && !fees.fee_waived) {',
    replace: '  if (inclusiveKeep === 0 && !fees.currency) {',
    expect: 'no longer consults fees.fee_waived',
  },
  {
    name: 'the breakdown stops recording the waiver from the source that zeroed the rates',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/payment-calculator.ts',
    find: '      fee_waived: waiver.active,',
    replace: '      fee_waived: false,',
    expect: 'does not set fee_waived from waiver.active',
  },
  {
    name: 'the charge is created before anybody checks the organiser can be paid',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/create-platform-charge.ts',
    find: '  assertOrganiserCanReceiveFunds(org, input.fees)',
    replace: '  // assertOrganiserCanReceiveFunds(org, input.fees)',
    expect: 'does not call assertOrganiserCanReceiveFunds',
  },
  {
    name: 'the charge stops resolving a destination connected account',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/create-platform-charge.ts',
    find: '  const connectedAccountId = org.stripe_account_id!',
    replace: '  const connectedAccountId = null as unknown as string',
    expect: 'no longer resolved from the organisation row',
  },
  {
    name: 'an organiser whose payouts are disabled is no longer refused',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/application-fee.ts',
    find: '  if (!org.stripe_payouts_enabled) {\n    throw new ChargePreconditionError(\n      \'org_charges_disabled\',',
    replace: '  if (false) {\n    throw new ChargePreconditionError(\n      \'org_charges_disabled\',',
    expect: 'no longer tests `!org.stripe_payouts_enabled`',
  },
  /*
   * MONEY FIX B3, the five drills for every-message-has-a-declared-recipient.
   *
   * The first two are the defect itself from both directions: an organiser
   * message that stops being sent, and an owner message that stops naming the
   * organiser message that balances it. MKLStudios sold two tickets on
   * 10 September 2026 and the only human told was the platform owner, and the
   * reason nothing caught it is that the organiser's message did not exist to
   * be broken. A guard against a missing message has to be a declaration.
   */
  {
    name: 'the owner is told about a sale and the organiser message that balances it is gone',
    guard: `${GUARDS}/every-message-has-a-declared-recipient.mjs`,
    file: 'src/lib/notifications/recipient-matrix.ts',
    find: "    organiserToldBy: 'organiser_first_sale',",
    replace: '',
    expect: 'is neither a recipient nor named in organiserToldBy',
  },
  {
    name: 'the companion is named but nothing in the tree ever sends it',
    guard: `${GUARDS}/every-message-has-a-declared-recipient.mjs`,
    file: 'src/lib/notifications/recipient-matrix.ts',
    find: "    organiserToldBy: 'organiser_first_sale',",
    replace: "    organiserToldBy: 'organiser_hears_about_it_somehow',",
    expect: 'nothing in src/ ever sends that type',
  },
  {
    name: 'a send site stops declaring what its message is',
    guard: `${GUARDS}/every-message-has-a-declared-recipient.mjs`,
    file: 'src/lib/refunds/notify.ts',
    find: "    messageType: 'organiser_refund_requested',",
    replace: '',
    expect: 'calls sendEmail() without a messageType',
  },
  {
    name: 'the central transport stops enforcing the matrix',
    guard: `${GUARDS}/every-message-has-a-declared-recipient.mjs`,
    file: 'src/lib/email/send.ts',
    find: '  assertRecipientDeclared(input.messageType, input.recipientRole)',
    replace: '  // assertRecipientDeclared(input.messageType, input.recipientRole)',
    expect: 'no longer calls assertRecipientDeclared',
  },
  {
    name: "the buyer's ticket transport stops checking, which is how it escaped before",
    guard: `${GUARDS}/every-message-has-a-declared-recipient.mjs`,
    file: 'src/lib/email/order-confirmation.ts',
    find: "  assertRecipientDeclared('order_confirmation_and_ticket', 'buyer')",
    replace: "  // assertRecipientDeclared('order_confirmation_and_ticket', 'buyer')",
    expect: 'is a transport but never calls assertRecipientDeclared',
  },
  /*
   * CLAUSE 4, TWO DRILLS (close-out MONEY FIX B4, 19 September 2026, lane A).
   *
   * Clause 4 exists because clause 2 judges the DECLARATION and nothing judged
   * the SENDS, so a type naming BOTH the owner and the organiser passed while
   * every send site reached only the owner. It found `refund_did_not_complete`
   * live in exactly that state the day it was written.
   *
   * Each drill removes the organiser's only route to one of these messages, in
   * the two ways that have actually happened: a send site that stops naming the
   * type at all, and a money message that goes back to being owner-only.
   */
  {
    name: "the organiser's chargeback warning stops naming its message type",
    guard: `${GUARDS}/every-message-has-a-declared-recipient.mjs`,
    file: 'src/lib/notifications/organiser-money-notify.ts',
    find: "      messageType: 'organiser_dispute_opened',",
    replace: "      messageType: 'organiser_event_published',",
    expect: "'organiser_dispute_opened' declares the organiser as a recipient and nothing in src/ sends it to one",
  },
  {
    name: 'a failed refund goes back to telling the owner and not the organiser',
    guard: `${GUARDS}/every-message-has-a-declared-recipient.mjs`,
    file: 'src/lib/notifications/organiser-money-notify.ts',
    find: "      messageType: 'refund_did_not_complete',",
    replace: "      messageType: 'organiser_event_published',",
    expect: "'refund_did_not_complete' declares the organiser as a recipient and nothing in src/ sends it to one",
  },
  {
    name: 'a payout message starts consulting the sales off switch',
    guard: `${GUARDS}/every-message-has-a-declared-recipient.mjs`,
    file: 'src/lib/payouts/email.ts',
    find: "    .select('id, name, owner_id')",
    replace: "    .select('id, name, owner_id, sales_notification_mode')",
    expect: "reads 'sales_notification_mode'",
  },
  /*
   * initial-bundle-budget, the CONTRACT half (close-out C8B.3, 15 September
   * 2026). This harness runs a guard with no arguments, so what it can drill is
   * the prebuild half: the promise. The proof half (--built) weighs the build
   * and is drilled by hand against a real build, recorded in
   * C:\dev\EVIDENCE\C8C\guard-built-drills.txt, because a drill that needs a
   * five minute `next build` cannot live in a harness that runs on every push.
   *
   * The first drill is the one that matters most. The prebuild half CANNOT
   * WEIGH ANYTHING, so if the postbuild half is ever unhooked this guard goes
   * on passing for ever while nothing is measured, which is the exact shape
   * `pre-push-gate-wired` and `workflows-skip-drafts` exist to refuse.
   */
  {
    name: 'the half that actually weighs the build is unhooked from postbuild',
    guard: `${GUARDS}/initial-bundle-budget.mjs`,
    file: 'package.json',
    find: ' && node scripts/guards/initial-bundle-budget.mjs --built',
    replace: '',
    expect: 'does not run this guard with --built',
  },
  {
    name: 'the budget file quietly disagrees with the scope about what 200KB is',
    guard: `${GUARDS}/initial-bundle-budget.mjs`,
    file: 'perf-budget.json',
    find: '"_budgetBytes": 204800,',
    replace: '"_budgetBytes": 307200,',
    expect: 'is not the authority',
  },
  {
    name: 'a recorded mark stops being a byte count',
    guard: `${GUARDS}/initial-bundle-budget.mjs`,
    file: 'perf-budget.json',
    find: '"marks": {',
    replace: '"marks": {\n    "/drill-not-a-byte-count": null,',
    expect: 'which is not a byte count',
  },
  /*
   * API1, eleven drills, one per check in api-v1-organiser-scope.
   *
   * Every one of these is a way the public API could quietly start serving one
   * organiser another organiser's rows, or start telling the holder of a key
   * that a uuid they may not read is nonetheless real. The guard passed on its
   * first run, which is exactly the condition under which a blind guard goes
   * unnoticed, so each clause is planted individually rather than the file
   * being broken once and the whole thing called drilled.
   */
  {
    name: 'a public API query loses the organisation predicate',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/lib/api/v1/reads.ts',
    find: "      .from(API_V1_RESOURCES.events)\n      .select('*', { count: 'exact' })\n      .eq('organisation_id', scope.organisationId)",
    replace: "      .from(API_V1_RESOURCES.events)\n      .select('*', { count: 'exact' })",
    expect: 'does not carry',
  },
  {
    name: 'a public API query reads the underlying table instead of the scoped view',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/lib/api/v1/reads.ts',
    find: '      .from(API_V1_RESOURCES.events)',
    replace: "      .from('events')",
    expect: 'which is not one of the scoped API views',
  },
  {
    name: 'the read only API grows a write',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/lib/api/v1/reads.ts',
    find: "      .from(API_V1_RESOURCES.events)\n      .select('*', { count: 'exact' })",
    replace: "      .from(API_V1_RESOURCES.events)\n      .update({ title: 'x' })\n      .select('*', { count: 'exact' })",
    expect: 'this surface is read only',
  },
  {
    name: 'a route file starts querying for itself',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/app/api/v1/events/route.ts',
    find: "  return handleList(request, 'events')",
    replace: "  void createAdminClient().from('events')\n  return handleList(request, 'events')",
    expect: 'a route file may not query',
  },
  {
    name: 'an out of scope id starts answering 403 instead of 404',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/lib/api/v1/handlers.ts',
    find: '  const id = asUuid(rawId)',
    replace: '  const forbidden = 403\n  void forbidden\n  const id = asUuid(rawId)',
    expect: 'existence oracle',
  },
  {
    name: 'a handler builds a response of its own, without the organisation id on it',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/lib/api/v1/handlers.ts',
    find: '  const admitted = await admit(request)\n  if (!admitted.ok) return admitted.response\n  const { scope } = admitted\n\n  const params',
    replace: '  const admitted = await admit(request)\n  if (!admitted.ok) return NextResponse.json({ ok: false })\n  const { scope } = admitted\n\n  const params',
    expect: 'builds its own response',
  },
  {
    name: 'a second reader of the scoped views appears somewhere else in src',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/lib/api/v1/handlers.ts',
    find: "import { applyRateLimit } from '@/lib/rate-limit/middleware'",
    replace: "import { applyRateLimit } from '@/lib/rate-limit/middleware'\nconst elsewhere = 'api_v1_orders'\nvoid elsewhere",
    expect: 'only src',
  },
  {
    name: 'a scoped view stops carrying the column every API query filters on',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'supabase/migrations/20260918000020_organiser_api_keys.sql',
    find: 'select\n  t.id,\n  e.organisation_id,',
    replace: 'select\n  t.id,',
    expect: 'the predicate every API query carries would match nothing',
  },
  {
    name: 'the read only views become writable again',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'supabase/migrations/20260918000020_organiser_api_keys.sql',
    find: 'revoke insert, update, delete, truncate on public.api_v1_events from public, anon, authenticated, service_role;',
    replace: '-- revoke removed by the drill',
    expect: 'a read only surface must be read only in the database',
  },
  {
    name: 'the key lookup grows a cache, so a revoked key keeps working',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/lib/api/v1/keys.ts',
    find: "import { createAdminClient } from '@/lib/supabase/admin'",
    replace: "import { createAdminClient } from '@/lib/supabase/admin'\nconst seen = new Map()\nvoid seen",
    expect: 'must read the database on every request',
  },
  {
    name: 'the key screen types a cap instead of reading it',
    guard: `${GUARDS}/api-v1-organiser-scope.mjs`,
    file: 'src/app/(dashboard)/dashboard/api-keys/page.tsx',
    find: '              {DEFAULT_PAGE_SIZE} by default, {MAX_PAGE_SIZE} at most',
    replace: '              {50} by default, {MAX_PAGE_SIZE} at most',
    expect: 'is typed onto the key screen',
  },

  /* =======================================================================
   * ELEVEN GUARDS THAT WERE REGISTERED, BLOCKING, AND HAD NEVER BEEN SEEN TO
   * FAIL. Lane B, 18 September 2026.
   *
   * Each of the guards below was proven red once, by hand, in the session that
   * wrote it, with the output pasted into an evidence file. That is a claim
   * about a session nobody can replay. The harness this array feeds exists
   * because of the difference between the two, and its own header says so in
   * its first line: "A guard never seen to fail is not a guard."
   *
   * The gap was found by counting rather than by remembering: 148 entry points
   * are registered in run-guards.mjs and 69 of them had no drill, of which
   * eleven belong to lane B. The other 58 belong to the other lanes and are
   * reported to their owners rather than drilled here.
   *
   * WHAT WAS LOOKED FOR FIRST AND NOT FOUND, recorded so the absence is
   * evidence rather than an omission: lane A shipped a guard on 18 September
   * whose matcher was built in a template literal, where `\s` is not a
   * recognised escape and the lexer drops the backslash, so the pattern
   * compiled to `from s*` and reported PASS about a file that violated it.
   * Every one of lane B's eighteen guards was scanned for that shape. None
   * carries it: the only two template literals holding a class escape are
   * `String.raw` tagged, which preserves the backslash, and every candidate
   * across the other 402 guard and verify scripts is a comment or an embedded
   * regex literal. The drills below therefore prove the clauses, not the
   * syntax.
   * ======================================================================= */

  /*
   * matcher-consented-and-capped (GA2), two drills, one per structural half.
   * The guard's data half can only report on rows that exist, and a platform
   * that has produced no match run has none, so the half that must never be
   * able to pass vacuously is this one.
   */
  {
    name: 'the consent trigger on the matcher score table is dropped and never put back',
    guard: `${GUARDS}/matcher-consented-and-capped.mjs`,
    file: 'supabase/migrations/20260913000050_matcher.sql',
    find: 'create trigger trg_match_score_requires_live_consent\n  before insert on public.marketing_match_score\n  for each row execute function public.match_score_requires_live_consent();',
    replace: '-- the trigger a later migration dropped and nobody put back',
    expect: 'no migration puts the consent-and-cap trigger',
  },
  {
    name: 'the matcher invariant view is renamed, so the guard reads a name nothing defines',
    guard: `${GUARDS}/matcher-consented-and-capped.mjs`,
    file: 'supabase/migrations/20260913000050_matcher.sql',
    find: 'create or replace view public.marketing_match_invariant_breaches as',
    replace: 'create or replace view public.marketing_match_breaches as',
    expect: 'is not defined by any migration',
  },

  /*
   * campaigner-allowlist-and-cap-in-database (GA4), six drills, one per
   * structural clause. Each is the shape of a real regression: a constraint
   * dropped in a later migration, a trigger lost in a rewrite, a view renamed.
   * All six are drilled because the guard's own header says the data half can
   * be clean simply because nobody has sent anything yet.
   */
  {
    name: 'the send table loses the COMPOSITE key onto the allowlist',
    guard: `${GUARDS}/campaigner-allowlist-and-cap-in-database.mjs`,
    file: 'supabase/migrations/20260913000070_campaigner.sql',
    find: '  constraint marketing_send_recipient_is_allowlisted\n    foreign key (allowlist_id, campaign_id, channel_code)\n    references public.marketing_recipient_allowlist (id, campaign_id, channel_code),',
    replace: '  constraint marketing_send_recipient_is_allowlisted\n    foreign key (allowlist_id)\n    references public.marketing_recipient_allowlist (id),',
    expect: 'COMPOSITE foreign key onto the allowlist',
  },
  {
    name: 'an allowlist row is admitted with consent_state false',
    guard: `${GUARDS}/campaigner-allowlist-and-cap-in-database.mjs`,
    file: 'supabase/migrations/20260913000070_campaigner.sql',
    find: '  constraint marketing_recipient_allowlist_consent_must_be_true check (consent_state),',
    replace: '  -- the check a later migration dropped while tidying',
    expect: 'refuses an allowlist row whose consent state is false',
  },
  {
    name: 'a consent scoped to email is allowed to admit somebody to an SMS list',
    guard: `${GUARDS}/campaigner-allowlist-and-cap-in-database.mjs`,
    file: 'supabase/migrations/20260913000070_campaigner.sql',
    find: "    check (consent_channel_scope = 'both' or consent_channel_scope = channel_code),",
    replace: "    check (consent_channel_scope in ('email', 'sms', 'both')),",
    expect: 'refuses an allowlist row whose consent scope does not cover its own channel',
  },
  {
    name: 'the volume cap becomes an application check instead of a trigger',
    guard: `${GUARDS}/campaigner-allowlist-and-cap-in-database.mjs`,
    file: 'supabase/migrations/20260913000070_campaigner.sql',
    find: 'create trigger trg_marketing_send_respects_cap\n  before insert on public.marketing_send\n  for each row execute function public.marketing_send_respects_cap();',
    replace: '-- the cap is applied in src/lib/campaigner/run.ts now',
    expect: 'no migration puts the volume cap trigger',
  },
  {
    name: 'a machine-drafted message can move itself out of draft with nobody reading it',
    guard: `${GUARDS}/campaigner-allowlist-and-cap-in-database.mjs`,
    file: 'supabase/migrations/20260913000070_campaigner.sql',
    find: 'create trigger trg_marketing_send_requires_approval\n  before insert or update on public.marketing_send\n  for each row execute function public.marketing_send_requires_approval();',
    replace: '-- approval is checked before the insert is built',
    expect: 'no migration puts the approval trigger',
  },
  {
    name: 'the campaigner invariant view is renamed out from under the guard',
    guard: `${GUARDS}/campaigner-allowlist-and-cap-in-database.mjs`,
    file: 'supabase/migrations/20260913000070_campaigner.sql',
    find: 'create or replace view public.marketing_send_invariant_breaches as',
    replace: 'create or replace view public.marketing_send_breaches as',
    expect: 'is not defined by any migration',
  },

  /*
   * consent-ledger-is-evidence (GA1 v3), six drills, one per clause plus the
   * taxonomy. Clause 4 is drilled on the campaigner's own runner rather than on
   * a file invented for the purpose, because that is the module that actually
   * reaches a transport with a marketing message.
   */
  {
    name: 'the consent ledger stops refusing DELETE at the database',
    guard: `${GUARDS}/consent-ledger-is-evidence.mjs`,
    file: 'supabase/migrations/20260913000040_consent_ledger.sql',
    find: 'create trigger trg_consent_events_no_delete\n  before delete on public.consent_events\n  for each statement execute function public.refuse_ledger_mutation();',
    replace: '-- deletes are prevented by the application',
    expect: 'does not refuse DELETE at the database',
  },
  {
    name: 'a consent event is allowed to carry empty wording',
    guard: `${GUARDS}/consent-ledger-is-evidence.mjs`,
    file: 'supabase/migrations/20260913000040_consent_ledger.sql',
    find: '  constraint consent_events_wording_present check (length(btrim(wording)) > 0),',
    replace: '  -- wording is validated in the action',
    expect: 'refuses empty wording on public.consent_events',
  },
  {
    name: 'the audience table stops asking the resolver before it accepts a row',
    guard: `${GUARDS}/consent-ledger-is-evidence.mjs`,
    file: 'supabase/migrations/20260913000040_consent_ledger.sql',
    find: '  for each row execute function public.audience_requires_live_consent();',
    replace: '  for each row execute function public.audience_touch_updated_at();',
    expect: 'does not refuse a row the resolver refuses',
  },
  {
    name: 'the campaign runner stops filtering its recipients through the resolver',
    guard: `${GUARDS}/consent-ledger-is-evidence.mjs`,
    file: 'src/lib/campaigner/run.ts',
    find: '    const verdict = await resolveSend(admin, {',
    replace: '    const verdict = await decideSend(admin, {',
    expect: 'is registered as a marketing send path and never calls the resolver',
  },
  {
    name: 'the unsubscribe page starts asking who the visitor is',
    guard: `${GUARDS}/consent-ledger-is-evidence.mjs`,
    file: 'src/app/unsubscribe/[token]/page.tsx',
    find: "import { createAdminClient } from '@/lib/supabase/admin'",
    replace: "import { createAdminClient } from '@/lib/supabase/admin'\nimport { requireUser } from '@/lib/auth/require-user'",
    expect: 'Unsubscribing and exercising a privacy right must never require a login',
  },
  {
    name: 'a consent purpose covers something in TypeScript that it does not cover in SQL',
    guard: `${GUARDS}/consent-ledger-is-evidence.mjs`,
    file: 'src/lib/consent/purposes.ts',
    find: "    covers: ['platform_local_digest'],",
    replace: '    covers: [],',
    expect: 'is a send decision that disagrees with itself',
  },

  /*
   * audience-consent-is-the-title-deed (GA1 v3), five drills. The two
   * one-decision-two-languages clauses are drilled from the TypeScript side,
   * because that is the side a refactor moves.
   */
  {
    name: 'an audience row is allowed to exist without consent',
    guard: `${GUARDS}/audience-consent-is-the-title-deed.mjs`,
    file: 'supabase/migrations/20260913000030_audience_asset.sql',
    find: '  constraint audience_members_consent_must_be_true\n    check (consent_state is true),',
    replace: '  -- consent is checked by the writer',
    expect: 'no migration constrains audience_members.consent_state to TRUE',
  },
  {
    name: 'a consent record is allowed to store no wording at all',
    guard: `${GUARDS}/audience-consent-is-the-title-deed.mjs`,
    file: 'supabase/migrations/20260913000030_audience_asset.sql',
    find: '  constraint audience_members_consent_text_present\n    check (length(btrim(consent_text)) > 0),',
    replace: '  -- the wording is validated in the action',
    expect: 'constrains audience_members.consent_text to be non-empty',
  },
  {
    name: 'the waitlist unsubscribe page starts reading a session',
    guard: `${GUARDS}/audience-consent-is-the-title-deed.mjs`,
    file: 'src/app/waitlist/unsubscribe/[token]/page.tsx',
    find: "import { contactAddress } from '@/lib/email/sender'",
    replace:
      "import { contactAddress } from '@/lib/email/sender'\nimport { requireUser } from '@/lib/auth/require-user'",
    expect: 'unsubscribe asks who the visitor is',
  },
  {
    name: 'a price band boundary moves in TypeScript and not in SQL',
    guard: `${GUARDS}/audience-consent-is-the-title-deed.mjs`,
    file: 'src/lib/audience/segments.ts',
    find: "  if (unitCents < 3000) return 'under-30'",
    replace: "  if (unitCents < 2500) return 'under-30'",
    expect: 'disagrees: SQL says under',
  },
  {
    name: 'a community gains a tag in the bridge that the database does not map',
    guard: `${GUARDS}/audience-consent-is-the-title-deed.mjs`,
    file: 'src/lib/communities/tag-bridge.ts',
    find: 'const COMMUNITY_TO_TAGS',
    replace: "const COMMUNITY_TO_TAGS_UNUSED: Record<string, string[]> = { 'first-nations': ['a-tag-no-migration-seeds'] }\nvoid COMMUNITY_TO_TAGS_UNUSED\nconst COMMUNITY_TO_TAGS",
    expect: 'is in the tag bridge and not in community_tag_map',
  },

  /*
   * no-analytics-before-consent (AN1), five drills, one per clause. The first
   * is the one the guard exists for: a second place that names a tracker host,
   * which is by definition the place nobody gated.
   */
  {
    name: 'a second file names an advertising host, outside the one gate',
    guard: `${GUARDS}/no-analytics-before-consent.mjs`,
    file: 'src/lib/analytics/funnel.ts',
    find: 'export',
    replace: "const ENDPOINT = 'https://connect.facebook.net/en_US/fbevents.js'\nvoid ENDPOINT\n\nexport",
    expect: 'names the provider host connect.facebook.net',
  },
  {
    name: 'the gate renders its tags before the consent decision has been read',
    guard: `${GUARDS}/no-analytics-before-consent.mjs`,
    file: 'src/components/analytics/gated-analytics.tsx',
    find: '  if (loading) return null',
    replace: '  if (loading) { /* the cookie is still being read */ }',
    expect: 'no longer refuses to render while the decision is still being read',
  },
  {
    name: 'a provider is gated on its key alone, and loads for everybody',
    guard: `${GUARDS}/no-analytics-before-consent.mjs`,
    file: 'src/components/analytics/gated-analytics.tsx',
    find: "  const loadMeta = mayLoad({ decision, category: 'advertising', identifier: metaPixel })",
    replace: '  const loadMeta = Boolean(metaPixel)',
    expect: 'Every provider asks BOTH questions',
  },
  {
    name: 'the default consent decision starts granting a category',
    guard: `${GUARDS}/no-analytics-before-consent.mjs`,
    file: 'src/lib/analytics/consent.ts',
    find: 'export const NO_CONSENT: ConsentDecision = {\n  analytics: false,',
    replace: 'export const NO_CONSENT: ConsentDecision = {\n  analytics: true,',
    expect: 'NO_CONSENT grants a category',
  },
  {
    name: 'a malformed consent cookie stops answering "they have not agreed"',
    guard: `${GUARDS}/no-analytics-before-consent.mjs`,
    file: 'src/lib/analytics/consent.ts',
    find: "    if (!raw || typeof raw !== 'object') return NO_CONSENT\n    if (raw.v !== CONSENT_VERSION) return NO_CONSENT",
    replace: "    if (!raw || typeof raw !== 'object') return allGranted()\n    if (raw.v !== CONSENT_VERSION) return allGranted()",
    expect: 'path(s) returning NO_CONSENT',
  },

  /*
   * organiser-page-is-a-read (OL1), four drills, one per clause.
   *
   * THE FOURTH ONE EXISTS BECAUSE THE CLAUSE HAD TO BE REWRITTEN TO HAVE IT.
   * That clause asserts the copy gate still walks src/, and it used to pass if
   * any of three text patterns matched anywhere in scripts/copy-tell-gate.mjs.
   * That file names the root twice, once in the scan that enforces the copy
   * laws and once in a coverage measurement that enforces nothing, and this
   * harness replaces the first match only, so no planted regression could make
   * the clause false. A clause nothing can falsify is not enforcing anything.
   * It now reads the body of scanRoots() and the drill below narrows it.
   */
  {
    name: 'the copy gate narrows its scan to src/app and the organiser page drops out of the copy laws',
    guard: `${GUARDS}/organiser-page-is-a-read.mjs`,
    file: 'scripts/copy-tell-gate.mjs',
    find: "  const roots = [path.join(ROOT, 'src')]",
    replace: "  const roots = [path.join(ROOT, 'src', 'app')]",
    expect: 'no longer roots the walk at src/',
  },
  {
    name: 'the live proof block stops reading the catalogue and becomes a screenshot',
    guard: `${GUARDS}/organiser-page-is-a-read.mjs`,
    file: 'src/components/templates/OrganisersLandingPage.tsx',
    find: '    getNewestPublishedEvent(),',
    replace: '    Promise.resolve({ slug: "warehouse-party", title: "Warehouse Party" }),',
    expect: 'does not call getNewestPublishedEvent()',
  },
  {
    name: 'one signup button is pointed straight at the signup path and records nothing',
    guard: `${GUARDS}/organiser-page-is-a-read.mjs`,
    file: 'src/components/templates/OrganisersLandingPage.tsx',
    find: '<Button variant="primary" size="lg" href={withSignupSource(ORGANISER_SIGNUP_PATH)}>',
    replace: '<Button variant="primary" size="lg" href="/organisers/signup">',
    expect: 'straight at /organisers/signup',
  },
  {
    name: "the founder's address is typed onto a public page instead of composed",
    guard: `${GUARDS}/organiser-page-is-a-read.mjs`,
    file: 'src/components/templates/OrganisersLandingPage.tsx',
    find: "href={contactMailto('hello', FOUNDING_OFFER.founderCtaSubject)}",
    replace: 'href="mailto:hello@eventlinqs.com.au"',
    expect: 'no longer opens the founder button through contactMailto',
  },

  /*
   * product-loops-carry-their-parameters (PL1), four drills. The first is the
   * valuable one: the ticket email is RENDERED by the guard through the real
   * builders, so this proves the assertion is made against the email a buyer
   * would receive rather than against the source of a branch that never runs.
   */
  {
    name: 'the ticket email loses the parameter that says where the organiser came from',
    guard: `${GUARDS}/product-loops-carry-their-parameters.mjs`,
    file: 'src/lib/email/order-confirmation.ts',
    find: '<a href="${organiserLoopUrl(siteUrl, LOOP_SOURCES.TICKET)}"',
    replace: '<a href="${siteUrl}/organisers"',
    expect: 'is missing the source parameter src=',
  },
  {
    name: 'a loop link is typed by hand somewhere in the product',
    guard: `${GUARDS}/product-loops-carry-their-parameters.mjs`,
    file: 'src/lib/growth/referrals.ts',
    find: 'export',
    replace: "const TYPED_BY_HAND = '/organisers?src=ticket-email'\nvoid TYPED_BY_HAND\n\nexport",
    expect: 'types a loop link by hand',
  },
  {
    name: 'the confirmation page loses the marker the driven proof finds the block by',
    guard: `${GUARDS}/product-loops-carry-their-parameters.mjs`,
    file: 'src/app/orders/[order_id]/confirmation/page.tsx',
    find: '          data-loop="organiser-invite"',
    replace: '          data-loop="organiser-invitation"',
    expect: 'has lost the data-loop marker',
  },
  {
    name: 'the share bar stops putting every channel through one builder',
    guard: `${GUARDS}/product-loops-carry-their-parameters.mjs`,
    file: 'src/components/features/events/event-share-bar.tsx',
    find: '  const urlFor = (channel: ShareChannel): string => withShareSource(',
    replace: '  const urlFor = (channel: ShareChannel): string => String(',
    expect: 'no longer passes every shared link through withShareSource',
  },

  /*
   * proof-page-every-number-sourced (GA5), four drills. This is the page a fee
   * is defended on, so the clause that matters most is the one that refuses a
   * figure which cannot name where it came from.
   */
  {
    name: 'a figure on the proof page is produced without naming its source',
    guard: `${GUARDS}/proof-page-every-number-sourced.mjs`,
    file: 'src/lib/proof/compose.ts',
    find: '  figures[FIGURE.SENDS_DISPATCHED] = sourced(',
    replace: '  figures[FIGURE.SENDS_DISPATCHED] = countOf(',
    expect: 'which is neither sourced(...) nor unavailable(...)',
  },
  {
    name: 'a number is typed into the proof page rendering path',
    guard: `${GUARDS}/proof-page-every-number-sourced.mjs`,
    file: 'src/lib/proof/present.ts',
    find: "import { formatMoneyDisplay } from '@/lib/money/format'",
    replace: "import { formatMoneyDisplay } from '@/lib/money/format'\nconst ROUNDING = 137\nvoid ROUNDING",
    expect: 'is written into the rendering path',
  },
  {
    name: 'a commission rate is typed onto the page instead of read',
    guard: `${GUARDS}/proof-page-every-number-sourced.mjs`,
    file: 'src/lib/proof/present.ts',
    find: "import { formatMoneyDisplay } from '@/lib/money/format'",
    replace: "import { formatMoneyDisplay } from '@/lib/money/format'\nconst RATE = 'our 6% commission'\nvoid RATE",
    expect: 'a percentage is written into the rendering path',
  },
  {
    name: 'the database stops refusing a snapshot holding a figure nothing sources',
    guard: `${GUARDS}/proof-page-every-number-sourced.mjs`,
    file: 'supabase/migrations/20260913000080_proof_page.sql',
    find: '  constraint marketing_proof_snapshot_every_figure_is_sourced\n    check (public.marketing_proof_every_figure_is_sourced(figures, sources))',
    replace: '  constraint marketing_proof_snapshot_figures_present\n    check (figures is not null)',
    expect: 'so the rule lives only in application code',
  },

  /*
   * forecast-reads-every-number (FT1), five drills. FT1's own GUARD line asks
   * for exactly the first of these: "Proven red by hard coding the fee, then
   * green." It was, once, by hand. This is that proof made repeatable, plus the
   * other four clauses the guard grew.
   */
  {
    name: 'the forecast hard-codes the fee instead of reading the one the checkout charges',
    guard: `${GUARDS}/forecast-reads-every-number.mjs`,
    file: 'src/lib/forecast/read.ts',
    find: '  const fee = await getLivePublicFee()',
    replace: '  const fee = { percent: 6, fixedCents: 0, currency: "AUD", label: "6%" }',
    expect: 'no longer CALLS getLivePublicFee',
  },
  {
    name: 'a percentage is typed into the forecast',
    guard: `${GUARDS}/forecast-reads-every-number.mjs`,
    file: 'src/lib/forecast/present.ts',
    find: 'export',
    replace: "const RATE_NOTE = 'we take 6% of each ticket'\nvoid RATE_NOTE\n\nexport",
    expect: 'a percentage is written into the forecast',
  },
  {
    name: 'the forecast carries a taxonomy list of its own instead of reading one',
    guard: `${GUARDS}/forecast-reads-every-number.mjs`,
    file: 'src/app/forecast/page.tsx',
    find: 'export default async function',
    replace: "const EVENT_TYPES = ['music', 'comedy']\nvoid EVENT_TYPES\n\nexport default async function",
    expect: 'carries a taxonomy list of its own',
  },
  {
    name: 'the forecast claims a measured range while the calculation is arithmetic',
    guard: `${GUARDS}/forecast-reads-every-number.mjs`,
    file: 'src/lib/forecast/method.ts',
    find: 'export const MEASURED_IS_REACHABLE = false',
    replace: 'export const MEASURED_IS_REACHABLE = true',
    expect: 'says the measured claim is reachable',
  },
  {
    name: 'the result marker is renamed, so nothing can judge that the CTA sits below it',
    guard: `${GUARDS}/forecast-reads-every-number.mjs`,
    file: 'src/app/forecast/page.tsx',
    find: '            data-forecast="break-even"',
    replace: '            data-forecast="break-even-result"',
    expect: 'is missing the result or the call-to-action marker',
  },

  /*
   * founding-offer-matches-configuration (FO1), five drills. The offer is
   * published, is repeated in every outreach message, and is charged by a
   * different module from the one that prints it, so each drill is a way the
   * page and the invoice come to disagree.
   */
  {
    name: 'the engine changes the founding cap and the published page does not',
    guard: `${GUARDS}/founding-offer-matches-configuration.mjs`,
    file: 'src/lib/payments/founding-waiver.ts',
    find: 'export const FOUNDING_WAIVER_CAP = 50',
    replace: 'export const FOUNDING_WAIVER_CAP = 75',
    expect: 'and the engine that charges uses',
  },
  {
    name: 'a published claim is deleted from the offer instead of corrected',
    guard: `${GUARDS}/founding-offer-matches-configuration.mjs`,
    file: 'src/lib/organisers/founding-offer.ts',
    find: "    '3 more fee-free months for every organiser you refer who runs an event',",
    replace: "    'More fee-free months for every organiser you refer who runs an event',",
    expect: 'no longer states',
  },
  {
    name: 'the fee is typed onto the organiser page instead of read',
    guard: `${GUARDS}/founding-offer-matches-configuration.mjs`,
    file: 'src/components/templates/OrganisersLandingPage.tsx',
    find: 'export async function OrganisersLandingPage',
    replace: `const HEADLINE_RATE = 'just ${LOCKED_PERCENT}% per ticket'\nvoid HEADLINE_RATE\n\nexport async function OrganisersLandingPage`,
    expect: 'as a literal. Render fee.label from getLivePublicFee instead',
    stale: LOCKED_PERCENT ? null : 'the locked percentage could not be derived from src/lib/pricing/public-fee.ts',
  },
  {
    name: 'the organiser page stops reading the fee and only mentions the resolver',
    guard: `${GUARDS}/founding-offer-matches-configuration.mjs`,
    file: 'src/components/templates/OrganisersLandingPage.tsx',
    find: '    getLivePublicFee(),',
    replace: '    Promise.resolve(FALLBACK_PUBLIC_FEE),',
    expect: 'does not CALL getLivePublicFee',
  },
  {
    name: 'the last-resort fee fallback goes stale against the lock block',
    guard: `${GUARDS}/founding-offer-matches-configuration.mjs`,
    file: 'src/lib/pricing/public-fee.ts',
    find: 'fixedCents:',
    replace: 'fixedCents: 149, unusedFixedCents:',
    expect: 'while the lock block says',
  },
  {
    name: 'the displayed waiver is read with a client that cannot see it',
    guard: `${GUARDS}/founding-offer-matches-configuration.mjs`,
    file: 'src/lib/pricing/event-fee-config.ts',
    find: '        createAdminClient() as unknown as OrganisationReadClient,',
    replace: '        (await createServerClient()) as unknown as OrganisationReadClient,',
    expect: 'reads the founding waiver with something other than createAdminClient()',
  },

  /*
   * drive-quantity-control-selector (FO1, 18 September), two drills. This guard
   * was itself written after a loose selector spent four days accusing the
   * product of a defect that was the harness's, so the drill that matters is
   * the one that puts the loose selector back.
   */
  {
    name: 'the money drives go back to a prefix selector, and press whatever sits higher',
    guard: `${GUARDS}/drive-quantity-control-selector.mjs`,
    file: 'scripts/verify/lib/refund-proof-fixture.mjs',
    find: "    page.getByRole('button', { name: /^increase .+ quantity$/i }).first()",
    replace: "    page.getByRole('button', { name: /^(\\+|increase|add)/i }).first()",
    expect: 'which is not anchored at both ends',
  },
  {
    name: 'the product stops labelling the control every money drive presses',
    guard: `${GUARDS}/drive-quantity-control-selector.mjs`,
    file: 'src/components/checkout/ticket-selector.tsx',
    find: 'aria-label={`Increase ${tier.name} quantity`}',
    replace: 'aria-label={`Add one ${tier.name}`}',
    expect: 'does not match',
  },

  /*
   * every-guard-has-been-seen-to-fail, two drills. The guard that asks whether
   * every guard has a drill has two of its own, which is the least it can do.
   *
   * The two regressions are the two halves of the same mistake: a guard added
   * to the registry and never drilled, and a drill that stops aiming at the
   * guard it was written for. The second is not hypothetical inside this file:
   * its own header records three occasions when a drill went on reporting green
   * while aimed at a target that had moved.
   */
  {
    name: 'a new guard is registered as blocking and nobody ever makes it fail',
    guard: `${GUARDS}/every-guard-has-been-seen-to-fail.mjs`,
    file: 'scripts/guards/run-guards.mjs',
    find: "  'scripts/guards/api-v1-organiser-scope.mjs',",
    replace: "  'scripts/guards/api-v1-organiser-scope.mjs',\n  'scripts/guards/a-new-guard-nobody-drilled.mjs',",
    expect: 'a-new-guard-nobody-drilled.mjs is registered in',
  },
  {
    name: 'a guard is renamed and its only drill is left aiming at the old name',
    guard: `${GUARDS}/every-guard-has-been-seen-to-fail.mjs`,
    file: 'scripts/verify/guard-failure-drills.mjs',
    find: '    guard: `${GUARDS}/attribution-one-record-per-order-never-billable-when-reversed.mjs`,',
    replace: '    guard: `${GUARDS}/attribution-one-record.mjs`,',
    expect: 'attribution-one-record-per-order-never-billable-when-reversed.mjs is registered in',
  },
  // -------------------------------------------------------------------------
  // no-loadable-in-platform-chrome. BOTH HALVES, because this guard exists
  // precisely because its older sibling reported a confident PASS on the defect
  // it was written for: no-loadable-in-the-root-shell is rooted at
  // src/app/layout, SiteHeader is not under src/app/layout, and so two pieces
  // of header chrome carried next/dynamic past a green gate for a day. A guard
  // built to cover another guard's blind spot has to prove it can fail.
  // -------------------------------------------------------------------------
  {
    name: 'header chrome goes back to deferring its panel with next/dynamic',
    guard: `${GUARDS}/no-loadable-in-platform-chrome.mjs`,
    file: 'src/components/layout/header-search-trigger.tsx',
    find: "import { useDeferredComponent } from '@/components/ui/use-deferred-component'",
    replace: "import dynamic from 'next/dynamic'",
    expect: 'module(s) in the platform chrome import',
  },
  {
    // The clause that stops this guard going the way of the one it backs up. A
    // walk whose roots are gone finds an empty closure and reports PASS, which
    // is the exact shape of a gate that has quietly stopped checking anything.
    name: 'the platform chrome is renamed and the guard is left pointing at nothing',
    guard: `${GUARDS}/no-loadable-in-platform-chrome.mjs`,
    file: 'scripts/guards/no-loadable-in-platform-chrome.mjs',
    find: "const ROOTS = ['src/components/layout/site-header', 'src/components/layout/site-footer']",
    replace: "const ROOTS = ['src/components/layout/site-header-gone', 'src/components/layout/site-footer']",
    expect: 'are not on disk',
  },
  // -------------------------------------------------------------------------
  // interaction-only-chrome-is-split. This guard had NO drill until 19
  // September 2026, which is how its clause 2 came to require the literal
  // `dynamic(` wrapper rather than the call-form `import()` that actually
  // causes the split. It then failed both of its own registered surfaces for
  // moving OFF next/dynamic onto a cheaper deferral, which is a gate refusing
  // an improvement. The matcher was corrected and this drill is what holds it.
  // The planted static import fires clause 2 and clause 3 together, which is
  // the real-world shape: the "tidy-up" that deletes the deferral writes the
  // static import in the same edit.
  // -------------------------------------------------------------------------
  {
    name: 'a deferred chrome import is tidied back into a static one',
    guard: `${GUARDS}/interaction-only-chrome-is-split.mjs`,
    file: 'src/components/layout/header-search-trigger.tsx',
    find: "    import('./header-search-overlay').then(m => m.HeaderSearchOverlay),",
    replace: "    Promise.resolve(HeaderSearchOverlayStatic),",
    expect: 'no longer reaches ./header-search-overlay through a deferred',
  },
  {
    name: 'a rail cell is widened in the class string and its pixel pair is left behind',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/lib/ui/rhythm.ts',
    find: "export const CITY_TILE_CELL = 'w-[280px] shrink-0 snap-start sm:w-[340px]' as const",
    replace: "export const CITY_TILE_CELL = 'w-[280px] shrink-0 snap-start sm:w-[400px]' as const",
    expect: 'renders at 280/400 and CITY_TILE_PX says 280/340',
  },
  {
    name: 'a rail hint is edited by hand until it no longer describes its cell',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/media/sizes.ts',
    find: "  railCityTile: '(min-width: 640px) 340px, 280px',",
    replace: "  railCityTile: '(min-width: 640px) 288px, 256px',",
    expect: 'MEDIA_SIZES.railCityTile is',
  },
  {
    name: 'a twelfth rail cell width is typed into a feature file instead of imported',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/features/home/sounds-rail.tsx',
    find: '    <div className={SCENE_TILE_CELL}>',
    replace: '    <div className="w-[152px] shrink-0 snap-start sm:w-[170px]">',
    expect: 'a rail cell width is written here rather than imported',
  },
  {
    name: 'a raw sizes string reappears in feature code, outside the media layer',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/ui/CategoryHeroEmpty.tsx',
    find: '            alt=""',
    replace: '            alt="" sizes="(max-width: 768px) 100vw, 1280px"',
    expect: 'a raw sizes string',
  },
  {
    name: 'a variant is added to the union and nobody gives it a hint',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/media/EventCardMedia.tsx',
    find: "  | 'marquee'",
    replace: "  | 'marquee'\n  | 'drill-unmapped-variant'",
    expect: "the variant 'drill-unmapped-variant' has no entry in SIZES_BY_VARIANT",
  },
  {
    name: 'a hint is left in the table after its last reader is deleted',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/media/sizes.ts',
    find: "  marquee: '280px',",
    replace: "  marquee: '280px',\n  drillDeadHint: '123px',",
    expect: 'is declared and nothing reads it',
  },
  {
    name: 'sizes.ts gains an import and stops being a leaf, which is what cost 49KB across 61 routes',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/media/sizes.ts',
    find: '/**\n * Centralised `sizes` hints for next/image.',
    replace:
      "import { RHYTHM_GAP } from '@/lib/ui/rhythm'\n\nvoid RHYTHM_GAP\n" +
      '/**\n * Centralised `sizes` hints for next/image.',
    expect: 'sizes.ts has gained an import',
  },
  {
    name: 'a feature file goes back to importing the media barrel',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/auth/auth-shell.tsx',
    find: "import { HeroMedia } from '@/components/media/HeroMedia'",
    replace: "import { HeroMedia } from '@/components/media'",
    expect: 'imports from the media barrel',
  },
  {
    name: 'the cell geometry file is renamed away and the guard cannot compare anything',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    // The pairing moved out of sizes.ts on 18 September 2026, because putting it
    // there gave the most widely imported module in the media layer an import
    // and cost 49,014 bytes of gzip across 61 routes. This drill went STALE in
    // that move and said so on its next run, which is what a stale anchor is for.
    file: 'src/components/media/rail-cell-hints.ts',
    find: "  { key: 'railCityTile', px: CITY_TILE_PX, name: 'CITY_TILE_PX' },",
    replace: "  { key: 'railCityTile', px: GONE_TILE_PX, name: 'GONE_TILE_PX' },",
    expect: 'which src/lib/ui/rhythm.ts does not declare',
  },

  /*
   * THE AVATAR SLOTS ARE DECLARED TWICE ON PURPOSE, SO BOTH WAYS THAT CAN GO
   * WRONG ARE DRILLED (19 September 2026, lane A).
   *
   * `OrganiserAvatar` is in the dashboard shell, and `MEDIA_SIZES` is one
   * object literal, so importing one member of it put a 21,005 byte chunk
   * carrying every hint on the platform into the first load of thirty dashboard
   * routes. The component reads a leaf instead. The slots stay declared in
   * `sizes.ts` because the configured width ladder is derived from it, and
   * neither file may reference the other: `image-hints-match-the-cell` refuses
   * an import in sizes.ts, and `candidate-ladder-has-no-dead-rung` refuses a
   * reference because the ladder is derived by reading string literals.
   *
   * So clause 5 verifies the duplication instead of excusing it, and a clause
   * nobody has seen fail is not a clause.
   */
  {
    name: 'the avatar leaf drifts from the hint table it must agree with',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/media/avatar-sizes.ts',
    find: "  topbar: '32px',",
    replace: "  topbar: '30px',",
    expect: 'does not declare "32px"',
  },
  {
    name: 'the avatar component stops reading the leaf, so a declared slot renders nothing',
    guard: `${GUARDS}/image-hints-match-the-cell.mjs`,
    file: 'src/components/media/OrganiserAvatar.tsx',
    find: '  topbar: AVATAR_SIZES.topbar,',
    replace: "  topbar: '32px',",
    expect: 'is declared and nothing reads it',
  },

  /*
   * THE WIDTH LADDER, THREE DRILLS (close-out C8B.3, 19 September 2026).
   *
   * The first one restores the exact defect the guard was written for: the rung
   * that was live when the ladder was last trimmed and dead the moment the
   * smallest slot moved from 16 CSS pixels to 24. It is the drill that matters,
   * because a guard against a stale claim has to be shown refusing the stale
   * claim itself rather than a synthetic one.
   */
  {
    name: 'the dead 16px rung is put back into the width ladder',
    guard: `${GUARDS}/candidate-ladder-has-no-dead-rung.mjs`,
    file: 'next.config.ts',
    find: '    imageSizes: [32, 64, 128, 256, 384],',
    replace: '    imageSizes: [16, 32, 64, 128, 256, 384],',
    expect: 'the width 16 is offered and nothing can select it',
  },
  {
    name: 'a slot grows past the top of the ladder, which no hint can fix',
    guard: `${GUARDS}/candidate-ladder-has-no-dead-rung.mjs`,
    file: 'src/components/media/sizes.ts',
    find: "  fullBleed: '(max-width: 768px) 75vw, 1920px',",
    replace: "  fullBleed: '(max-width: 768px) 75vw, 2400px',",
    expect: 'and the widest width offered is 3840',
  },
  {
    name: 'the width ladder is renamed away and the guard judges an empty list',
    guard: `${GUARDS}/candidate-ladder-has-no-dead-rung.mjs`,
    file: 'next.config.ts',
    find: '    deviceSizes: [640, 750, 828, 1080, 1920, 3840],',
    replace: '    deviceSizesRenamed: [640, 750, 828, 1080, 1920, 3840],',
    expect: 'could not both be read as number lists',
  },

  /*
   * THE MARKETING BANDS (lane B, 19 September 2026). One drill per clause of
   * scripts/guards/marketing-bands-are-supplyable.mjs.
   *
   * The guard exists because /organisers and /about shipped under-fetched bands
   * at every desktop width with every gate green. The gate that could have seen
   * them, image-hint-fidelity-drive.mjs, simply did not have those routes in its
   * list, so clause 1 is a route list that cannot be forgotten quietly.
   */
  {
    name: 'a route that renders a marketing band drops out of the fidelity drive list',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'scripts/verify/image-hint-fidelity-drive.mjs',
    find: "'communities', 'organisers'",
    replace: "'communities'",
    expect: 'is not in the default route list',
  },
  {
    name: 'two band variants are pointed at one hint, which is the whole fault',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'src/components/media/MarketingMedia.tsx',
    find: "'band-full-column': MEDIA_SIZES.bandFullColumn",
    replace: "'band-full-column': MEDIA_SIZES.bandHalfColumn",
    expect: 'One hint cannot be right for two layouts',
  },
  {
    name: "a band hint's fixed term drifts away from the slot the guard declares",
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'src/components/media/sizes.ts',
    find: '(max-width: 1399px) 100vw, 1340px',
    replace: '(max-width: 1399px) 100vw, 1280px',
    expect: 'Move both or neither',
  },
  {
    name: 'a band hint loses the fixed term that holds it above the container cap',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'src/components/media/sizes.ts',
    find: "bandHalfColumn: '(max-width: 1023px) 100vw, (max-width: 1399px) 50vw, 640px'",
    replace: "bandHalfColumn: '(max-width: 1023px) 100vw, 50vw'",
    expect: 'does not end in a fixed pixel term',
  },
  {
    name: 'a band the raster cannot supply is left out of the register',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'scripts/guards/marketing-bands-are-supplyable.mjs',
    find: "    variant: 'band-full-bleed',",
    replace: "    variant: 'band-half-column',",
    expect: 'it is not in this guard',
  },
  {
    name: 'the soft register outlives its defect once the raster ceiling rises',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'src/lib/images/spine.ts',
    find: '  hero: 1920,',
    replace: '  hero: 4096,',
    expect: 'a register that outlives its defect is a mute button',
  },
  {
    name: 'an exemption in the register loses the reason that justifies it',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'scripts/guards/marketing-bands-are-supplyable.mjs',
    // The first version of this drill shortened the sentence to "because" and
    // the guard PASSED, correctly: what was left still ran past the 40-character
    // floor. The drill was wrong, not the guard, and only running it red found
    // that. It now empties the reason, which is the thing the clause is for.
    find:
      "    why: 'the /about story band is the full viewport, so a 2x screen at 1920 needs 3840 physical pixels and the hero raster ceiling is 1920. Same owner action, same law.',",
    replace: "    why: '',",
    expect: 'indistinguishable from a forgotten one',
  },

  /*
   * THE TILE, added 19 September 2026 with the authed half of the drive. The
   * guard's header used to say it could not judge `tile` because the one call
   * site was behind a login nothing signed in to. The hint over that call site
   * was wrong the whole time and under-fetched at 6 of 9 viewports, so the hole
   * became three more clauses and these three drills.
   */
  {
    name: 'a route that renders a marketing tile drops out of the fidelity drive authed list',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'scripts/verify/image-hint-fidelity-drive.mjs',
    find: "const AUTHED_PATHS = ['/dashboard/events/[id]/launch-kit']",
    replace: "const AUTHED_PATHS = ['/dashboard/events/[id]/door']",
    expect: 'is not in AUTHED_PATHS',
  },
  {
    name: 'the authed route list is renamed away and the guard judges no tile route at all',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'scripts/verify/image-hint-fidelity-drive.mjs',
    find: 'const AUTHED_PATHS = [',
    replace: 'const AUTHED_ROUTES = [',
    expect: 'the AUTHED_PATHS list could not be found',
  },
  {
    name: 'a layout excluded from the raster-ceiling clause loses the reason for the exclusion',
    guard: `${GUARDS}/marketing-bands-are-supplyable.mjs`,
    file: 'scripts/guards/marketing-bands-are-supplyable.mjs',
    // Emptied, not shortened. The drill one entry above was written the wrong
    // way round the first time (it trimmed a sentence that stayed over the
    // 40-character floor, the guard passed, and the DRILL was the thing that was
    // wrong), so this one deletes the value outright.
    find:
      "    rasterWhy: 'an ORGANISER-SUPPLIED event cover sits behind this tile rather than a licensed library raster, so the library ingest ceiling is not the ceiling over it and judging it against one would be judging the wrong file. Law 6 governs what may be done with it: render what was supplied, never invent pixels it does not have.',",
    replace: "    rasterWhy: '',",
    expect: 'is excluded from the raster-ceiling clause with no',
  },

  /*
   * no-silent-row-ceiling (lane B, 19 September 2026), five drills.
   *
   * The guard exists because a read with no bound is silently truncated at
   * 1,000 rows by the server, with HTTP 200 and no error. Three drills remove a
   * bound from a real read; two break the pager itself in the two ways a pager
   * is broken, both of which pass every test that does not fake a server with a
   * LOWER ceiling than the page size.
   */
  {
    name: 'a configuration read in the matcher loses its stated bound',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/matching/config.ts',
    find: ".order('band').limit(200),",
    replace: ".order('band'),",
    expect: 'reads marketing_match_postcode_bands with no bound',
  },
  {
    name: 'a paged read loses the order that makes paging deterministic',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/matching/run.ts',
    find:
      "      admin.from('recovery_sends').select('contact_email, sent_at').order('id', { ascending: true }).range(from, to),",
    replace: "      admin.from('recovery_sends').select('contact_email, sent_at').range(from, to),",
    expect: 'pages recovery_sends with .range() and no .order()',
  },
  {
    name: 'the audience screen goes back to reading the consent ledger unbounded',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/audience/read.ts',
    find:
      "        .order('id', { ascending: true })\n        .range(from, to),",
    replace: '',
    expect: 'with no bound',
  },
  {
    name: 'the pager advances by the page size instead of by the rows it received',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/supabase/read-every-row.ts',
    find: '    from += batch.length',
    replace: '    from += pageSize',
    expect: 'no longer advances by the rows it received',
  },
  {
    name: 'the pager stops on a short page, which a lowered project ceiling makes every page',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/supabase/read-every-row.ts',
    find: '    if (batch.length === 0) return rows',
    replace: '    if (batch.length < pageSize) return rows',
    expect: 'stops on a SHORT page',
  },
  {
    name: 'the guard is pointed at a directory that does not exist and would sweep nothing',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'scripts/guards/no-silent-row-ceiling.mjs',
    find: "  'src/lib/consent',",
    replace: "  'src/lib/consent-ledger',",
    expect: 'a scope that scans nothing reports PASS',
  },

  /*
   * marketing-mail-carries-one-click (lane B, 19 September 2026), six drills,
   * one per clause plus the blindness case.
   *
   * The guard exists because both marketing send paths shipped without the RFC
   * 8058 one-click unsubscribe pair and nothing anywhere could see it: the
   * message renders, the body link works, the provider returns an id, and every
   * test is green. The only signal is a deliverability number weeks later.
   *
   * THE SIXTH DRILL IS THE IMPORTANT ONE. It does not break the product at all.
   * It empties the registry the guard reads, so the guard would sweep nothing
   * and report OK over a platform sending no-one-click mail. A guard that
   * passes because it looked at nothing is the failure mode lane A found twice
   * in this tree in two days, once in a matcher built from a template literal.
   */
  {
    name: 'the campaigner stops composing the one-click pair on its live send',
    guard: `${GUARDS}/marketing-mail-carries-one-click.mjs`,
    file: 'src/lib/campaigner/run.ts',
    find: "import { oneClickUnsubscribeHeaders } from '@/lib/consent/one-click'",
    replace: '',
    expect: 'does not import oneClickUnsubscribeHeaders',
  },
  {
    name: 'the weekly city digest stops composing the one-click pair',
    guard: `${GUARDS}/marketing-mail-carries-one-click.mjs`,
    file: 'src/app/api/cron/weekly-digest/route.ts',
    find: "import { oneClickUnsubscribeHeaders } from '@/lib/consent/one-click'",
    replace: '',
    expect: 'does not import oneClickUnsubscribeHeaders',
  },
  {
    name: 'the transport accepts headers and quietly drops them before the provider',
    guard: `${GUARDS}/marketing-mail-carries-one-click.mjs`,
    file: 'src/lib/email/send.ts',
    find: '    ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),',
    replace: '',
    expect: 'the resend.emails.send call does not pass them',
  },
  {
    name: 'the RFC 8058 header value is edited to a form a receiver will not match',
    guard: `${GUARDS}/marketing-mail-carries-one-click.mjs`,
    file: 'src/lib/consent/one-click.ts',
    find: "export const LIST_UNSUBSCRIBE_POST_VALUE = 'List-Unsubscribe=One-Click'",
    replace: "export const LIST_UNSUBSCRIBE_POST_VALUE = 'List-Unsubscribe=one-click'",
    expect: 'RFC 8058 requires exactly',
  },
  {
    name: 'the headers point at an address no route answers',
    guard: `${GUARDS}/marketing-mail-carries-one-click.mjs`,
    file: 'src/lib/consent/one-click.ts',
    find: "export const ONE_CLICK_UNSUBSCRIBE_ROUTE = '/api/marketing/one-click-unsubscribe'",
    replace: "export const ONE_CLICK_UNSUBSCRIBE_ROUTE = '/api/marketing/unsubscribe-one-click'",
    expect: 'does not exist',
  },
  {
    /*
     * THE GUARD'S OWN BLINDNESS, not the product's.
     *
     * The first version of this drill flipped one entry in the registry from
     * marketing to transactional, and it would NOT have fired: the harness
     * replaces the FIRST match only, so the second marketing entry survived, the
     * guard judged it, found the pair, and reported OK. A drill that cannot fail
     * proves nothing, and it is the same shape as the guard lane A found on
     * 18 September reporting PASS over the import it banned.
     *
     * So the sabotage is aimed where it can only have one effect: the guard's
     * own comparison, which makes it match no entry at all and sweep an empty
     * set.
     */
    name: 'the guard matches no registry entry and would sweep nothing while reporting OK',
    guard: `${GUARDS}/marketing-mail-carries-one-click.mjs`,
    file: 'scripts/guards/marketing-mail-carries-one-click.mjs',
    find: "if (kind && kind[1] === 'marketing') entries.push(file)",
    replace: "if (kind && kind[1] === 'marketing-direct') entries.push(file)",
    expect: 'classifies no path as marketing',
  },

  /*
   * consent-dates-are-zoned (lane B, 19 September 2026), five drills.
   *
   * The guard exists because the consent ledger rendered every date from UTC
   * getters on a platform whose readers are all UTC+10 or UTC+11, so every
   * record made after 10:00 local was a day early, on the one page whose closing
   * line is "Records are kept as evidence of what you were shown and when".
   *
   * THE FOURTH DRILL AIMS AT THE GUARD ITSELF, because a guard that sweeps
   * nothing prints the same OK as one that sweeps everything, and this guard
   * legitimately reports zero rendering calls on a healthy tree: everything in
   * scope already delegates. The file count is the only thing that proves it
   * looked, so the drill takes the file count away.
   */
  {
    name: 'the consent ledger goes back to assembling its dates from UTC getters',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'src/lib/consent/sentences.ts',
    find: '  return formatPlatformDateLong(iso)',
    replace: '  return `${at.getUTCDate()} ${at.getUTCMonth()} ${at.getUTCFullYear()}`',
    expect: 'assembles a date from .getUTCDate()',
  },
  {
    name: 'an audience read formats a date with no zone named',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'src/lib/audience/read.ts',
    find: 'export ',
    replace: 'const shownAt = (iso) => new Date(iso).toLocaleDateString(); export ',
    expect: 'names no timeZone',
  },
  {
    name: 'a date is formatted through Intl with every option except the zone',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'src/lib/proof/read.ts',
    find: 'export ',
    replace:
      "const stamp = (d) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long' }).format(d); export ",
    expect: 'names no timeZone',
  },
  {
    name: 'the date guard sweeps no files at all while still reporting OK',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'scripts/guards/consent-dates-are-zoned.mjs',
    find: `!/${BSL}.test${BSL}.tsx?$/.test(entry)) out.push(full)`,
    replace: `!/${BSL}.(ts|tsx)$/.test(entry)) out.push(full)`,
    expect: 'the scope matched no files at all',
  },
  {
    name: 'the ledger keeps a zoned date but stops delegating to the one formatter',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'src/lib/consent/sentences.ts',
    find: "import { formatPlatformDateLong } from '@/lib/dates/event-time'",
    replace: '',
    expect: 'no longer imports formatPlatformDateLong',
  },

  /*
   * THIS HARNESS'S OWN FAILURE, DRILLED. Two drills, one per clause of
   * scripts/guards/no-drill-residue.mjs.
   *
   * The guard exists because THIS FILE left a mutated source file in the tree
   * twice in two days: a power loss on 16 September 2026 committed
   * `process.exit(1)` into no-control-characters.mjs, and a usage-limit kill on
   * 17 September left an auth provider hardcoded on in the login page. The
   * header above claimed a `finally` made that impossible. A `finally` runs when
   * a block exits and never when a process is killed.
   *
   * THE FIRST DRILL NEEDS NO SABOTAGE AT ALL, which is the neatest possible
   * demonstration. Every file drill now opens a journal entry before it mutates,
   * so simply BEING mid-drill is the condition the guard refuses. The mutation
   * below is deliberately inert and lands in a .json file, which clause 3 does
   * not read, so the only thing the guard can be objecting to is the open entry.
   */
  {
    name: 'a drill is mid-flight and the tree does not say so',
    guard: `${GUARDS}/no-drill-residue.mjs`,
    file: 'perf-budget.json',
    find: '"marks": {',
    replace: '"marks": {\n    "/drill-journal-open": 1,',
    expect: 'has an OPEN drill journal entry',
  },
  /*
   * THE OTHER HALF, and the one that covers the 16 September case specifically.
   * Residue that was already COMMITTED has no journal entry to find, because the
   * journal is gitignored and a fresh checkout has none. Every plant that
   * executes carries a `planted by the <id> drill` label, so that phrase in a
   * tracked source file is residue by definition.
   *
   * It plants the EXACT line from commit b3cc6317, in the exact file, at the
   * exact anchor, so this drill fails if the guard ever stops recognising the
   * real thing rather than a paraphrase of it.
   */
  {
    name: "an interrupted drill's sabotage line was committed and nothing notices",
    guard: `${GUARDS}/no-drill-residue.mjs`,
    file: 'scripts/guards/no-control-characters.mjs',
    find: 'const ROOT = process.cwd()',
    replace: 'const ROOT = process.cwd()\nprocess.exit(1) // planted by the F1.1 drill, restored in the finally',
    expect: "still carries a drill's planted sabotage line",
  },
  /*
   * TWO GUARDS THAT ARRIVED IN THE SAME MERGE WITH NO DRILL, DRILLED HERE.
   *
   * Both are lane A's, both were registered in run-guards.mjs on 18 September
   * 2026, and the merge of that work into lane/b-growth on 19 September made
   * every-guard-has-been-seen-to-fail go red naming exactly these two. That is
   * the rule working rather than a complaint: it printed the command that
   * watches each one fail, and the answer to it is a drill, never a baseline
   * entry. Only THIS file changes. Neither guard is touched.
   */
  /*
   * The first plants the EXACT edge lane A removed. `sale-status.ts` wanted one
   * pure value, the Connect country-to-currency map, and reached it through
   * `./application-fee`, which reaches `pricing-rules` and from there
   * `@/lib/redis/client` and a 16.0 KB Buffer polyfill. `ticket-selector.tsx` is
   * a client component that imports `sale-status`, so the chain the guard
   * reports is the one that really shipped 17.5 KB of server code to a buyer's
   * phone. The fix was a leaf module, `./connect-currency`, and this drill
   * un-does exactly that one line.
   */
  {
    name: 'a client component reaches the Redis client again through the payments chain',
    guard: `${GUARDS}/no-client-redis-import.mjs`,
    file: 'src/lib/payments/sale-status.ts',
    find: "import { getCurrencyForCountry } from './connect-currency'",
    replace: "import { getCurrencyForCountry } from './application-fee'",
    expect: 'client component(s) reach the Redis client',
  },
  /*
   * The second plants `next/dynamic` back into the root layout's client shell,
   * in `measurement-boot.tsx`, which is the one 'use client' module the shell
   * reaches and the exact file the import was taken out of. The cost it recreates
   * is 1306 bytes gzip and one whole shared chunk in the first load of all 141
   * routes, which the bundle ratchet reports as 116 identical faults on routes
   * that measure nothing. This guard names the cause instead, so it has to be
   * seen to name it.
   */
  {
    name: "the root layout's client shell imports next/dynamic again",
    guard: `${GUARDS}/no-loadable-in-the-root-shell.mjs`,
    file: 'src/components/analytics/measurement-boot.tsx',
    find: "import { useEffect, useState, type ComponentType } from 'react'",
    replace: "import { useEffect, useState, type ComponentType } from 'react'\nimport dynamic from 'next/dynamic'",
    expect: "in the root client shell import 'next/dynamic'",
  },

  /*
   * edge-cache-is-viewer-independent, four drills, one per clause that carries
   * the defect it was written for. Added by lane B on 19 September 2026, in the
   * merge that brought the guard in, because the moment it was registered
   * `every-guard-has-been-seen-to-fail` refused the build and named it: it
   * blocked every build and nobody had ever watched it go red.
   *
   * THE DEFECT IS WORTH RESTATING because it decides what a drill has to plant.
   * `/events` was publicly edge-cached while rendering the per-viewer header,
   * so one signed-in visitor's display name, initials and email local part were
   * storable at Vercel's edge and servable to strangers for 60 seconds, and 300
   * more while stale. Production answered `X-Vercel-Cache: HIT` with `Age: 80`,
   * so it was real rather than theoretical.
   *
   * The two halves are drilled SEPARATELY because neither is redundant and a
   * single drill would let either one rot unnoticed: `missing` stops a
   * signed-in render being STORED, `staticSafe` stops a signed-in visitor being
   * SERVED a stored copy, and the guard's own header says the edge looks a URL
   * up before any function runs, so cookies are not in its key.
   */
  {
    name: 'a publicly cached route loses the cookie condition that stops a signed-in render being stored',
    guard: `${GUARDS}/edge-cache-is-viewer-independent.mjs`,
    file: 'next.config.ts',
    find: "        source: '/events',\n        missing: [{ type: 'cookie', key: 'el-signed-in' }],",
    replace: "        source: '/events',",
    expect: 'edge-cached publicly with no',
  },
  {
    name: 'a publicly cached page goes back to the per-viewer header',
    guard: `${GUARDS}/edge-cache-is-viewer-independent.mjs`,
    file: 'src/app/events/page.tsx',
    find: '      <SiteHeader staticSafe />',
    replace: '      <SiteHeader />',
    expect: 'which reads the session',
  },
  {
    name: 'the shelf life in the header rule and the one in the page stop agreeing',
    guard: `${GUARDS}/edge-cache-is-viewer-independent.mjs`,
    file: 'src/app/events/page.tsx',
    find: 'export const revalidate = 60',
    replace: 'export const revalidate = 300',
    expect: 'answer the same question',
  },
  {
    name: 'a cache rule is left behind pointing at a route that has moved',
    guard: `${GUARDS}/edge-cache-is-viewer-independent.mjs`,
    file: 'next.config.ts',
    find: "        source: '/events',\n        missing:",
    replace: "        source: '/events-moved-away',\n        missing:",
    expect: 'no page route answers it under src/app',
  },

  /*
   * THE CATALOGUE IN EVERY DOCUMENT, FOUR DRILLS (close-out C8B.3,
   * 19 September 2026), one per clause of the CONTRACT half.
   *
   * The half that WEIGHS runs from npm's postbuild with --built, and it cannot
   * be drilled here because this harness mutates source and runs a guard: there
   * is no build in the loop. IT HAS BEEN SEEN RED ANYWAY, and on the real defect
   * rather than a planted one. Run against the gate build of 19 September 2026
   * made BEFORE the fix it refused 42 documents carrying 150,360 bytes of
   * catalogue, exit 1, and the output is kept at
   * C:\dev\EVIDENCE\C8B3-CATALOGUE\guard-red-on-champion.txt. Saying which half
   * is drilled here and which was drilled by hand is the point: claiming both
   * were drilled the same way is the shape this harness exists to stop.
   *
   * THE FOURTH DRILL IS THE ONE THAT MATTERS. This guard passes by finding
   * NOTHING, so a blind matcher and a clean platform produce the same green.
   * That drill blinds the matcher and proves the calibration catches it.
   */
  {
    name: 'the field the catalogue matcher is anchored on is renamed in its row type',
    guard: `${GUARDS}/no-catalogue-in-every-document.mjs`,
    file: 'src/lib/locations/picker-cities.ts',
    /*
     * THE FIRST VERSION OF THIS DRILL DID NOT FIRE, and the guard was the thing
     * that was wrong. Its clause searched the whole file, and `isLaunchCity` is
     * written four times there, so renaming the DECLARATION left three
     * assignments carrying the string and the guard passed on a tree where the
     * field it is anchored on no longer existed. The clause is now scoped to the
     * exported row type, which is the one place the name has to be.
     */
    find: '  /** True when the slug matches a LAUNCH_TARGET_CITIES entry. */\n  isLaunchCity: boolean',
    replace: '  /** True when the slug matches a LAUNCH_TARGET_CITIES entry. */\n  isCuratedLaunchCity: boolean',
    expect: 'no longer appears in PickerCity',
  },
  {
    name: 'the endpoint that replaced the prop is pointed at a file that is not there',
    guard: `${GUARDS}/no-catalogue-in-every-document.mjs`,
    file: 'scripts/perf/lib/catalogues.mjs',
    find: "    servedBy: 'src/app/api/location/cities/route.ts',",
    replace: "    servedBy: 'src/app/api/location/cities-renamed/route.ts',",
    expect: 'is not in the tree',
  },
  {
    name: 'postbuild stops running the half that actually weighs a document',
    guard: `${GUARDS}/no-catalogue-in-every-document.mjs`,
    file: 'package.json',
    find: ' && node scripts/guards/no-catalogue-in-every-document.mjs --built',
    replace: '',
    expect: 'there is no proof at all, only a promise',
  },
  {
    name: 'the matcher goes blind on the unescaped payload and the calibration catches it',
    guard: `${GUARDS}/no-catalogue-in-every-document.mjs`,
    file: 'scripts/perf/lib/document-weight.mjs',
    /*
     * The optional backslash is what lets ONE matcher read both the escaped form
     * inside a flight chunk and the plain form inside an .rsc payload. Making it
     * mandatory leaves the guard reading .html perfectly and blind to every .rsc
     * file in the build, which is exactly the half-blindness no green run could
     * ever show. The calibration's second probe is the plain form, so it is the
     * thing that notices.
     */
    find: 'new RegExp(`\\\\\\\\?"${marker}\\\\\\\\?":`',
    replace: 'new RegExp(`\\\\\\\\"${marker}\\\\\\\\":`',
    expect: 'CALIBRATION FAILED',
  },
  /* ---------------------------------------------------------------------
   * class-lists-are-not-repeated-per-card (close-out C8B.3, 19 Sept 2026).
   * One drill per clause, plus the calibration. Clause C passes by finding
   * NOTHING, so the calibration drill is the one that matters most: it is the
   * only one that proves a blinded matcher refuses instead of reporting green.
   * ------------------------------------------------------------------- */
  {
    name: 'a composite the home cards render on every card is deleted from globals.css',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/app/globals.css',
    find: '@utility home-card-surface {',
    replace: '@utility home-card-surface-renamed {',
    expect: 'is not defined in src/app/globals.css',
  },
  {
    name: 'a card component re-inlines the class list the composite replaced',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/components/features/home/cards.tsx',
    find: "const SURFACE = 'group h-full home-card-surface'",
    replace: "const SURFACE = 'group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-[var(--shadow-card)] transition-[transform,box-shadow,color] duration-200 ease-out hover:-translate-y-1'",
    expect: 'character class literal (limit 120 in a per-card file)',
  },
  {
    name: 'a new class literal over the platform limit arrives outside the reviewed baseline',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/components/features/home/sounds-rail.tsx',
    find: "const IMG_MOTION = 'home-card-zoom'",
    replace: "const IMG_MOTION = 'home-card-zoom'\nconst DRILL_ONLY = 'flex w-full flex-col items-center justify-between gap-4 rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-6 text-sm font-semibold uppercase tracking-widest text-[var(--text-primary)] shadow-[var(--shadow-card)] transition-[transform,box-shadow,color] duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'",
    expect: 'character class literal (limit 400)',
  },
  /* ---------------------------------------------------------------------
   * The BROWSE card family (EventCard), added 19 September 2026 with the
   * second collapse. Two drills rather than four: clause B and the
   * calibration are family-agnostic and are already drilled above, so
   * repeating them would prove the same code twice. What is genuinely new is
   * that clause A now judges two more files and twelve more composites, and
   * each half of that is drilled here.
   * ------------------------------------------------------------------- */
  {
    name: 'a composite the browse card renders on every card is deleted from globals.css',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/app/globals.css',
    find: '@utility event-card-body {',
    replace: '@utility event-card-body-renamed {',
    expect: '@utility event-card-body is not defined in src/app/globals.css',
  },
  {
    name: 'the browse card re-inlines the 428-character list the composite replaced',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/components/features/events/event-card.tsx',
    find: 'className="group event-card-surface"',
    replace:
      'className="group card-hover-transition flex flex-col rounded-2xl overflow-hidden bg-[var(--surface-0)] border border-[var(--surface-2)] shadow-[var(--shadow-card)] hover:-translate-y-1 hover:border-[var(--surface-2)] hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"',
    expect: 'character class literal (limit 120 in a per-card file)',
  },
  /* The SHARED CHROME, added 19 September 2026 with the third collapse. One
   * drill per half of the new contract: the composite itself, and clause A2's
   * exact call-site rule, which is what catches a link family going back to
   * writing its class list out once per link on every page. */
  {
    name: 'a chrome composite every page renders per link is deleted from globals.css',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/app/globals.css',
    find: '@utility chrome-footer-link {',
    replace: '@utility chrome-footer-link-renamed {',
    expect: '@utility chrome-footer-link is not defined in src/app/globals.css',
  },
  {
    name: 'the header nav goes back to writing its 338-character class list per link',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/components/layout/site-header-client.tsx',
    find: 'className="chrome-nav-link"',
    replace:
      'className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium text-white/85 hover:text-[var(--brand-accent)] transition-colors whitespace-nowrap rounded-lg"',
    expect: 'does not reference chrome-nav-link',
  },
  {
    name: 'every interior template stops skipping below-fold layout because ContentSection dropped the class',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/components/layout/ContentSection.tsx',
    find: "className={`${skipOffscreen ? 'cv-section ' : ''}relative",
    replace: "className={`${skipOffscreen ? '' : ''}relative",
    expect: 'does not reference cv-section',
  },
  {
    /* cv-section is not a class list; it is held by the same guard because it
     * fails the same way - a one-line deletion that costs measured
     * milliseconds on every homepage visit and breaks no test. */
    name: 'the homepage rails stop skipping below-fold layout because SECTION_RAIL lost the class',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'src/lib/ui/spacing.ts',
    find: "export const SECTION_RAIL    = 'cv-section py-6 sm:py-8' as const",
    replace: "export const SECTION_RAIL    = 'py-6 sm:py-8' as const",
    expect: 'does not reference cv-section',
  },
  {
    name: 'the flight matcher goes blind and the calibration refuses rather than reporting a clean build',
    guard: `${GUARDS}/class-lists-are-not-repeated-per-card.mjs`,
    file: 'scripts/guards/class-lists-are-not-repeated-per-card.mjs',
    find: "const CLASS_FLIGHT = new RegExp(`className${BS}${BS}\":${BS}${BS}\"([^${BS}${BS}]{20,})${BS}${BS}\"`, 'g')",
    replace: "const CLASS_FLIGHT = new RegExp(`classNameXX${BS}${BS}\":${BS}${BS}\"([^${BS}${BS}]{20,})${BS}${BS}\"`, 'g')",
    expect: 'REFUSING: the calibration probe was found',
  },

  /*
   * THE RESERVED HEIGHT OF AN EVENT GRID, FIVE DRILLS, ONE PER CLAUSE
   * (close-out C8B.3, 19 September 2026).
   *
   * The guard holds a number that is EXACT today - the reservation reproduces
   * the measured section to within a pixel - and an exact number is a claim
   * about eight pieces of markup that do not announce themselves when they
   * change. Each drill below moves one of them and shows the build refusing.
   */
  {
    name: 'reserved height: an event grid goes back to laying out in full before first paint',
    guard: `${GUARDS}/event-grid-reserves-its-own-height.mjs`,
    file: 'src/components/templates/SuburbLandingPage.tsx',
    find: '        intrinsicSize={eventGridIntrinsicSize(shownEvents.length)}',
    replace: '        skipOffscreen={false}',
    expect: 'reserves a rail',
  },
  {
    name: 'reserved height: a section reserves room for the array it was handed and renders a slice of it',
    guard: `${GUARDS}/event-grid-reserves-its-own-height.mjs`,
    file: 'src/components/templates/CityLandingPage.tsx',
    find: '        intrinsicSize={eventGridIntrinsicSize(shownEvents.length)}',
    replace: '        intrinsicSize={eventGridIntrinsicSize(allEvents.length)}',
    expect: 'and renders shownEvents.map',
  },
  {
    name: 'reserved height: the grid gutter is widened and the reservation is left describing the old one',
    guard: `${GUARDS}/event-grid-reserves-its-own-height.mjs`,
    file: 'src/lib/ui/event-grid-intrinsic.ts',
    find: "  gridClass: 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3',",
    replace: "  gridClass: 'grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3',",
    expect: 'the gutter is 24px, which is gap-6',
  },
  {
    name: 'reserved height: the spacing scale is redefined under a module that reads it as pixels',
    guard: `${GUARDS}/event-grid-reserves-its-own-height.mjs`,
    file: 'src/app/globals.css',
    find: '  --container-7xl: 87.5rem; /* 1400px */',
    replace: '  --container-7xl: 87.5rem; /* 1400px */\n  --spacing: 0.3rem;',
    expect: 'declares --spacing:',
  },
  {
    name: 'reserved height: the reservation switches to the two-column height at the wrong breakpoint',
    guard: `${GUARDS}/event-grid-reserves-its-own-height.mjs`,
    file: 'src/app/globals.css',
    find: '@media (width >= 48rem) {',
    replace: '@media (width >= 40rem) {',
    expect: 'does not declare the md reservation on .cv-measured at 48rem',
  },
  {
    name: 'reserved height: the drive goes back to comparing a content box with a border box',
    guard: `${GUARDS}/event-grid-reserves-its-own-height.mjs`,
    file: 'scripts/verify/event-grid-intrinsic-drive.mjs',
    find: '          const reservedBorderBox = estimate + (g.sectionPadTop ?? 0) + (g.sectionPadBottom ?? 0)',
    replace: '          const reservedBorderBoxRenamed = estimate',
    expect: "no longer adds the section's padding",
  },
  {
    name: 'reserved height: the stylesheet formula is edited by hand and stops matching the module',
    guard: `${GUARDS}/event-grid-reserves-its-own-height.mjs`,
    file: 'src/app/globals.css',
    find: '+ 168.5px) + 88px);',
    replace: '+ 168.5px) + 96px);',
    expect: 'does not declare the base reservation the module generates',
  },
]

/** Run a guard as the runner would; a drill may add environment (never replace it). */
function run(guard, env = null) {
  const r = spawnSync(process.execPath, [join(ROOT, guard)], { encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/**
 * Anchors are written with plain newlines, but the working tree on Windows
 * holds CRLF. Matching literally made two drills silently report STALE, which
 * is the exact failure mode this harness exists to prevent: a drill that never
 * runs looks the same as a drill that passes if nobody reads the summary.
 * Matching line-ending agnostically removes the trap.
 */
function anchorRegex(anchor) {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped.replace(/\r?\n/g, '\\r?\\n'))
}

/*
 * CRASH SAFETY, WHICH THE `finally` BELOW IS NOT.
 *
 * The header of this file used to claim that restoring in a `finally` meant "an
 * interrupted run cannot leave a mutated tree behind". A `finally` runs when the
 * block exits and does not run when the process is killed, and this harness has
 * now been killed mid-drill twice: power loss on 16 September 2026, which put
 * `process.exit(1)` into no-control-characters.mjs and into commit 1aa059f6, and
 * a usage-limit kill on 17 September, which left `<LoginForm googleEnabled={true} />`
 * in the login page while the push lane measured a bundle baseline against it.
 *
 * So the original bytes are now written to the journal BEFORE the file is
 * touched, and the entry is deleted only after the restore is OBSERVED. A killed
 * run leaves its entry, scripts/guards/no-drill-residue.mjs fails the build while
 * any entry exists, and `--restore` puts every journalled file back in one
 * command. The full reasoning lives in scripts/verify/lib/drill-journal.mjs.
 *
 * The signal handlers below are a courtesy, not the mechanism: they catch a
 * Ctrl-C or a `taskkill` without `/f`, and they cannot catch a SIGKILL or a
 * power cut. Only the journal covers those, which is the whole point of putting
 * the safety net on disk instead of in the process.
 */
/*
 * A PREVIOUS RUN'S DAMAGE IS REPAIRED BEFORE THIS ONE PLANTS ANYTHING, because
 * a drill that reads a mutated file as its "original" would record the sabotage
 * as the thing to restore to, and the residue would become permanent at the
 * moment it was next drilled.
 */
{
  const { restored, stuck } = journal.restoreAll(ROOT)
  for (const f of restored) console.log(`[drills] a previous run was interrupted; restored ${f}`)
  if (stuck.length > 0) {
    for (const s of stuck) console.error(`[drills] COULD NOT RESTORE ${s.entryPath}: ${s.why}`)
    console.error('[drills] refusing to drill on a tree whose previous damage cannot be undone.')
    process.exit(1)
  }
}

/** Open handles, so a caught signal can put every one of them back. */
const openHandles = new Set()

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => {
    for (const h of openHandles) {
      try {
        writeFileSync(h.path, h.handle.original)
        journal.close(ROOT, h.handle)
      } catch (error) {
        /*
         * The journal entry survives this, and no-drill-residue will refuse the
         * next build because of it, which is the designed outcome. The error is
         * still named: a reader who sees the guard fire tomorrow should be able
         * to find the reason the automatic restore could not happen today.
         */
        console.error(
          `[drills] could not restore ${h.handle.relPath} on ${signal}, so its journal entry stands: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    console.error(`\n[drills] ${signal}: restored ${openHandles.size} mutated file(s) and exited.`)
    process.exit(130)
  })
}

let passed = 0
const failed = []

/*
 * --only <substring> RUNS A SUBSET, AND SAYS SO LOUDLY EVERY TIME.
 *
 * Added 18 September 2026 while drilling eleven guards that had never been seen
 * to fail. Iterating on one drill's expected reason meant running all 270 of
 * them, each spawning a guard, which is minutes per attempt and mutates the
 * working tree the whole time, on a machine three lanes share.
 *
 * THE DANGER IS OBVIOUS AND IS DESIGNED AGAINST: a filtered run that looks like
 * a full one is a green light nobody earned. So a filtered run announces the
 * filter before it starts, prints SUBSET on every summary line, and ends with a
 * final line that says in words that this is NOT the full harness. The
 * pre-push gate and every other caller pass no argument and are unaffected.
 *
 * 18 September 2026, the merge: LANE A WROTE THE SAME FLAG ON THE SAME DAY, in
 * the same file, and the two declarations collided on `onlyAt`, so keeping both
 * was a SyntaxError rather than a choice. This one is kept because it is the
 * superset: it accepts a comma separated list, matches a GUARD PATH as well as a
 * drill name, and refuses a `--only` with no argument at all. Lane A's version
 * matched one substring against names only. Its reasoning is kept here because
 * it names a cost this comment did not: two of these drills run the WHOLE guard
 * runner, so a full pass is minutes rather than seconds, and a new drill entry
 * that was never executed looks identical to one that passed.
 */
const onlyAt = process.argv.indexOf('--only')
const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]
if (onlyAt !== -1 && !only) {
  console.error('--only needs a substring to match drill names against')
  process.exit(2)
}
const onlyParts = only ? only.split(',').map((p) => p.trim()).filter(Boolean) : []
const selected = only
  ? DRILLS.filter((d) => onlyParts.some((p) => d.name.includes(p) || d.guard.includes(p)))
  : DRILLS
if (only && selected.length === 0) {
  console.error(`--only ${only} matched no drill. Nothing was run, which is not a pass.`)
  process.exit(2)
}

console.log('\n=== GUARD FAILURE DRILLS ===\n')
if (only) {
  console.log(`*** SUBSET ONLY: --only ${only} selected ${selected.length} of ${DRILLS.length} drills. ***`)
  console.log('*** This is NOT the full harness and must never be quoted as one. ***\n')
}
console.log('Each drill introduces a real regression, runs the guard, and restores the file.\n')

for (const drill of selected) {
  /*
   * A drill that could not aim is STALE, exactly like a missing anchor: it is
   * reported as a problem and fails the harness, never skipped in silence.
   */
  if (drill.stale) {
    failed.push(`${drill.name}: the drill could not aim (${drill.stale}). The drill is stale.`)
    console.log(`  STALE  ${drill.name}`)
    continue
  }

  /*
   * A drill plants its fault by mutating a file (`file`, `find`, `replace`) or
   * by environment alone (`env`), when the fault is real and lives outside the
   * tree. A file drill is restored in the finally whatever happens.
   */
  const mutates = Boolean(drill.file)
  const path = mutates ? join(ROOT, drill.file) : null
  const original = mutates ? readFileSync(path, 'utf8') : null
  const anchor = mutates ? anchorRegex(drill.find) : null
  if (mutates && !anchor.test(original)) {
    failed.push(`${drill.name}: anchor text not found in ${drill.file}. The drill is stale.`)
    console.log(`  STALE  ${drill.name}`)
    continue
  }

  /*
   * The journal entry is written BEFORE the mutation, never after, so the
   * window in which the tree is mutated and unrecorded does not exist.
   */
  let handle = null
  try {
    if (mutates) {
      handle = journal.open(ROOT, drill.file, { drill: drill.name, planted: drill.replace })
      openHandles.add({ path, handle })
      writeFileSync(path, original.replace(anchor, drill.replace))
    }
    const { code, out } = run(drill.guard, drill.env ?? null)

    /*
     * A drill that asserts the guard STAYS QUIET. Added 28 August 2026 with the
     * labelled-form-controls guard, because for that guard the dangerous
     * failure is the false positive: it fails the build over working markup,
     * somebody switches it off, and the law loses its enforcement entirely.
     * `expectPass` names the mechanism that must have recognised the addition,
     * so a guard that passes for the WRONG reason still fails the drill.
     */
    if (drill.expectPass) {
      if (code !== 0) {
        failed.push(
          `${drill.name}: guard FAILED on legitimate markup. It is crying wolf.\n` +
            `      got: ${out.trim().split('\n').slice(-6).join(' / ')}`,
        )
        console.log(`  FALSE POSITIVE  ${drill.name}`)
        continue
      }
      if (!out.includes(drill.expectPass)) {
        failed.push(
          `${drill.name}: guard passed, but never reported recognising it via ${drill.expectPass}.`,
        )
        console.log(`  PASSED FOR THE WRONG REASON  ${drill.name}`)
        continue
      }
      passed += 1
      console.log(`  STAYS QUIET AS EXPECTED  ${drill.name}`)
      console.log(`      recognised via ${drill.expectPass}\n`)
      continue
    }

    if (code === 0) {
      failed.push(`${drill.name}: guard PASSED on a violating tree. It is not actually guarding.`)
      console.log(`  DID NOT FAIL  ${drill.name}`)
      continue
    }
    if (!out.includes(drill.expect)) {
      failed.push(
        `${drill.name}: guard failed, but not for the expected reason.\n` +
          `      expected to see: ${drill.expect}\n` +
          `      got: ${out.trim().split('\n').slice(0, 4).join(' / ')}`,
      )
      console.log(`  WRONG REASON  ${drill.name}`)
      continue
    }

    passed += 1
    const line = out
      .split('\n')
      .find((l) => l.includes(drill.expect))
      ?.trim()
    console.log(`  FAILS AS EXPECTED  ${drill.name}`)
    console.log(`      exit ${code}: ${line}\n`)
  } finally {
    if (mutates) {
      writeFileSync(path, original)
      /*
       * OBSERVED, NEVER ASSUMED. `close` re-reads the file and keeps the journal
       * entry when the bytes do not match, so a write that half-succeeded, on a
       * disk three worktrees share, leaves the alarm standing rather than a tree
       * that only looks restored.
       */
      const closed = journal.close(ROOT, handle)
      if (!closed.ok) failed.push(`${drill.name}: ${closed.why}`)
      for (const h of openHandles) if (h.handle === handle) openHandles.delete(h)
    }
  }
}

// The tree must be clean again, and every guard green, or the harness itself
// has left damage behind.
console.log('--- restoring and re-verifying a clean tree ---')
const after = run(`${GUARDS}/run-guards.mjs`)
if (after.code !== 0) {
  failed.push('after restoring every drill, the guards do NOT pass. The tree may be dirty.')
  console.log(after.out)
} else {
  console.log('  all guards PASS on the restored tree.')
}

console.log(`\n=== ${passed}/${selected.length} drills fired correctly ===\n`)
if (only) {
  console.log(`*** SUBSET ONLY: ${selected.length} of ${DRILLS.length} drills ran, filtered by --only ${only}. ***`)
  console.log('*** The full harness has NOT been run. Run it with no arguments before claiming it green. ***\n')
}

if (failed.length > 0) {
  for (const f of failed) console.error(`  PROBLEM: ${f}`)
  process.exit(1)
}
