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
 * The five seating screens, and the one anchor three of their drills share.
 * Named here because the seat chart's paging order is four lines long, and
 * repeating a four-line anchor in three drills is how an anchor drifts out of
 * step with the file it has to match exactly.
 */
const SEATING_SEATS = 'src/app/(dashboard)/dashboard/events/[id]/seats/page.tsx'
const SEATING_KIT = 'src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx'
const SEATING_LIST = 'src/app/(dashboard)/dashboard/events/page.tsx'
const SEATING_MAPS = 'src/app/(dashboard)/dashboard/venues/[id]/seat-maps/page.tsx'
const SEATING_ACTIONS = 'src/app/(dashboard)/dashboard/venues/[id]/seat-maps/actions.ts'
const SEATING_SEAT_ORDER =
  "        .order('row_label')\n" +
  "        .order('seat_number')\n" +
  "        .order('id')\n" +
  '        .range(from, to),'

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

/**
 * The digest's per-city consent audience, paged and totally ordered. Shared by
 * three drills because clause 1, clause 2 and the plausible wrong fix are three
 * different ways to break the same four lines.
 */
const AUDIENCE_PAGE =
  "        .eq('city_slug', citySlug)\n" +
  "        .order('granted_at', { ascending: true })\n" +
  "        .order('id', { ascending: true })\n" +
  '        .range(from, to),\n'

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
   * THE ARTIST FAMILY, TWO DRILLS (19 September 2026).
   *
   * The first is the defect that exposed the gap, reproduced rather than
   * described: on 19 September the sitemap advertised four artist pages whose
   * only events had ended, and the reachability crawl found one answering 200
   * with nothing on the site linking to it. Deleting the listing window from
   * the reader re-creates exactly that, and TEST still holds those four cold
   * artists, so the drill has real rows to go wrong with rather than a fixture.
   *
   * The second is the 42703 again, asked of the family that had no guard at
   * all until now. It is the one that hid the venue block for its whole life.
   */
  {
    name: 'the artist reader forgets the listing window, so artists whose events have ended are advertised again',
    guard: `${GUARDS}/sitemap-covers-the-catalogue.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: "        .filter(e => typeof e.start_date === 'string' && isStillListed(e, now))",
    replace: "        .filter(e => typeof e.start_date === 'string')",
    expect: 'artists URL(s) in the sitemap have no row behind them and would answer 404',
  },
  {
    name: 'the artist query names a column that does not exist, so the family would publish nothing',
    guard: `${GUARDS}/sitemap-covers-the-catalogue.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: "      .select('slug, updated_at')\n      .in('id', artistIds)",
    replace: "      .select('handle, updated_at')\n      .in('id', artistIds)",
    expect: 'the sitemap would publish NO artists URL at all and say nothing about it',
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
    /*
     * RE-ANCHORED TWICE, and the second time is the interesting one.
     *
     * 20 September 2026: the layout moved from `afterTheFactEventExists(slug)`
     * to `fetchAfterTheFactEvent`, the row-returning reader on the same module,
     * and the guard's clause was re-derived to accept any function the door
     * EXPORTS rather than one typed name.
     *
     * 21 September 2026, close-out C8: the layout, `generateMetadata` and the
     * page were collapsed onto ONE memoised resolver, so neither surface names
     * the door any more - the resolver does, once, for both. The guard now
     * follows value imports to find who consults it. This drill therefore
     * removes the CALL from the resolver, which takes the door away from BOTH
     * surfaces at once, and the guard has to name both.
     */
    name: 'the shared event resolver stops consulting the after-the-fact door',
    guard: `${GUARDS}/event-lifecycle-total.mjs`,
    file: 'src/lib/events/event-detail-read.ts',
    find: '  return fetchAfterTheFactEvent<FullEvent>(slug, EVENT_PAGE_SELECT)',
    replace: '  return null // lane-C drill: the door removed',
    expect: 'no longer consults the after-the-fact door',
  },
  {
    /*
     * THE OTHER HALF OF THE SAME CLAUSE, AND IT IS NEW ON 21 SEPTEMBER 2026.
     *
     * The drill above breaks the door. This one leaves the door alone and
     * breaks the PATH TO IT from one surface, which is the failure the
     * import-following derivation exists to catch and which the old
     * one-file-one-name version could not have expressed: the layout stops
     * importing the shared resolver, so it reaches the after-the-fact door
     * through nothing, while the page still does. A guard that only asked
     * "does this file say the name" would have been satisfied by neither file
     * saying it, which is the state the tree is legitimately in.
     */
    name: 'the events layout stops reaching the after-the-fact door at all',
    guard: `${GUARDS}/event-lifecycle-total.mjs`,
    file: 'src/app/events/[slug]/layout.tsx',
    find: "import { readEventForRoute } from '@/lib/events/event-detail-read'",
    replace: 'const readEventForRoute = async (_slug: string) => null // lane-C drill: the path removed',
    expect: 'src/app/events/[slug]/layout.tsx no longer consults the after-the-fact door',
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
    /*
     * Added 20 September 2026 with the clause it drills. This used to require
     * the identifier HERO_SCRIM_GRADIENT, and that wash was a percentage of the
     * band while the text is bottom-anchored, so it left the gold eyebrow at
     * 2.53:1 on two of the five homepage slides at 390. The clause now requires
     * the PROPERTY - the text sits inside the wash that is anchored to it - and
     * this drill is what proves the new clause can still fire.
     */
    name: 'the no-event hero paints its text outside the caption wash',
    guard: `${GUARDS}/homepage-hero-never-empty.mjs`,
    file: 'src/components/features/home/FeaturedHero.tsx',
    /* The anchor moved on 20 September 2026 and this drill went stale without
     * failing: <HeroCaption> gained `contentClassName`, because `.hero-enter`
     * staggers its DIRECT children and the caption puts two elements between
     * its own className and the text. A drill whose anchor no longer exists
     * reports "stale" rather than "guarded", which is the harness doing its
     * job; the fix is to follow the code, never to delete the drill. */
    find: '<HeroCaption className="max-w-2xl" contentClassName="hero-enter">',
    replace: '<div className="max-w-2xl">',
    expect: 'does not wrap its text in <HeroCaption>',
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
   * CLAUSES E AND F OF sitemap-resolves, THE ARTIST HALF (19 September 2026).
   *
   * Clause F is the one worth explaining. The comparison guard MODELS the
   * `broadcast_artists` gate because it cannot execute sitemap.ts, and a model
   * that drifts from the file drifts SILENTLY and in the worst direction:
   * delete the `if` and the model keeps agreeing with itself while production,
   * where that flag is OFF, hands Googlebot a 404 for every artist row on the
   * platform. Nothing else in the tree would notice. This drill deletes it.
   */
  {
    name: 'the artist block in the sitemap loses its feature-flag gate, which no comparison could see',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/app/sitemap.ts',
    find: "    if (await isFeatureEnabled('broadcast_artists')) {",
    replace: "    if (true) {",
    expect: 'outside any `if (await isFeatureEnabled(',
  },
  {
    name: 'the catalogue stops building an artists path, so the family disappears in silence',
    guard: `${GUARDS}/sitemap-resolves.mjs`,
    file: 'src/lib/seo/sitemap-catalogue.ts',
    find: "      rows.push({ path: `/artists/${slug}`,",
    replace: "      rows.push({ path: `/performers/${slug}`,",
    expect: 'no longer builds /artists/PARAM',
  },
  /*
   * one-weekend-definition, THREE DRILLS (19 September 2026).
   *
   * This definition has been got wrong SIX times. Four copies were found and
   * consolidated by the header on listing-window.ts; two more were still live
   * on 19 September and that consolidation had no way to see them. The first
   * two drills put each of those two back, in the exact shape it had. The
   * third is the quiet one: rename the definition and clause 1 becomes
   * unsatisfiable while a guard without clause 2 would report a pass on a tree
   * that no longer defines a weekend anywhere.
   */
  {
    name: 'the homepage builds its own weekend again, on a UTC day',
    guard: `${GUARDS}/one-weekend-definition.mjs`,
    file: 'src/app/page.tsx',
    find: "import { weekendWindowUtc } from '@/lib/events/listing-window'",
    replace: "const weekendWindowUtc = (n) => ({ from: new Date(n.setUTCHours(0,0,0,0)), to: new Date() })",
    expect: 'src/app/page.tsx decides something about the WEEKEND',
  },
  {
    name: 'the surprise label reads the server clock again, so a Monday morning is Weekend energy',
    guard: `${GUARDS}/one-weekend-definition.mjs`,
    file: 'src/app/api/home/surprise/route.ts',
    find: "import { listingWindowOrPredicate, localDayOfWeek, localHourOfDay } from '@/lib/events/listing-window'",
    replace: "const localDayOfWeek = (d) => d.getDay(); const localHourOfDay = (d) => d.getHours();",
    expect: 'src/app/api/home/surprise/route.ts decides something about the WEEKEND',
  },
  {
    name: 'the weekend definition is renamed, so every file is sent to a function that is not there',
    guard: `${GUARDS}/one-weekend-definition.mjs`,
    file: 'src/lib/events/listing-window.ts',
    find: "export function weekendWindowUtc(",
    replace: "export function weekendWindowUtcRenamed(",
    expect: 'no longer exports weekendWindowUtc',
  },
  /*
   * event-dates-in-the-event-zone, TWO DRILLS (19 September 2026).
   *
   * The first puts the defect back on the highest-traffic card on the
   * platform. Eight components shipped this shape at once and every morning
   * event in Australia showed the wrong DAY, because an event starting before
   * 10:00 AEST is on the previous day in UTC. The second is the quiet one: a
   * rename of the formatter everything is sent to, which without clause 2
   * would leave the guard giving an impossible instruction and reporting a
   * pass.
   */
  {
    name: 'a card pins its date to UTC again, so every morning event shows the previous day',
    guard: `${GUARDS}/event-dates-in-the-event-zone.mjs`,
    file: 'src/components/features/events/event-bento-tile.tsx',
    find: "          {formatEventDateShort(event.start_date, event.timezone)}",
    replace: "          {new Date(event.start_date).toLocaleDateString('en-AU', { timeZone: 'UTC' })}",
    expect: 'pins a date to UTC on a surface that renders for a reader',
  },
  {
    name: 'the shared date formatter is renamed, so every surface is sent to a function that is not there',
    guard: `${GUARDS}/event-dates-in-the-event-zone.mjs`,
    file: 'src/lib/dates/event-time.ts',
    find: "export function formatEventDateShort(",
    replace: "export function formatEventDateShortRenamed(",
    expect: 'no longer exports formatEventDateShort',
  },
  /*
   * weekend-surface-one-decision, SIX DRILLS, one per clause (19 September 2026).
   *
   * /this-weekend is the only page on the platform whose contents expire on a
   * schedule, so every one of these is a state the tree will genuinely be one
   * edit away from. The last one is the defect the item found rather than
   * introduced: a date preset that REPLACED the listing window instead of
   * narrowing it, which had /events?preset=weekend listing gigs that finished
   * yesterday while the homepage rail above the same link did not.
   */
  {
    name: 'the sitemap publishes the weekend even when nothing is on it',
    guard: `${GUARDS}/weekend-surface-one-decision.mjs`,
    file: 'src/app/sitemap.ts',
    find: '  if (isDiscoveryIndexable(weekendSurface.total, threshold)) {',
    replace: '  if (weekendSurface.total >= 0) {',
    expect: 'without an isDiscoveryIndexable',
  },
  {
    name: 'the page stops deciding its own robots directive from the weekend count',
    guard: `${GUARDS}/weekend-surface-one-decision.mjs`,
    file: 'src/app/this-weekend/page.tsx',
    find: '    ...(await discoveryIndexingFor(total, WEEKEND_SURFACE_PATH)),',
    replace: '    robots: { index: true, follow: true },',
    expect: 'does not decide its robots directive',
  },
  {
    name: 'the weekend surface is renamed, so the page and the sitemap are sent to a function that is not there',
    guard: `${GUARDS}/weekend-surface-one-decision.mjs`,
    file: 'src/lib/events/weekend-surface.ts',
    find: 'export async function loadWeekendSurface(',
    replace: 'export async function loadWeekendSurfaceRenamed(',
    expect: 'no longer exports loadWeekendSurface',
  },
  {
    name: 'the day split is renamed in the leaf, where the fixture seeder reads it from outside Next',
    guard: `${GUARDS}/weekend-surface-one-decision.mjs`,
    file: 'src/lib/events/weekend-days.ts',
    find: 'export function groupWeekendByDay<',
    replace: 'export function groupWeekendByDayRenamed<',
    expect: 'no longer exports groupWeekendByDay',
  },
  {
    name: 'the read module stops re-exporting the leaf, so one surface becomes two unrelated imports',
    guard: `${GUARDS}/weekend-surface-one-decision.mjs`,
    file: 'src/lib/events/weekend-surface.ts',
    find: "export * from './weekend-days'",
    replace: "export type { WeekendDay } from './weekend-days'",
    expect: 'no longer re-exports',
  },
  {
    name: 'the sitemap writes the weekend path as a literal, so two strings must match and nothing checks',
    guard: `${GUARDS}/weekend-surface-one-decision.mjs`,
    file: 'src/app/sitemap.ts',
    find: '      url: `${baseUrl}${WEEKEND_SURFACE_PATH}`,',
    replace: "      url: `${baseUrl}` + '/this-weekend',",
    expect: 'writes the path',
  },
  {
    name: 'the weekend page is reclassified always, so an empty weekend is published every week',
    guard: `${GUARDS}/weekend-surface-one-decision.mjs`,
    file: 'src/lib/seo/indexing-policy.ts',
    find: "{ route: '/this-weekend', klass: 'conditional'",
    replace: "{ route: '/this-weekend', klass: 'always'",
    expect: "must be 'conditional'",
  },
  {
    name: 'a date preset replaces the listing window again, so a finished gig is still on this weekend',
    guard: `${GUARDS}/weekend-surface-one-decision.mjs`,
    file: 'src/lib/events/fetchers.ts',
    find: '  q = q.or(listingWindowOrPredicate(now))',
    replace: '  if (!window) q = q.or(listingWindowOrPredicate(now))',
    expect: 'applies the listing window behind a condition',
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
    /*
     * RE-ANCHORED 20 September 2026: the read was wrapped in readEveryRow so it
     * PAGES instead of stopping at the thousandth suppression, which indented the
     * chain by two. The anchor carries that indentation deliberately, because the
     * bare .from('recovery_suppressions') also appears on an upsert in this file
     * and an anchor that matched both would rewrite whichever came first.
     */
    find: "      .from('recovery_suppressions')\n      .select('contact_email')",
    replace: "      .from('profiles')\n      .select('contact_email')",
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
   * generated-types-are-generated (20 September 2026), four drills. Three of
   * them put back a hand-edit that was really in src/types/database.ts on the
   * morning of that day, found when a push of 234 commits was refused at
   * types-drift: six arguments of write_pricing_rule typed as `| null`, a form
   * the generator has no way of emitting, and two entries sitting where a person
   * would put them rather than in the generator's ascending order. The fourth
   * drills the half neither of those exercised, a parameter's optionality, which
   * the generator decides from whether the SQL gives it a default.
   */
  {
    name: 'a table is typed into the generated types in the place a person would put it',
    guard: `${GUARDS}/generated-types-are-generated.mjs`,
    file: 'src/types/database.ts',
    find: '\n      payments: {',
    replace: '\n      aaa_payments: {',
    expect: 'Tables lists "organiser_sales_digest_sends" before "aaa_payments"',
  },
  {
    name: 'a function argument is hand-typed as nullable, which the generator never writes',
    guard: `${GUARDS}/generated-types-are-generated.mjs`,
    file: 'src/types/database.ts',
    find: '          p_created_by: string\n',
    replace: '          p_created_by: string | null\n',
    expect: 'write_pricing_rule.Args.p_created_by is typed "string | null"',
  },
  {
    name: 'a function argument is renamed in the types and no longer matches its migration',
    guard: `${GUARDS}/generated-types-are-generated.mjs`,
    file: 'src/types/database.ts',
    /*
     * RE-ANCHORED 20 September 2026 on the merged tree. 20260920000011 gave the
     * writer's five optional arguments real DEFAULTs, so the generator now emits
     * this one as `p_value_integer?`. That is the fix working, and the drill
     * follows the generator rather than pinning the shape it was written against.
     */
    find: '          p_value_integer?: number\n',
    replace: '          p_value_integers?: number\n',
    expect: 'write_pricing_rule takes [',
  },
  {
    name: 'a required argument is typed optional although its migration gives it no default',
    guard: `${GUARDS}/generated-types-are-generated.mjs`,
    file: 'src/types/database.ts',
    find: '          p_created_by: string\n          p_currency: string',
    replace: '          p_created_by: string\n          p_currency?: string',
    expect: 'write_pricing_rule.Args.p_currency is optional in the types',
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
    /*
     * RE-ANCHORED 21 September 2026, by the lane whose change moved it. The
     * layout no longer performs a read at all: close-out C8 collapsed this
     * route's three reads of one row onto one memoised resolver in
     * src/lib/events/event-detail-read.ts, and the layout now awaits that.
     *
     * THE DRILL STILL BELONGS ON THE LAYOUT AND NOT ON THE RESOLVER, and the
     * reason is a real limit of the guard rather than a preference: it judges
     * src/app alone, and says so in its own header. A drill planted in
     * src/lib would not go red, and a drill that cannot go red is worse than no
     * drill. The layout is where a future edit would most plausibly put this
     * shape back, because it is the file whose job is to decide existence.
     *
     * THE REPLACE IS THE HISTORICAL INCIDENT VERBATIM IN ITS ESSENTIALS: a
     * destructure that never binds `error`, deciding a 404. It keeps the
     * notFound() call, because without one the guard does not judge the file at
     * all and the drill would go green for the wrong reason.
     */
    find: '  const event = await readEventForRoute(slug)\n  if (!event) notFound()',
    replace:
      '  const supabase = createPublicClient()\n' +
      "  const { data: event } = await supabase.from('events').select('id').eq('slug', slug).maybeSingle()\n" +
      '  if (!event) notFound()',
    expect: 'discards the error of the read that decides',
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
   * fixtures-are-not-published, THE BULK SEED (lane B, 21 September 2026).
   *
   * `writesIn` was widened that day to read a row literal out of a `.map(`,
   * because lb-proofcount-drive is the first drive in the tree that seeds a
   * thousand rows and the guard's only remedy for an unreadable write is
   * "inline the literal at the call", which for a thousand rows means a
   * thousand round trips or an exemption.
   *
   * A widening is a place a rule can quietly stop applying, so this drills the
   * widened path itself: a mapped bulk insert that publishes its fixtures must
   * still be named. If this ever passes, the guard is reading the shape and
   * judging nothing.
   *
   * THE FIRST VERSION OF THIS DRILL WAS BLIND, and it is worth writing down
   * because it passed. It expected `events.visibility='public'`, which the
   * guard prints on EVERY run as part of its excused baseline, for other
   * drives. So the drill went green off a line that had nothing to do with the
   * mutation, and would have gone green with the widening judging nothing at
   * all. It is anchored now on `lb-proofcount-drive.mjs:`, the file-and-line
   * form the guard only ever emits for a real finding: a baseline line reads
   * "<drive>.mjs excused", with no colon and no line number.
   */
  {
    name: 'a thousand-row seed publishes its fixtures through a mapped insert',
    guard: `${GUARDS}/fixtures-are-not-published.mjs`,
    file: 'scripts/verify/lb-proofcount-drive.mjs',
    find: "          visibility: 'unlisted',",
    replace: "          visibility: 'public',",
    expect: 'lb-proofcount-drive.mjs:',
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
   * MONEY FIX A3 layer three, the three drills for clause four. The first is
   * the one that matters: a reconciliation that repairs what it finds destroys
   * the evidence of how the money came to be adrift, and it would do so while
   * reporting a clean balance every morning.
   */
  {
    name: 'the settlement reconciliation starts repairing what it finds instead of reporting it',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/platform-settlement-reconcile.ts',
    find: "      .select('reference_id')",
    replace: "      .upsert({ reference_id: 'repaired' })",
    expect: 'must only READ',
  },
  {
    name: 'a settlement finding stops naming the charge, so nobody can match it to money in Stripe',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/platform-settlement-reconcile.ts',
    find: '`${money} settled on the platform balance as charge ${chargeId} carrying no transfer_group, `',
    replace: '`${money} settled on the platform balance carrying no transfer_group, `',
    expect: 'name the charge id',
  },
  {
    name: 'the daily schedule is left pointing at a settlement job that judges nothing',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/app/api/cron/platform-settlement-reconcile/route.ts',
    find: 'report = await scanPlatformSettlement(createAdminClient(), {',
    replace: 'report = await noSuchScan(createAdminClient(), {',
    expect: 'judges nothing',
  },
  /*
   * MONEY FIX A3 LAYER TWO, the four drills for clause five.
   *
   * The first is the defect itself. The five sale columns are a CACHE of what
   * Stripe last said and nothing recorded WHEN, so a row that said "enabled"
   * six weeks ago and has heard nothing since was accepted exactly like one
   * confirmed a minute ago. The event publishes, tickets sell, and the first
   * person to find out is the organiser whose transfer fails after the night.
   */
  {
    name: 'a paid event publishes on a cached Stripe posture of any age again (the A3 layer two defect)',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/events/publish-gate.ts',
    find: 'if (reconcile === null || connectVerificationIsFresh(verifiedAt)) {',
    replace: 'if (reconcile === null || verifiedAt !== undefined) {',
    expect: 'never calls connectVerificationIsFresh',
  },
  {
    name: 'the publish gate stops reading the date its cached posture was verified',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/events/publish-gate.ts',
    find: ".select(`${ORG_SALE_FIELDS_SELECT}, stripe_status_verified_at`)",
    replace: '.select(ORG_SALE_FIELDS_SELECT)',
    expect: 'does not SELECT stripe_status_verified_at',
  },
  {
    name: 'the publish grant goes back to canSell, which the checkout would then refuse',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/events/publish-gate.ts',
    find: 'if (fresh.sellable) return { ok: true }',
    replace: 'if (fresh.canSell) return { ok: true }',
    expect: "grants a publish on reconcile's canSell",
  },
  {
    name: 'reading the account from Stripe stops recording that it was read',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/stripe/reconcile-connect.ts',
    find: '    stripe_status_verified_at: new Date().toISOString(),\n  }',
    replace: '  }',
    expect: 'never writes stripe_status_verified_at into the payload BEFORE the change test',
  },
  /*
   * MONEY FIX A4, the four drills for clause six.
   *
   * The first is the Afro-Fusion failure itself: two charges settled to the
   * platform account with nothing anywhere recording who they belonged to.
   */
  {
    name: 'a ticket charge stops recording where its money is owed (the Afro-Fusion failure)',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/create-platform-charge.ts',
    find: '  await recordOrderDestination({',
    replace: '  await Promise.resolve({',
    expect: "does not record where this order's money is owed",
  },
  {
    name: 'the order record loses one of the four facts A4 asks for',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/order-destination.ts',
    find: '    destination_recorded_at: now.toISOString(),',
    replace: '    recorded_at: now.toISOString(),',
    expect: 'the order record is missing destination_recorded_at',
  },
  {
    name: 'the record stops insisting it touched exactly one order, so an UPDATE matching nothing passes',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/lib/payments/order-destination.ts',
    find: 'if (!Array.isArray(data) || data.length !== 1) {',
    replace: 'if (!Array.isArray(data)) {',
    expect: 'does not assert that exactly one order row was updated',
  },
  {
    name: 'a checkout call site stops handing the charge its own order id',
    guard: `${GUARDS}/funds-reach-the-organiser.mjs`,
    file: 'src/app/actions/squad-checkout.ts',
    find: '      transferGroup: order_id,',
    replace: '      transferGroup: squad.id,',
    expect: 'pass transferGroup: order_id 2 time(s), not 3',
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
   * Clause 6, the attributedMoves register. Five drills rather than one,
   * because a single planted fault cannot tell a guard that checks six things
   * from a guard that checks one and returns early, which is how three blind
   * gates were found in this tree in four days.
   *
   * Every anchor below is a SINGLE line on purpose. perf-budget.json is
   * written with LF and checked out with CRLF on this host, and a multi-line
   * anchor is one normalisation away from silently matching nothing.
   *
   * The last drill is the one with teeth. It moves the MARK rather than the
   * explanation, which is the real way this rots: the number moves again, the
   * attribution beside it does not, and a superseded explanation reads exactly
   * like a current one.
   */
  {
    name: 'the register that explains why a mark went up is dropped',
    guard: `${GUARDS}/initial-bundle-budget.mjs`,
    file: 'perf-budget.json',
    find: '"attributedMoves": {',
    replace: '"attributedMovesGone": {',
    expect: 'rather than an object',
  },
  {
    name: 'an attributed move loses the cause it attributes to',
    guard: `${GUARDS}/initial-bundle-budget.mjs`,
    file: 'perf-budget.json',
    find: '"cause": "Commit 97c88c27,',
    replace: '"causeGone": "Commit 97c88c27,',
    expect: 'has no `cause`',
  },
  {
    name: 'an attributed move loses the method that established it',
    guard: `${GUARDS}/initial-bundle-budget.mjs`,
    file: 'perf-budget.json',
    find: '"method": "esbuild bundle of the route client graph',
    replace: '"methodGone": "esbuild bundle of the route client graph',
    expect: 'has no `method`',
  },
  {
    name: "an attributed move's arithmetic stops closing",
    guard: `${GUARDS}/initial-bundle-budget.mjs`,
    file: 'perf-budget.json',
    find: '"delta": 312,',
    replace: '"delta": 311,',
    expect: 'The arithmetic must close',
  },
  {
    name: 'the mark moves again and leaves its explanation behind',
    guard: `${GUARDS}/initial-bundle-budget.mjs`,
    file: 'perf-budget.json',
    find: '"/waitlist": 175939,',
    replace: '"/waitlist": 176939,',
    expect: 'past the 64-byte jitter allowance',
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
   * no-silent-row-ceiling, THE MARKETPLACE SCOPE (lane B, 21 September 2026),
   * two more drills.
   *
   * The first proves the new scope entry actually judges: the performer draw
   * totals, which /artists SORTS on, back to an unbounded read.
   *
   * The second aims at the suppression list, and it is the one worth having.
   * RAISED_WITH_ANOTHER_LANE exists so that one unbounded read in another
   * lane's file does not cost the other three files in that directory their
   * cover, which means it is the one structure in this guard that can hide a
   * defect. It is only safe while it is forced to shrink, so the case drilled
   * is the case that rots quietly: the read gets BOUNDED and the entry is left
   * behind, live, over a file and table nobody is judging any more.
   */
  {
    name: 'the performer draw totals go back to counting through an unbounded read',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/marketplace/showcase.ts',
    find: "            .in('link_id', chunk)\n            .order('id', { ascending: true })\n            .range(from, to)",
    replace: "            .in('link_id', chunk)\n            .range2(from, to)",
    expect: 'share_link_events with no bound',
  },
  /*
   * THIS PLANTS THE ENTRY IT DRILLS, for the reason recorded on the two
   * border drills of a-failed-read-is-not-a-fact-about-a-person: the entry
   * it used to edit was the unbounded push_subscriptions read lane B raised
   * on 21 September, lane C paged it the same afternoon, the guard refused
   * the stale entry and it went. An empty border list is the GOOD state and
   * the normal one, so a drill that can only run while a debt is outstanding
   * is a drill that stops running on the good days.
   */
  {
    /*
     * REWRITTEN BY LANE C, 21 September 2026, BECAUSE IT HAD GONE STALE AND A
     * STALE DRILL VERIFIES NOTHING WHILE LOOKING LIKE A DRILL.
     *
     * It used to mutate the ONE live entry in RAISED_WITH_ANOTHER_LANE. Lane C
     * bounded that read the same afternoon it was raised, the guard refused the
     * now-stale entry by name, the entry went, and this drill was left anchored
     * to text that no longer existed. The harness reported it as STALE rather
     * than as a pass, which is the only reason it was visible at all.
     *
     * It no longer depends on the list having anything in it: it ADDS an entry
     * naming a read that is bounded, which is precisely the condition the clause
     * refuses, so it keeps working whether the list is empty or full.
     */
    name: 'a read raised with another lane is bounded and the exemption is kept anyway',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'scripts/guards/no-silent-row-ceiling.mjs',
    find: 'const RAISED_WITH_ANOTHER_LANE = [',
    replace: "const RAISED_WITH_ANOTHER_LANE = [\n  {\n    file: 'src/lib/marketplace/notify.ts',\n    table: 'push_subscriptions',\n    lane: 'lane C',\n    since: '2026-09-21',\n    why: 'planted by a drill',\n  },",
    expect: 'no such read was found',
  },

  /*
   * no-silent-row-ceiling, THE STATS SCOPE AND THE COUNT CLAUSE (lane B,
   * 21 September 2026), four drills.
   *
   * `getPlatformStats` asked for `{ count: 'exact' }` and then deduped the BODY
   * of the same response for two of its three numbers, so past a thousand
   * published events /organisers would have printed a true total beside a
   * sample of it. The first two drills put each half of that back.
   *
   * THE THIRD IS THE ONE WORTH HAVING, and it is why the count clause is a
   * separate clause rather than a stricter bound. A `.limit()` satisfies the
   * boundedness clause completely while leaving the lie exactly as it was: the
   * header still carries the true total, the body is still a sample, and the
   * number derived from it is still printed beside a total it does not
   * describe. If the clause could be bought off with a bound, it would be
   * bought off by the first person who read the failure message and reached for
   * the cheapest thing that made it go away.
   *
   * The fourth aims at the scope entry itself: a directory name that no longer
   * exists sweeps nothing and reports PASS, which is how a scanner lies.
   */
  {
    name: 'the platform social proof goes back to reading every published event unbounded',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/stats/platform-stats.ts',
    find: "        .order('id', { ascending: true })\n        .range(from, to),",
    replace: "        .order('id', { ascending: true })\n        .range2(from, to),",
    expect: 'reads events with no bound',
  },
  {
    name: 'the social proof asks for an exact count and takes the rows back as well',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/stats/platform-stats.ts',
    find: "        .select('organisation_id, venue_city')",
    replace: "        .select('organisation_id, venue_city', { count: 'exact' })",
    expect: 'with a count: and no head: true',
  },
  {
    name: 'the count beside a sampled body is bought off with a stated limit, and must not be',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/stats/platform-stats.ts',
    find:
      "        .select('organisation_id, venue_city')\n        .eq('status', 'published')\n        .order('id', { ascending: true })\n        .range(from, to),",
    replace:
      "        .select('organisation_id, venue_city', { count: 'exact' })\n        .eq('status', 'published')\n        .order('id', { ascending: true })\n        .limit(5000),",
    expect: 'with a count: and no head: true',
  },
  {
    name: 'the stats scope is pointed at a directory that does not exist and would sweep nothing',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'scripts/guards/no-silent-row-ceiling.mjs',
    find: "  'src/lib/stats',",
    replace: "  'src/lib/platform-stats',",
    expect: 'a scope that scans nothing reports PASS',
  },

  /*
   * no-silent-row-ceiling, THE NOTIFICATION SCOPE (lane C, 21 September 2026),
   * four drills.
   *
   * This is the PRODUCT half of the guard's scope rather than a fourth marketing
   * surface, so it gets its own drills: the marketing drills above all live under
   * src/lib/{matching,audience}, and a scope entry with no drill of its own is a
   * scope entry nobody has watched fail.
   *
   * What the scope caught when it was added: the just-announced alert cron read
   * its follower lists unbounded, so past the ceiling a follower was never a
   * recipient on any run; and the daily sales digest read an organiser's
   * confirmed orders unbounded, so an organiser who sold past the ceiling in one
   * platform day was emailed a smaller amount than they took.
   */
  {
    name: 'the just-announced follower list goes back to being read unbounded',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/notifications/audience.ts',
    find: "        .order('organisation_id')\n        .order('user_id')\n        .range(from, to),",
    replace: '',
    expect: 'reads saved_organisers with no bound',
  },
  {
    name: 'the follower page loses the unique column that settles its boundary',
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/notifications/audience.ts',
    find: "        .order('followable_id')\n        .order('user_id')\n        .range(from, to),",
    replace: '        .range(from, to),',
    expect: 'pages follows with .range() and no .order()',
  },
  {
    name: "the daily sales digest goes back to reading an organiser's orders unbounded",
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/notifications/organiser-sales-digest.ts',
    find: "          .order('order_number')\n          .range(from, to),",
    replace: '',
    expect: 'reads orders with no bound',
  },
  {
    name: "the dispatcher's device read loses its stated limit",
    guard: `${GUARDS}/no-silent-row-ceiling.mjs`,
    file: 'src/lib/notifications/dispatch.ts',
    find: '    .limit(MAX_PUSH_ENDPOINTS_PER_USER)',
    replace: '',
    expect: 'reads push_subscriptions with no bound',
  },

  /*
   * one-name-for-where-you-were-going (lane C, 21 September 2026), four drills,
   * one per clause.
   *
   * The guard exists because twelve pages emitted /login?redirect= and NINE
   * emitted /login?next=, against a sign-in form that read only 'redirect'. All
   * nine of those deep links silently dropped the person on the dashboard. The
   * guard then found a TENTH the hand count had missed, ?returnUrl= on the
   * waitlist modal, which is drill three below and is the real regression.
   *
   * Clause four is the security half: the two copies of the is-this-path-safe
   * check had drifted, and the copy on the sign-in page accepted a backslash.
   */
  {
    name: 'the sign-in form goes back to reading the deep link itself',
    guard: `${GUARDS}/one-name-for-where-you-were-going.mjs`,
    file: 'src/components/auth/login-form.tsx',
    find: 'router.push(readRedirectParam(searchParams))',
    replace: "router.push(searchParams.get('redirect') ?? '/dashboard')",
    // The NEGATIVE clause is the one with teeth and so it is the one named
    // here: the form still calls readRedirectParam in its magic-link branch, so
    // a drill that only removed one of the two calls would have been satisfied
    // by a guard that could not tell two occurrences from one. That is exactly
    // what happened on the first run of this drill.
    expect: "reads the 'redirect' parameter directly",
  },
  {
    name: 'the resolver stops reading the spelling nine pages emit',
    guard: `${GUARDS}/one-name-for-where-you-were-going.mjs`,
    file: 'src/lib/auth/safe-redirect.ts',
    find: "params.get('redirect') ?? params.get('next')",
    replace: "params.get('redirect')",
    expect: "does not read the 'next' parameter",
  },
  {
    name: 'the waitlist modal goes back to a third spelling nothing reads',
    guard: `${GUARDS}/one-name-for-where-you-were-going.mjs`,
    file: 'src/components/waitlist/join-waitlist-modal.tsx',
    find: 'router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)',
    replace: 'router.push(`/login?returnUrl=${encodeURIComponent(window.location.pathname)}`)',
    expect: '/login?returnUrl=<a path>',
  },
  {
    name: 'an auth surface grows a second copy of the is-this-path-safe check',
    guard: `${GUARDS}/one-name-for-where-you-were-going.mjs`,
    file: 'src/app/api/auth/magic-link/route.ts',
    find: 'export const safeNextPath = safeRedirectPath',
    replace:
      'export const safeNextPath = (c) =>\n' +
      "  c && c.startsWith('/') && !c.startsWith('//') ? c : '/dashboard'",
    expect: 'tests for a protocol-relative path itself',
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
   * consent-dates-are-zoned CLAUSE 3 (lane B, 19 September 2026), four drills.
   *
   * The clause exists because this guard had a blind spot for a day: it read
   * three getters and two formatters, and could not see the COMMONEST way to
   * render a UTC date, which is slicing the first ten characters off an ISO
   * string. Four live renderings in its own path did exactly that while it
   * printed OK.
   *
   * THE FOURTH DRILL AIMS AT THE MATCHER RATHER THAN AT THE CODE, and it is the
   * one worth reading. It rebuilds ISO_SLICE inside a TEMPLATE LITERAL, where a
   * backslash class is not an escape, which is precisely how a guard in this
   * tree shipped blind on 18 September and reported PASS over the thing it
   * banned. The clause's own probes must catch that on every run.
   */
  {
    name: 'the matcher run date goes back to slicing the ISO string',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'src/app/admin/(authed)/matches/page.tsx',
    find: '{formatPlatformDate(run.started_at)}.',
    replace: '{new Date(run.started_at).toISOString().slice(0, 10)}.',
    expect: 'cuts a date out of .toISOString()',
  },
  {
    name: 'the match event picker goes back to slicing the stored instant',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'src/app/admin/(authed)/matches/match-run-form.tsx',
    find: '{event.title} ({event.dateLabel})',
    replace: '{event.title} ({event.startDate.slice(0, 10)})',
    expect: 'takes the first ten characters of startDate',
  },
  {
    name: 'the consent door goes back to slicing its own evidence date',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'src/lib/consent/decide.ts',
    find: 'reason: `granted on ${formatPlatformDate(deciding.occurredAt)} under wording',
    replace: 'reason: `granted on ${deciding.occurredAt.slice(0, 10)} under wording',
    expect: 'takes the first ten characters of occurredAt',
  },
  {
    /*
     * THIS ONE PROVES THE SCOPE RATHER THAN THE CLAUSE. The pricing screens were
     * outside the guard's directory list until 19 September, which is how a UTC
     * event date survived in the picker a fee override is attached from. If the
     * pricing directory ever leaves SCOPE again, this drill stops firing.
     */
    name: 'the fee-override picker goes back to slicing, in a directory the guard used not to sweep',
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'src/app/admin/(authed)/pricing/targets/route.ts',
    find: "const date = e.start_date ? formatEventDate(e.start_date, e.timezone) : ''",
    replace: "const date = e.start_date ? new Date(e.start_date).toISOString().slice(0, 10) : ''",
    expect: 'cuts a date out of .toISOString()',
  },

  /*
   * matcher-offers-an-event-not-yet-over (lane B, 19 September 2026), four
   * drills.
   *
   * The guard exists because the matcher's event picker read published public
   * events ordered ascending with no bound on time, which is the forty OLDEST
   * events the platform has ever had. On TEST that was 101 finished events and a
   * list beginning in June. Nothing threw and nothing was empty.
   *
   * THE SECOND DRILL IS THE ONE WORTH READING. It leaves the visibility rule in
   * place and only takes away the instant handed to it. The picker still behaves
   * correctly in production, and the bound becomes unprovable at any chosen
   * time, which is how a correct-looking read stops being testable without
   * anybody noticing.
   */
  {
    name: 'the matcher door stops composing the visibility rule and offers every event ever published',
    guard: `${GUARDS}/matcher-offers-an-event-not-yet-over.mjs`,
    file: 'src/lib/matching/events.ts',
    /*
     * THE ANCHOR CARRIES ITS NEXT LINE, and it has to. The call was unwrapped
     * from an `await` into a `readOrThrow(... () => ...)` thunk so the order and
     * the limit sit inside the chain no-silent-row-ceiling walks, which left
     * this drill matching `await applyPublicEventVisibility(` and finding
     * nothing: STALE, reported on 20 September 2026. The bare name is no good
     * either, because the comment fifteen lines above mentions it and would be
     * rewritten instead of the call.
     */
    find: "    applyPublicEventVisibility(\n      admin.from(\'events\')",
    replace: "    noVisibilityRuleAtAll(\n      admin.from(\'events\')",
    expect: 'no longer composes applyPublicEventVisibility',
  },
  {
    name: 'the matcher door keeps the rule but hands it no instant, so the bound cannot be proven',
    guard: `${GUARDS}/matcher-offers-an-event-not-yet-over.mjs`,
    file: 'src/lib/matching/events.ts',
    find: '    { now },',
    replace: '    {},',
    expect: 'hands it no instant',
  },
  {
    name: 'the matcher screen composes its own list of events beside the door',
    guard: `${GUARDS}/matcher-offers-an-event-not-yet-over.mjs`,
    file: 'src/app/admin/(authed)/matches/page.tsx',
    find: '  const admin = createAdminClient()',
    replace:
      "  const admin = createAdminClient(); const extra = await admin.from('events').select('id').limit(40)",
    expect: 'reads a LIST of events directly',
  },
  {
    name: "the matcher guard's own door disappears",
    guard: `${GUARDS}/matcher-offers-an-event-not-yet-over.mjs`,
    file: 'src/lib/matching/events.ts',
    find: 'export async function readMatchableEvents',
    replace: 'async function readMatchableEvents',
    expect: 'no longer exports readMatchableEvents',
  },

  /*
   * or-filter-values-are-escaped (lane B, 19 September 2026), five drills.
   *
   * The guard exists because a comma inside a PostgREST or(...) is GRAMMAR. An
   * unescaped term carrying one answers PGRST100, the route answers 500, and
   * the screen shows nothing with no way to know a comma was the reason. Four
   * of the first 320 event titles on TEST are of the shape
   * "Something Night, Geelong".
   *
   * THE LAST DRILL AIMS AT THE MATCHER RATHER THAN AT THE CODE. The clause that
   * accepts a file sanitising at its source is the weaker of the two tiers, and
   * if its pattern stops matching, two correct reads in fetchers.ts start
   * failing and somebody "fixes" a file that was never wrong.
   */
  {
    name: 'the fee-override picker goes back to interpolating a raw search term',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'src/app/admin/(authed)/pricing/targets/route.ts',
    find: ".or(ilikeAnyOf(['title', 'slug'], q))",
    replace: '.or(`title.ilike.${term},slug.ilike.${term}`)',
    expect: 'builds an or() ilike pattern by interpolation, unescaped',
  },
  {
    name: 'the founding-terms organisation search goes back to interpolating a raw term',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'src/app/admin/(authed)/network/page.tsx',
    find: "termQuery = termQuery.or(ilikeAnyOf(['name', 'slug'], foundingQuery))",
    replace: 'termQuery = termQuery.or(`name.ilike.%${foundingQuery}%,slug.ilike.%${foundingQuery}%`)',
    expect: 'builds an or() ilike pattern by interpolation, unescaped',
  },
  {
    name: 'the or() escape door stops exporting half of itself',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'src/lib/supabase/or-filter.ts',
    find: 'export function ilikeAnyOf',
    replace: 'function ilikeAnyOf',
    expect: 'no longer exports ilikeAnyOf',
  },
  {
    name: 'the or() guard sweeps no files at all while still reporting OK',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'scripts/guards/or-filter-values-are-escaped.mjs',
    find: `!/${BSL}.test${BSL}.tsx?$/.test(entry)) out.push(full)`,
    replace: `!/${BSL}.(ts|tsx)$/.test(entry)) out.push(full)`,
    expect: 'the sweep matched no files at all',
  },
  {
    name: "the or() guard's source-sanitiser matcher quietly stops matching",
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'scripts/guards/or-filter-values-are-escaped.mjs',
    find: 'const SANITISES_AT_SOURCE = /',
    replace: 'const SANITISES_AT_SOURCE = /never-matches-anything-at-all/; const UNUSED_SANITISES = /',
    expect: 'no longer matches',
  },

  /*
   * THE FIVE DEBTS LANE C PAID, one drill each (19 September 2026).
   *
   * They were in the register when the guard shipped, which meant the guard
   * PRINTED them and could not FAIL on them. They are ordinary files now, so
   * each drill puts the interpolation back and shows the build refusing. A debt
   * that is paid and not drilled is a debt that comes back on the next
   * copy-paste, which is how four of these five arrived in the first place.
   *
   * Measured against TEST before any of them was touched:
   *   .or(`title.ilike.%Night, Geelong%,slug.ilike.%Night, Geelong%`)
   *     -> PGRST100 failed to parse logic tree
   *   the same search, escaped -> 3 rows, all of the shape "... Night, Geelong"
   */
  {
    name: 'the admin user search goes back to interpolating a raw term, so "Smith, John" 500s',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'src/lib/admin/users.ts',
    find: "q = q.or(ilikeAnyOf(['email', 'full_name', 'display_name'], filters.search))",
    replace: 'q = q.or(`email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`)',
    expect: 'builds an or() ilike pattern by interpolation, unescaped',
  },
  {
    name: 'the admin event search goes back to interpolating a raw term',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'src/lib/admin/events.ts',
    find: "q = q.or(ilikeAnyOf(['title', 'slug'], filters.search))",
    replace: 'q = q.or(`title.ilike.%${filters.search}%,slug.ilike.%${filters.search}%`)',
    expect: 'builds an or() ilike pattern by interpolation, unescaped',
  },
  {
    name: 'the admin organiser search goes back to interpolating a raw term',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'src/lib/admin/organisers.ts',
    find: "q = q.or(ilikeAnyOf(['name', 'slug', 'email'], filters.search))",
    replace: 'q = q.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)',
    expect: 'builds an or() ilike pattern by interpolation, unescaped',
  },
  {
    name: 'the global admin search goes back to interpolating a raw term',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'src/lib/admin/search.ts',
    find: "or(ilikeAnyOf(['title', 'slug'], q))",
    replace: 'or(`title.ilike.%${q}%,slug.ilike.%${q}%`)',
    expect: 'builds an or() ilike pattern by interpolation, unescaped',
  },
  {
    name: 'the public organiser search scope goes back to its own private copy of the escape',
    guard: `${GUARDS}/or-filter-values-are-escaped.mjs`,
    file: 'src/lib/events/search-scopes.ts',
    find: "or(ilikeAnyOf(['name', 'slug'], term))",
    replace: 'or(`name.ilike.%${term}%,slug.ilike.%${term}%`)',
    expect: 'builds an or() ilike pattern by interpolation, unescaped',
  },

  /*
   * sr-only-cannot-escape-a-scroller, six drills (19 September 2026).
   *
   * sr-only is position:absolute, and an absolutely positioned element is
   * clipped by an ancestor's overflow ONLY when that ancestor is its CONTAINING
   * BLOCK. Nine containers held a screen-reader label and were not one, so the
   * label was laid out at its position in the FULL scroll width. Measured at 390:
   * /admin/users 569, /admin/events 594, /admin/organisers 605, against a
   * control of 390 on /admin/orders, whose table markup is identical and whose
   * cells carry no sr-only.
   *
   * ONE DRILL AIMS AT THE PREMISE RATHER THAN AT THE MARKUP. The rule is only
   * true while sr-only is absolutely positioned. If a stylesheet redefines it the
   * guard must say so loudly rather than keep failing builds over a rule that has
   * stopped being true.
   */
  {
    name: 'the admin user table stops being a containing block for its own screen-reader labels',
    guard: `${GUARDS}/sr-only-cannot-escape-a-scroller.mjs`,
    file: 'src/app/admin/(authed)/users/page.tsx',
    find: 'className="relative overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]"',
    replace: 'className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]"',
    expect: 'but is not a containing block',
  },
  {
    name: 'the admin event table stops being a containing block for its own screen-reader labels',
    guard: `${GUARDS}/sr-only-cannot-escape-a-scroller.mjs`,
    file: 'src/app/admin/(authed)/events/page.tsx',
    find: 'className="relative overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]"',
    replace: 'className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]"',
    expect: 'but is not a containing block',
  },
  {
    name: 'the fee table on /admin/pricing stops being a containing block',
    guard: `${GUARDS}/sr-only-cannot-escape-a-scroller.mjs`,
    file: 'src/app/admin/(authed)/pricing/page.tsx',
    find: 'className="relative overflow-x-auto rounded-lg border border-white/[0.08]"',
    replace: 'className="overflow-x-auto rounded-lg border border-white/[0.08]"',
    expect: 'but is not a containing block',
  },
  {
    name: "the organiser's GST report table stops being a containing block",
    /*
     * RE-AIMED 21 September 2026. The anchor was the whole class attribute
     * including `overflow-x-auto`, and the phone rebuild of this table
     * (a-table-a-phone-can-read) moved the scroller to `lg:overflow-x-auto`,
     * so the anchor stopped existing and the drill reported STALE, which is
     * the harness doing its job rather than a failure.
     *
     * The subject is unchanged and so is what it proves: this box still
     * scrolls from `lg` up and still holds an sr-only caption, so it must
     * still be a containing block. Only the attribute it lives in moved.
     */
    guard: `${GUARDS}/sr-only-cannot-escape-a-scroller.mjs`,
    file: 'src/app/(dashboard)/dashboard/reports/gst/page.tsx',
    find: 'className="relative rounded-xl border border-ink-200 bg-white max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent lg:overflow-x-auto"',
    replace: 'className="rounded-xl border border-ink-200 bg-white max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent lg:overflow-x-auto"',
    expect: 'but is not a containing block',
  },
  {
    name: 'the city picker dialog stops being a containing block for its own labels',
    guard: `${GUARDS}/sr-only-cannot-escape-a-scroller.mjs`,
    file: 'src/components/ui/location-picker-panel.tsx',
    find: 'className="relative flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden',
    replace: 'className="flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden',
    expect: 'but is not a containing block',
  },
  {
    name: "the premise moves: a stylesheet redefines sr-only and the guard refuses rather than judging on",
    guard: `${GUARDS}/sr-only-cannot-escape-a-scroller.mjs`,
    file: 'src/app/globals.css',
    find: ':root {',
    replace: '.sr-only { position: static; }\n:root {',
    expect: 'redefines .sr-only',
  },

  /*
   * a-hero-is-never-a-placeholder, five drills (19 September 2026).
   *
   * The link crawler found /categories/technology answering 500, linked from
   * /categories/music, with "[HeroMedia] image must be a raster URL (got SVG)"
   * in the log. The photo resolver answers "no photograph" with a branded SVG,
   * a non-empty string wins the `??` chain, and the hero's own bundled last
   * resort never ran. In PRODUCTION the assertion is compiled out, so the same
   * page would have served a hero that cannot be the LCP, silently.
   *
   * THE LAST TWO AIM AT THE GUARD'S OWN PREMISES rather than at the markup: the
   * refusal it protects, and the matcher that decides whether a chain ends on a
   * raster.
   */
  {
    name: 'the category page goes back to passing the placeholder straight into its hero',
    guard: `${GUARDS}/a-hero-is-never-a-placeholder.mjs`,
    file: 'src/app/categories/[slug]/page.tsx',
    find: 'heroImage={isBrandedFallbackPhoto(photo) ? null : photo.src}',
    replace: 'heroImage={photo.src}',
    expect: 'without asking isBrandedFallbackPhoto',
  },
  {
    name: 'a second file keeps its own private copy of the placeholder path',
    guard: `${GUARDS}/a-hero-is-never-a-placeholder.mjs`,
    file: 'src/lib/images/event-media.ts',
    find: 'const FALLBACK_POSTER = BRANDED_FALLBACK_PHOTO.src',
    replace: "const FALLBACK_POSTER = '/images/event-fallback-hero.svg'",
    expect: 'names the placeholder path',
  },
  {
    name: "the category hero's chain goes back to ending on whatever the caller passed",
    guard: `${GUARDS}/a-hero-is-never-a-placeholder.mjs`,
    file: 'src/components/templates/PhotographicCategoryHero.tsx',
    find: 'const src = spine?.src ?? HERO_RASTER_BY_SLUG[slug] ?? fallbackImage ?? HERO_RASTER_DEFAULT',
    replace: 'const src = spine?.src ?? HERO_RASTER_BY_SLUG[slug] ?? fallbackImage',
    expect: 'does not end on a bundled raster literal',
  },
  {
    name: 'HeroMedia stops refusing an SVG and the guard refuses rather than judging on',
    guard: `${GUARDS}/a-hero-is-never-a-placeholder.mjs`,
    file: 'src/components/media/HeroMedia.tsx',
    find: 'must be a raster URL',
    replace: 'must be a bitmap URL',
    expect: 'no longer refuses an SVG',
  },
  {
    name: "the raster-chain matcher quietly stops recognising a named constant",
    guard: `${GUARDS}/a-hero-is-never-a-placeholder.mjs`,
    file: 'scripts/guards/a-hero-is-never-a-placeholder.mjs',
    find: 'const RASTER_DECLARATION = /',
    replace: 'const RASTER_DECLARATION = /never-matches-anything-at-all/; const UNUSED_RASTER = /',
    expect: 'does not end on a bundled raster literal',
  },
  /*
   * hero-text-over-a-photograph, six drills (19 September 2026).
   *
   * Four hero templates each carried their own navy gradient, the four
   * disagreed, and every stop in all four was a percentage of the hero BAND
   * while the text is bottom-anchored and hugs its own content. So the wash
   * promised something about text it could not locate: the gold eyebrow on
   * /categories/technology measured 1.38:1 at 390, 3.33:1 at 768 and 10.67:1 at
   * 1440 against a floor of 4.5, on one page and one photograph. Across the
   * platform 301 of 795 measured runs failed, on 75 of 91 routes.
   *
   * THE LAST THREE AIM AT THE GUARD'S OWN PREMISES rather than at the markup:
   * the strength, the geometry that makes the strength mean anything, and the
   * component that actually paints it.
   */
  /*
   * THE SEVENTH AND EIGHTH AIM AT THE LIST ITSELF, added 20 September 2026.
   *
   * The guard opened by saying its heroes were "derived from the one thing they
   * all must do rather than listed", and then listed five files. The derivation
   * was performed for the first time on 20 September and returned THIRTEEN. The
   * eight that had never been on the list carried eight more hand-written navy
   * gradients, measured at 1.01:1 on /waitlist and /about and 1.04:1 on
   * /organisers against a 4.5:1 floor, while the guard printed PASS.
   *
   * Drill 7 breaks a hero the OLD hand-written list did not contain. Against
   * that list it could not have fired at all; against the derivation it must.
   * Drill 8 aims at the ratchet: the register's one non-border entry says the
   * empty state's photographic branch has no caller, and the guard must notice
   * the moment that stops being true.
   */
  {
    name: 'a hero the old hand-written list never held loses its caption',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/app/about/page.tsx',
    find: '<HeroCaption className="max-w-2xl" contentClassName="hero-enter">',
    replace: '<div className="max-w-2xl">',
    expect: 'src/app/about/page.tsx paints hero text without <HeroCaption>',
  },
  {
    name: 'the register says the empty state has no photographic caller, and a caller appears',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/templates/CityLandingPage.tsx',
    find: '<CategoryHeroEmpty\n            eyebrow={city.name.toUpperCase()}',
    replace: '<CategoryHeroEmpty\n            coverImage="/images/hero/curated-1.avif"\n            eyebrow={city.name.toUpperCase()}',
    expect: 'has stopped being true',
  },
  {
    /*
     * The ninth, and the one no drive could ever have replaced. `.hero-enter`
     * staggers its DIRECT children, and <HeroCaption> puts two elements between
     * its className and the text, so a stagger written there animates the wash
     * and the whole block rather than the eyebrow, headline, meta and CTA in
     * turn. The stagger is armed only under html[data-motion="1"], which
     * headless agents are deliberately never given, so every screenshot shows
     * the correct settled frame. This mistake was made for real while
     * converting the heroes on 20 September 2026.
     */
    name: 'a hero puts its child stagger two elements above the text it staggers',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/app/waitlist/page.tsx',
    find: '<HeroCaption className="max-w-2xl" contentClassName="hero-enter">',
    replace: '<HeroCaption className="max-w-2xl hero-enter">',
    expect: 'which is two elements above the text',
  },
  {
    name: 'a hero goes back to writing its own navy gradient',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/features/city/city-hero.tsx',
    find: 'style={{ background: HERO_HEADER_SCRIM }}',
    replace: "style={{ background: 'linear-gradient(180deg, rgba(10,22,40,0.36) 0%, rgba(10,22,40,0.88) 100%)' }}",
    expect: 'writes its own navy gradient',
  },
  {
    name: 'a hero paints its text outside the caption that carries the wash',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/templates/PhotographicCommunityHero.tsx',
    find: '<HeroCaption className="max-w-3xl">',
    replace: '<div className="max-w-3xl">',
    expect: 'without <HeroCaption>',
  },
  {
    name: 'a hero band loses the clip that trims the full-width bleed',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/templates/PhotographicCityHero.tsx',
    find: 'className="relative overflow-hidden"',
    replace: 'className="relative"',
    expect: 'does not clip its hero band',
  },
  {
    name: 'the caption wash is weakened below what the gold eyebrow needs',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/media/hero-photo-scrim.ts',
    find: 'export const HERO_CAPTION_MIN_ALPHA = 0.82',
    replace: 'export const HERO_CAPTION_MIN_ALPHA = 0.7',
    expect: 'under WCAG 2.2 SC 1.4.3',
  },
  {
    name: "the caption ramp goes back to a percentage, which is the original defect",
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/media/hero-photo-scrim.ts',
    find: "export const HERO_CAPTION_DEEPEN = '14rem'",
    replace: "export const HERO_CAPTION_DEEPEN = '100%'",
    expect: 'must not depend on the element',
  },
  {
    name: 'the caption component imports the wash and forgets to paint it',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/media/hero-caption.tsx',
    find: 'background: HERO_CAPTION_SCRIM,',
    replace: 'background: undefined,',
    expect: 'sits on nothing',
  },

  /*
   * hero-text-over-a-photograph, six more drills (20 September 2026), for the
   * SECOND derivation: the subject set stopped keying on the locked hero scale
   * and went from 13 files to 22. Five of the six below exercise a file the old
   * derivation could not see at all, and the sixth is the anti-false-positive.
   */
  {
    /*
     * THE ONE THAT PROVES THE WIDENING. `auth-shell.tsx` carries no hero scale
     * token, because it is not a hero, so no drill written before today could
     * have touched it and the guard could not have failed. It is also the file
     * whose wordmark was measured at 1.00:1 on every sign-in page.
     */
    name: 'the auth brand panel, which no hero-scale derivation could see, loses its caption',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/auth/auth-shell.tsx',
    find: '<HeroCaption className="z-10 flex w-full"',
    replace: '<div className="z-10 flex w-full"',
    expect: 'src/components/auth/auth-shell.tsx paints hero text without <HeroCaption>',
  },
  {
    /*
     * THE HOLE IN CLAUSE 1. It matched `rgba(10,22,40`, written out, so a wash
     * in ANY other dark colour walked past it. The auth panel's was
     * rgba(10,14,26), which the design system's "no new colours" rule forbids
     * twice over and which the old pattern would have waved through.
     */
    name: 'a surface washes its photograph in a navy that is not the brand navy',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/features/city/city-hero.tsx',
    find: 'style={{ background: HERO_HEADER_SCRIM }}',
    replace: "style={{ background: 'linear-gradient(135deg, rgba(10,14,26,0.88) 0%, rgba(10,14,26,0.55) 50%)' }}",
    expect: 'writes its own navy gradient',
  },
  {
    /*
     * THE FLOW-BOX CLAUSE MUST NOT HIDE A REAL DEFECT. The derivation stops
     * climbing at a photograph's own flow box, which is what correctly excludes
     * the organiser banner: its cover fills a box with a declared height and
     * every word sits below that box on the canvas. The clause would be worth
     * nothing if it also excluded a caption painted INSIDE that box, so this
     * drill paints one there and the guard has to see it.
     */
    name: 'the organiser banner gains a caption inside the container its cover fills',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/features/organisers/organiser-profile-hero.tsx',
    /* The caption has to be a SIBLING of the cover, inside the banner box: the
     * derivation skips the painter's own subtree, so text nested inside the
     * cover div would prove nothing. */
    find: "          }}\n        />\n      </div>\n",
    replace:
      "          }}\n        />\n        <p className=\"absolute bottom-4 left-4 text-white\">Presented by</p>\n      </div>\n",
    expect: 'src/components/features/organisers/organiser-profile-hero.tsx paints hero text without <HeroCaption>',
  },
  {
    /*
     * AND A REGISTER ENTRY THAT SAYS "its own wash is already at least as strong
     * as the shared one" has to die the day somebody lightens it. This is the
     * entry doing the work the conversion would otherwise have done.
     */
    name: 'the queue room lightens the wash its register entry rests on',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/app/queue/[slug]/queue-room.tsx',
    find: '<div className="absolute inset-0 bg-ink-900/85" />',
    replace: '<div className="absolute inset-0 bg-ink-900/40" />',
    expect: 'has stopped being true',
  },
  {
    /*
     * THE SAME CLAUSE FROM THE OTHER SIDE. `/squad/[token]` shows a cover card
     * in flow with the event title underneath it, and the derivation is right
     * to walk past it. It must stop being right the moment a caption is
     * painted over the card itself.
     */
    name: 'the squad cover card gains a caption painted over the picture',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/app/squad/[token]/page.tsx',
    find: '          <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 bg-ink-200">',
    replace:
      '          <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 bg-ink-200">\n            <p className="absolute bottom-2 left-2 z-10 text-white">Your squad is going</p>',
    expect: 'src/app/squad/[token]/page.tsx paints hero text without <HeroCaption>',
  },
  {
    /*
     * THE ANTI-FALSE-POSITIVE, and it is not hypothetical: it fired on the real
     * tree the hour clause 1 was widened. Every conversion in this class quotes
     * the gradient it DELETED, so the next reader can see what was wrong, and
     * `auth-shell.tsx` does exactly that. Testing the raw source made the guard
     * fail on its own paper trail, which is how a guard gets switched off. The
     * clause reads code, not comments, and this drill holds that.
     */
    name: 'a converted surface documents the wash it deleted, in a comment',
    guard: `${GUARDS}/hero-text-over-a-photograph.mjs`,
    file: 'src/components/templates/PhotographicCityHero.tsx',
    find: 'export function PhotographicCityHero',
    replace:
      '/* Superseded: linear-gradient(180deg, rgba(10,22,40,0.55) 0%, rgba(10,22,40,0.92) 100%) */\nexport function PhotographicCityHero',
    expectPass: 'PASS hero-text-over-a-photograph',
  },

  {
    name: "clause 3's matcher is rebuilt inside a template literal and quietly stops matching",
    guard: `${GUARDS}/consent-dates-are-zoned.mjs`,
    file: 'scripts/guards/consent-dates-are-zoned.mjs',
    find: 'const ISO_SLICE = /',
    replace:
      'const ISO_SLICE = new RegExp(`' +
      BSL + '.toISOString' + BSL + 's*' + BSL + '.' + BSL + "s*slice" +
      '`); const UNUSED_ISO_SLICE = /',
    expect: 'no longer matches',
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
    /*
     * RE-ANCHORED 20 September 2026, by the lane whose change moved it. A
     * `cv-measured` branch was added AHEAD of the `cv-section` one, for the six
     * sections too tall for the intrinsic-size estimate to be honest about, so
     * the ternary the old anchor described is now the inner arm of a nested one.
     */
    find: "className={`${intrinsicSize ? 'cv-measured ' : skipOffscreen ? 'cv-section ' : ''}relative",
    replace: "className={`${intrinsicSize ? 'cv-measured ' : skipOffscreen ? '' : ''}relative",
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
  /*
   * SURFACE FLAG COLOURS. The three shapes the defect actually took, and the
   * one it could take next. The shared empty state branched seven colours on
   * its photo/canvas flag and left two behind, in OPPOSITE directions, which is
   * why clause 1 alone is not enough: a branch that points the wrong way round
   * satisfies it and paints 1.59:1 anyway.
   */
  {
    name: 'surface colours: the trust-pillar icon stops branching and paints gold-400 on the light card at 1.59:1',
    guard: `${GUARDS}/surface-flag-colours-branch.mjs`,
    file: 'src/components/ui/CategoryHeroEmpty.tsx',
    find: "shrink-0 ${onPhoto ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-accent-strong)]'}",
    replace: 'shrink-0 text-[var(--brand-accent)]',
    expect: 'is painted unconditionally',
  },
  {
    name: 'surface colours: the eyebrow stops branching and paints gold-800 on the photo hero at 2.70:1',
    guard: `${GUARDS}/surface-flag-colours-branch.mjs`,
    file: 'src/components/ui/CategoryHeroEmpty.tsx',
    find: "tracking-[0.18em] ${onPhoto ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-accent-strong)]'}",
    replace: 'tracking-[0.18em] text-[var(--brand-accent-strong)]',
    expect: 'is painted unconditionally',
  },
  {
    name: 'surface colours: the icon branches the WRONG WAY ROUND, which clause 1 alone would pass',
    guard: `${GUARDS}/surface-flag-colours-branch.mjs`,
    file: 'src/components/ui/CategoryHeroEmpty.tsx',
    find: "shrink-0 ${onPhoto ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-accent-strong)]'}",
    replace: "shrink-0 ${onPhoto ? 'text-[var(--brand-accent-strong)]' : 'text-[var(--brand-accent)]'}",
    expect: 'which is the wrong way round',
  },
  /*
   * HERO SCALE. The growing variant exists because a fixed box clipped 637px of
   * content into 439px at 390 on 19 September 2026. The plausible next edit is
   * somebody deciding the card is too tall and handing that rule a height back,
   * which restores the clipping silently, so that is drill one.
   */
  {
    name: 'hero scale: the growing variant is given a height back, which is exactly how the clipping returns',
    guard: `${GUARDS}/hero-scale-one-source.mjs`,
    file: 'src/app/globals.css',
    find: '.hero-marketing-grow { min-height: max(var(--hero-scale), 400px); }',
    replace: '.hero-marketing-grow { min-height: max(var(--hero-scale), 400px); height: var(--hero-scale); }',
    expect: 'gives .hero-marketing-grow a height',
  },
  {
    name: 'hero scale: the growing variant is given a max-height, which clips the same content from the other end',
    guard: `${GUARDS}/hero-scale-one-source.mjs`,
    file: 'src/app/globals.css',
    find: '.hero-marketing-grow { min-height: max(var(--hero-scale), 400px); }',
    replace: '.hero-marketing-grow { min-height: max(var(--hero-scale), 400px); max-height: 600px; }',
    expect: 'gives .hero-marketing-grow a max-height',
  },
  {
    name: 'hero scale: the scale is written back as a literal instead of read from the one custom property',
    guard: `${GUARDS}/hero-scale-one-source.mjs`,
    file: 'src/app/globals.css',
    find: '.hero-marketing { height: var(--hero-scale); }',
    replace: '.hero-marketing { height: 52vh; }',
    expect: 'sets a hero height literal',
  },
  {
    name: 'hero scale: a page overrides the shared scale on the hero element itself',
    guard: `${GUARDS}/hero-scale-one-source.mjs`,
    file: 'src/components/ui/CategoryHeroEmpty.tsx',
    find: "'hero-marketing-grow border border-ink-100",
    replace: "'hero-marketing-grow h-[44vh] border border-ink-100",
    expect: 'on the same element as the hero class',
  },

  /*
   * a-failed-read-is-not-a-fact-about-a-person (lane B, 19 September 2026),
   * six drills.
   *
   * The guard exists because a failed read on the send path is not an empty
   * rail and not a 404: it is written into public.marketing_send_skip, which is
   * append-only, as a sentence about a named person, and counted onto
   * /admin/campaigns. One failed read of the small authored template table used
   * to record "the step names a template that does not exist" against EVERY
   * recipient on the campaign.
   *
   * THE SECOND DRILL IS THE ONE THAT EARNS THE GUARD. The sibling guard's
   * matcher is `const {...} = await`, which cannot see an ARRAY destructure, and
   * two of the forty-eight sites were spelled that way, including the event and
   * organisation read this drill restores. A guard whose matcher cannot see the
   * commonest spelling reports the absence of what it never looked at.
   *
   * THE LAST TWO AIM AT THE GUARD ITSELF rather than at the product, because
   * both of its counters can come back zero while it prints PASS: a scope that
   * scans nothing, and a matcher that matches nothing. Lane A lost a whole guard
   * to the second of those on 18 September, to a `${BSL}s` inside a template
   * literal.
   */
  {
    name: 'the campaigner template read goes back to discarding its error',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'src/lib/campaigner/run.ts',
    find: "const data = await readOrThrow('campaigner template library', () =>",
    replace: "const { data } = await (() =>",
    expect: 'src/lib/campaigner/run.ts',
  },
  {
    name: 'the event and organisation reads go back to an ARRAY destructure that drops both errors',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'src/lib/campaigner/run.ts',
    find: '  const [event, organisation] = await Promise.all([\n    readOrThrow(',
    replace: '  const [{ data: event }, { data: organisation }] = await Promise.all([\n    readOrThrow(',
    expect: 'element 1 of an array destructure',
  },
  {
    name: "the unsubscribe token lookup goes back to calling a person's live link invalid",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'src/lib/consent/ledger.ts',
    find: "const consentRow = await readOrThrow('unsubscribe token, platform consent', () =>",
    replace: 'const { data: consentRow } = await (() =>',
    expect: 'src/lib/consent/ledger.ts',
  },
  {
    name: 'the register names a file this guard no longer scans',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs',
    find: "file: 'src/lib/consent/digest-city.ts',",
    replace: "file: 'src/lib/consent/digest-city-renamed.ts',",
    expect: 'no longer matches a scanned file',
  },
  {
    name: 'the guard scans no send-path files at all while still reporting a pass',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs',
    find: "['src/lib/campaigner', 'a permanent skip row and a counted reason on /admin/campaigns'],",
    replace: "['src/lib/campaigner-gone', 'a permanent skip row and a counted reason on /admin/campaigns'],",
    expect: 'A scope that scans nothing reports a pass',
  },
  {
    name: "the guard's own matcher quietly stops seeing an object destructure",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs',
    find: `for (const m of code.matchAll(/(?:const|let|var)${BSL}s*${BSL}{([^{}]*)${BSL}}${BSL}s*=${BSL}s*await${BSL}b/g)) {`,
    replace: `for (const m of code.matchAll(/(?:const|let|var)${BSL}s*${BSL}{([^{}]*)${BSL}}${BSL}s*=${BSL}s*await${BSL}b/g)) {\n    if (m) continue`,
    expect: 'REFUSING: the destructure calibration probe',
  },
  {
    name: "the guard's own matcher quietly stops seeing an ARRAY destructure",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs',
    find: `for (const inner of m[1].matchAll(/${BSL}{([^{}]*)${BSL}}/g)) {`,
    replace: `for (const inner of m[1].matchAll(/${BSL}{([^{}]*)${BSL}}/g)) {\n      if (inner) continue`,
    expect: 'REFUSING: the destructure calibration probe',
  },

  /*
   * a-failed-read-is-not-a-fact-about-a-person, THE WHOLE-RESPONSE SPELLING
   * (lane B, 21 September 2026), four more drills.
   *
   * The guard's first matcher reads a DESTRUCTURE. `src/lib/consent/resolver.ts`
   * binds the whole response instead, and that file calls itself THE ONE DOOR
   * every message this platform sends to a person goes through. Driven before
   * the widening, on one person and one ledger: with the suppression read
   * failing, somebody who had unsubscribed was PERMITTED, and their grant was
   * filed as the reason.
   *
   * THE LAST TWO AIM AT THE MATCHER, and the fourth is not hypothetical. The
   * first draft asked "does this FILE read `eventResult.error`", and that one
   * file binds `eventResult` in two functions: the correct one excused the
   * defective one, and the two reads at the centre of this item did not appear
   * in the guard's own output. One `.test()` cannot tell two occurrences apart.
   */
  {
    name: 'the one door goes back to binding the whole suppression response and dropping its error',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'src/lib/consent/resolver.ts',
    find: '      readOrThrow(\'consent resolver suppressions\', () =>\n        admin\n          .from(\'suppression_events\')\n          .select(\'id, channel, scope, occurred_at\')\n          .eq(\'tenant_id\', tenant.id)\n          .eq(\'subject_email\', email)\n          .order(\'occurred_at\', { ascending: false })\n          .limit(200),\n      ),\n      readOrThrow(\'consent resolver policy\', () =>\n        admin.from(\'consent_policy\').select(\'max_age_months\').eq(\'id\', true).maybeSingle(),\n      ),\n    ])\n\n    const events: LedgerConsentEvent[] = (eventRows ?? []).map((row) => ({\n      id: row.id,\n      tenantSlug,\n      purpose: row.purpose,\n      channelScope: row.channel_scope as ConsentChannelScope,\n      decision: row.decision as ConsentDecisionValue,\n      occurredAt: row.occurred_at,\n      wordingVersion: row.wording_version,\n    }))\n\n    const suppressions: LedgerSuppressionEvent[] = (suppressionRows ?? []).map((row) => ({\n',
    replace: '      (() =>\n        admin\n          .from(\'suppression_events\')\n          .select(\'id, channel, scope, occurred_at\')\n          .eq(\'tenant_id\', tenant.id)\n          .eq(\'subject_email\', email)\n          .order(\'occurred_at\', { ascending: false })\n          .limit(200))(),\n      readOrThrow(\'consent resolver policy\', () =>\n        admin.from(\'consent_policy\').select(\'max_age_months\').eq(\'id\', true).maybeSingle(),\n      ),\n    ])\n\n    const events: LedgerConsentEvent[] = (eventRows ?? []).map((row) => ({\n      id: row.id,\n      tenantSlug,\n      purpose: row.purpose,\n      channelScope: row.channel_scope as ConsentChannelScope,\n      decision: row.decision as ConsentDecisionValue,\n      occurredAt: row.occurred_at,\n      wordingVersion: row.wording_version,\n    }))\n\n    const suppressions: LedgerSuppressionEvent[] = (suppressionRows.data ?? []).map((row) => ({\n',
    expect: 'src/lib/consent/resolver.ts',
  },
  {
    name: 'the five attribution counts go back to reading zero out of a failure',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'src/lib/attribution/read.ts',
    find: '    orders: countOrRaise(\'orders\', counts[0]),\n    attributions: countOrRaise(\'stored attributions\', counts[1]),\n    attributed: countOrRaise(\'attributed orders\', counts[2]),\n    billable: countOrRaise(\'billable attributions\', counts[3]),\n    reversed: countOrRaise(\'attribution reversals\', counts[4]),',
    replace: '    orders: counts[0].count ?? 0,\n    attributions: counts[1].count ?? 0,\n    attributed: counts[2].count ?? 0,\n    billable: counts[3].count ?? 0,\n    reversed: counts[4].count ?? 0,',
    expect: 'src/lib/attribution/read.ts',
  },
  {
    name: 'the whole-response matcher quietly stops seeing a Promise.all element',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/lib/whole-result-bindings.mjs',
    find: '      if (!bareChainIn(code, element.start, element.end, doors)) return',
    replace: '      if (element) return\n      if (!bareChainIn(code, element.start, element.end, doors)) return',
    expect: 'REFUSING: the whole-response calibration probe',
  },
  {
    name: 'the scope walk goes back to asking a whole file about a name two functions bind',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/lib/whole-result-bindings.mjs',
    find: 'function scopeEnd(code, from) {',
    replace: 'function scopeEnd(code, from) {\n  if (from >= 0) return code.length',
    expect: 'REFUSING: the whole-response calibration probe',
  },

  /*
   * a-failed-read-is-not-a-fact-about-a-person, THE TWO PUBLIC PROFILES
   * (lane B, 21 September 2026), three drills.
   *
   * These two directories joined the scope because of what their pages SAY when
   * a read fails. The organiser profile renders "No upcoming events from <name>
   * just yet" under the organiser's own name, to the audience they sent there,
   * at HTTP 200, because a socket dropped. src/lib/supabase/read-or-throw.ts
   * names this same file as the first two occurrences of the family and exists
   * so that "the fifth occurrence has nowhere to happen"; those two were the
   * destructure spelling and these were the whole-response spelling, nine lines
   * apart in the same function.
   *
   * THE FIRST TWO SPAN THE DOOR AND ITS CONSUMER IN ONE HUNK, because restoring
   * only the door leaves a name the matcher does not judge: the rule is about a
   * whole response whose PAYLOAD is read, so both halves have to come back for
   * the defect to be the defect.
   *
   * THE THIRD AIMS AT THE SCOPE rather than at the product, because a directory
   * renamed away is scanned for nothing and reported as a pass.
   */
  {
    name: 'the organiser profile goes back to publishing an empty catalogue when a socket drops',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'src/app/organisers/[handle]/page.tsx',
    find: '    readOrThrow(\'the organiser upcoming events\', () =>\n      supabase\n        .from(\'events\')\n        .select(baseSelect)\n        .eq(\'organisation_id\', orgId)\n        .match(PUBLIC_EVENT_MATCH)\n        .or(listingWindowOrPredicate(new Date(nowIso)))\n        .order(\'start_date\', { ascending: true })\n        .limit(24),\n    ),\n    readOrThrow(\'the organiser past events\', () =>\n      supabase\n        .from(\'events\')\n        .select(baseSelect)\n        .eq(\'organisation_id\', orgId)\n        .eq(\'visibility\', \'public\')\n        .lt(\'start_date\', nowIso)\n        .in(\'status\', [\'published\', \'completed\'])\n        .order(\'start_date\', { ascending: false })\n        .limit(12),\n    ),\n  ])\n\n  return {\n    upcoming: ((upcoming ?? []) as unknown as OrganiserEventRow[]),',
    replace: '    (() =>\n      supabase\n        .from(\'events\')\n        .select(baseSelect)\n        .eq(\'organisation_id\', orgId)\n        .match(PUBLIC_EVENT_MATCH)\n        .or(listingWindowOrPredicate(new Date(nowIso)))\n        .order(\'start_date\', { ascending: true })\n        .limit(24))(),\n    readOrThrow(\'the organiser past events\', () =>\n      supabase\n        .from(\'events\')\n        .select(baseSelect)\n        .eq(\'organisation_id\', orgId)\n        .eq(\'visibility\', \'public\')\n        .lt(\'start_date\', nowIso)\n        .in(\'status\', [\'published\', \'completed\'])\n        .order(\'start_date\', { ascending: false })\n        .limit(12),\n    ),\n  ])\n\n  return {\n    upcoming: ((upcoming.data ?? []) as unknown as OrganiserEventRow[]),',
    expect: 'src/app/organisers/[handle]/page.tsx',
  },
  {
    name: 'the venue profile goes back to showing a working venue as having nothing on',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'src/app/venues/[handle]/page.tsx',
    find: '    readOrThrow(\'the venue upcoming events\', () =>\n      supabase\n        .from(\'events\')\n        .select(baseSelect)\n        .match(PUBLIC_EVENT_MATCH)\n        .ilike(\'venue_name\', venueName)\n        .or(listingWindowOrPredicate(new Date(nowIso)))\n        .order(\'start_date\', { ascending: true })\n        .limit(24),\n    ),\n    readOrThrow(\'the venue past events\', () =>\n      supabase\n        .from(\'events\')\n        .select(baseSelect)\n        .eq(\'visibility\', \'public\')\n        .ilike(\'venue_name\', venueName)\n        .lt(\'start_date\', nowIso)\n        .in(\'status\', [\'published\', \'completed\'])\n        .order(\'start_date\', { ascending: false })\n        .limit(12),\n    ),\n  ])\n  return {\n    upcoming: ((upcoming ?? []) as unknown as VenueEventRow[]),',
    replace: '    (() =>\n      supabase\n        .from(\'events\')\n        .select(baseSelect)\n        .match(PUBLIC_EVENT_MATCH)\n        .ilike(\'venue_name\', venueName)\n        .or(listingWindowOrPredicate(new Date(nowIso)))\n        .order(\'start_date\', { ascending: true })\n        .limit(24))(),\n    readOrThrow(\'the venue past events\', () =>\n      supabase\n        .from(\'events\')\n        .select(baseSelect)\n        .eq(\'visibility\', \'public\')\n        .ilike(\'venue_name\', venueName)\n        .lt(\'start_date\', nowIso)\n        .in(\'status\', [\'published\', \'completed\'])\n        .order(\'start_date\', { ascending: false })\n        .limit(12),\n    ),\n  ])\n  return {\n    upcoming: ((upcoming.data ?? []) as unknown as VenueEventRow[]),',
    expect: 'src/app/venues/[handle]/page.tsx',
  },
  {
    name: 'the guard scans neither public profile while still reporting a pass',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs',
    find: "    'src/app/organisers',",
    replace: "    'src/app/organisers-gone',",
    expect: 'A scope that scans nothing reports a pass',
  },

  /*
   * a-failed-read-is-not-a-fact-about-a-person, THE MARKETPLACE SCOPE
   * (lane B, 21 September 2026), three more drills.
   *
   * src/lib/marketplace joined the scope because the same shape there is not a
   * skip row, it is an empty marketplace: /artists answered 200 with "No
   * performers match those filters yet" whenever one read blinked, on the
   * surface a promoter judges the whole supply side by.
   *
   * THE SECOND AND THIRD AIM AT THE NEW LIST rather than at the product, and
   * they are the ones worth having. RAISED_WITH_ANOTHER_LANE suppresses a real
   * fault in another lane's file, so it is the one structure here that can hide
   * a defect, and a suppression list is only safe while it is forced to shrink:
   * one drill proves a path that has rotted is refused, the other proves an
   * entry whose debt has been PAID is refused, which is the case that would
   * otherwise sit there for ever claiming a fault nobody has any more.
   */
  {
    name: 'the performer directory goes back to reading an empty marketplace as an empty marketplace',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'src/lib/marketplace/showcase.ts',
    find: '  const { data, error } = await query',
    replace: '  const { data } = await query',
    expect: 'src/lib/marketplace/showcase.ts',
  },
  /*
   * THESE TWO PLANT THE ENTRY THEY DRILL, AND THEY DID NOT USED TO.
   *
   * Both named `file: 'src/lib/marketplace/notify.ts'` and edited it. That
   * entry existed for twelve hours on 21 September 2026 and then lane C fixed
   * the file, the guard refused the now-stale entry, and the entry went - which
   * is the mechanism working exactly as designed. The drills went stale with
   * it, and the harness reported them STALE rather than red or green.
   *
   * A drill that can only run while a cross-lane debt is outstanding is a drill
   * that stops running on the good days. The empty list is the NORMAL state, so
   * each of these now plants its own entry against the list's declaration and
   * proves the refusal from there.
   */
  {
    name: 'a fault raised with another lane names a file this guard no longer scans',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs',
    find: 'export const RAISED_WITH_ANOTHER_LANE = [',
    replace: "export const RAISED_WITH_ANOTHER_LANE = [\n  {\n    file: 'src/lib/marketplace/notify-renamed.ts',\n    lane: 'lane C',\n    since: '2026-09-21',\n    why: 'planted by a drill',\n    raised: 'REVIEW-QUEUE-B.md',\n  },",
    expect: 'matches no scanned file',
  },
  {
    name: 'a fault raised with another lane is kept after that lane has fixed it',
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: 'scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs',
    find: 'export const RAISED_WITH_ANOTHER_LANE = [',
    replace: "export const RAISED_WITH_ANOTHER_LANE = [\n  {\n    file: 'src/lib/marketplace/cities.ts',\n    lane: 'lane C',\n    since: '2026-09-21',\n    why: 'planted by a drill',\n    raised: 'REVIEW-QUEUE-B.md',\n  },",
    expect: 'The debt is paid',
  },

  /*
   * a-failed-read-is-not-a-fact-about-a-person, THE TRACKED-LINK, CONSENT AND
   * CAMPAIGNER SPINE (lane B, 21 September 2026), ten drills.
   *
   * Four directories and two named files joined the scope, for nine reads that
   * each had a correct, deliberate fallback for a row that is genuinely absent,
   * and each of which quietly used that same fallback to answer a dropped
   * socket.
   *
   * THE ONE THAT NAMES THE GROUP is drill 1. /s/[code] is what the QR code on an
   * organiser's printed poster resolves to, and its own comment says a link
   * whose event has been DELETED degrades to the browse page rather than a dead
   * end. A blink took that same door, so the buyer standing in front of the
   * poster was sent to a generic browse page and the organiser lost a sale
   * nothing reported.
   *
   * DRILLS 8, 9 AND 10 AIM AT THE GUARD rather than at the product, and they are
   * the ones worth having. Eight is the old rule, that a scope renamed away
   * scans nothing and reports a pass. Nine and ten are new and they are a pair:
   * a scope entry may now name ONE FILE, which is a real narrowing, so it must
   * say what the directory around it holds that keeps it out, and a DIRECTORY
   * entry carrying such a reason is that same rule read backwards, which is how
   * a directory that has quietly become a file would otherwise pass unremarked.
   */
  {
    name: "a scanned poster goes back to being answered as though the event were deleted",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/app/s/[code]/route.ts",
    find: "  const event = await readOrThrow('short-link destination event', () =>\n    admin.from('events').select('slug').eq('id', link.event_id).maybeSingle(),\n  )",
    replace: "  const { data: event } = await admin\n    .from('events')\n    .select('slug')\n    .eq('id', link.event_id)\n    .maybeSingle()",
    expect: "a scanned poster sending the buyer to the browse page",
  },
  {
    name: "the short-link resolver goes back to losing the artist who drove the sale",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/lib/broadcast/resolve-short-link.ts",
    find: "    const artist = await readOrThrow('resolved short link tagged artist', () =>\n      admin.from('artists').select('slug').eq('id', link.artist_id).maybeSingle(),\n    )",
    replace: "    const { data: artist } = await admin\n      .from('artists')\n      .select('slug')\n      .eq('id', link.artist_id)\n      .maybeSingle()",
    expect: "an artist losing the credit for a sale they drove",
  },
  {
    name: "the Launch Kit goes back to telling an organiser their own event does not exist",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/lib/broadcast/kit-artefacts.ts",
    find: "  const data = await readOrThrow('the launch kit event', () =>\n    admin\n      .from('events')",
    replace: "  const { data } = await admin\n    .from('events')",
    expect: "a Launch Kit reporting that the organiser",
  },
  {
    name: "the share-link API goes back to answering event_not_found about a live event",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/app/api/broadcast/share-link/route.ts",
    find: "  const event = await readOrThrow('the share-link event', () =>\n    admin.from('events').select('id, status, slug').eq('slug', parsed.data.slug).maybeSingle(),\n  )",
    replace: "  const { data: event } = await admin\n    .from('events')\n    .select('id, status, slug')\n    .eq('slug', parsed.data.slug)\n    .maybeSingle()",
    expect: "a 404 saying event_not_found about a live event",
  },
  {
    name: "the campaign console goes back to counting a send reach against an empty channel",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/app/admin/(authed)/campaigns/page.tsx",
    find: "  const channelRows = await readOrThrow('the campaign channel table', () =>\n    admin.from('marketing_channel').select('code, display_name').order('code').limit(100),\n  )",
    replace: "  const { data: channelRows } = await admin\n    .from('marketing_channel')\n    .select('code, display_name')\n    .order('code')\n    .limit(100)",
    expect: "reach against an empty channel code",
  },
  {
    name: "a digest consent goes back to being filed against no city when the person chose one",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/app/actions/consent.ts",
    find: "      const city = await readOrThrow('the digest consent city', () =>\n        admin.from('cities').select('slug').eq('slug', input.citySlug as string).maybeSingle(),\n      )",
    replace: "      const { data: city } = await admin\n        .from('cities')\n        .select('slug')\n        .eq('slug', input.citySlug as string)\n        .maybeSingle()",
    expect: "a consent record filed against no city when the person chose one",
  },
  {
    name: "a carried consent goes back to saying \"no such reservation\" about one that exists",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/app/actions/discovery-consent.ts",
    find: "    const reservation = await readOrThrow('the reservation behind a carried consent', () =>\n      admin\n        .from('reservations')",
    replace: "    const { data: reservation } = await admin\n      .from('reservations')",
    expect: "said about a reservation that exists",
  },
  {
    name: "the guard scans neither the poster route nor the link spine while still reporting a pass",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs",
    find: "    'src/app/s',",
    replace: "    'src/app/s-gone',",
    expect: "A scope that scans nothing reports a pass",
  },
  {
    name: "a file scope entry stops saying what keeps it out of its own directory",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs",
    find: "    'src/app/actions holds 46 more reads of this shape in lane A and lane C files, and scoping ' +\n      'the directory would fail their builds on a fault this lane cannot fix',\n  ],",
    replace: "  ],",
    expect: "is a single FILE in a scope of directories and says nothing about why",
  },
  {
    name: "a directory scope entry claims to be a single file",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs",
    find: "  [\n    'src/app/s',",
    replace: "  [\n    'src/app/s',\n    'what a failed read becomes, planted by a drill',\n    'a reason planted by a drill',\n  ],\n  [\n    'src/app/s',",
    expect: "is a DIRECTORY but carries a reason for being a single file",
  },

  /*
   * a-failed-read-is-not-a-fact-about-a-person, THE TOKEN DOORS (lane B,
   * 21 September 2026), four drills.
   *
   * Three pages a person reaches by following a link out of their own inbox,
   * each of which answered a blinked read with a sentence about that link.
   * Drill 1 is the one that matters most: the Spam Act unsubscribe facility has
   * to work, and a dropped socket told the reader it had already been spent.
   *
   * EACH DRILL ASSERTS ITS OWN SENTENCE rather than its file path, and that is
   * deliberate. On the morning these were written, two drills in the block above
   * asserted a path the guard prints on EVERY run, in the "narrowed to one file"
   * line, so both would have gone green against a guard that never judged the
   * file at all. Only judgeFile() can emit the sentences below.
   */
  {
    name: "a live unsubscribe link goes back to being called spent when a socket drops",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/app/unsubscribe/[token]/page.tsx",
    find: "  const data = await readOrThrow('the organiser unsubscribe token', () =>\n    admin\n      .from('organiser_marketing_consents')",
    replace: "  const { data } = await admin\n      .from('organiser_marketing_consents')",
    expect: "told their live unsubscribe link is not valid",
  },
  {
    name: "a live city-waitlist unsubscribe link goes back to being called invalid",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/app/waitlist/unsubscribe/[token]/page.tsx",
    find: "  const data = await readOrThrow('the city waitlist unsubscribe token', () =>\n    admin\n      .from('city_waitlist_signups')",
    replace: "  const { data } = await admin\n      .from('city_waitlist_signups')",
    expect: "a live city-waitlist unsubscribe link called invalid",
  },
  {
    name: "a single-use performer invite goes back to being reported as already claimed",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "src/app/artists/claim/[token]/page.tsx",
    find: "  const tag = await readOrThrow('the performer claim invite token', () =>\n    admin\n      .from('event_artists')",
    replace: "  const { data: tag } = await admin\n      .from('event_artists')",
    expect: "single-use invite has already been claimed",
  },
  {
    name: "the guard scans none of the three token doors while still reporting a pass",
    guard: `${GUARDS}/a-failed-read-is-not-a-fact-about-a-person.mjs`,
    file: "scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs",
    find: "    'src/app/unsubscribe',",
    replace: "    'src/app/unsubscribe-gone',",
    expect: "A scope that scans nothing reports a pass",
  },

  /*
   * tile-label-over-a-photograph, nine drills (20 September 2026).
   *
   * The hero guard above was written on 19 September, the four heroes were
   * converted onto one anchored wash, it went green and it stayed green. One
   * component family along, thirteen TILE captions each carried a hand-written
   * wash whose every stop was a percentage of the TILE, and the same instrument
   * measured 149 runs below their WCAG 2.2 SC 1.4.3 floor: /cities 86,
   * /communities 49, /waitlist 12, /city/sydney 2, with Brisbane at 1.00:1 on a
   * white sky and 100 per cent of its 464 core pixels failing.
   *
   * Drills 1 to 4 aim at the markup. Drills 5 to 7 aim at the guard's own
   * premises: the strength, the geometry that makes the strength mean anything,
   * and the single source of the number. Drill 8 is the defect the guard found
   * on its FIRST run, kept as a drill because it is the subtlest of them: a
   * class naming a colour token globals.css does not declare emits no CSS at all
   * and the label silently inherits. Drill 9 aims at the painter derivation,
   * because a derivation that quietly returns nothing is how the tile family
   * stayed invisible to the hero guard for a day.
   */
  {
    name: 'a tile label leaves the shared caption and goes back onto the bare photograph',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'src/app/cities/page.tsx',
    find: '<TileCaption className="px-3 pb-3 pt-2 sm:px-5 sm:pb-4 sm:pt-3">',
    replace: '<div className="absolute inset-x-0 bottom-0 px-3 pb-3">',
    expect: 'paints a label on a CityTileImage photograph outside <TileCaption>',
  },
  {
    name: 'a converted tile goes back to writing its own translucent wash as well',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'src/app/waitlist/waitlist-client.tsx',
    find: "'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)',",
    replace: "'linear-gradient(180deg, rgba(10,22,40,0.0) 40%, rgba(10,22,40,0.55) 72%, rgba(10,22,40,0.92) 100%)',",
    expect: 'ALSO writes its own translucent dark gradient',
  },
  {
    name: 'a tile loses the clip that trims the caption wash bleeding a viewport past its edges',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'src/app/communities/page.tsx',
    find: '<div className="relative aspect-[4/5] w-full overflow-hidden bg-ink-200">',
    replace: '<div className="relative aspect-[4/5] w-full bg-ink-200">',
    expect: 'does not clip',
  },
  {
    name: 'a caller repositions the caption, moving the label off the wash computed for it',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'src/components/features/community/cities-rail.tsx',
    find: '<TileCaption className="p-4">',
    replace: '<TileCaption className="absolute top-0 p-4">',
    expect: 'gives <TileCaption> positioning classes',
  },
  {
    name: 'the shared floor is weakened below what the gold date line on a bento needs',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'src/components/media/hero-photo-scrim.ts',
    find: 'export const HERO_CAPTION_MIN_ALPHA = 0.82',
    replace: 'export const HERO_CAPTION_MIN_ALPHA = 0.7',
    expect: 'the tile caption wash is 0.7 navy',
  },
  {
    name: 'the tile scrim restates the floor as a literal instead of importing the one source',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'src/components/media/tile-photo-scrim.ts',
    find: 'export const TILE_CAPTION_MIN_ALPHA = HERO_CAPTION_MIN_ALPHA',
    replace: 'export const TILE_CAPTION_MIN_ALPHA = 0.82',
    expect: 'states its own floor instead of importing',
  },
  {
    name: 'the caption stops starting its wash above the label, which is the original defect',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'src/components/media/tile-caption.tsx',
    find: 'top: `calc(-1 * ${TILE_CAPTION_FADE})`,',
    replace: "top: '0px',",
    expect: 'no longer starts its wash TILE_CAPTION_FADE above the label',
  },
  {
    name: 'a caption paints a colour token globals.css does not declare, so Tailwind emits nothing',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'src/components/features/events/city-tile.tsx',
    find: 'translate-x-[-6px] text-[var(--brand-accent)]',
    replace: 'translate-x-[-6px] text-gold-300',
    expect: 'declares no such colour token',
  },
  {
    name: 'the painter derivation quietly stops finding the media directory',
    guard: `${GUARDS}/tile-label-over-a-photograph.mjs`,
    file: 'scripts/guards/lib/tile-files.mjs',
    find: "const MEDIA_DIR = 'src/components/media'",
    replace: "const MEDIA_DIR = 'src/components/seo'",
    expect: 'tile-painter derivation found only',
  },

  /*
   * no-loading-boundary-in-front-of-a-hero, three drills (20 September 2026).
   *
   * This guard replaced hero-preload-above-the-loading-boundary, whose four
   * drills were deleted WITH it rather than left pointing at a file that is no
   * longer in the tree. Two of those four described placements that had been
   * tried and had silently done nothing (`generateMetadata`, and `react-dom`'s
   * `preload` inside a server component); the second of them is kept below,
   * because the resolver it describes is still here and the trap is still live.
   *
   * The three that remain are one per clause:
   *
   *   1. A page behind an existing boundary grows a hero. The harness cannot
   *      create a file, so it cannot plant a boundary; this is the other and
   *      likelier direction anyway, and the drill's own comment says why.
   *   2. The server resolver imports `react-dom`, where `preload()` has no
   *      dispatcher and does nothing at all.
   *   3. The hero derivation goes blind. It matters more on this guard than it
   *      did on the last one, because clause 1 passes by finding NOTHING and a
   *      broken derivation finds nothing too.
   */
  {
    /*
     * CLAUSE 1, AND THE DRILL COMES AT IT FROM THE DIRECTION IT WILL ACTUALLY
     * ARRIVE FROM.
     *
     * The obvious drill is "put a loading.tsx back beside the event page", and
     * it is the one that was run by hand while the guard was written (red with
     * the fault named, green when the file was removed again). This harness
     * only mutates files it can find an anchor in, so it cannot CREATE one, and
     * the substitute chosen here is not a weaker version of the same thing: it
     * is the other, likelier direction. A boundary is added deliberately and by
     * somebody thinking about loading; a HERO is added to a page that already
     * sits behind one without anybody thinking about loading at all. The
     * checkout route has carried its boundary since long before this rule, so
     * giving its page a hero is exactly that mistake.
     *
     * Both marks are planted, because deriveHeroFiles requires both: the locked
     * `.hero-marketing` scale and a rendered `<HeroMedia>`. Planting one alone
     * would leave the guard green and the drill would be verifying nothing.
     */
    name: 'a page that already sits behind a loading boundary grows a hero',
    guard: `${GUARDS}/no-loading-boundary-in-front-of-a-hero.mjs`,
    file: 'src/app/checkout/[reservation_id]/page.tsx',
    find: '    <CheckoutForm',
    replace:
      '    <div className="hero-marketing"><HeroMedia image={null} alt="" /></div>,\n' +
      '    <CheckoutForm',
    expect: 'renders a hero and sits behind',
  },
  {
    name: 'the server-only resolver reaches for react-dom preload, which does nothing there',
    guard: `${GUARDS}/no-loading-boundary-in-front-of-a-hero.mjs`,
    file: 'src/lib/images/hero-preload.tsx',
    find: "import 'server-only'",
    replace: "import 'server-only'\n" + "import { preload } from 'react-dom'",
    expect: 'imports from react-dom',
  },
  {
    /*
     * CLAUSE 3, AND IT IS THE CLAUSE THIS GUARD MOST NEEDS DRILLED.
     *
     * Clause 1 PASSES by finding nothing, which is the same shape a derivation
     * that has stopped working produces. So the guard is only worth anything
     * while it can still see the two halves of the join, and this proves it
     * notices when one of them goes rather than reporting a confident zero.
     *
     * IT AIMS AT THE BOUNDARY HALF, and the first version of this drill aimed
     * at the other half and DID NOT FIRE - the harness reported 0 of 1, which
     * is what it is for. Renaming `<HeroMedia` inside hero-files.mjs does not
     * hand this guard an empty list: `deriveHeroFiles` THROWS on a short list
     * by its own IMPLAUSIBLY_FEW floor, so the check it was written against was
     * unreachable and has been deleted rather than left looking careful. The
     * boundary half has no such floor above it, so it is the one that can
     * silently go to zero, and it is the one drilled.
     */
    name: 'the boundary derivation goes blind, so clause 1 could not have failed',
    guard: `${GUARDS}/no-loading-boundary-in-front-of-a-hero.mjs`,
    file: 'scripts/guards/no-loading-boundary-in-front-of-a-hero.mjs',
    find: "const loadings = files.filter((f) => f.endsWith('/loading.tsx'))",
    replace: "const loadings = files.filter((f) => f.endsWith('/loading.tsx.disabled'))",
    expect: 'the derivation of boundaries has gone blind',
  },
  /*
   * audit-flag-is-read-where-it-is-written, four drills (20 September 2026).
   *
   * One per clause. Drill 1 is the defect itself, as it stood in six files.
   * Drill 2 is the form that is correct today and was correct for `body` once
   * too. Drill 3 moves the WRITER and proves the writer and the reader are
   * compared rather than each judged alone. Drill 4 takes the predicate's own
   * key away, which is the shape a rename would have.
   */
  {
    name: 'a suppression goes back to reading the audit flag off document.body',
    guard: `${GUARDS}/audit-flag-is-read-where-it-is-written.mjs`,
    file: 'src/components/media/hero-ambient-layer.tsx',
    find: '    if (isAuditRun()) return',
    replace: "    if (document.body.dataset.headless === '1') return",
    expect: 'reads the audit flag off document.body',
  },
  {
    name: 'a suppression reads documentElement directly instead of asking the predicate',
    guard: `${GUARDS}/audit-flag-is-read-where-it-is-written.mjs`,
    file: 'src/components/features/events/event-video.tsx',
    find: '  const headless = isAuditRun()',
    replace: "  const headless = document.documentElement.dataset.headless === '1'",
    expect: 'reads the audit flag off documentElement directly',
  },
  {
    name: 'the writer stops setting the flag the predicate reads',
    guard: `${GUARDS}/audit-flag-is-read-where-it-is-written.mjs`,
    file: 'src/app/layout.tsx',
    find: "if(audit){d.dataset.headless='1';return}",
    replace: "if(audit){d.dataset.auditing='1';return}",
    expect: 'does not set documentElement.dataset.headless',
  },
  {
    name: 'the predicate stops declaring the key this guard compares against',
    guard: `${GUARDS}/audit-flag-is-read-where-it-is-written.mjs`,
    file: 'src/lib/ui/audit-mode.ts',
    find: "export const AUDIT_FLAG = 'headless'",
    replace: 'export const AUDIT_FLAG = FLAG_KEY',
    expect: 'declares no AUDIT_FLAG',
  },

  /*
   * the-head-and-the-body-ask-once (close-out C8, 21 September 2026), four
   * drills: one per mechanism the guard has to hold.
   *
   * Every one of these is the tree as it actually stood on the morning of
   * 21 September. The counter measured ten duplicate database calls across four
   * public SEO route families in one warmed page view each; these four drills
   * put four of them back.
   */
  {
    name: 'the event route goes back to buying its row for the head and again for the body',
    guard: `${GUARDS}/the-head-and-the-body-ask-once.mjs`,
    file: 'src/lib/events/event-detail-read.ts',
    find: 'export const readEventForRoute = cache(async function readEventForRoute(',
    replace: 'export const readEventForRoute = (async function readEventForRoute(',
    expect: 'buys the same rows twice in one request',
  },
  {
    name: 'the organiser profile goes back to reading its status gate twice',
    guard: `${GUARDS}/the-head-and-the-body-ask-once.mjs`,
    file: 'src/app/organisers/[handle]/page.tsx',
    find: 'const fetchOrganiser = cache(async function fetchOrganiser(',
    replace: 'const fetchOrganiser = (async function fetchOrganiser(',
    expect: 'buys the same rows twice in one request',
  },
  {
    /*
     * THE VENUE PAGE'S WRAPPER IS A BARE `cache(reader)` RATHER THAN A WRAPPED
     * FUNCTION BODY, so this drill takes a different shape from the two above
     * and is worth having for exactly that reason: it proves the guard judges
     * what the identifier is ASSIGNED, not whether the word `cache` appears
     * somewhere in the file.
     */
    name: 'the venue profile goes back to resolving its venue twice',
    guard: `${GUARDS}/the-head-and-the-body-ask-once.mjs`,
    file: 'src/app/venues/[handle]/page.tsx',
    find: 'const venueForRoute = cache(resolveVenueProfile)',
    replace: 'const venueForRoute = resolveVenueProfile',
    expect: 'buys the same rows twice in one request',
  },
  {
    /*
     * THE ANTI-FALSE-PASS FOR THE DERIVATION ITSELF. A route that stops
     * exporting `generateMetadata` is not judged at all, which is correct - it
     * has no head of its own to buy anything for - and this drill proves the
     * guard NOTICES rather than quietly dropping the subject: the identifier
     * moves out of reach, so the clause that looks it up must say so.
     */
    name: 'a route awaits a reader this guard cannot find the definition of',
    guard: `${GUARDS}/the-head-and-the-body-ask-once.mjs`,
    file: 'src/app/artists/[slug]/page.tsx',
    find: 'const artistForRoute = cache(async function artistForRoute(slug: string) {',
    replace: 'const artistForRouteRenamedAway = cache(async function artistForRouteRenamedAway(slug: string) {',
    expect: 'could not find where it is defined',
  },

  /*
   * a-refusal-keeps-its-door (21 September 2026), four drills.
   *
   * Every one of these is a state the tree was really in. The event form had
   * the first on 28 August; the events list and the lifecycle actions both had
   * it until this commit, and the third was found by the guard rather than by
   * reading.
   */
  {
    name: 'the events list throws away the door the publish gate worked out',
    guard: `${GUARDS}/a-refusal-keeps-its-door.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/events-table.tsx',
    find:
      '      {refusal.nextAction && (' + '\n' +
      '        <Link' + '\n' +
      '          href={refusal.nextAction.href}' + '\n' +
      '          className="ml-2 font-semibold underline underline-offset-2"' + '\n' +
      '        >' + '\n' +
      '          {refusal.nextAction.label}' + '\n' +
      '        </Link>' + '\n' +
      '      )}',
    replace: '      {null}',
    expect: 'never reads `nextAction`',
  },
  {
    name: 'the events list stops announcing its refusal',
    guard: `${GUARDS}/a-refusal-keeps-its-door.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/events-table.tsx',
    find: '      role="alert"',
    replace: '      data-refusal="true"',
    expect: 'without role="alert"',
  },
  {
    name: 'the restore path throws away the door, which is the copy nobody knew about',
    guard: `${GUARDS}/a-refusal-keeps-its-door.mjs`,
    file: 'src/components/features/dashboard/event-lifecycle-actions.tsx',
    find:
      '          {refusal.nextAction && (' + '\n' +
      '            <Link href={refusal.nextAction.href} className="ml-2 font-semibold underline underline-offset-2">' + '\n' +
      '              {refusal.nextAction.label}' + '\n' +
      '            </Link>' + '\n' +
      '          )}',
    replace: '          {null}',
    expect: 'never reads `nextAction`',
  },
  {
    /*
     * THE ANTI-BLINDNESS DRILL. Take the door off the CONTRACT and the guard
     * has nothing to look for; a version that shrugged would report PASS on a
     * tree where every refusal had silently lost its link.
     */
    name: 'the ActionResult contract loses the door itself',
    guard: `${GUARDS}/a-refusal-keeps-its-door.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/actions.ts',
    find: "export type ActionResult = { error?: string; nextAction?: { label: string; href: string } }",
    replace: 'export type ActionResult = { error?: string }',
    expect: 'no { label, href } member',
  },

  /*
   * a-table-a-phone-can-read (21 September 2026), five drills, one per clause.
   *
   * Every one of these is the state the tree was really in when the drive
   * measured it. Clause four's is the exact class attribute that clipped six
   * controls, and clause five's is the exact button that rendered 16px tall on
   * a 1440 desktop as well as on a phone.
   */
  {
    name: 'the discount codes table goes back to being a table on a phone',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    find: '<table className="w-full text-sm max-lg:block">',
    replace: '<table className="w-full text-sm">',
    expect: 'no phone presentation',
  },
  {
    name: 'the header stays while the cells stack, five headings above one card',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    find: '<thead className="max-lg:hidden">',
    replace: '<thead>',
    expect: 'stays visible below `lg`',
  },
  {
    name: 'the minimum width that forces the phone-width scroller comes back',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/reach/page.tsx',
    find: '<table className="w-full text-sm max-lg:block lg:min-w-[560px]">',
    replace: '<table className="w-full text-sm max-lg:block min-w-[560px]">',
    expect: 'forces a phone-width scroller',
  },
  {
    /*
     * THE ONE THAT WAS REALLY THERE. `overflow-hidden` on the wrapper is what
     * made six controls unreachable, and it reads in a class list exactly like
     * the harmless corner-rounding it also does.
     */
    name: 'the wrapper clips again at phone width',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    find: 'bg-white overflow-hidden max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:overflow-visible',
    replace: 'bg-white overflow-hidden max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent',
    expect: 'applies below `lg`',
  },
  {
    name: 'a row control goes back to eleven pixels of underlined text',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/discounts-client.tsx',
    find: 'className={`${ROW_CONTROL} text-[var(--color-error-strong)] hover:underline`}',
    replace: 'className="text-xs text-[var(--color-error-strong)] hover:underline"',
    expect: 'no 44px floor',
  },
  {
    /*
     * THE ADMIN HALF. This is the class attribute /admin/audit carried until
     * 21 September 2026: fifty View buttons outside a box showing a third of
     * its own table. The wrapper is a shared constant now, so the drill puts
     * the literal back at the call site, which is exactly how the defect would
     * return.
     */
    name: 'the admin audit log goes back to clipping its own table',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/app/admin/(authed)/audit/page.tsx',
    find: '<div className={ADMIN_TABLE_WRAP}>',
    replace: '<div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#131A2A]">',
    expect: 'is a CLIP and not a scroller',
  },

  /*
   * a-table-a-phone-can-read, THE ADMIN SCOPE (21 September 2026), six drills.
   *
   * The first four mutate the SHARED constants, and that is the point rather
   * than a shortcut: sixteen admin tables now render their classes from
   * src/components/admin/table-card.ts, so one character there is a regression
   * on sixteen screens at once. A drill that only poked one call site would
   * leave the file that actually matters undrilled.
   *
   * The last two are call sites, because a screen can also opt itself out.
   */
  {
    name: 'the shared admin table stops being a card on a phone, on sixteen screens at once',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/components/admin/table-card.ts',
    find: "export const ADMIN_TABLE = 'w-full text-left text-sm max-lg:block'",
    replace: "export const ADMIN_TABLE = 'w-full text-left text-sm'",
    expect: 'no phone presentation',
  },
  {
    name: 'the shared admin wrapper becomes a phone-width scroller again',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/components/admin/table-card.ts',
    find: "'rounded-xl max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent lg:overflow-x-auto'",
    replace: "'rounded-xl max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent overflow-x-auto'",
    expect: 'applies below `lg`',
  },
  {
    name: 'the shared admin header stays while the cells stack',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/components/admin/table-card.ts',
    find: "  'bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50 max-lg:hidden'",
    replace: "  'bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50'",
    expect: 'stays visible below',
  },
  {
    /*
     * THE CONSTANT THE GUARD ACCEPTS BY NAME. Clause FIVE passes any control
     * mentioning ADMIN_ROW_CONTROL, for a call site the resolver cannot reach,
     * so the guard REFUSES to run at all if that name stops being 44px.
     */
    name: 'the admin row control stops being 44px, and the guard refuses to run',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/components/admin/table-card.ts',
    find: "export const ADMIN_ROW_CONTROL = 'inline-flex min-h-11 items-center'",
    replace: "export const ADMIN_ROW_CONTROL = 'inline-flex items-center'",
    expect: 'carries no 44px floor',
  },
  {
    name: 'an admin table takes back the unqualified minimum width',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/app/admin/(authed)/kyc/page.tsx',
    find: '<table className={`${ADMIN_TABLE} lg:min-w-[720px]`}>',
    replace: '<table className={`${ADMIN_TABLE} min-w-[720px]`}>',
    expect: 'forces a phone-width scroller',
  },
  {
    name: 'an admin row link goes back to nineteen pixels of text',
    guard: `${GUARDS}/a-table-a-phone-can-read.mjs`,
    file: 'src/app/admin/(authed)/payouts/page.tsx',
    find: 'className={`${ADMIN_ROW_CONTROL} font-medium text-[var(--brand-accent)] hover:underline`}',
    replace: 'className="text-[var(--brand-accent)] hover:underline"',
    expect: 'no 44px floor',
  },

  /*
   * the-cost-table-can-name-what-it-measures (21 September 2026), four drills,
   * one per contract clause.
   *
   * WHAT IS DRILLED HERE AND WHAT IS NOT, said plainly. These four mutate the
   * SOURCE and the guard reads source, so the harness can aim at them. Clauses
   * five and six read a real `.next`, which this harness does not own and does
   * not restore, so they are proven instead by running the guard with --built
   * (postbuild runs it on every build, and it reports its own coverage on every
   * run) and by the unit test that pins `parseClientReferenceManifest` returning
   * null rather than throwing on a manifest whose shape has changed. Saying
   * which half a drill set covers is the difference between a proof and a count.
   */
  {
    /*
     * THE ONE THAT WAS REALLY THERE. The cost table carried its own copy of the
     * reviewed markers, made before the shared module existed, and that copy
     * still held three markers the shared module had recorded as dead on
     * 15 September. Its second row read `unattributed` for a chunk the shared
     * list names correctly.
     */
    name: 'the cost table stops reading the one reviewed marker list',
    guard: `${GUARDS}/the-cost-table-can-name-what-it-measures.mjs`,
    file: 'scripts/perf/chunk-cost-table.mjs',
    find: "import { markerCoverage, nameChunk, readClientModuleChunks } from './lib/chunk-attribution.mjs'",
    replace: "const attributionIsSomebodyElsesProblem = true",
    expect: 'does not read',
  },
  {
    name: 'the cost table takes back a private copy of the reviewed marker list',
    guard: `${GUARDS}/the-cost-table-can-name-what-it-measures.mjs`,
    file: 'scripts/perf/chunk-cost-table.mjs',
    find: "import { markerCoverage, nameChunk, readClientModuleChunks } from './lib/chunk-attribution.mjs'",
    replace:
      "import { markerCoverage, nameChunk, readClientModuleChunks } from './lib/chunk-attribution.mjs'\nconst FEATURE_MARKERS = [{ feature: 'React DOM', test: /__reactContainer/ }]",
    expect: 'declares its own FEATURE_MARKERS',
  },
  {
    name: 'a marker starts matching the empty string, and would claim every chunk in the build',
    guard: `${GUARDS}/the-cost-table-can-name-what-it-measures.mjs`,
    file: 'scripts/perf/lib/chunk-attribution.mjs',
    find: "  { feature: 'Lucide icons', test: /lucide/,",
    replace: "  { feature: 'Lucide icons', test: /lucide|/,",
    expect: 'EMPTY STRING',
  },
  {
    name: 'two markers claim one feature, so one of them can never be the answer',
    guard: `${GUARDS}/the-cost-table-can-name-what-it-measures.mjs`,
    file: 'scripts/perf/lib/chunk-attribution.mjs',
    find: "  { feature: 'Supabase client', test: /GoTrueClient|PostgrestClient/,",
    replace: "  { feature: 'React DOM', test: /GoTrueClient|PostgrestClient/,",
    expect: 'both claim the feature',
  },

  /*
   * no-punctuation-standing-in-for-a-value (21 September 2026), three drills.
   *
   * The first two are the exact lines the em-dash scrub left behind, restored
   * character for character. The third is a mark the scrub did not produce and
   * that would read identically wrong, so the guard is shown to hold the class
   * rather than one character.
   */
  {
    name: 'a buyer with no name is called ":" again, on the order detail page',
    guard: `${GUARDS}/no-punctuation-standing-in-for-a-value.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/orders/[orderId]/page.tsx',
    find: "{buyerName || 'Not given'}",
    replace: "{buyerName || ':'}",
    expect: 'standing in for a value',
  },
  {
    name: 'a ticket tier with no capacity reads "0/:" again',
    guard: `${GUARDS}/no-punctuation-standing-in-for-a-value.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/page.tsx',
    find: "{tier.sold_count}/{tier.total_capacity || '-'}",
    replace: "{tier.sold_count}/{tier.total_capacity || ':'}",
    expect: 'standing in for a value',
  },
  {
    name: 'a different separator mark, to show the guard holds the class and not one character',
    guard: `${GUARDS}/no-punctuation-standing-in-for-a-value.mjs`,
    file: 'src/components/orders/order-table.tsx',
    find: "{order.buyer_name || 'Not given'}",
    replace: "{order.buyer_name || '|'}",
    expect: 'standing in for a value',
  },


  /*
   * a-drive-waits-for-a-cached-flag (lane B, 19 September 2026), four drills.
   *
   * The guard exists because a drive process cannot invalidate the server's
   * feature-flag cache, and three separate drives wrote three spellings of a
   * helper that returns silently when it cannot. The GA2 matcher drive failed
   * three consecutive runs on a 30-second click at a button that was never
   * going to enable, and the error named none of the three conditions that
   * disable it.
   *
   * THE FIRST DRILL IS THE REAL REGRESSION: take the wait out of ga2 and the
   * guard must refuse, because that is the state the tree was in this morning.
   */
  {
    name: 'the matcher drive goes back to clicking at whatever the first render showed',
    guard: `${GUARDS}/a-drive-waits-for-a-cached-flag.mjs`,
    file: 'scripts/verify/ga2-matcher-drive.mjs',
    find: 'async function waitForProduceButton(page, { enabled, url }) {',
    replace: 'async function notAWaiter(page, { enabled, url }) {',
    expect: 'writes public.feature_flags and drives a browser',
  },
  {
    name: 'a register entry names a drive that no longer flips a flag',
    guard: `${GUARDS}/a-drive-waits-for-a-cached-flag.mjs`,
    file: 'scripts/guards/a-drive-waits-for-a-cached-flag.mjs',
    find: "file: 'scripts/verify/waitlist-bridge-e2e.mjs',",
    replace: "file: 'scripts/verify/waitlist-bridge-renamed.mjs',",
    expect: 'a register entry no longer matches',
  },
  {
    name: "the flag-write matcher quietly stops seeing a supabase-js write",
    guard: `${GUARDS}/a-drive-waits-for-a-cached-flag.mjs`,
    file: 'scripts/guards/a-drive-waits-for-a-cached-flag.mjs',
    find: `const SUPABASE_WRITE = /${BSL}.from${BSL}(${BSL}s*['"]feature_flags['"]${BSL}s*${BSL})`,
    replace: `const SUPABASE_WRITE = /never-matches-anything-at-all/g; const UNUSED_SUPABASE_WRITE = /${BSL}.from${BSL}(${BSL}s*['"]feature_flags['"]${BSL}s*${BSL})`,
    expect: 'REFUSING: the calibration probe',
  },
  {
    name: 'the guard stops being able to see that a drive opens a page',
    guard: `${GUARDS}/a-drive-waits-for-a-cached-flag.mjs`,
    file: 'scripts/guards/a-drive-waits-for-a-cached-flag.mjs',
    find: `const DRIVES_A_BROWSER = /${BSL}bpage${BSL}.(goto|getByRole|locator)${BSL}s*${BSL}(/`,
    replace: `const DRIVES_A_BROWSER = /never-matches-a-browser-at-all/; const UNUSED_DRIVES = /${BSL}bpage${BSL}.(goto|getByRole|locator)${BSL}s*${BSL}(/`,
    expect: 'REFUSING: the calibration probe',
  },

  /*
   * discovery-consent-is-asked-once-and-never-preticked (lane B, 19 September 2026), five drills, one per clause.
   *
   * The guard shipped having ALREADY found one live defect: the homepage email
   * signup panel rendered "I agree to receive community event updates from
   * EventLinqs" beside a box carrying `defaultChecked`, and stored consent:
   * true for an agreement nobody made. The first drill puts that back, because
   * that is the state the tree was in this morning.
   */
  {
    name: 'a consent checkbox is pre ticked again, which is where the tree actually was',
    guard: `${GUARDS}/discovery-consent-is-asked-once-and-never-preticked.mjs`,
    file: 'src/components/features/home/email-signup-panel.tsx',
    find: `                type="checkbox"
                name="consent"`,
    replace: `                type="checkbox"
                name="consent"
                defaultChecked`,
    expect: 'renders a consent checkbox and carries defaultChecked',
  },
  {
    name: 'the payment step stops reading the placement, so it asks whatever the placement says',
    guard: `${GUARDS}/discovery-consent-is-asked-once-and-never-preticked.mjs`,
    file: 'src/app/checkout/[reservation_id]/page.tsx',
    find: 'resolveCapturePlacement(admin)',
    replace: "Promise.resolve('checkout' as const)",
    expect: 'does not resolve the capture placement',
  },
  {
    name: 'a discovery reader stops asking the consent door',
    guard: `${GUARDS}/discovery-consent-is-asked-once-and-never-preticked.mjs`,
    file: 'src/lib/matching/run.ts',
    find: 'filterPermittedRecipients(admin, emails,',
    replace: 'Promise.resolve(new Set<string>()), ((admin, emails,',
    expect: 'reads public.audience_members',
  },
  {
    name: 'the placement decision log stops refusing UPDATE',
    guard: `${GUARDS}/discovery-consent-is-asked-once-and-never-preticked.mjs`,
    file: 'supabase/migrations/20260919000110_marketing_capture_placement.sql',
    find: 'before update on public.marketing_capture_placement',
    replace: 'before insert on public.marketing_capture_placement',
    expect: 'does not refuse UPDATE',
  },
  {
    name: 'the two percent rule goes back to comparing a rounded delta',
    guard: `${GUARDS}/discovery-consent-is-asked-once-and-never-preticked.mjs`,
    file: 'src/lib/consent/capture-conversion-math.ts',
    find: '} else if (fallExceedsLimit(b, a, fallLimit)) {',
    replace: '} else if (deltaPoints < -fallLimit) {',
    expect: 'no longer decides the two percent rule in whole numbers',
  },

  /*
   * the-group-rate-and-the-sharer-are-honest (lane B, 19 September 2026), five drills, one
   * per clause. The fifth is the interesting one: it asserts the guard refuses
   * a surface that SHOWS a price nothing charges, which is the placeholder the
   * Definition of Done calls a defect, and it releases itself the day the squad
   * payment step reads the rate.
   */
  {
    name: 'the group rate floor stops reading the fee and becomes a second copy of it',
    guard: `${GUARDS}/the-group-rate-and-the-sharer-are-honest.mjs`,
    file: 'supabase/migrations/20260919000120_group_rate_and_its_floor.sql',
    find: "    'platform_fee_percentage', p_event_id, p_organisation_id, p_country_code, p_currency);",
    replace: "    'platform_fee_percentage_renamed', p_event_id, p_organisation_id, p_country_code, p_currency);",
    expect: 'does not resolve platform_fee_percentage from pricing_rules',
  },
  {
    name: 'a currency is added to the calculator and the SQL never hears about it',
    guard: `${GUARDS}/the-group-rate-and-the-sharer-are-honest.mjs`,
    file: 'src/lib/payments/payment-calculator.ts',
    find: "  ZAR: 'ZA',",
    replace: "  ZAR: 'ZA',\n  SGD: 'SG',",
    expect: 'maps SGD to nothing',
  },
  {
    name: 'the ticket page loses its share bar again',
    guard: `${GUARDS}/the-group-rate-and-the-sharer-are-honest.mjs`,
    file: 'src/app/t/[code]/page.tsx',
    find: '            <EventShareBar',
    replace: '            <NoShareBarHere',
    expect: 'carries no tracked share bar',
  },
  {
    name: 'the coefficient starts counting sharers it cannot identify',
    guard: `${GUARDS}/the-group-rate-and-the-sharer-are-honest.mjs`,
    file: 'src/lib/growth/referral-coefficient-math.ts',
    find: 'const coefficient = referralCoefficient(fromAKnownBuyer, soldOrders)',
    replace: 'const coefficient = referralCoefficient(attributed, soldOrders)',
    expect: 'no longer computed from the known-buyer count',
  },
  {
    name: 'a page shows a group rate that nothing on the platform charges',
    guard: `${GUARDS}/the-group-rate-and-the-sharer-are-honest.mjs`,
    file: 'src/app/tickets/page.tsx',
    find: "  const shares = await fetchMyShares(user.id)",
    replace: "  const shares = await fetchMyShares(user.id)\n  await supabase.from('event_group_rates').select('id')",
    expect: 'shows the group rate, and nothing charges it',
  },

  /*
   * the-directory-ranks-the-platform (lane B, LB-DRAWSORT, 21 September 2026),
   * six drills, one per clause.
   *
   * THE FIRST IS THE EDIT SOMEBODY WILL ACTUALLY MAKE, because it is the code
   * that was there until this guard existed and it reads as obviously correct.
   * It also passes every automated proof this platform owns, because they run
   * against a database with five performers, where the alphabetical order and
   * the draw order happen to be the same order.
   */
  {
    name: 'the directory goes back to sorting its page of performers in JavaScript',
    guard: `${GUARDS}/the-directory-ranks-the-platform.mjs`,
    file: 'src/app/artists/page.tsx',
    find: '  const rows = artists.map((a) => ({ artist: a, draw: draw.get(a.id) ?? null }))',
    replace:
      '  const rows = artists.map((a) => ({ artist: a, draw: draw.get(a.id) ?? null }))\n' +
      '  rows.sort((x, y) => (y.draw?.tickets ?? 0) - (x.draw?.tickets ?? 0))',
    expect: 'sorts in JavaScript',
  },
  {
    name: 'the sort control stops reaching the ranked read',
    guard: `${GUARDS}/the-directory-ranks-the-platform.mjs`,
    file: 'src/app/artists/page.tsx',
    find: "  const rankByDraw = raw.sort === 'draw'",
    replace: "  const rankByDraw = raw.order === 'draw'",
    expect: "does not branch on sort === 'draw'",
  },
  {
    name: 'the code calls a ranking function no migration installs',
    guard: `${GUARDS}/the-directory-ranks-the-platform.mjs`,
    file: 'src/lib/marketplace/showcase.ts',
    find: "export const RANKED_DIRECTORY_FUNCTION = 'directory_artists_ranked_by_draw'",
    replace: "export const RANKED_DIRECTORY_FUNCTION = 'directory_artists_ranked_by_takings'",
    expect: 'no migration declares public.directory_artists_ranked_by_takings',
  },
  {
    name: 'the page bound moves back in front of the ranking',
    guard: `${GUARDS}/the-directory-ranks-the-platform.mjs`,
    file: 'supabase/migrations/20260921000010_the_directory_ranks_the_platform_not_the_alphabet.sql',
    find: '  LIMIT GREATEST(COALESCE(p_limit, 48), 0);',
    replace: '  ;',
    expect: 'does not bound AFTER it orders',
  },
  /*
   * TWO CONSENT DRILLS, BECAUSE THE KEY IS WRITTEN TWICE AND THE FIRST VERSION
   * OF THIS DRILL CAUGHT NEITHER. It mutated only the REPORTED number and the
   * guard went green, because the same expression was still standing in the
   * ORDER BY and one `.test()` cannot tell two occurrences from one. The guard
   * now requires both and there is a drill for each, which is the only way to
   * know that.
   */
  {
    name: 'consent stops gating the number the ranking reports',
    guard: `${GUARDS}/the-directory-ranks-the-platform.mjs`,
    file: 'supabase/migrations/20260921000010_the_directory_ranks_the_platform_not_the_alphabet.sql',
    find: '    CASE WHEN cand.draw_consent THEN COALESCE(d.tickets, 0) ELSE 0 END AS published_tickets',
    replace: '    COALESCE(d.tickets, 0) AS published_tickets',
    expect: 'no longer ranks on the PUBLISHED draw',
  },
  {
    name: 'consent stops gating the position, so a withheld number is published by rank',
    guard: `${GUARDS}/the-directory-ranks-the-platform.mjs`,
    file: 'supabase/migrations/20260921000010_the_directory_ranks_the_platform_not_the_alphabet.sql',
    find: '    CASE WHEN cand.draw_consent THEN COALESCE(d.tickets, 0) ELSE 0 END DESC,',
    replace: '    COALESCE(d.tickets, 0) DESC,',
    expect: 'no longer ranks on the PUBLISHED draw',
  },
  {
    name: 'the badge and the rank stop resolving a doubly-claimed order the same way',
    guard: `${GUARDS}/the-directory-ranks-the-platform.mjs`,
    file: 'src/lib/marketplace/showcase.ts',
    find: '        occurredAt < held.occurredAt ||',
    replace: '        true ||',
    expect: 'no longer resolve a doubly-claimed order the same way',
  },

  /*
   * organic-is-not-direct (lane B, close-out AQ3, 19 September 2026), five
   * drills, one per way of losing the acceptance line.
   *
   * THE FIRST IS THE EDIT SOMEBODY WILL ACTUALLY MAKE. search.brave.com really
   * is absent from Google's published table, so Brave traffic really does read
   * as a referral, and adding `brave` by hand looks like fixing a bug. It is
   * not: it is this repository asserting a third-party specification from
   * memory, which is exactly what Law 7 forbids and what the seal refuses.
   */
  {
    name: 'a search engine is added to the published table by hand',
    guard: `${GUARDS}/organic-is-not-direct.mjs`,
    file: 'src/lib/growth/source-categories.generated.ts',
    find: `  "bing": 'search',`,
    replace: `  "bing": 'search',\n  "brave": 'search',`,
    expect: 'has been edited by hand',
  },
  {
    name: 'the generated table loses the banner that is a reader only warning',
    guard: `${GUARDS}/organic-is-not-direct.mjs`,
    file: 'src/lib/growth/source-categories.generated.ts',
    find: ' * GENERATED FILE. DO NOT EDIT BY HAND.',
    replace: ' * A perfectly ordinary file somebody may edit.',
    expect: 'has lost its',
  },
  {
    name: 'the table loses the citation that makes it evidence rather than an opinion',
    guard: `${GUARDS}/organic-is-not-direct.mjs`,
    file: 'src/lib/growth/source-categories.generated.ts',
    find: '  rules:',
    replace: '  notTheRules:',
    expect: 'no longer carries its provenance',
  },
  {
    name: 'a client component imports the classifier and ships the whole table to a phone',
    guard: `${GUARDS}/organic-is-not-direct.mjs`,
    file: 'src/components/analytics/consent-banner.tsx',
    find: "import { useConsent } from './consent-provider'",
    replace:
      "import { useConsent } from './consent-provider'\n" +
      "import { channelForVisit } from '@/lib/growth/traffic-channel'\n" +
      'void channelForVisit',
    expect: 'client component(s) reach',
  },
  {
    name: 'the free traffic page stops naming direct beside organic search',
    guard: `${GUARDS}/organic-is-not-direct.mjs`,
    file: 'src/app/admin/(authed)/traffic/page.tsx',
    find: '  const direct = summary.direct',
    replace: '  const direct = summary.organicSearch',
    expect: 'never name direct',
  },

  /*
   * evidence-outlives-the-account (lane B, 19 September 2026), four drills.
   *
   * THE FIRST IS THE TREE AS IT ACTUALLY STOOD THIS MORNING: put the foreign key
   * back and no account on the platform can be deleted again, which is what the
   * AQ3 teardown discovered after eighteen of them had quietly piled up on TEST.
   */
  {
    name: 'the foreign key that made every account undeletable is put back',
    guard: `${GUARDS}/evidence-outlives-the-account.mjs`,
    file: 'supabase/migrations/20260919000130_evidence_outlives_the_account.sql',
    find: 'alter table public.marketing_capture_placement\n  drop constraint if exists marketing_capture_placement_decided_by_fkey;',
    replace: '-- the drop, removed by a drill',
    expect: 'a parent row can never be deleted',
  },
  {
    name: 'the guard stops recognising a statement level refusal',
    guard: `${GUARDS}/evidence-outlives-the-account.mjs`,
    file: 'scripts/guards/lib/referential-keys.mjs',
    find: "export const REFUSAL = 'refuse_ledger_mutation'",
    replace: "const REFUSAL = 'a_function_no_migration_in_this_tree_uses'",
    expect: 'REFUSING: the calibration probe',
  },
  {
    name: 'the guard stops honouring a constraint that was later dropped',
    guard: `${GUARDS}/evidence-outlives-the-account.mjs`,
    file: 'scripts/guards/lib/referential-keys.mjs',
    find: 'const DROP_CONSTRAINT = /alter',
    replace: 'const DROP_CONSTRAINT = /never-matches-a-drop-at-all/gi\nconst UNUSED_DROP_CONSTRAINT = /alter',
    expect: 'REFUSING: the calibration probe',
  },
  {
    name: 'the guard starts believing a drop that was only ever written in a comment',
    guard: `${GUARDS}/evidence-outlives-the-account.mjs`,
    file: 'scripts/guards/lib/referential-keys.mjs',
    find: "    .map(line => line.replace(/--.*$/, ''))",
    replace: '    .map(line => line)',
    expect: 'REFUSING: the calibration probe',
  },

  /*
   * one-way-to-delete-an-account (lane B, 19 September 2026), four drills.
   *
   * THE SAME INCIDENT FROM THE OTHER SIDE. `evidence-outlives-the-account`
   * guards the CAUSE; this guards the BLINDFOLD that let the cause live for
   * five days. Every teardown discarded the deletion error and then asserted
   * "left as found" from a read of `profiles`, which the line above it had
   * already deleted, so the assertion was true whether or not the account
   * still existed.
   *
   * THE FIRST IS THE LINE AS IT STOOD IN TWENTY DRIVES THIS MORNING.
   */
  {
    name: 'a drive goes back to swallowing the deletion error',
    guard: `${GUARDS}/one-way-to-delete-an-account.mjs`,
    file: 'scripts/verify/pl1-loops-drive.mjs',
    find: 'await tearDownAccountOrFailTheRun(db, id)',
    replace: 'await db.auth.admin.deleteUser(id).catch(() => {})',
    expect: 'calls auth.admin.deleteUser directly',
  },
  {
    name: 'a baselined file is converted and its debt line is left behind',
    guard: `${GUARDS}/one-way-to-delete-an-account.mjs`,
    file: 'scripts/guards/one-way-to-delete-an-account.mjs',
    find: "  { path: 'scripts/verify/quiet-hours-proof.mjs', lane: 'C', why: 'the notification router' },",
    replace: "  { path: 'scripts/verify/a-file-no-lane-has-ever-written.mjs', lane: 'C', why: 'a drill' },",
    expect: 'Delete the line',
  },
  {
    name: 'the one place stops telling an account that was already gone from a refusal',
    guard: `${GUARDS}/one-way-to-delete-an-account.mjs`,
    file: 'scripts/verify/lib/teardown-account.mjs',
    find: 'export function accountIsGone',
    replace: 'function accountIsGone',
    expect: 'no longer has',
  },
  {
    name: 'the one place prints the refusal and stops failing the run',
    guard: `${GUARDS}/one-way-to-delete-an-account.mjs`,
    file: 'scripts/verify/lib/teardown-account.mjs',
    find: 'process.exitCode = 1',
    replace: 'void 0',
    expect: 'no longer fails the run',
  },

  /*
   * a-referential-null-is-not-an-edit (lane B, 19 September 2026), seven drills.
   *
   * THE FIRST TWO ARE THE TREE AS IT ACTUALLY STOOD THIS MORNING: take the
   * column list off either trigger and the defect comes straight back. Both
   * were driven against TEST before the fix was written, and the second one
   * arms itself with the calendar, so "nobody would do that" is not a defence.
   */
  {
    name: 'the group rate floor goes back to judging a price on an account closure',
    guard: `${GUARDS}/a-referential-null-is-not-an-edit.mjs`,
    file: 'supabase/migrations/20260919000140_a_referential_null_is_not_an_edit.sql',
    find: '  before insert or update of event_id, ticket_tier_id, unit_price_cents\n  on public.event_group_rates',
    replace: '  before insert or update on public.event_group_rates',
    expect: 'event_group_rates.trg_event_group_rates_floor',
  },
  {
    name: 'the consent check goes back to judging a deleted order',
    guard: `${GUARDS}/a-referential-null-is-not-an-edit.mjs`,
    file: 'supabase/migrations/20260919000140_a_referential_null_is_not_an_edit.sql',
    find: '  before insert or update of email\n  on public.audience_members',
    replace: '  before insert or update on public.audience_members',
    expect: 'audience_members.trg_audience_requires_live_consent',
  },
  {
    name: 'a column list is made to name the very key a parent delete blanks',
    guard: `${GUARDS}/a-referential-null-is-not-an-edit.mjs`,
    file: 'supabase/migrations/20260919000140_a_referential_null_is_not_an_edit.sql',
    find: '  before insert or update of event_id, ticket_tier_id, unit_price_cents\n  on public.event_group_rates',
    replace: '  before insert or update of event_id, ticket_tier_id, unit_price_cents, created_by\n  on public.event_group_rates',
    expect: 'which the database blanks when a parent row is deleted',
  },
  {
    /*
     * THE DRIFT, WHICH IS THE WORSE HALF. A column list that stops covering
     * what the function reads does not refuse anything loudly: the check simply
     * stops running, and a group rate under the floor goes in unopposed.
     */
    name: 'a column list stops covering a column the function still reads',
    guard: `${GUARDS}/a-referential-null-is-not-an-edit.mjs`,
    file: 'supabase/migrations/20260919000140_a_referential_null_is_not_an_edit.sql',
    find: '  before insert or update of event_id, ticket_tier_id, unit_price_cents\n  on public.event_group_rates',
    replace: '  before insert or update of event_id, ticket_tier_id\n  on public.event_group_rates',
    expect: 'silently stops running',
  },
  {
    name: 'the guard stops being able to read an event list at all',
    guard: `${GUARDS}/a-referential-null-is-not-an-edit.mjs`,
    file: 'scripts/guards/lib/referential-keys.mjs',
    find: 'const UPDATE_OF = /',
    replace: 'const UPDATE_OF = /never-matches-a-column-list/\nconst UNUSED_UPDATE_OF = /',
    expect: 'REFUSING: the calibration probe',
  },
  {
    name: 'the guard starts demanding a column the function only stamps',
    guard: `${GUARDS}/a-referential-null-is-not-an-edit.mjs`,
    file: 'scripts/guards/a-referential-null-is-not-an-edit.mjs',
    find: '    if (!readElsewhere) read.delete(name)',
    replace: '    void readElsewhere',
    expect: 'REFUSING: the calibration probe',
  },
  {
    /*
     * THE LIST CAN ONLY SHRINK. An entry that stops matching a real defect is
     * a finding, which is the only thing that stops a baseline rotting into an
     * unexamined list.
     */
    name: 'a trigger is excused as another lane’s when it does not have the defect',
    guard: `${GUARDS}/a-referential-null-is-not-an-edit.mjs`,
    file: 'scripts/guards/a-referential-null-is-not-an-edit.mjs',
    find: 'const NOT_THIS_LANE = []',
    replace:
      "const NOT_THIS_LANE = [{ table: 'audience_members', trigger: 'trg_audience_requires_live_consent', lane: 'a drill', why: 'a drill' }]",
    expect: 'no longer matches a trigger with the defect',
  },

  /*
   * one-lawful-writer-of-the-fee (lane B, 20 September 2026), seven drills.
   *
   * THE FIRST ONE IS THE TREE AS IT ACTUALLY STOOD THIS MORNING, and it is the
   * whole reason the guard exists: put the direct INSERT back and /admin/pricing
   * stops being able to save anything at all, exactly as it could not between
   * 27 July and 20 September. It was driven against TEST before the fix was
   * written, 23505 on the AU region default at version 3, so "nobody would
   * write it that way" is not a defence: somebody already had.
   */
  /*
   * the-founder-screens-read-every-row (lane B, 20 September 2026), nine drills, plus six more below for the demand signal.
   *
   * The screen the founder reads the business off summed two unbounded selects
   * with no order and a discarded error. TEST held 801 AUD orders against a
   * ceiling of 1,000, so it was 199 sales from reporting a GMV that stops
   * growing, and a failed read already rendered zero revenue.
   */
  {
    name: 'the GMV orders read goes back to an unbounded select',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/analytics.ts',
    find:
      "      .eq('currency', ANALYTICS_CURRENCY)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to),',
    replace: "      .eq('currency', ANALYTICS_CURRENCY),",
    expect: 'reads orders with no bound',
  },
  {
    name: 'the GMV refunds read goes back to an unbounded select',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/analytics.ts',
    find:
      "        .eq('currency', ANALYTICS_CURRENCY)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .eq('currency', ANALYTICS_CURRENCY),",
    expect: 'reads refunds with no bound',
  },
  {
    /*
     * A ranged read with no total order is not paging: Postgres may hand back
     * one row in two windows and another in none, so the total is wrong in both
     * directions at once.
     */
    name: 'the GMV orders read pages without a stable order',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/analytics.ts',
    find:
      "      .eq('currency', ANALYTICS_CURRENCY)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to),',
    replace: "      .eq('currency', ANALYTICS_CURRENCY)\n" + '      .range(from, to),',
    expect: 'with .range() and no .order()',
  },
  {
    name: 'the GMV refunds read pages without a stable order',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/analytics.ts',
    find:
      "        .eq('currency', ANALYTICS_CURRENCY)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .eq('currency', ANALYTICS_CURRENCY)\n" + '        .range(from, to),',
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * THE SECOND HALF OF THE ORIGINAL DEFECT. `const { data } = await ...`
     * dropped `error`, so a read that FAILED rendered a GMV of zero. A founder
     * acts on zero revenue and cannot tell it from a payments outage.
     */
    name: 'a GMV read goes back to discarding its error',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/analytics.ts',
    find: '    const { data: orgs, error: orgError } = await db',
    replace: '    const { data: orgs } = await db',
    expect: 'destructures `data` and not `error`',
  },
  {
    /*
     * `pricing_rules` is APPEND-ONLY and versioned, so it grows for ever by
     * design. Truncation here is not an undercount, it is an ABSENCE: the loop
     * keeps the first row per target, so a live per-event override that IS
     * being charged vanishes from the only screen that lists overrides.
     */
    name: 'the fee-override list goes back to an unbounded read of pricing_rules',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/pricing.ts',
    find:
      "      .order('version', { ascending: false })\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{',
    replace: "      .order('version', { ascending: false }) as unknown as PromiseLike<{",
    expect: 'reads pricing_rules with no bound',
  },
  {
    /*
     * `version` is NOT unique across scopes, so paging on it alone is undefined:
     * Postgres may hand one row back in two windows and another in none. The
     * guard cannot check uniqueness, but it can insist a paged read is ordered
     * at all, and the second key is why the header says what it says.
     */
    name: 'the fee-override list pages pricing_rules with no order at all',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/pricing.ts',
    find:
      "      .order('version', { ascending: false })\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{',
    replace: '      .range(from, to) as unknown as PromiseLike<{',
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * The fee screen's own read of the CURRENT value. Dropping `error` made a
     * failed read indistinguishable from a scope with no rule yet, and since
     * LB-OVERRIDE0 a null value renders the control on its placeholder, so an
     * unreachable database showed a fee screen that looked like a platform with
     * no fee configured.
     */
    name: 'the current-fee read goes back to discarding its error',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/pricing.ts',
    find: '  const { data, error } = await admin',
    replace: '  const { data } = await admin',
    expect: 'destructures `data` and not `error`',
  },
  {
    /*
     * A GUARD THAT CANNOT FIND ITS SUBJECT MUST NOT REPORT PASS. Move the money
     * dashboard and this has to say so rather than scanning nothing quietly.
     */
    name: 'a founder screen moves and the guard is left judging nothing for it',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'scripts/guards/the-founder-screens-read-every-row.mjs',
    find: "  'src/lib/admin/analytics.ts',\n",
    replace: "  'src/lib/admin/analytics-moved-away.ts',\n",
    expect: 'does not exist',
  },
  /*
   * The demand signal joined the guard on 20 September 2026, six more drills.
   *
   * /admin/network is where the founder decides which city has tipped and who
   * to invite next. Its per-city read was unbounded AND unordered, five of its
   * figures were `count ?? 0`, and the read that subtracts the already-invited
   * is the one that fails towards doing too much rather than too little.
   */
  {
    name: 'the per-city waitlist demand goes back to an unbounded read',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/demand-signal.ts',
    find:
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to),\n' +
      '  )\n',
    replace: '  )\n',
    expect: 'reads city_waitlist_signups with no bound',
  },
  {
    name: 'the per-city waitlist demand pages with no stable order',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/demand-signal.ts',
    find:
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to),\n' +
      '  )\n',
    replace: '      .range(from, to),\n  )\n',
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * CLAUSE 5, THE ONE THE FIRST FIX WOULD HAVE WALKED PAST. Name the result
     * rather than destructuring it, coalesce the count, and every figure on the
     * screen is a lie again while clause 4 sees nothing to judge.
     */
    name: 'a Launch Kit figure goes back to rendering a failed count as zero',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/demand-signal.ts',
    find: "      eventsPublished: countOrRaise('events published', publishedRes),",
    replace: '      eventsPublished: publishedRes.count ?? 0,',
    expect: 'coalesces the count',
  },
  {
    /*
     * THE SUPPRESSION LIST. Truncated or failed, this read puts organisers who
     * have already had their founding invitation back on the list to be emailed
     * a second one.
     */
    name: 'the already-invited list goes back to an unbounded read of founding_invites',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/app/admin/(authed)/network/page.tsx',
    find:
      "        .eq('inviter_kind', 'founder')\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .eq('inviter_kind', 'founder'),",
    expect: 'reads founding_invites with no bound',
  },
  {
    /*
     * The bound moved back off the builder and onto the await, which is the
     * same query and an invisible bound: the chain walker cannot follow a
     * variable across statements and neither can a reader.
     */
    name: 'the founding terms list is bounded somewhere the reader cannot see',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/app/admin/(authed)/network/page.tsx',
    find: '    .limit(FOUNDING_TERMS_SHOWN)\n',
    replace: '\n',
    expect: 'reads organisations with no bound',
  },
  {
    name: 'the founding terms read goes back to discarding its error',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/app/admin/(authed)/network/page.tsx',
    find: '  const { data: termRows, error: termError } = await termQuery',
    replace: '  const { data: termRows } = await termQuery',
    expect: 'destructures `data` and not `error`',
  },
  /*
   * The organiser screens joined the guard on 20 September 2026, five drills.
   *
   * `countEventsAndVolume` exists because a stored counter drifted, and its own
   * header promises the figure "cannot be wrong" now that the rows are counted.
   * Both counting reads were unbounded, so the drift returns by another route.
   */
  {
    name: 'the organiser event count goes back to an unbounded read',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/organisers.ts',
    find:
      "        .in('organisation_id', orgIds)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .in('organisation_id', orgIds),",
    expect: 'reads events with no bound',
  },
  {
    name: 'the organiser event count pages with no stable order',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/organisers.ts',
    find:
      "        .in('organisation_id', orgIds)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .in('organisation_id', orgIds)\n        .range(from, to),",
    expect: 'with .range() and no .order()',
  },
  {
    name: 'the organiser lifetime volume goes back to an unbounded read',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/organisers.ts',
    find:
      "          .eq('status', 'confirmed')\n" +
      "          .order('id', { ascending: true })\n" +
      '          .range(from, to),',
    replace: "          .eq('status', 'confirmed'),",
    expect: 'reads orders with no bound',
  },
  {
    /*
     * A failed read returned null, and the route above renders null as "not
     * found": the screen told the founder a live organisation did not exist.
     */
    name: 'the organiser detail read goes back to discarding its error',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/organisers.ts',
    find: '  const { data: org, error: orgError } = await admin',
    replace: '  const { data: org } = await admin',
    expect: 'destructures `data` and not `error`',
  },
  {
    /*
     * CLAUSE 5 AGAIN, and this one fired on the fix itself while it was being
     * written: `(cascade.count ?? 0) > 0` files "nothing needed pausing" and
     * "the count did not come back" under the same audit entry.
     */
    name: 'the suspend cascade goes back to coalescing the count it audits',
    guard: `${GUARDS}/the-founder-screens-read-every-row.mjs`,
    file: 'src/lib/admin/organisers.ts',
    find: '    } else if (cascade.count === null) {',
    replace: '    } else if ((cascade.count ?? 0) < 0) {',
    expect: 'coalesces the count',
  },
  /*
   * the-audit-log-says-when-it-could-not-write (lane B, 20 September 2026),
   * five drills.
   *
   * Both writers inserted with no destructure, and a PostgREST client reports a
   * refused write in `error` rather than throwing, so the try/catch could not
   * see the failure it was written for. The catch then logged only outside
   * production. Every drill below is one of the two defects, or the half of the
   * contract that was right.
   */
  {
    name: 'the audit insert goes back to ignoring whether the row was written',
    guard: `${GUARDS}/the-audit-log-says-when-it-could-not-write.mjs`,
    file: 'src/lib/admin/audit.ts',
    find: '    const { error } = await createAdminClient()\n      .from(\'audit_log\')\n      .insert({\n        actor_id: session.userId,',
    replace: '    await createAdminClient()\n      .from(\'audit_log\')\n      .insert({\n        actor_id: session.userId,',
    expect: 'without binding `error`',
  },
  {
    name: 'the anonymous audit insert goes back to ignoring it too',
    guard: `${GUARDS}/the-audit-log-says-when-it-could-not-write.mjs`,
    file: 'src/lib/admin/audit.ts',
    find: '    const { error } = await createAdminClient()\n      .from(\'audit_log\')\n      .insert({\n        actor_id: null,',
    replace: '    await createAdminClient()\n      .from(\'audit_log\')\n      .insert({\n        actor_id: null,',
    expect: 'without binding `error`',
  },
  {
    /*
     * THE ONE THAT MADE IT SILENT WHERE IT MATTERS. Reporting only outside
     * production is how this module went quiet in the environment where a
     * missing entry is evidence of nothing having happened.
     */
    name: 'the audit failure path is gated on the environment again',
    guard: `${GUARDS}/the-audit-log-says-when-it-could-not-write.mjs`,
    file: 'src/lib/admin/audit.ts',
    find: "  console.error('[audit] the entry for %s was NOT written: %s', action, reason)",
    replace:
      "  if (process.env.NODE_ENV !== 'production') console.error('[audit] the entry for %s was NOT written: %s', action, reason)",
    expect: 'gates something on NODE_ENV',
  },
  {
    name: 'a writer stops reaching the error reporter',
    guard: `${GUARDS}/the-audit-log-says-when-it-could-not-write.mjs`,
    file: 'src/lib/admin/audit.ts',
    find: '    if (error) return auditCouldNotBeWritten(action, new Error(error.message))\n    return { recorded: true }\n  } catch (err) {\n    return auditCouldNotBeWritten(action, err)\n  }\n}\n\nexport async function recordAnonAuditEvent',
    replace: '    if (error) return { recorded: false }\n    return { recorded: true }\n  } catch (err) {\n    void err\n    return { recorded: false }\n  }\n}\n\nexport async function recordAnonAuditEvent',
    expect: 'never reaches captureException',
  },
  {
    /*
     * THE HALF OF THE ORIGINAL CONTRACT THAT WAS RIGHT, and the easiest thing
     * to lose while fixing the rest: an audit failure must not fail the action
     * that was already taken.
     */
    name: 'the audit writer starts throwing, and fails the action it was only supposed to record',
    guard: `${GUARDS}/the-audit-log-says-when-it-could-not-write.mjs`,
    file: 'src/lib/admin/audit.ts',
    find: '    if (error) return auditCouldNotBeWritten(action, new Error(error.message))',
    replace: '    if (error) throw new Error(error.message)',
    expect: 'contains a `throw`',
  },
  /*
   * the-recovery-stop-list-is-whole (lane B, 20 September 2026), eleven drills.
   *
   * The guard exists because two guards already stood over this engine and both
   * were satisfied while the abandoned-checkout sender mailed people who had
   * unsubscribed. Measured on TEST before the fix: 147 people carried a
   * suppression event, recovery_suppressions held 19 rows, and the read of it
   * was unbounded against a server that stops at 1,000 rows in silence
   * (Content-Range: 0-999/14364, measured the same day).
   */
  {
    name: 'the suppression list goes back to an unbounded read of the first thousand names',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/fillrate/read.ts',
    find:
      "      .from('recovery_suppressions')\n" +
      "      .select('contact_email')\n" +
      "      .eq('source_system', SOURCE)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to),',
    replace:
      "      .from('recovery_suppressions')\n" +
      "      .select('contact_email')\n" +
      "      .eq('source_system', SOURCE),",
    expect: 'reads recovery_suppressions with no bound',
  },
  /*
   * Clause 1 widened from one table to the three the engine owns on
   * 20 September 2026, four more drills. The send log is the one nearest the
   * cliff: 452 rows on the busiest slot on TEST against a ceiling of 1,000, and
   * short it writes to somebody a second time.
   */
  {
    name: 'the already-sent set goes back to an unbounded read, and somebody is written to twice',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/fillrate/read.ts',
    find:
      "        .select('contact_email, message_number')\n" +
      "        .eq('slot_id', slotId)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .select('contact_email, message_number')\n        .eq('slot_id', slotId),",
    expect: 'reads recovery_sends with no bound',
  },
  {
    name: 'the holds on a slot go back to an unbounded read, and a held seat is offered twice',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/fillrate/read.ts',
    find:
      "      .select('id, demand_entry_id, contact_email, inventory_class, units, expires_at, claimed_at, released_at')\n" +
      "      .eq('slot_id', slotId)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to),',
    replace:
      "      .select('id, demand_entry_id, contact_email, inventory_class, units, expires_at, claimed_at, released_at')\n" +
      "      .eq('slot_id', slotId),",
    expect: 'reads recovery_holds with no bound',
  },
  {
    name: 'the recovery proof goes back to an unbounded read of what it sent',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/fillrate/proof.ts',
    find:
      "        .select('contact_email, sent_at')\n" +
      "        .eq('slot_id', slotId)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .select('contact_email, sent_at')\n        .eq('slot_id', slotId),",
    expect: 'reads recovery_sends with no bound',
  },
  {
    name: 'the recovery proof goes back to an unbounded read of the holds it reports',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/fillrate/proof.ts',
    find:
      "          .select('claimed_at, released_at, expires_at')\n" +
      "          .eq('slot_id', slotId)\n" +
      "          .order('id', { ascending: true })\n" +
      '          .range(from, to),',
    replace: "          .select('claimed_at, released_at, expires_at')\n          .eq('slot_id', slotId),",
    expect: 'reads recovery_holds with no bound',
  },
  {
    /*
     * The reversal condition's own numerator. Truncate it while the denominator
     * stays an exact count and both rates read smaller than they are, so the
     * brake that should stop the engine holds off exactly when it ought to fire.
     */
    name: 'the reversal condition goes back to counting only the first page of suppressions',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/fillrate/rates.ts',
    find:
      "        .from('recovery_suppressions')\n" +
      "        .select('reason')\n" +
      "        .eq('source_system', SOURCE_SYSTEM)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace:
      "        .from('recovery_suppressions')\n" +
      "        .select('reason')\n" +
      "        .eq('source_system', SOURCE_SYSTEM),",
    expect: 'reads recovery_suppressions with no bound',
  },
  {
    name: 'the bridge stops asking the consent ledger who has withdrawn',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/recovery/consent-stops.ts',
    find: 'await addressesStoppedForFacilitatedMail(db)',
    replace: 'await Promise.resolve(new Set())',
    expect: 'does not call addressesStoppedForFacilitatedMail',
  },
  {
    name: 'the bridge writes the suppression row itself instead of through the engine',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/recovery/consent-stops.ts',
    find: "    await suppress(address, 'unsubscribed', db)",
    replace: "    await db.from('recovery_suppressions').upsert({ contact_email: address })",
    expect: "does not write through the engine's own suppress()",
  },
  {
    name: 'the sweep stops reconciling at all, and every unit test still passes',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/app/api/cron/recovery-sweep/route.ts',
    find: '    const stops = await syncConsentStopsIntoRecovery()',
    replace: '    const stops = { stopped: 0, added: 0, alreadyHeld: 0 }',
    expect: 'never calls syncConsentStopsIntoRecovery()',
  },
  {
    /*
     * ORDER IS THE WHOLE CLAUSE. A sweep that reconciles afterwards has already
     * mailed the people it was about to learn had unsubscribed.
     */
    name: 'the sweep reconciles AFTER it sweeps, which is the same as not at all',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/app/api/cron/recovery-sweep/route.ts',
    find: '    const stops = await syncConsentStopsIntoRecovery()',
    replace:
      '    await sweepAbandonedCheckouts(eventLinqsLinks, new Date())\n' +
      '    const stops = await syncConsentStopsIntoRecovery()',
    expect: 'AFTER sweepAbandonedCheckouts()',
  },
  {
    /*
     * The boundary the fix could have broken. Close-out D2: the engine reads
     * the ledger and nothing else, so the bridge lives outside it and the
     * engine never reaches back across.
     */
    name: 'the engine reaches back across its own boundary and imports the bridge',
    guard: `${GUARDS}/the-recovery-stop-list-is-whole.mjs`,
    file: 'src/lib/fillrate/rates.ts',
    find: "import { readEveryRow } from '@/lib/supabase/read-every-row'",
    replace:
      "import { readEveryRow } from '@/lib/supabase/read-every-row'\n" +
      "import { syncConsentStopsIntoRecovery } from '@/lib/recovery/consent-stops'",
    expect: 'imports the bridge',
  },
  {
    name: 'the fee writer goes back to inserting directly and leaving the old row open',
    guard: `${GUARDS}/one-lawful-writer-of-the-fee.mjs`,
    file: 'src/lib/admin/pricing.ts',
    find: "const { data, error } = await admin.rpc('write_pricing_rule', {",
    replace: "const { data, error } = await admin.from('pricing_rules').insert({",
    expect: 'calls .insert() on pricing_rules directly',
  },
  {
    /*
     * THE SECOND REFUSAL, 23514. The form shipped defaultValue={0} against a
     * column constrained to > 0, so the override form as rendered submitted the
     * one value the database rejects and the screen blamed the target id.
     */
    name: 'the percentage bound drifts back to admitting the zero the database refuses',
    guard: `${GUARDS}/one-lawful-writer-of-the-fee.mjs`,
    file: 'src/app/admin/(authed)/pricing/actions.ts',
    find: '  currency: z.string().length(3),\n  platform_fee_percentage: z.coerce.number().gt(0).max(100),',
    replace: '  currency: z.string().length(3),\n  platform_fee_percentage: z.coerce.number().min(0).max(100),',
    expect: 'so the schema must use .gt(0)',
  },
  {
    name: 'a fee control offers a minimum the database will not accept',
    guard: `${GUARDS}/one-lawful-writer-of-the-fee.mjs`,
    file: 'src/app/admin/(authed)/pricing/page.tsx',
    find: '              min="0.01"\n              max="100"\n              required\n              placeholder="e.g. 2.5"',
    replace: '              min="0"\n              max="100"\n              required\n              placeholder="e.g. 2.5"',
    expect: 'offers min="0" on platform_fee_percentage',
  },
  {
    /*
     * THE ZERO FALLBACK. On TEST the IE/EUR scope holds none of the three
     * rules, so `?? 0` is not hypothetical: it is what the Europe row rendered,
     * and it is why that row could not be saved.
     */
    name: 'a scope with no rule yet goes back to being handed a zero it cannot save',
    guard: `${GUARDS}/one-lawful-writer-of-the-fee.mjs`,
    file: 'src/app/admin/(authed)/pricing/page.tsx',
    find: 'defaultValue={row.platformFeePercentage.value ?? undefined}',
    replace: 'defaultValue={row.platformFeePercentage.value ?? 0}',
    expect: 'defaults platform_fee_percentage to 0',
  },
  {
    name: 'the fee writer is opened up to a browser session',
    guard: `${GUARDS}/one-lawful-writer-of-the-fee.mjs`,
    file: 'supabase/migrations/20260920000010_the_writer_stamps_the_previous_row.sql',
    find: ') to service_role;',
    replace: ') to service_role, authenticated;',
    expect: 'to authenticated',
  },
  {
    /*
     * RE-AIMED AT THE GUARD 20 September 2026, ON THE MERGED TREE, and the
     * reason is the whole value of this drill so it is written down.
     *
     * This drill used to rename the writer inside 20260920000010 and the guard
     * refused. It PASSED ON A VIOLATING TREE here, which is worse than failing:
     * a drill that cannot make its clause fire is a clause nobody is checking.
     * The cause is that TWO migrations now declare the writer. 20260920000011
     * drops 20260920000010's ten-argument signature and declares a new one with
     * five defaults, so both files carry the text clause 4 looks for, and
     * renaming it in either one leaves the other declaring it.
     *
     * NEITHER LANE COULD HAVE SEEN THIS. 20260920000011 and this drill arrived
     * from different lanes; the second declaration exists only on the tree that
     * holds both. A drill edits ONE file, so no single-file aim at a migration
     * can empty the list any more.
     *
     * So it is aimed at the guard, the calibration-probe shape this file already
     * uses wherever a clause cannot be reached from product code. Emptying the
     * candidate list is the narrowest possible probe: the WRITER constant was
     * tried first and is NO GOOD, because renaming it also takes the call-site
     * and grant counts to zero and the guard then refuses on its own
     * did-nothing check instead, which is failing for the wrong reason. Under
     * this probe the other clauses still count 2 writers and 2 grants and only
     * clause 4 speaks.
     *
     * WHAT THIS PROBE NO LONGER PROVES, stated plainly rather than left to be
     * discovered: that clause 4 fires when a REAL migration loses the writer.
     * It cannot, while a dropped declaration still counts as a declaration.
     * Raised for the lane that owns the fee writer as a BORDER in
     * REVIEW-QUEUE-C.md: clause 4 should judge the LIVE writer, not any
     * migration that ever declared one, and then this drill can aim at a
     * migration again.
     */
    name: 'the writer the code is required to call stops existing',
    guard: `${GUARDS}/one-lawful-writer-of-the-fee.mjs`,
    file: `${GUARDS}/one-lawful-writer-of-the-fee.mjs`,
    find: 'const declaring = files.filter((f) =>',
    replace: 'const declaring = [].filter((f) =>',
    expect: 'no migration declares public.write_pricing_rule',
  },
  {
    /*
     * THE BOUND IS DERIVED, NOT TYPED. Relax the CHECK and the guard must turn
     * round and demand `.min(0)` of the code it currently requires `.gt(0)` of.
     * A guard carrying the number itself would go quietly green here, which is
     * how the code and the constraint drifted apart in the first place.
     */
    name: 'the constraint is relaxed and the code is not brought with it',
    guard: `${GUARDS}/one-lawful-writer-of-the-fee.mjs`,
    file: 'supabase/migrations/20260520000001_schema_hygiene.sql',
    find: '       AND value_percentage > 0',
    replace: '       AND value_percentage >= 0',
    expect: 'so the schema must use .min(0)',
  },

  /*
   * the-attribution-panels-count-every-row (lane B, 20 September 2026), six drills.
   *
   * The organiser's reach panel read eight tables with no bound and no error
   * check, and the reconciliation that decides whether it shows a percentage at
   * all compared one number against itself. The last two drills are the ones
   * that matter most: they put the self-referential check back, which is the
   * shape a later tidy-up would most plausibly reach for.
   */
  {
    name: 'the reach panel reads an event’s tracked links with no bound again',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/reach.ts',
    find:
      "        .eq('event_id', eventId)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .eq('event_id', eventId),",
    expect: 'reads share_links with no bound',
  },
  {
    /*
     * share_link_events takes one row per view and one per click, so this is
     * the fastest growing read on the panel and the first to pass the ceiling.
     */
    name: 'the view and click events go back to a single unbounded select',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/reach.ts',
    find:
      "            .in('link_id', chunk)\n" +
      "            .order('id', { ascending: true })\n" +
      '            .range(from, to),',
    replace: "            .in('link_id', chunk),",
    expect: 'reads share_link_events with no bound',
  },
  {
    /*
     * Paging without a total order is not paging: Postgres may hand back one
     * row in two windows and another in none.
     */
    name: 'the reach panel pages its links without a stable order',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/reach.ts',
    find:
      "        .eq('event_id', eventId)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .eq('event_id', eventId)\n" + '        .range(from, to),',
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * An `in` list is bounded by BYTES. Spelling every link id into one URL is
     * the 16 KB break at about 400 shares, and the failure arrives as a
     * discarded error and a panel of zeros.
     */
    name: 'the conversion read spells every link id into one in clause',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/sales-attribution.ts',
    find: "              .in('link_id', chunk)",
    replace: "              .in('link_id', links.map(l => l.id))",
    expect: 'rather than from a chunk',
  },
  {
    /*
     * THE ONE THAT MATTERS. Put the self-referential comparison back and the
     * panel returns to showing a share-of-sales percentage with no check over
     * it at all, which is what it did until this item.
     */
    name: 'the reconciliation goes back to comparing totals against itself',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/sales-attribution.ts',
    find: '    orders: ledgerSoldOrders - bucketOrders,',
    replace: '    orders: totals.orders - bucketOrders,',
    expect: 'computes `discrepancy` from `totals.`',
  },
  {
    /*
     * The other half of clause 5, and neither alone is enough: this one does
     * NOT mention `totals.`, so only the "came from countOrRaise" half can
     * catch it. Without that half, an expected side counted anywhere in this
     * module would pass while proving nothing.
     */
    name: 'the reconciliation drops the server count and uses a local number',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/sales-attribution.ts',
    find:
      '    orders: ledgerSoldOrders - bucketOrders,\n' +
      '    tickets: ledgerSoldTickets - bucketTickets,',
    replace: '    orders: sold.length - bucketOrders,\n' + '    tickets: bucketTickets - bucketTickets,',
    expect: 'without any value that came from',
  },

  /*
   * The artist half of the same guard, four more. The last two are the reads
   * whose failure is not a shrunken number: an event meta row that does not
   * arrive DELETES a show from the artist's history (`if (!meta) continue`),
   * and an artist name that does not arrive is rendered as the words "Unknown
   * artist" on the organiser's lineup panel (`?? 'Unknown artist'`).
   */
  {
    name: 'the artist profile lookup goes back to discarding its error',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/artists.ts',
    find:
      "  const data = await readOrThrow('artist-by-slug', () =>\n" +
      "    admin.from('artists').select(ARTIST_COLUMNS).eq('slug', slug).maybeSingle(),\n" +
      '  )',
    replace:
      "  const { data } = await admin.from('artists').select(ARTIST_COLUMNS).eq('slug', slug).maybeSingle()",
    expect: 'destructures the result without',
  },
  {
    name: 'the artist proof-of-draw links go back to an unbounded select',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/artists.ts',
    find:
      "        .eq('artist_id', artistId)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to),',
    replace: "        .eq('artist_id', artistId),",
    expect: 'reads share_links with no bound',
  },
  {
    name: 'the show that a lost row would delete goes back to an unbounded select',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/artists.ts',
    find:
      "            .select('id, title, slug, start_date')\n" +
      "            .in('id', chunk)\n" +
      "            .order('id', { ascending: true })\n" +
      '            .range(from, to),',
    replace: "            .select('id, title, slug, start_date')\n" + "            .in('id', chunk),",
    expect: 'reads events with no bound',
  },
  {
    name: 'the artist names go back to one unchunked in clause',
    guard: `${GUARDS}/the-attribution-panels-count-every-row.mjs`,
    file: 'src/lib/broadcast/artists.ts',
    find: "          .select('id, name')\n" + "          .in('id', chunk)",
    replace: "          .select('id, name')\n" + "          .in('id', [...byArtist.keys()])",
    expect: 'rather than from a chunk',
  },

  /*
   * the-organiser-dashboard-reads-every-row (lane B, 20 September 2026), five
   * drills. The third is the one the fourth clause exists for: it plants the
   * fix a reader would reach for first, ordering the paged read by the column
   * the page actually wants to sort on, and that column is not unique.
   */
  {
    name: 'the organiser home goes back to one unbounded read of its orders',
    guard: `${GUARDS}/the-organiser-dashboard-reads-every-row.mjs`,
    file: 'src/app/(dashboard)/dashboard/page.tsx',
    find:
      "          .gte('created_at', since60Days)\n" +
      "          .order('id', { ascending: true })\n" +
      '          .range(from, to),',
    replace: "          .gte('created_at', since60Days),",
    expect: 'reads orders with no bound',
  },
  {
    name: 'the organiser home pages its orders with no order at all',
    guard: `${GUARDS}/the-organiser-dashboard-reads-every-row.mjs`,
    file: 'src/app/(dashboard)/dashboard/page.tsx',
    find:
      "          .gte('created_at', since60Days)\n" +
      "          .order('id', { ascending: true })\n" +
      '          .range(from, to),',
    replace: "          .gte('created_at', since60Days)\n" + '          .range(from, to),',
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * THE PLAUSIBLE WRONG FIX. The page wants newest first, so paging on
     * `created_at` descending looks like the tidy answer and reads better than
     * what is there. It is not unique, so two orders taken in the same instant
     * can land in two windows or in none, and revenue is then double counted or
     * lost with nothing on the screen able to say so. Only clause 4 sees this.
     */
    name: 'the orders are paged on created_at, which is not unique',
    guard: `${GUARDS}/the-organiser-dashboard-reads-every-row.mjs`,
    file: 'src/app/(dashboard)/dashboard/page.tsx',
    find: "          .order('id', { ascending: true })\n" + '          .range(from, to),',
    replace: "          .order('created_at', { ascending: false })\n" + '          .range(from, to),',
    expect: 'is not unique on that table',
  },
  {
    name: 'the event overview goes back to an unbounded, unordered read',
    guard: `${GUARDS}/the-organiser-dashboard-reads-every-row.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/page.tsx',
    find:
      "      .eq('event_id', id)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to),',
    replace: "      .eq('event_id', id),",
    expect: 'reads orders with no bound',
  },
  {
    /*
     * The organiser's own profile. A failed read leaves `profile` null,
     * `isOrganiser` false, and an organiser looking at the dashboard of
     * somebody who has never run an event.
     */
    name: 'the organiser profile read goes back to discarding its error',
    guard: `${GUARDS}/the-organiser-dashboard-reads-every-row.mjs`,
    file: 'src/app/(dashboard)/dashboard/page.tsx',
    find:
      '  const [profile, scope] = await Promise.all([\n' +
      "    readOrThrow('dashboard profile', () =>\n" +
      "      supabase.from('profiles').select('*').eq('id', user.id).single(),\n" +
      '    ),',
    replace:
      '  const [{ data: profile }, scope] = await Promise.all([\n' +
      "    supabase.from('profiles').select('*').eq('id', user.id).single(),",
    expect: 'destructures',
  },

  /*
   * the-attendee-list-is-every-attendee (lane B, 20 September 2026), seven
   * drills, one per clause plus the two plausible WRONG fixes.
   *
   * This guard holds the data-ownership promise, which is the growth plan's
   * second blade: an organiser owns every attendee relationship and nothing is
   * withheld. A read that quietly hands back the first thousand rows is that
   * promise broken with nobody to blame, so each drill below restores exactly
   * the shape the surface shipped with before 20 September.
   */
  {
    name: 'the attendee list goes back to one unbounded read of its tickets',
    guard: `${GUARDS}/the-attendee-list-is-every-attendee.mjs`,
    file: 'src/lib/reporting/attendees.ts',
    find:
      "      .eq('event_id', eventId)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{ data: RawTicket[] | null; error: { message: string } | null }>,',
    replace: "      .eq('event_id', eventId),",
    expect: 'reads tickets with no bound',
  },
  {
    /*
     * THE CONSENT ONE, which is the wedge rather than a screen.
     * `organiser_marketing_consents` carries unique (organisation_id, email),
     * so truncation DROPS people and a dropped person reads as NOT consented.
     * The organiser is shown their own lawful audience as smaller than it is,
     * in the one column nobody second-guesses.
     */
    name: 'the marketing consents go back to an unbounded read',
    guard: `${GUARDS}/the-attendee-list-is-every-attendee.mjs`,
    file: 'src/lib/reporting/attendees.ts',
    find:
      "        .eq('organisation_id', eventRow.organisation_id)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to) as unknown as PromiseLike<{ data: ConsentRow[] | null; error: { message: string } | null }>,',
    replace: "        .eq('organisation_id', eventRow.organisation_id),",
    expect: 'reads organiser_marketing_consents with no bound',
  },
  {
    name: 'the orders report pages with no order at all',
    guard: `${GUARDS}/the-attendee-list-is-every-attendee.mjs`,
    file: 'src/lib/reporting/attendees.ts',
    find:
      "      .eq('event_id', eventId)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{ data: RawOrder[] | null; error: { message: string } | null }>,',
    replace:
      "      .eq('event_id', eventId)\n" +
      '      .range(from, to) as unknown as PromiseLike<{ data: RawOrder[] | null; error: { message: string } | null }>,',
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * THE PLAUSIBLE WRONG FIX, and only clause 3 sees it. The attendee list
     * wants oldest-first, so paging on `created_at` looks like the tidy answer
     * and reads better than paging on a uuid. `tickets.created_at` is not
     * unique, so two tickets sold in the same instant can land in two windows
     * or in none: the door list gains a duplicate and loses somebody, and both
     * look completely ordinary on the page.
     */
    name: 'the attendee list is paged on created_at, which is not unique',
    guard: `${GUARDS}/the-attendee-list-is-every-attendee.mjs`,
    file: 'src/lib/reporting/attendees.ts',
    find:
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{ data: RawTicket[] | null; error: { message: string } | null }>,',
    replace:
      "      .order('created_at', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{ data: RawTicket[] | null; error: { message: string } | null }>,',
    expect: 'is not unique on that table',
  },
  {
    /*
     * THE OTHER PLAUSIBLE WRONG FIX. One `.in()` holding every buyer id looks
     * like one fewer round trip. An `in` list is bounded by BYTES, and past the
     * row ceiling it truncates too, so the buyers past it resolve to no profile
     * and fall through to the guest columns, which are NULL for a signed-in
     * buyer. Real named people render as blank rows on their own financial
     * report.
     */
    name: 'the orders report buyer profiles go back to one unchunked in clause',
    guard: `${GUARDS}/the-attendee-list-is-every-attendee.mjs`,
    file: 'src/lib/reporting/attendees.ts',
    find: "          .in('id', chunk)",
    replace: "          .in('id', userIds)",
    expect: 'rather than from a chunk',
  },
  {
    name: 'the door review winners go back to one unchunked in clause',
    guard: `${GUARDS}/the-attendee-list-is-every-attendee.mjs`,
    file: 'src/lib/reporting/door-review.ts',
    find: "        .in('ticket_id', chunk)",
    replace: "        .in('ticket_id', ticketIds)",
    expect: 'rather than from a chunk',
  },
  {
    /*
     * The waiting-list count on the organiser's orders screen. `count ?? 0`
     * rendered a FAILED count as "nobody is waiting", which is the answer that
     * stops an organiser releasing more tickets.
     */
    name: 'the orders screen goes back to coalescing a failed waiting-list count',
    guard: `${GUARDS}/the-attendee-list-is-every-attendee.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx',
    find:
      '        const waiting = countOrRaise(\n' +
      '          `the waiting list for ${t.name}`,\n' +
      '          await adminClient\n' +
      "            .from('waitlist')\n" +
      "            .select('id', { count: 'exact', head: true })\n" +
      "            .eq('ticket_tier_id', t.id)\n" +
      "            .eq('status', 'waiting'),\n" +
      '        )',
      replace:
      '        const { count } = await adminClient\n' +
      "          .from('waitlist')\n" +
      "          .select('id', { count: 'exact', head: true })\n" +
      "          .eq('ticket_tier_id', t.id)\n" +
      "          .eq('status', 'waiting')\n" +
      '        const waiting = count ?? 0',
    /*
     * MATCHED ON THE CLAUSE'S OWN SENTENCE, NOT ON THE WORD "destructures".
     * That word also appears in this guard's work report ("20 await
     * destructures judged"), which prints on every run including a passing
     * one, so a drill expecting it would be satisfied by a guard that failed
     * for some completely unrelated reason. The phrase below appears only in
     * the clause 5 failure.
     */
    expect: 'indistinguishable from an event nobody has bought a ticket to',
  },

  /*
   * the-seating-surfaces-count-every-seat (lane B, 20 September 2026), eight
   * drills, one per clause plus the plausible wrong fix plus BOTH shapes of
   * clause 5.
   *
   * Clause 5 is the reason this guard exists rather than a sixth clause on the
   * organiser-dashboard one. Two of the three ceilings on these screens were
   * BOUNDS: `.range(0, 1999)` in the launch kit and `from < 10000` in the seat
   * manager's own pager. Every other guard in this family asks "is this read
   * bounded" and would have answered PASS about both, which is exactly what
   * they did for as long as they existed alongside them.
   */
  {
    name: 'the seat chart goes back to an unbounded read of its seats',
    guard: `${GUARDS}/the-seating-surfaces-count-every-seat.mjs`,
    file: SEATING_SEATS,
    find: SEATING_SEAT_ORDER,
    replace: "        .order('row_label'),",
    expect: 'reads seats with no bound',
  },
  {
    name: 'the seat chart pages its seats with no order at all',
    guard: `${GUARDS}/the-seating-surfaces-count-every-seat.mjs`,
    file: SEATING_SEATS,
    find: SEATING_SEAT_ORDER,
    replace: '        .range(from, to),',
    expect: 'and no order()',
  },
  {
    /*
     * THE PLAUSIBLE WRONG FIX. A seat chart is read row by row and seat by
     * seat, so ordering the paged read by exactly the two columns the chart is
     * drawn in looks like the obvious and tidy answer. Neither is unique, and a
     * two thousand seat chart has plenty of rows sharing a label, so a window
     * boundary can land between two seats in row K and return one of them in
     * both pages and the other in neither. Only clause 3 sees this.
     */
    name: 'the seats are paged on row and seat number, neither of which is unique',
    guard: `${GUARDS}/the-seating-surfaces-count-every-seat.mjs`,
    file: SEATING_SEATS,
    find: SEATING_SEAT_ORDER,
    replace:
      "        .order('row_label')\n" +
      "        .order('seat_number')\n" +
      '        .range(from, to),',
    expect: 'is unique on that table',
  },
  {
    /*
     * The organiser's own list of events. Unbounded here is not the seat
     * ceiling, it is the list the sold count is joined to.
     */
    name: 'the My Events list goes back to reading every event unbounded',
    guard: `${GUARDS}/the-seating-surfaces-count-every-seat.mjs`,
    file: SEATING_LIST,
    find:
      "      .order('created_at', { ascending: false })\n" +
      "      .order('id')\n" +
      '      .range(from, to)',
    replace: "      .order('created_at', { ascending: false })",
    expect: 'reads events with no bound',
  },
  {
    /*
     * The protected-seat count on the chart list: the number that decides
     * whether an organiser is warned before editing a chart people already hold
     * seats on. `count ?? 0` with no error bound rendered a FAILED count as
     * nought protected seats, which reads as "safe to edit".
     */
    name: 'the protected-seat count goes back to discarding its error',
    guard: `${GUARDS}/the-seating-surfaces-count-every-seat.mjs`,
    file: SEATING_MAPS,
    find: '      const { count, error: protectedError } = await admin',
    replace: '      const { count } = await admin',
    expect: 'indistinguishable from an event that has sold nothing',
  },
  {
    /*
     * CLAUSE 5, FIRST SHAPE, and the exact literal that was in the tree: the
     * launch kit printed its seat count and its open-seat count out of an array
     * capped at two thousand.
     */
    name: 'the launch kit goes back to a literal two thousand seat ceiling',
    guard: `${GUARDS}/the-seating-surfaces-count-every-seat.mjs`,
    file: SEATING_KIT,
    find:
      "          .order('row_label')\n" +
      "          .order('seat_number')\n" +
      "          .order('id')\n" +
      '          .range(from, to),',
    replace:
      "          .order('row_label')\n" +
      "          .order('seat_number')\n" +
      '          .range(0, 1999),',
    expect: 'caps a read at the literal 1999',
  },
  {
    /*
     * CLAUSE 5, SECOND SHAPE, and the exact loop that was in the tree: a
     * hand-rolled pager written to defeat the 1,000-row cap, which stopped at
     * ten thousand and said nothing. A bound, and therefore invisible to every
     * scanner that only asks whether a read is bounded.
     */
    name: 'a hand-rolled pager with a literal ten thousand ceiling comes back',
    guard: `${GUARDS}/the-seating-surfaces-count-every-seat.mjs`,
    file: SEATING_SEATS,
    find: '  const [seats, sections, unassigned] = await Promise.all([',
    replace:
      '  let from = 0\n' +
      '  while (from < 10000) from += 1000\n' +
      '  const [seats, sections, unassigned] = await Promise.all([',
    expect: 'stops paging when the cursor reaches the literal 10000',
  },
  {
    /*
     * CLAUSE 6. An insert of more rows than the response ceiling SUCCEEDS and
     * hands back fewer rows than it wrote, with no error. Paging is not the
     * remedy, because the rows are already in; noticing is, and the only way to
     * notice is to compare the count returned with the count sent.
     */
    name: 'the section insert stops comparing what it got back with what it sent',
    guard: `${GUARDS}/the-seating-surfaces-count-every-seat.mjs`,
    file: SEATING_ACTIONS,
    find: '  if (returnedSections.length !== sectionInserts.length) {',
    replace: '  if (returnedSections.length < 0) {',
    expect: 'reads the representation back with no',
  },

  /*
   * the-weekly-digest-owes-nobody-an-email (lane B, 20 September 2026), seven
   * drills, one per clause plus the plausible wrong fix plus both halves of the
   * send-loop clause.
   *
   * This is the only send path on the platform that writes to STRANGERS, and
   * the drill that matters most is the fourth: the suppression read failed
   * OPEN. One un-chunked `.in()` over a city's whole waitlist exceeded the
   * documented 16 KB URL bound, the request failed, the discarded error left
   * the list EMPTY, and every address that had unsubscribed was put back into
   * the send by its waitlist row. Each drill below restores exactly the shape
   * the digest shipped with before 20 September.
   */
  {
    name: 'the city audience goes back to an unbounded read of its consents',
    guard: `${GUARDS}/the-weekly-digest-owes-nobody-an-email.mjs`,
    file: 'src/lib/broadcast/digest.ts',
    find: AUDIENCE_PAGE,
    replace: "        .eq('city_slug', citySlug),\n",
    expect: 'reads marketing_consents with no bound',
  },
  {
    name: 'the city audience pages its consents with no order at all',
    guard: `${GUARDS}/the-weekly-digest-owes-nobody-an-email.mjs`,
    file: 'src/lib/broadcast/digest.ts',
    find: AUDIENCE_PAGE,
    replace: "        .eq('city_slug', citySlug)\n        .range(from, to),\n",
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * THE PLAUSIBLE WRONG FIX, and only clause 3 sees it. The audience wants
     * oldest first, so ordering on `granted_at` alone reads better than
     * breaking the tie on a uuid. It is not unique, so two people who consented
     * in the same instant can land in two windows or in none. On this path the
     * audience is ALSO the resume order, so the duplicate is a second copy of a
     * marketing email and the loss is somebody who never hears from us.
     */
    name: 'the city audience pages on granted_at alone, which is not unique',
    guard: `${GUARDS}/the-weekly-digest-owes-nobody-an-email.mjs`,
    file: 'src/lib/broadcast/digest.ts',
    find: AUDIENCE_PAGE,
    replace:
      "        .eq('city_slug', citySlug)\n" +
      "        .order('granted_at', { ascending: true })\n" +
      '        .range(from, to),\n',
    expect: 'none of those is unique on that table',
  },
  {
    /*
     * THE ONE THAT FAILED OPEN. Not a truncation: a REFUSAL. The joined address
     * list passes the documented 16 KB URL and header bound at a few hundred
     * ordinary addresses, measured on this project's TEST instance between
     * 15,038 and 16,083 bytes, and the request never reaches the database at
     * all. The suppression list is then empty rather than short.
     */
    name: 'the suppression read goes back to one in() over the whole waitlist',
    guard: `${GUARDS}/the-weekly-digest-owes-nobody-an-email.mjs`,
    file: 'src/lib/broadcast/digest.ts',
    find: "          .in('email', chunk)",
    replace: "          .in('email', waitlistEmails)",
    expect: 'rather than from a chunk',
  },
  {
    name: 'the idempotence read goes back to discarding its error',
    guard: `${GUARDS}/the-weekly-digest-owes-nobody-an-email.mjs`,
    file: 'src/app/api/cron/weekly-digest/route.ts',
    find: '    const { data: openRows, error: openError } = await admin',
    replace: '    const { data: openRows } = await admin',
    expect: 'indistinguishable from an answer',
  },
  {
    /*
     * CLAUSE 6, THE HALF NO READ-SHAPED GUARD COULD CARRY. A slice IS a bound
     * and every scanner in this repository agreed it was one, for as long as it
     * was dropping four hundred people a week in silence.
     */
    name: 'the send loop goes back to slicing its recipients',
    guard: `${GUARDS}/the-weekly-digest-owes-nobody-an-email.mjs`,
    file: 'src/app/api/cron/weekly-digest/route.ts',
    find: '    for (const recipient of plan.toSend) {',
    replace: '    for (const recipient of recipients.slice(0, DIGEST_MAX_RECIPIENTS_PER_RUN)) {',
    expect: 'slices `recipients` directly',
  },
  {
    /*
     * THE ORIGINAL DEFECT WEARING THE NEW COLUMN: the row is read, the column
     * is selected, and the decision still asks only whether a row exists. A row
     * exists as soon as the first batch goes out.
     */
    name: 'the skip goes back to asking whether a row exists rather than whether it closed',
    guard: `${GUARDS}/the-weekly-digest-owes-nobody-an-email.mjs`,
    file: 'src/app/api/cron/weekly-digest/route.ts',
    find: '    if (already?.completed_at && live) {',
    replace: '    if (already && live) {',
    expect: 'never reads completed_at off the row it found',
  },
  {
    /*
     * THE SCOPE ITSELF, DRILLED. `share-links.ts` was added to this guard after
     * its own eight discarded errors were corrected, rather than being declared
     * out of reach. This drill proves the guard actually judges that file: put
     * one discard back and it must say so. Without it, "the scope was widened"
     * would be a claim about a list rather than about behaviour.
     */
    name: 'the share link lookup goes back to discarding its error',
    guard: `${GUARDS}/the-weekly-digest-owes-nobody-an-email.mjs`,
    file: 'src/lib/broadcast/share-links.ts',
    find: '  const { data: existing, error: lookupError } = await lookup.maybeSingle()',
    replace: '  const { data: existing } = await lookup.maybeSingle()',
    expect: 'indistinguishable from an answer',
  },

  /*
   * organiser-money-has-one-source (lane B, 20 September 2026), five drills,
   * one for each way the defect was true.
   *
   * The edit screen rendered the same RevenueSummary as the orders screen from
   * its own unbounded, unordered, error-discarding read of one status. Each
   * drill below puts back exactly one of those properties, because the guard
   * carries three rules and a rule nobody has watched fail is a rule nobody has
   * tested.
   */
  {
    name: 'the revenue read on the edit screen loses its bound',
    guard: `${GUARDS}/organiser-money-has-one-source.mjs`,
    file: 'src/lib/organisers/event-revenue.ts',
    find: "        .order('id', { ascending: true })\n        .range(from, to) as unknown as PromiseLike<{\n        data: (EventRevenueOrderRow & { id: string })[] | null",
    replace: " as unknown as PromiseLike<{\n        data: (EventRevenueOrderRow & { id: string })[] | null",
    expect: 'reads orders with no bound',
  },
  {
    name: 'the refund read pages without the order that makes paging deterministic',
    guard: `${GUARDS}/organiser-money-has-one-source.mjs`,
    file: 'src/lib/organisers/event-revenue.ts',
    find: "          .in('order_id', chunk)\n          .order('id', { ascending: true })\n          .range(from, to)",
    replace: "          .in('order_id', chunk)\n          .range(from, to)",
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * THE SECOND COPY OF THE ARITHMETIC, which is what made the two screens
     * disagree. Bounding the read would not have fixed it and did not.
     */
    name: 'the edit screen goes back to summing the takings itself',
    guard: `${GUARDS}/organiser-money-has-one-source.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/edit/page.tsx',
    find: '  const existingStreamUrl = await readStreamLink(supabase, id)',
    replace:
      '  const rows: { total_cents: number }[] = []\n' +
      '  const grossCents = rows.reduce((s, o) => s + o.total_cents, 0)\n' +
      '  void grossCents\n' +
      '  const existingStreamUrl = await readStreamLink(supabase, id)',
    expect: 'sums total_cents itself',
  },
  {
    /*
     * A SCREEN THAT DRAWS THE CARD WITHOUT REACHING THE ONE SOURCE. This is the
     * defect in its original form: the component was already shared, and only
     * the number behind it was not.
     */
    name: 'a screen renders the revenue card without reaching the module that owns the sum',
    guard: `${GUARDS}/organiser-money-has-one-source.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx',
    find: "import { PAID_ORDER_STATUSES, summariseEventRevenue } from '@/lib/organisers/event-revenue'",
    replace: "const PAID_ORDER_STATUSES = ['confirmed', 'partially_refunded', 'refunded'] as const\nconst summariseEventRevenue = (..._a: unknown[]) => ({}) as never",
    expect: 'without reaching src/lib/organisers/event-revenue.ts',
  },
  {
    /*
     * THE SCOPE ITSELF. A guard whose directory list has been renamed away
     * scans nothing and reports PASS, which is the failure mode the list is
     * checked for existence to prevent.
     */
    name: 'the guard scope names a directory that is not there',
    guard: `${GUARDS}/organiser-money-has-one-source.mjs`,
    file: 'scripts/guards/organiser-money-has-one-source.mjs',
    find: "  'src/lib/organisers',",
    replace: "  'src/lib/organisers-renamed-away',",
    expect: 'a scope that scans nothing reports PASS',
  },

  /*
   * a-marketplace-block-holds (lane B, 20 September 2026), seven drills, one per
   * clause. Two plant the defect in its ORIGINAL form, which is the only way to
   * know the guard would have caught the thing it was written for: the fourth
   * restores `Boolean(data)` over a discarded error in the block check, and the
   * seventh restores `billing_order: count ?? 0`.
   */
  {
    name: 'the marketplace guard names a surface that is not there',
    guard: `${GUARDS}/a-marketplace-block-holds.mjs`,
    file: 'scripts/guards/a-marketplace-block-holds.mjs',
    find: "  'src/lib/marketplace/gigs.ts',",
    replace: "  'src/lib/marketplace/gigs-renamed-away.ts',",
    expect: 'would report PASS',
  },
  {
    name: 'the organiser gig board reads its applicant counts unbounded again',
    guard: `${GUARDS}/a-marketplace-block-holds.mjs`,
    file: 'src/app/(dashboard)/dashboard/gigs/page.tsx',
    find: '    const apps = await readEveryRow<{ gig_id: string }>(',
    replace: [
      "    const { data: unbounded } = await admin",
      "      .from('gig_applications')",
      "      .select('gig_id')",
      "      .in('gig_id', gigIds)",
      '    void unbounded',
      '    const apps = await readEveryRow<{ gig_id: string }>(',
    ].join('\n'),
    expect: 'reads gig_applications with no bound',
  },
  {
    name: 'the organiser gig board goes back to discarding the error on its organisation read',
    guard: `${GUARDS}/a-marketplace-block-holds.mjs`,
    file: 'src/app/(dashboard)/dashboard/gigs/page.tsx',
    find: "  const org = await readOrThrow('organiser-gig-board-organisation', () =>",
    replace: [
      '  const { data: org } = await (async () =>',
      '    await (async () =>',
    ].join('\n'),
    expect: 'destructures `data` and not `error`',
  },
  {
    /*
     * THE ORIGINAL DEFECT, RESTORED. This exact shape is what made a block stop
     * holding for the length of any fault in one read.
     */
    name: 'the block check answers Boolean(data) over a discarded error again',
    guard: `${GUARDS}/a-marketplace-block-holds.mjs`,
    file: 'src/lib/marketplace/gigs.ts',
    find: "  const row = await readOrThrow('marketplace-block-check', () =>",
    replace: [
      '  const { data: row } = await (async () =>',
      '    await (async () =>',
    ].join('\n'),
    expect: 'isPairBlocked no longer reads through readOrThrow',
  },
  {
    name: 'the migration stops installing the block trigger on applications',
    guard: `${GUARDS}/a-marketplace-block-holds.mjs`,
    file: 'supabase/migrations/20260920000060_a_block_holds_when_the_read_blinks.sql',
    find: 'CREATE TRIGGER trg_marketplace_block_on_application',
    replace: 'CREATE TRIGGER trg_marketplace_block_on_application_disabled',
    expect: 'does not install trg_marketplace_block_on_application',
  },
  {
    /*
     * CLAUSE 7, THE ORGANISER SIDE. All three of these functions opened with a
     * read whose error was discarded, so a dropped socket told an organiser
     * that their own event did not exist.
     */
    name: 'createDiscountCode discards the error on its event lookup again',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: '  const { data: event, error: eventError } = await withBuildRetry(',
    replace: '  const { data: event } = await withBuildRetry(',
    expect: 'destructures a read without its `error`',
  },
  {
    name: 'the update lookup answers a FAILED read with Discount code not found',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: "    return { error: COULD_NOT_READ }" + String.fromCharCode(10) + "  }" + String.fromCharCode(10) + "  if (!dc) return { error: 'Discount code not found' }" + String.fromCharCode(10) + "  /*",
    replace: "    return { error: 'Discount code not found' }" + String.fromCharCode(10) + "  }" + String.fromCharCode(10) + "  if (!dc) return { error: 'Discount code not found' }" + String.fromCharCode(10) + "  /*",
    expect: 'FAILURE with a not-found sentence',
  },
  {
    /*
     * THE LABEL, WHICH IS HOW CLAUSE 7 AIMS. Without it that read is invisible
     * to the clause, which then judges nothing for it and reports PASS. This
     * drill replaced a WEAKER version that renamed the constant and did not
     * fire, because three usages kept the name in the file.
     */
    name: 'the delete read loses its label, so clause 7 would judge nothing for it',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: "    { label: 'discount-delete-code-lookup' },",
    replace: "    { label: 'discount-delete-code-lookup-renamed' },",
    expect: 'no longer labels a read `discount-delete-code-lookup`',
  },
  {
    name: 'the create lookup stops answering a failure with the could-not-read sentence',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: "    console.error('[discount-codes] could not read the event, so no verdict is given about it:', eventError)" + String.fromCharCode(10) + "    return { error: COULD_NOT_READ }",
    replace: "    console.error('[discount-codes] could not read the event, so no verdict is given about it:', eventError)" + String.fromCharCode(10) + "    return { error: 'Something went wrong' }",
    expect: 'does not answer a failure with COULD_NOT_READ',
  },
  {
    /*
     * THE HELD USE. reserved_uses moves the moment a buyer applies the code and
     * current_uses only when their order confirms, so a refusal that reads one
     * of the two deletes a code out from under somebody mid-checkout.
     */
    name: 'the delete refusal goes back to counting confirmed uses only',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: '  if ((dc.current_uses ?? 0) + (dc.reserved_uses ?? 0) > 0) {',
    replace: '  if ((dc.current_uses ?? 0) > 0) {',
    expect: 'no longer refuses to delete a code whose uses are merely HELD',
  },
  {
    /*
     * CLAUSE 6, THE WHOLE-TREE ONE. A fifth copy of the picker read is exactly
     * how four bugs became four bugs in the first place.
     */
    name: 'a surface reads the city picker inline again',
    guard: `${GUARDS}/a-marketplace-block-holds.mjs`,
    file: 'src/app/(dashboard)/dashboard/gigs/page.tsx',
    find: '  const cities = await fetchPickerCities(admin)',
    replace: [
      "  const citiesResult = await admin.from('cities').select('slug, name').order('tier').order('name')",
      "  const cities = (citiesResult.data ?? []) as { slug: string; name: string }[]",
    ].join('\n'),
    expect: 'reads the cities picker inline',
  },
  {
    /*
     * THE OTHER ORIGINAL DEFECT. Zero is the TOP of the bill, so a coalesced
     * count printed a support act above the headliner.
     */
    name: 'accepting a booking guesses a position on the bill again',
    guard: `${GUARDS}/a-marketplace-block-holds.mjs`,
    file: 'src/app/actions/gigs.ts',
    find: '          billing_order: count,',
    replace: '          billing_order: count ?? 0,',
    expect: 'writes billing_order from a coalesced count',
  },

  /*
   * the-founding-invite-is-spent-once (lane B, 20 September 2026), six drills,
   * one per clause. Two of them plant the defect in its ORIGINAL form, which is
   * the only way to know the guard would have caught the thing it was written
   * for: the fourth restores the direct claim_founding_spot call that put the
   * consume and the claim in two transactions, and the fifth restores the
   * unconditional cookie delete that threw away an unspent code.
   */
  {
    name: 'the founding invite guard names a surface that is not there',
    guard: `${GUARDS}/the-founding-invite-is-spent-once.mjs`,
    file: 'scripts/guards/the-founding-invite-is-spent-once.mjs',
    find: "  'src/lib/founding/invites.ts',",
    replace: "  'src/lib/founding/invites-renamed-away.ts',",
    expect: 'would report PASS',
  },
  {
    name: 'the invites screen reads its list inline again, unbounded',
    guard: `${GUARDS}/the-founding-invite-is-spent-once.mjs`,
    file: 'src/app/(dashboard)/dashboard/invites/page.tsx',
    find: '  const invites = org.is_founding',
    replace: [
      '  const { data: unbounded } = await admin',
      "    .from('founding_invites')",
      "    .select('code, city_slug, status, invitee_email, accepted_at, created_at')",
      "    .eq('inviter_org_id', org.id)",
      '  void unbounded',
      '  const invites = org.is_founding',
    ].join('\n'),
    expect: 'reads founding_invites with no bound',
  },
  {
    name: 'the invite action goes back to discarding the error on its organisation read',
    guard: `${GUARDS}/the-founding-invite-is-spent-once.mjs`,
    file: 'src/app/(dashboard)/dashboard/invites/actions.ts',
    find: "  const org = await readOrThrow('founding-invite-issuer', () =>",
    replace: [
      '  const { data: org } = await (async () =>',
      '    await (async () =>',
    ].join('\n'),
    expect: 'destructures `data` and not `error`',
  },
  {
    /*
     * THE ORIGINAL DEFECT, RESTORED. This exact call is what put the spot claim
     * in a different transaction from the consume, so a fault on it left a
     * single-use code spent and no spot granted.
     */
    name: 'the converter claims the founding spot in its own round trip again',
    guard: `${GUARDS}/the-founding-invite-is-spent-once.mjs`,
    file: 'src/lib/founding/invites.ts',
    find: "  const { data, error } = await admin.rpc('accept_founding_invite', {",
    replace: "  const { data, error } = await admin.rpc('claim_founding_spot', {",
    expect: 'calls claim_founding_spot directly',
  },
  {
    /*
     * THE OTHER ORIGINAL DEFECT. The cookie used to be dropped on the line after
     * a call whose result nobody read, so a conversion that wrote nothing still
     * cost the organiser the only copy of their code.
     */
    name: 'the signup drops the invite cookie whether or not the code was spent',
    guard: `${GUARDS}/the-founding-invite-is-spent-once.mjs`,
    file: 'src/app/(dashboard)/dashboard/organisation/actions.ts',
    find: '      if (outcome.consumed) {',
    replace: '      if (true) {',
    expect: 'without first establishing that the code was actually consumed',
  },
  {
    name: 'the database allowance and the TypeScript allowance drift apart',
    guard: `${GUARDS}/the-founding-invite-is-spent-once.mjs`,
    file: 'supabase/migrations/20260920000050_a_founding_invite_is_spent_once.sql',
    find: '  v_allowance CONSTANT INTEGER := 5;',
    replace: '  v_allowance CONSTANT INTEGER := 6;',
    expect: 'the founding invite allowance disagrees with itself',
  },

  /*
   * a-discount-code-a-buyer-can-actually-use (lane B, 21 September 2026), nine
   * drills, at least one per clause and THREE that restore the original defect.
   *
   * The three that matter most are drills 4, 5 and 6: they put back the session
   * client, the browser-supplied user id, and the collapsed error branch, which
   * are the three shapes that were actually live. A drill that only renames a
   * symbol proves the guard runs; a drill that restores the defect proves the
   * guard would have caught the thing it was written for.
   */
  {
    name: 'the reader goes back to discarding the error on the per-user cap',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/lib/pricing/discount-validation.ts',
    find: '    const spend = (await withBuildRetry(',
    replace: [
      "    const { count } = await supabase",
      "      .from('discount_code_usages')",
      "      .select('*', { count: 'exact', head: true })",
      "      .eq('discount_code_id', dc.id)",
      "      .eq('user_id', user_id)",
      '    const spend = (await withBuildRetry(',
    ].join('\n'),
    expect: 'destructures `count` and not `error`',
  },
  {
    name: 'the reader stops labelling its code lookup, so clause 3 would judge nothing',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/lib/pricing/discount-validation.ts',
    find: "    { label: 'discount-code-lookup' },",
    replace: "    { label: 'discount-code-lookup-renamed' },",
    expect: 'no longer labels a read `discount-code-lookup`',
  },
  {
    /*
     * THE ORIGINAL DEFECT, RESTORED. `error || !dc` is the line that told a
     * buyer holding a live code off an organiser's flyer that their code was
     * invalid, because a dropped socket and an absent row were the same answer
     * to it.
     */
    name: 'the lookup collapses a failed read back into Invalid discount code',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/lib/pricing/discount-validation.ts',
    find: "    return { valid: false, discount_cents: 0, error: DISCOUNT_UNCHECKABLE }\n  }\n  if (!dc) return",
    replace: "    return { valid: false, discount_cents: 0, error: 'Invalid discount code' }\n  }\n  if (!dc) return",
    expect: 'answers a FAILED read with "Invalid discount code"',
  },
  {
    /*
     * AND THE OTHER DIRECTION, which a careless fix breaks: a code that
     * genuinely does not exist must still be called invalid, or a buyer with a
     * typo is invited to keep trying forever.
     */
    name: 'every empty answer becomes could-not-check, including a mistyped code',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/lib/pricing/discount-validation.ts',
    find: "  if (!dc) return { valid: false, discount_cents: 0, error: 'Invalid discount code' }",
    replace: '  if (!dc) return { valid: false, discount_cents: 0, error: DISCOUNT_UNCHECKABLE }',
    expect: 'no longer answers "Invalid discount code" for a successful read that found no row',
  },
  {
    /*
     * THE DEFECT THAT KILLED EVERY CODE ON THE PLATFORM. The session client
     * cannot see either discount table, so this one line turns every live code
     * into "Invalid discount code" and the per-user cap into a no-op.
     */
    name: 'the buyer-facing action hands the reader the session client again',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: '  return validateDiscountCodeWith(createAdminClient(), {',
    replace: '  return validateDiscountCodeWith(session, {',
    expect: 'does not hand validateDiscountCodeWith a service-role client',
  },
  {
    /*
     * THE OTHER LIVE DEFECT. `user_id` arrives from a CLIENT component, so it
     * is a value the browser chose, and it decides the only cap on
     * max_uses_per_user that exists anywhere.
     */
    name: 'the action believes the browser about who the buyer is',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: '    user_id: user?.id ?? null,',
    replace: '    user_id: user_id,',
    expect: 'passes its own `user_id` parameter through to the reader',
  },
  {
    name: 'the action stops reading the session user at all',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: '  const { data: { user } } = await session.auth.getUser()',
    replace: '  const user = { id: null }',
    expect: 'no longer reads the signed-in user from the session',
  },
  {
    /*
     * CLAUSE 6, THE WHOLE-TREE ONE, and it is matched by the SHAPE of the read
     * rather than by the table: the organiser's own listing reads the same
     * table by event_id on the session client and is correct.
     */
    name: 'a second buyer-shaped lookup appears outside the one reader',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/lib/organisers/event-tier-config.ts',
    find: "        .from('discount_codes')",
    replace: [
      "        .from('discount_codes')",
      "        .eq('code', 'PLANTED')",
    ].join('\n'),
    expect: 'without reaching validateDiscountCodeWith',
  },
  {
    /*
     * THE SCANNER THAT LIES. Clauses 4 and 5 both judge ONE call, so a tree
     * where that call no longer exists is a tree where both clauses judge
     * nothing and report PASS. The guard must say so rather than going quiet.
     */
    name: 'the action stops calling the reader, so clauses 4 and 5 would judge nothing',
    guard: `${GUARDS}/a-discount-code-a-buyer-can-actually-use.mjs`,
    file: 'src/app/actions/discount-codes.ts',
    find: '  return validateDiscountCodeWith(createAdminClient(), {',
    replace: '  return validateDiscountCodeSomewhereElse(createAdminClient(), {',
    expect: 'no longer calls validateDiscountCodeWith',
  },
  /*
   * the-price-ladder-survives-a-blink (lane B, 20 September 2026), six drills,
   * one per clause. Two of them plant the defect in its ORIGINAL form, which is
   * the only way to know the guard would have caught the thing it was written
   * for: the fifth restores the action ternary that made a pause destructive,
   * and the sixth removes the guard on the DELETE inside the migration.
   */
  {
    name: 'the pricing screen reads the ladder inline again, unbounded',
    guard: `${GUARDS}/the-price-ladder-survives-a-blink.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/pricing/page.tsx',
    find: '  const tiersWithRules = attachLadders(',
    replace: [
      '  const { data: rules } = await supabase',
      "    .from('dynamic_pricing_rules')",
      "    .select('id, ticket_tier_id, step_order, capacity_threshold_percent, price_cents')",
      "    .in('ticket_tier_id', tiers.map(t => t.id))",
      "    .order('step_order')",
      '  const tiersWithRules = attachLadders(',
    ].join('\n'),
    expect: 'reads dynamic_pricing_rules with no bound',
  },
  {
    name: 'the discounts screen pages its codes with no order at all',
    guard: `${GUARDS}/the-price-ladder-survives-a-blink.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/discounts/page.tsx',
    find: '  const discountCodes = await readEventDiscountCodes<DiscountCode>(supabase, eventId)',
    replace: [
      '  const { data: discountCodes, error: codesError } = await supabase',
      "    .from('discount_codes')",
      "    .select('*')",
      "    .eq('event_id', eventId)",
      '    .range(0, 999)',
      '  if (codesError) throw codesError',
    ].join('\n'),
    expect: 'with .range() and no .order()',
  },
  {
    /*
     * THE ROOM AGAIN. The stream page carried two of these when the guard was
     * first run over it, and both were real: a discarded event read drew a
     * virtual event as an in-person one, and a discarded messages read drew an
     * empty Q&A on a live room.
     */
    name: 'the stream room goes back to discarding the error on its messages',
    guard: `${GUARDS}/the-price-ladder-survives-a-blink.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/stream/page.tsx',
    find: [
      "    readOrThrow('dashboard stream room messages', () =>",
      '      admin',
      "        .from('stream_messages')",
    ].join('\n'),
    replace: [
      '    (async () => {',
      '      const { data } = await admin',
      "        .from('stream_messages')",
    ].join('\n'),
    expect: 'destructures `data` and not `error`',
  },
  {
    /*
     * CLAUSE 4, THE WHOLE-TREE ONE. A screen that hands an organiser an
     * editable copy of their own configuration has to get that copy from a read
     * that throws, wherever that screen lives.
     */
    name: 'the pricing screen renders the editor without reaching the reader',
    guard: `${GUARDS}/the-price-ladder-survives-a-blink.mjs`,
    file: 'src/app/(dashboard)/dashboard/events/[id]/pricing/page.tsx',
    find: "} from '@/lib/organisers/event-tier-config'",
    replace: "} from '@/lib/organisers/event-tier-config-renamed'",
    expect: 'does not read through src/lib/organisers/event-tier-config.ts',
  },
  {
    /*
     * THE ORIGINAL DEFECT, RESTORED. This exact ternary is what made turning
     * dynamic pricing off destroy the ladder: the database function was handed
     * an empty list and replaced the stored steps with nothing.
     */
    name: 'the action sends the steps only when the switch is on',
    guard: `${GUARDS}/the-price-ladder-survives-a-blink.mjs`,
    file: 'src/app/actions/dynamic-pricing.ts',
    find: '  const normalised = normaliseDynamicPricingSteps(steps)',
    replace: '  const normalised = enabled ? normaliseDynamicPricingSteps(steps) : []',
    expect: 'sends the price steps only when the switch is on',
  },
  {
    /*
     * THE OTHER HALF OF THE SAME DEFECT, IN SQL. Without the replace guard the
     * function deletes every rule before it knows whether it has anything to
     * put back, so a correct caller cannot save it.
     */
    name: 'the migration deletes the ladder before knowing it has a replacement',
    guard: `${GUARDS}/the-price-ladder-survives-a-blink.mjs`,
    file: 'supabase/migrations/20260920000040_a_paused_ladder_is_not_a_deleted_one.sql',
    find: [
      '  IF v_replace THEN',
      '    DELETE FROM public.dynamic_pricing_rules WHERE ticket_tier_id = p_tier_id;',
    ].join('\n'),
    replace: [
      '  DELETE FROM public.dynamic_pricing_rules WHERE ticket_tier_id = p_tier_id;',
      '  IF true THEN',
    ].join('\n'),
    expect: 'without first establishing that a replacement ladder was actually supplied',
  },
  /*
   * tinted-text-meets-contrast, CLAUSE 2 AND THE BASELINE (lane B, 21 September
   * 2026). The guard was registered and blocking from 11 September and had no
   * drill at all, which is how it spent ten days reporting PASS over
   * twenty-nine WCAG AA failures: it skipped every class string carrying an
   * opacity modifier, and a tint is written with one.
   *
   * SIX DRILLS, because six different things can break and one of them broke
   * on the first run. The matcher took the FIRST `text-` utility in a string,
   * so on `... text-xs text-error` it resolved "xs", found no such token and
   * returned silently. Only the baseline rot check caught it, by reporting that
   * two of its own entries matched nothing.
   */
  {
    name: 'a tint pair under AA on every light surface (clause 2)',
    guard: `${GUARDS}/tinted-text-meets-contrast.mjs`,
    file: 'src/app/gigs/[id]/page.tsx',
    find: 'bg-success/10 px-3 py-2 text-sm text-success-strong"',
    replace: 'bg-success/10 px-3 py-2 text-sm text-success"',
    expect: 'text-success (#0F9D58) on bg-success/10',
  },
  {
    /*
     * THE WORST PAIR ON THE PLATFORM, restored: amber on amber at 1.91:1,
     * carrying the "18+ only" age restriction on the public event page. The
     * assertion is on the composited arithmetic rather than the class names,
     * so a guard that matched the string without doing the sum cannot pass it.
     */
    name: 'the age badge, amber on amber, reported with all three composites',
    guard: `${GUARDS}/tinted-text-meets-contrast.mjs`,
    file: 'src/app/events/[slug]/page.tsx',
    find: 'bg-warning/15 px-3 py-1.5 text-xs font-semibold text-ink-900"',
    replace: 'bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning"',
    expect: 'worst of the three is 1.67:1 (over ink-100)',
  },
  {
    name: 'a solid pair under AA (clause 1, the original behaviour, still held)',
    guard: `${GUARDS}/tinted-text-meets-contrast.mjs`,
    file: 'src/components/marketplace/requests-panel.tsx',
    find: "'bg-success/15 text-ink-900' : 'bg-ink-100 text-ink-600'",
    replace: "'bg-success/15 text-ink-900' : 'bg-ink-100 text-ink-400'",
    expect: 'text-ink-400 (#6B7280) on bg-ink-100 (#EFEDE8) = 4.13:1',
  },
  {
    /*
     * THE BASELINE CANNOT ROT. An entry that matches nothing is a permission
     * for something that no longer exists, which is how an allowlist becomes
     * an unexamined list. This plants one aimed at a pair the tree does not
     * contain.
     */
    name: 'a border baseline entry that matches nothing in the tree',
    guard: `${GUARDS}/tinted-text-meets-contrast.mjs`,
    file: 'scripts/guards/tinted-text-meets-contrast.mjs',
    find: ['const BORDER_BASELINE = [', ''].join('\n'),
    replace: [
      'const BORDER_BASELINE = [',
      "  { file: 'src/app/a-file-the-drill-invented.tsx', fg: 'error', bg: 'error/10', lane: 'nobody', since: '2026-09-21', note: 'planted by the drill' },",
      '',
    ].join('\n'),
    expect: 'src/app/a-file-the-drill-invented.tsx',
  },
  {
    /*
     * THE BASELINE IS SUPPRESSING REAL FAILURES, not decorating the output.
     * Removing one entry must produce the finding it was suppressing, with the
     * arithmetic. Without this drill the five entries could name pairs that
     * were never failures and nothing would say so.
     */
    name: 'removing a border entry exposes the failure it was holding',
    guard: `${GUARDS}/tinted-text-meets-contrast.mjs`,
    file: 'scripts/guards/tinted-text-meets-contrast.mjs',
    /*
     * THE WHOLE ENTRY GOES, not one of its fields. Corrupting a field makes the
     * entry STALE, and the rot check runs before the violations and exits
     * first, so the drill went green on the wrong finding until it was read.
     */
    find: [
      '  {',
      "    file: 'src/components/payouts/refunds-list.tsx',",
      "    fg: 'error',",
      "    bg: 'error/10',",
      "    lane: 'A (refunds)',",
      "    since: '2026-09-21',",
      "    note: '4.13:1. Use text-error-strong (5.54:1), which payouts-history-table.tsx in the same directory already uses on the same tint.',",
      '  },',
      '',
    ].join('\n'),
    replace: '',
    expect: 'text-error (#DC2626) on bg-error/10',
  },
  {
    /*
     * THE LIGHT-SYSTEM-INK EXCLUSION IS LOAD BEARING. Without it the guard
     * condemns `text-white` on the navy hero's own wash and on three
     * aria-hidden tick icons, which is the false positive that gets a gate
     * switched off. Deleting the check must make the guard cry wolf.
     */
    name: 'the on-dark ink exclusion, deleted',
    guard: `${GUARDS}/tinted-text-meets-contrast.mjs`,
    file: 'scripts/guards/tinted-text-meets-contrast.mjs',
    find: ['    if (LIGHT_SURFACES.includes(fg)) {', '      skippedComposite += 1', '      continue', '    }', ''].join('\n'),
    replace: '',
    expect: 'text-white (#FFFFFF) on bg-success',
  },
  {
    /*
     * AND THE GREEN HALF OF THE SAME BOUNDARY: white ink on a tint that would
     * measure 1.13:1 against a light surface is legitimate on-dark markup and
     * the guard must stay quiet about it.
     */
    name: 'white ink on a tint is on-dark markup and stays quiet',
    guard: `${GUARDS}/tinted-text-meets-contrast.mjs`,
    file: 'src/components/marketplace/requests-panel.tsx',
    find: "'bg-success/15 text-ink-900' : 'bg-ink-100 text-ink-600'",
    replace: "'bg-error/15 text-white' : 'bg-ink-100 text-ink-600'",
    expectPass: 'every one at or above 4.55:1 outside the',
  },
  {
    /*
     * THE COMPOSITOR MARGIN IS LOAD BEARING, and it is the one number in that
     * guard not derived from a token, so it is the one most likely to be
     * deleted as an oddity. This plants the exact pair that made it necessary:
     * text-success-strong on bg-success/15 is 4.51:1 by the guard's own sRGB
     * arithmetic and 4.48:1 when Chromium paints it, measured by
     * scripts/verify/lb-tintaa-drive.mjs. Without the margin the guard passes
     * a pair the browser fails.
     */
    name: 'the pair the compositor fails and sRGB arithmetic does not',
    guard: `${GUARDS}/tinted-text-meets-contrast.mjs`,
    file: 'src/components/marketplace/requests-panel.tsx',
    find: "'bg-success/15 text-ink-900' : 'bg-ink-100 text-ink-600'",
    replace: "'bg-success/15 text-success-strong' : 'bg-ink-100 text-ink-600'",
    expect: 'worst of the three is 4.51:1 (over ink-100)',
  },

  /*
   * an-outage-is-not-a-withdrawal (lane B, 21 September 2026), eight drills.
   *
   * THE FIRST TWO PLANT THE DEFECT IN ITS ORIGINAL FORM, which is the only way
   * to know the guard would have caught the thing it was written for: drill 2
   * restores the exact decline branch that turned a blinked consent read into a
   * withdrawal of a live consent, and drill 5 restores the third city read that
   * could only ever return what it was handed or fail.
   *
   * THREE OF THE EIGHT AIM AT THE GUARD rather than at the product: a clause
   * that stops aiming (drill 4), a deletion whose justification has gone
   * (drill 6), and a fallback that could break the write it is protecting
   * (drill 7). A guard is a claim about the world and each of those is the
   * world moving under it.
   */
  {
    name: 'the send verdict stops carrying whether the ledger was read at all',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/consent/decide.ts',
    find: '  ledgerWasRead: boolean',
    replace: '  ledgerWasReadRenamed: boolean',
    expect: 'does not declare `ledgerWasRead: boolean` on the send verdict',
  },
  {
    /*
     * THE ORIGINAL DEFECT, restored exactly. Without the two lines this deletes,
     * an untouched checkbox over an unreadable ledger writes a `declined` event
     * and the ledger's latest-event rule revokes a live consent.
     */
    name: 'the checkout answer goes back to writing a decline over an unreadable ledger',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/consent/checkout-answer.ts',
    find: '    if (!live.ledgerWasRead) {',
    replace: '    if (false) {',
    expect: 'never consults `ledgerWasRead`',
  },
  {
    name: 'the resolver answers an unreadable ledger without saying so',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/consent/resolver.ts',
    find: "      reason: 'the consent ledger could not be read, so the message is refused',\n      decidingEventId: null,\n      ledgerWasRead: false,",
    replace: "      reason: 'the consent ledger could not be read, so the message is refused',\n      decidingEventId: null,",
    expect: 'answers an unreadable ledger without `ledgerWasRead: false`',
  },
  {
    /*
     * THE CLAUSE THAT STOPS AIMING. Clause 4 finds its subjects by pattern, and
     * a pattern that stops matching has no symptom: it judges nothing and prints
     * PASS. This takes one of the two known writers out of its sight.
     *
     * TWO EARLIER VERSIONS OF THIS DRILL DID NOT FIRE, and the harness caught
     * both. The first renamed the DEFINITION of recordConsentEvent in ledger.ts,
     * which leaves every call site spelling the old name. The second renamed ONE
     * of the two recordConsentEvent calls in this file, and the other one kept
     * the file matching: a single find-and-replace cannot tell two occurrences
     * from one, which is the same lesson three earlier guards on this project
     * have already been taught. This aims at `resolveSend(`, which appears here
     * exactly once (the import spells it `resolveSend }`, not `resolveSend(`).
     *
     * The clause was also weaker then: it only complained when it found ZERO
     * writers, and there are two, so no aimed single-file drill could have
     * fired it. It holds the count now.
     */
    name: 'a known consent writer drops out of clause 4’s sight',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/consent/checkout-answer.ts',
    find: '    const live = await resolveSend(admin, {',
    replace: '    const live = await resolveSendElsewhere(admin, {',
    expect: 'clause 4 found 1 file(s)',
  },
  {
    /*
     * THE RISK THE CLAUSE ACTUALLY EXISTS FOR: a THIRD place that turns a send
     * verdict into a written fact about a person. Two became two because nobody
     * was counting; this plants the third and asserts it is judged on arrival.
     */
    name: 'a third module starts writing consent events from a send verdict',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/consent/status.ts',
    find: '/** True only when a granted, non-withdrawn consent exists for this email. */',
    replace: [
      'export async function recordDeclineFromVerdict(admin: never, email: string) {',
      "  const live = await resolveSend(admin, { email, purpose: 'x', channel: 'email' })",
      "  if (live.permitted) return false",
      "  return await recordConsentEvent(admin, { email, decision: 'declined' })",
      '}',
      '',
      '/** True only when a granted, non-withdrawn consent exists for this email. */',
    ].join('\n'),
    expect: 'turns a send verdict into a written consent event and never consults `ledgerWasRead`',
  },
  {
    /*
     * THE DELETED READ, RESTORED. This is the re-validation of
     * `events.city_primary` against `cities` that the foreign key already
     * guarantees, and whose every null was an outage wearing the costume of a
     * validation.
     */
    name: 'the city door re-reads cities to validate what events just told it',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/consent/digest-city.ts',
    find: "    return event?.city_primary ? { city: event.city_primary, unresolved: false } : NO_CITY",
    replace: [
      "    if (!event?.city_primary) return NO_CITY",
      "    const { data: city } = await adminClient",
      "      .from('cities')",
      "      .select('slug')",
      "      .eq('slug', event.city_primary)",
      "      .maybeSingle()",
      "    return city?.slug ? { city: city.slug, unresolved: false } : NO_CITY",
    ].join('\n'),
    expect: 'must read exactly [cities, events]',
  },
  {
    /*
     * THE JUSTIFICATION FOR THE DELETION, REMOVED. The read above is only safe
     * to delete for as long as the foreign key exists. If it goes, the read has
     * to come back rather than the guard being relaxed.
     */
    name: 'the foreign key the deleted read rested on is dropped from the migration',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'supabase/migrations/20260507000001_city_taxonomy.sql',
    find: '  add column if not exists city_primary text references public.cities(slug) on delete set null,',
    replace: '  add column if not exists city_primary text,',
    expect: 'no longer declares `city_primary text references public.cities(slug)`',
  },
  {
    /*
     * THE FALLBACK THAT WOULD LOSE THE CONSENT IT IS PROTECTING. The city door
     * falls back to the taxonomy in code when the table cannot be read, and a
     * consent row's city is a foreign key into that table. A slug the code
     * accepts and the table does not hold would fail the write, which is worse
     * than the defect the fallback exists to fix.
     */
    name: 'a city is added to the taxonomy in code that the migration never seeds',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/cities/data.ts',
    find: '  sydney: {',
    replace: "  'not-seeded-anywhere': {\n    slug: 'sydney', name: 'X', state: 'NSW', region: 'X',\n  } as unknown as CityContent,\n  sydney: {",
    expect: "accepts 'not-seeded-anywhere'",
  },
  {
    /*
     * ONE READ BACK TO BELIEVING ONE DROPPED PACKET, which is exactly how this
     * shipped: the cookie city gave up on the first failure and filed somebody
     * who chose Geelong as having chosen nowhere.
     *
     * THE FIRST VERSION OF THIS DRILL DID NOT FIRE either, and again the harness
     * caught it. It renamed the IMPORT, which leaves both call sites spelling
     * `readOrThrow(`, and the clause only asked whether the name appeared
     * anywhere in the file. It counts them against the reads now, so half a fix
     * is no longer a pass.
     */
    name: 'one city read stops retrying and goes back to believing one dropped packet',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/consent/digest-city.ts',
    find: "      const city = await readOrThrow('the digest consent city, chosen', () =>\n        adminClient.from('cities').select('slug').eq('slug', cookieCity).maybeSingle(),\n      )",
    replace: "      const { data: city } = await adminClient.from('cities').select('slug').eq('slug', cookieCity).maybeSingle()",
    expect: 'only 1 of them go through `readOrThrow`',
  },

  /*
   * -----------------------------------------------------------------------
   * a-blink-defers-the-message (lane C, 21 September 2026), six drills.
   *
   * TWO OF THEM PLANT THE ORIGINAL DEFECT, which is the only way to know the
   * guard would have caught the thing it was written for. Drill 2 deletes the
   * per-recipient catch, which is the state the alert cron was in when a single
   * flaky read would have abandoned every recipient behind it. Drill 5 restores
   * the exact `count ?? 0` that told an organiser nought tickets sold.
   *
   * THREE AIM AT THE GUARD rather than at the product: a counter that stops
   * being reported (drill 3), a vocabulary that goes back to stating a fact it
   * cannot know (drill 4), and the PREMISE moving underneath the whole argument
   * (drill 6). A guard is a claim about the world and each of those is the world
   * moving under it.
   *
   * The sixth is the one worth reading twice. Nothing is broken when
   * DEFAULT_PREFS becomes restrictive: the code still compiles, every test still
   * passes, and the defect simply INVERTS, from mailing somebody who refused to
   * silencing somebody who agreed. That is the kind of change that walks past a
   * review, so it is made to argue for itself.
   */
  {
    /*
     * THE GUARD REFUSES WHEN IT CAN NO LONGER SEE WHAT IT JUDGES. Clause 1 has
     * to tell a per-RECIPIENT catch from a per-RUN one, and the only thing that
     * distinguishes them is where the recipient loop starts. A restructure that
     * moves or renames that loop must stop the build rather than quietly turn
     * the clause into a pass over nothing, which is how a scanner lies.
     *
     * This drill exists because the one that used to sit here did not work. It
     * renamed the ReadFailed IMPORT to test a file-wide "does it mention
     * ReadFailed" clause, and the rename left `err instanceof ReadFailed` in the
     * catch, so the mention was still there and the guard passed. The clause was
     * deleted rather than reworded: every state it could have caught is caught
     * by the next drill, and a clause nobody can make fail is not a clause.
     */
    name: 'the recipient loop is restructured and the guard can no longer tell which catch it is looking at',
    guard: `${GUARDS}/a-blink-defers-the-message.mjs`,
    file: 'src/app/api/cron/notify-just-announced/route.ts',
    find: '      for (const userId of recipients) {',
    replace: '      for (const recipientId of [...recipients]) {\n        const userId = recipientId',
    expect: 'no longer has the recipient loop this guard locates',
  },
  {
    /*
     * THE ORIGINAL DEFECT, RESTORED. Without this catch the dispatcher's refusal
     * to guess reaches the route's outer handler, the answer is a 500, and every
     * recipient and every event left in the pass is dropped. The dispatcher
     * raising and nothing absorbing it is WORSE than the defect it replaced.
     */
    name: 'the recipient loop stops absorbing the refusal it asked for',
    guard: `${GUARDS}/a-blink-defers-the-message.mjs`,
    file: 'src/app/api/cron/notify-just-announced/route.ts',
    find: '          if (!(err instanceof ReadFailed)) throw err',
    replace: '          if (true) throw err',
    expect: 'does not catch ReadFailed',
  },
  {
    name: 'the deferred-by-a-blink count stops being reported to anybody',
    guard: `${GUARDS}/a-blink-defers-the-message.mjs`,
    file: 'src/app/api/cron/notify-just-announced/route.ts',
    find: '      blinked,\n      settled,',
    replace: '      settled,',
    expect: 'never reported in the response',
  },
  {
    /*
     * THE VOCABULARY GOING BACK. `not_found` is a statement about an order that
     * exists, written into the warning line an operator reads in the Stripe
     * webhook, and produced by a dropped socket.
     */
    name: 'a money notifier goes back to calling a failed read "not found"',
    guard: `${GUARDS}/a-blink-defers-the-message.mjs`,
    file: 'src/lib/notifications/organiser-money-notify.ts',
    find: "  | { status: 'skipped'; reason: 'no_recipient' | 'not_found' | 'send_failed' | 'read_failed' }",
    replace: "  | { status: 'skipped'; reason: 'no_recipient' | 'not_found' | 'send_failed' }",
    expect: 'does not declare a `read_failed` reason',
  },
  {
    /*
     * THE THIRD SPELLING, RESTORED EXACTLY. Neither matcher in
     * a-failed-read-is-not-a-fact-about-a-person can see this line, which is the
     * whole reason clause 3 exists, so this drill is also the proof that the
     * sibling guard would NOT have caught it.
     */
    name: 'the ticket count goes back to reading a dropped socket as nought tickets sold',
    guard: `${GUARDS}/a-blink-defers-the-message.mjs`,
    file: 'src/lib/notifications/organiser-sale-notify.ts',
    find: "  const ticketCount = countOrRead(\n    'tickets on this order',\n    await admin.from('tickets').select('id', { count: 'exact', head: true }).eq('order_id', ctx.orderId),\n  )",
    replace: "  const { count: ticketCount } = await admin\n    .from('tickets')\n    .select('id', { count: 'exact', head: true })\n    .eq('order_id', ctx.orderId)",
    expect: 'never binds `error`',
  },
  {
    /*
     * THE ORDER GOING BACK, and this is the defect exactly as it was found by
     * the adversarial pass rather than by the scan. Reading the owner's address
     * after the day has been claimed means one dropped socket spends the day and
     * the organiser never gets that digest: the next run sees the claim row and
     * calls it already sent. The claim still goes before the SEND either way, so
     * nothing about this drill is visible in behaviour until a read fails.
     */
    name: 'the digest goes back to claiming the day before it knows who to send it to',
    guard: `${GUARDS}/a-blink-defers-the-message.mjs`,
    file: 'src/lib/notifications/organiser-sales-digest.ts',
    find: "      const recipient = await resolveOrganisationOwnerEmail(admin, org.id as string)\n      if (!recipient) {\n        summary.skippedNoRecipient += 1\n        continue\n      }\n\n      const titles = await loadEventTitles(\n        admin,\n        orders.map((o) => o.event_id as string),\n      )\n\n      const gross",
    replace: "      const gross",
    expect: 'is read AFTER the day is claimed',
  },
  {
    /*
     * THE PREMISE MOVING. Nothing breaks when this flips: it compiles, the tests
     * pass, and the defect inverts from mailing somebody who refused to
     * silencing somebody who agreed.
     */
    name: 'the permissive default this whole family rests on is quietly switched off',
    guard: `${GUARDS}/a-blink-defers-the-message.mjs`,
    file: 'src/lib/notifications/policy.ts',
    find: '  push_enabled: true,\n  email_enabled: true,',
    replace: '  push_enabled: true,\n  email_enabled: false,',
    expect: 'DEFAULT_PREFS.email_enabled is no longer `true`',
  },
  {
    /*
     * CLAUSE 8, THE SENTENCE. The page that exists so somebody can see and change
     * their own marketing state printed "Right now, EventLinqs sends you no
     * marketing" on a read that had failed. This restores the inline spelling.
     */
    name: 'the preferences page builds its own marketing-state sentence again',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/app/marketing/preferences/[token]/page.tsx',
    find: '              {marketingStateSentence(verdict)}',
    replace: [
      '              {verdict?.permitted',
      "                ? 'Right now, EventLinqs can send you marketing about events near you.'",
      '                : `Right now, EventLinqs sends you no marketing: ${verdict?.reason}.`}',
    ].join('\n'),
    expect: 'spells the marketing-state sentence inline again',
  },
  {
    /*
     * AND THE BRANCH INSIDE IT. Keeping the sentence in one place is worth
     * nothing if the one place stops telling an outage apart from an answer.
     */
    name: 'the one sentence stops telling an outage from an answer',
    guard: `${GUARDS}/an-outage-is-not-a-withdrawal.mjs`,
    file: 'src/lib/consent/sentences.ts',
    find: '  if (!verdict.ledgerWasRead) {',
    replace: '  if (false) {',
    expect: 'without branching on `ledgerWasRead`',
  },

  /*
   * an-unsubscribe-link-never-500s. Six drills.
   *
   * The first is the defect itself, restored exactly: the route sweep in the
   * push gate refused 348 commits with
   * `/unsubscribe/zzzzzzzzzzzz: server error 500`, because unsubscribe_token is
   * a uuid column and a mangled link is `22P02 invalid input syntax for type
   * uuid` rather than a row that is not there.
   *
   * The third drill is the one that matters most for a guard, and it is the
   * lesson this repository has already learned twice: EVERY occurrence, never
   * one per file. src/lib/consent/record.ts holds three separate resolvers with
   * three separate reads, and a guard that only asked whether the predicate
   * appeared SOMEWHERE in the file would pass with two of the three deleted.
   */
  {
    name: 'the organiser unsubscribe page reads a uuid column without testing the shape (the 21 September defect)',
    guard: `${GUARDS}/an-unsubscribe-link-never-500s.mjs`,
    file: 'src/app/unsubscribe/[token]/page.tsx',
    find: '  const data = isUnsubscribeToken(token)',
    replace: '  const data = (true as boolean)',
    expect: 'filters on unsubscribe_token with no isUnsubscribeToken() above it',
  },
  {
    name: 'the city waitlist unsubscribe page reads a uuid column without testing the shape',
    guard: `${GUARDS}/an-unsubscribe-link-never-500s.mjs`,
    file: 'src/app/waitlist/unsubscribe/[token]/page.tsx',
    find: '  const data = isUnsubscribeToken(token)',
    replace: '  const data = (true as boolean)',
    expect: 'filters on unsubscribe_token with no isUnsubscribeToken() above it',
  },
  {
    name: 'only the first of the three consent resolvers keeps its shape test',
    guard: `${GUARDS}/an-unsubscribe-link-never-500s.mjs`,
    file: 'src/lib/consent/record.ts',
    find: `): Promise<{ source: DigestUnsubscribeSource; alreadyWithdrawn: boolean } | null> {
  if (!isUnsubscribeToken(token)) {
    return null
  }`,
    replace: '): Promise<{ source: DigestUnsubscribeSource; alreadyWithdrawn: boolean } | null> {',
    expect: 'filters on unsubscribe_token with no isUnsubscribeToken() above it',
  },
  {
    name: 'the shape test is commented out rather than deleted',
    guard: `${GUARDS}/an-unsubscribe-link-never-500s.mjs`,
    file: 'src/lib/consent/ledger.ts',
    find: '  if (!isUnsubscribeToken(token)) {',
    replace: `  // if (!isUnsubscribeToken(token)) {
  if (false) {`,
    expect: 'filters on unsubscribe_token with no isUnsubscribeToken() above it',
  },
  {
    name: 'somebody writes the uuid shape out again in the consent module',
    guard: `${GUARDS}/an-unsubscribe-link-never-500s.mjs`,
    file: 'src/lib/consent/ledger.ts',
    find: '  if (!isUnsubscribeToken(token)) {',
    replace: '  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {',
    expect: 'the unsubscribe token shape is spelled again in',
  },
  {
    name: 'the predicate loses its anchors, so anything CONTAINING a uuid is accepted',
    guard: `${GUARDS}/an-unsubscribe-link-never-500s.mjs`,
    file: 'src/lib/consent/token.ts',
    find: '  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
    replace: '  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i',
    expect: 'no longer anchored with ^ and $',
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
