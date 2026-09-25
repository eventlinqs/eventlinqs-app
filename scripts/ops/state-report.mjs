/**
 * THE DAILY STATE EMAIL AND THE STALL ALERT. Close-out UX4.1 and UX4.2, the
 * impure half. The judging and the wording are in scripts/lib/state-report.mjs
 * and are tested without a network.
 *
 * WHAT IT READS, and every one of these was verified live against the real API
 * before it was written down, never assumed:
 *
 *   GitHub REST   the CI colour and commit at the head of main; what landed on
 *                 main in 24 hours; the open pull requests and their age; the
 *                 branches that went red in 24 hours WITH THE GUARD THEY NAMED,
 *                 read out of the failing job's own log; and the timestamp of
 *                 the last push to any ref, from /repos/{owner}/{repo}/activity.
 *   Vercel REST   the production deployment's ready state, the commit it
 *                 serves, and how long ago it went out.
 *   The platform  events live, tickets sold, paid orders and new organisers,
 *                 through GET /api/ops/state, which is authed with the
 *                 CRON_SECRET that is already a repository secret. No new
 *                 credential is minted for this, so no owner step is created.
 *
 * WHY THE GUARD NAME IS WORTH THE EXTRA REQUEST. Close-out F1.1 made
 * run-guards.mjs print `[guards] FAILED: <path>` on the way out, after two full
 * log reads across three passes were spent on a question the gate should answer
 * in one line. This is the reader that makes that line pay: a branch failure
 * becomes one line in a digest naming what caught it, instead of an email that
 * says only that something went wrong.
 *
 * Usage:
 *   node scripts/ops/state-report.mjs [--dry-run] [--stall] [--json out.json]
 *                                     [--html out.html] [--from-watchdog]
 *                                     [--now <iso>] [--alerted-band <n>]
 *                                     [--check-period-hours <n>] [--state-file <path>]
 *                                     [--drill]
 *
 * Exit codes:
 *   0  the report was produced (and sent, unless --dry-run)
 *   1  the report was produced and could not be delivered
 *   2  the report could not be produced at all
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

import { resolveVercelToken } from '../lib/vercel-login.mjs'
import { gitEnv } from '../lib/git-env.mjs'
import { declareWork } from '../lib/work-report.mjs'
import {
  judgeStall,
  guardsNamedIn,
  renderStateReport,
  renderStallAlert,
  hoursBetween,
  pickLastPush,
  nextLinkPath,
  BOOKKEEPING_REFS,
  STALL_THRESHOLD_HOURS,
} from '../lib/state-report.mjs'
import { INDEXING_STALE_AFTER_HOURS } from '../lib/indexing-check.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[state-report]'

/**
 * Where the parity check leaves its result. Imported rather than re-typed, so
 * the writer and the reader cannot disagree about the path.
 */
const PARITY_STATE_FILE = join(ROOT, '.parity', 'last-run.json')

/**
 * Where the weekly indexing check leaves its result (close-out SEO2 step 3).
 * Same handoff as the parity file above and for the same reason: that job runs
 * weekly, this report runs daily, and the two never share a process.
 */
const INDEXING_STATE_FILE = join(ROOT, '.indexing', 'last-run.json')

const DEFAULT_REPO = 'eventlinqs/eventlinqs-app'
const DEFAULT_SITE = 'https://www.eventlinqs.com.au'
const VERCEL_PROJECT = 'prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ'
const VERCEL_TEAM = 'team_yPo8T18zSl5VczJfWIIrNqly'

/** How many failing branch runs are looked at. A digest, not an archive. */
const MAX_FAILING_RUNS = 8

function parseArgs(argv) {
  const out = {
    dryRun: false,
    stall: false,
    json: null,
    html: null,
    fromWatchdog: false,
    now: null,
    alertedBand: null,
    checkPeriodHours: null,
    stateFile: null,
    drill: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => argv[(i += 1)]
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--stall') out.stall = true
    else if (arg === '--json') out.json = next()
    else if (arg === '--html') out.html = next()
    else if (arg === '--from-watchdog') out.fromWatchdog = true
    else if (arg === '--now') out.now = next()
    else if (arg === '--alerted-band') out.alertedBand = Number(next())
    else if (arg === '--check-period-hours') out.checkPeriodHours = Number(next())
    else if (arg === '--state-file') out.stateFile = next()
    else if (arg === '--drill') out.drill = true
    else return { error: `unrecognised argument ${arg}` }
  }
  return out
}

/**
 * A GitHub token, in this order and never printed: GITHUB_TOKEN from the
 * environment (Actions sets it), otherwise the login the gh CLI already holds
 * on this machine, so the same script drives from a laptop and from a runner.
 */
function resolveGithubToken(env = process.env) {
  if (typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.trim() !== '') {
    return { token: env.GITHUB_TOKEN.trim(), source: 'GITHUB_TOKEN from the environment' }
  }
  // NOT `shell: true`. Node deprecates passing args through a shell (DEP0190)
  // and the candidates below cover the three names the CLI installs under.
  for (const bin of process.platform === 'win32' ? ['gh.exe', 'gh.cmd', 'gh'] : ['gh']) {
    const r = spawnSync(bin, ['auth', 'token'], { encoding: 'utf8', timeout: 20_000 })
    if (!r.error && r.status === 0 && r.stdout.trim()) {
      return { token: r.stdout.trim(), source: 'the gh CLI login on this machine' }
    }
  }
  return { token: null, reason: 'no GITHUB_TOKEN in the environment and no usable gh CLI login' }
}

async function gh(token, path, { accept = 'application/vnd.github+json', text = false, noAuthOnRedirect = false } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'eventlinqs-state-report',
    },
    redirect: noAuthOnRedirect ? 'manual' : 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (noAuthOnRedirect && res.status >= 300 && res.status < 400) {
    // A JOB LOG IS NOT SERVED BY GITHUB. The API answers 302 to a signed blob
    // URL, and that host REFUSES a request that carries both its signature and
    // an Authorization header. `fetch` forwards headers across a redirect;
    // curl strips them, which is why the same request works by hand and
    // silently returns nothing here. Found by driving it: every failing branch
    // came back reading "no guard named in the log" while the line was plainly
    // in the log.
    const location = res.headers.get('location')
    if (!location) return { status: res.status, body: '' }
    const followed = await fetch(location, {
      headers: { 'User-Agent': 'eventlinqs-state-report' },
      signal: AbortSignal.timeout(30_000),
    })
    return { status: followed.status, body: await followed.text() }
  }
  if (text) return { status: res.status, body: await res.text() }
  const body = await res.text()
  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed, raw: body, link: res.headers.get('link') }
}

/** The repository this is reporting on, never guessed from a working directory. */
function repoName(env = process.env) {
  if (typeof env.GITHUB_REPOSITORY === 'string' && env.GITHUB_REPOSITORY.includes('/')) return env.GITHUB_REPOSITORY
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8', timeout: 20_000, env: gitEnv() })
  if (!r.error && r.status === 0) {
    const match = r.stdout.trim().match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
    if (match) return match[1]
  }
  return DEFAULT_REPO
}

async function collectMain(token, repo) {
  const head = await gh(token, `/repos/${repo}/commits/main`)
  if (head.status !== 200 || !head.body?.sha) {
    // THROWN, NOT RETURNED. A read that failed and a read that found nothing are
    // different facts, and the caller catches this one into the report's list of
    // blind spots. Returning a tidy "unknown" here is how a broken read used to
    // arrive looking like a quiet day.
    throw new Error(`the head of main could not be read (HTTP ${head.status})`)
  }
  const sha = head.body.sha
  const runs = await gh(token, `/repos/${repo}/actions/runs?branch=main&per_page=40`)
  const list = Array.isArray(runs.body?.workflow_runs) ? runs.body.workflow_runs : []
  const forHead = list.filter((r) => r.head_sha === sha && r.name === 'CI')
  if (forHead.length === 0) {
    return { conclusion: 'unknown', sha, shortSha: sha.slice(0, 8), reason: 'no CI run was found for the head of main' }
  }
  const newest = forHead[0]
  return {
    conclusion: newest.conclusion ?? newest.status ?? 'unknown',
    sha,
    shortSha: sha.slice(0, 8),
    runUrl: newest.html_url,
    when: newest.updated_at,
  }
}

async function collectLanded(token, repo, sinceIso) {
  const res = await gh(token, `/repos/${repo}/commits?sha=main&since=${encodeURIComponent(sinceIso)}&per_page=50`)
  if (res.status !== 200 || !Array.isArray(res.body)) {
    // An empty list is "nothing landed today", which is a real and common
    // answer. It must never be what a failed read looks like.
    throw new Error(`the commits on main could not be read (HTTP ${res.status})`)
  }
  return res.body.map((c) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 8),
    subject: String(c.commit?.message ?? '').split('\n')[0],
    when: c.commit?.committer?.date ?? null,
  }))
}

async function collectPullRequests(token, repo, nowIso) {
  const res = await gh(token, `/repos/${repo}/pulls?state=open&per_page=100`)
  if (res.status !== 200 || !Array.isArray(res.body)) {
    // Zero open pull requests is the goal state under the one-at-a-time rule, so
    // it is exactly the answer a failed read must never be able to imitate.
    throw new Error(`the open pull requests could not be read (HTTP ${res.status})`)
  }
  return res.body
    .map((p) => ({
      number: p.number,
      title: p.title,
      draft: Boolean(p.draft),
      openedAt: p.created_at,
      ageHours: hoursBetween(p.created_at, nowIso),
      url: p.html_url,
    }))
    .sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0))
}

/**
 * How many pages of the activity listing the last-push reader will turn before
 * it gives up and says so. Five pages of a hundred is five hundred records,
 * and on 11 September 2026 the bookkeeping pushes alone filled thirty.
 */
const LAST_PUSH_PAGES = 5

/**
 * When the build last pushed to a WORKING branch. Pushes to the bookkeeping
 * refs (scripts/lib/state-report.mjs, BOOKKEEPING_REFS) are passed over and
 * counted, and the listing is paged past them by its own cursor, because on
 * 11 September 2026 they filled the whole first page and the stall judge read a
 * 44 hour silence as "0.1 hours ago, to ops/session-log".
 */
async function collectLastPush(token, repo) {
  let path = `/repos/${repo}/activity?per_page=100`
  let bookkeepingSkipped = 0
  let records = 0
  for (let page = 1; page <= LAST_PUSH_PAGES && path; page += 1) {
    const res = await gh(token, path)
    if (res.status !== 200 || !Array.isArray(res.body)) {
      // The stall check reads this. "No push found" and "could not look" are
      // opposites there: the first is a quiet repository, the second is the one
      // alert whose whole subject is silence having no idea. Thrown, so the
      // caller records it as a blind spot and the stall judge is told.
      throw new Error(`the repository activity could not be read (HTTP ${res.status})`)
    }
    records += res.body.length
    const pick = pickLastPush(res.body)
    bookkeepingSkipped += pick.bookkeepingSkipped
    if (pick.when) return { ...pick, bookkeepingSkipped }
    path = nextLinkPath(res.link)
  }
  return {
    when: null,
    ref: null,
    actor: null,
    bookkeepingSkipped,
    reason: `no push to a working branch appears in the last ${records} activity records, and ${bookkeepingSkipped} push(es) to ${BOOKKEEPING_REFS.join(', ')} were passed over as bookkeeping`,
  }
}

/**
 * The branches that went red, WITH THE GUARD NAMED.
 *
 * The failing JOB's log is fetched, not the run's log archive: a job log comes
 * back as plain text on a 200, while a run log is a zip, and a digest is not
 * worth carrying an unzip for. Verified against run 34308099399 job
 * 102328905716, which named preview-deployment-state.
 */
async function collectFailingBranches(token, repo, sinceIso) {
  const res = await gh(token, `/repos/${repo}/actions/runs?status=failure&per_page=50`)
  if (res.status !== 200 || !Array.isArray(res.body?.workflow_runs)) {
    throw new Error(`the failing workflow runs could not be read (HTTP ${res.status})`)
  }
  const since = Date.parse(sinceIso)
  // ONE LINE PER BRANCH AND WORKFLOW, newest first. The same branch failing the
  // same gate four times in a day is one fact, and repeating it four times in a
  // digest is how a digest becomes something nobody reads.
  const seen = new Set()
  const runs = res.body.workflow_runs
    .filter((r) => r.head_branch && r.head_branch !== 'main')
    .filter((r) => Date.parse(r.created_at) >= since)
    .filter((r) => {
      const key = `${r.head_branch}|${r.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_FAILING_RUNS)

  const out = []
  for (const run of runs) {
    let guard = null
    const jobs = await gh(token, `/repos/${repo}/actions/runs/${run.id}/jobs?per_page=30`)
    const failed = Array.isArray(jobs.body?.jobs) ? jobs.body.jobs.filter((j) => j.conclusion === 'failure') : []
    for (const job of failed) {
      // THE ACCEPT HEADER STAYS JSON even though a plain text log comes back.
      // `Accept: text/plain` is answered 415 Unsupported Media Type by this
      // endpoint, which was found by driving it rather than by reading it: the
      // digest reported "no guard named in the log" for a run whose log plainly
      // carried the line.
      const log = await gh(token, `/repos/${repo}/actions/jobs/${job.id}/logs`, {
        text: true,
        noAuthOnRedirect: true,
      })
      if (log.status !== 200) continue
      const named = guardsNamedIn(log.body)
      if (named.length > 0) {
        guard = named.join(', ')
        break
      }
    }
    out.push({
      branch: run.head_branch,
      workflow: run.name,
      runUrl: run.html_url,
      when: run.created_at,
      guard,
    })
  }
  return out
}

async function collectProduction() {
  const resolved = resolveVercelToken()
  if (!resolved.token) return { readyState: null, reason: resolved.reason }
  const url =
    `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT}&teamId=${VERCEL_TEAM}` +
    '&target=production&limit=1'
  const res = await fetch(url, { headers: { Authorization: `Bearer ${resolved.token}` }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`the Vercel deployment list answered ${res.status}`)
  const body = await res.json()
  const deployment = Array.isArray(body.deployments) ? body.deployments[0] : null
  if (!deployment) return { readyState: null, reason: 'the Vercel project has no production deployment' }
  const created = new Date(deployment.created).toISOString()
  return {
    readyState: deployment.state ?? deployment.readyState ?? 'UNKNOWN',
    sha: deployment.meta?.githubCommitSha ?? null,
    shortSha: deployment.meta?.githubCommitSha?.slice(0, 8) ?? null,
    url: deployment.url ? `https://${deployment.url}` : null,
    when: created,
    ageHours: hoursBetween(created, new Date().toISOString()),
  }
}

/**
 * The platform's own counts: events live, tickets sold, new organisers.
 *
 * IT THROWS RATHER THAN RETURNING ITS OWN ERROR SHAPE (13 September 2026). It
 * used to hand back `{ error }`, which the renderer prints as "Not known", and
 * that was the whole of it: the failure never reached the report's list of blind
 * spots and never touched the headline, so a day when the platform could not be
 * read still led with ALL GREEN. The caller now records it beside every other
 * failed read and rebuilds the same `{ error }` shape for the renderer, so the
 * message says it twice: once at the top where it cannot be missed, and once in
 * its own section.
 */
async function collectBusiness(env = process.env) {
  const secret = env.CRON_SECRET
  const site = env.STATE_REPORT_SITE_URL?.trim() || DEFAULT_SITE
  if (!secret) throw new Error('CRON_SECRET is not set on this runner, so the platform counts could not be read')
  const res = await fetch(`${site}/api/ops/state`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`${site}/api/ops/state answered ${res.status}`)
  const body = await res.json()
  if (!body?.ok) throw new Error(`${site}/api/ops/state reported ${body?.error ?? 'a fault it did not name'}`)
  return body.counts
}

/**
 * Whether the build is MEANT to be running, stated honestly.
 *
 * `--from-watchdog` is proof by construction: the watchdog loop is what invoked
 * this process, so it is running. Anywhere else, including a scheduled run in
 * the cloud, this cannot be seen, and the alert says so in its own body rather
 * than implying a certainty it does not have.
 */
function watchdogEvidence(fromWatchdog) {
  if (fromWatchdog) {
    return { confirmed: true, evidence: 'this check was invoked by the watchdog loop itself, so the loop is alive' }
  }
  return { confirmed: false, evidence: 'this check ran on a schedule with no view of the build machine' }
}

/**
 * The readers, named and injectable.
 *
 * They are a parameter rather than a set of direct calls so that the thing this
 * module must never do again - go silent when a read fails - can be PROVEN
 * without a network: a caller hands in readers that fail and asserts a report
 * still comes out. scripts/guards/the-daily-state-cannot-go-silent.mjs does
 * exactly that, and so do the unit tests.
 */
/**
 * @typedef {{ token: string|null, repo: string, since: string, nowIso: string }} ReaderContext
 */

/*
 * THE CONTRACT IS DECLARED, NOT INFERRED, and that is deliberate.
 *
 * These readers exist so a caller can hand in ones that FAIL, which is the only
 * way to see the behaviour this module was fixed for without waiting for GitHub
 * to have a bad morning. If their type were inferred from the seven real
 * collectors, every test and guard fixture would have to reproduce each
 * collector's exact success shape field for field, and a fixture would be
 * rejected for omitting a field the assertion does not care about. The report's
 * renderer already tolerates a missing field - that is what "Not known" is for -
 * so the contract here is "an async read that answers something", stated once.
 */
/**
 * @type {Record<'main'|'landed'|'pullRequests'|'lastPush'|'failingBranches'|'production'|'business',
 *   (ctx: ReaderContext) => Promise<any>>}
 */
/**
 * THE PARITY RESULT, READ OFF DISK (close-out PARITY1 step 4).
 *
 * `scripts/ops/parity-check.mjs` runs fortnightly and writes `.parity/last-run.json`;
 * this digest runs daily. The two cannot pass a value in memory, so the file is
 * the handoff.
 *
 * IT NEVER INVENTS GOOD NEWS. A missing file means the check has never run, an
 * unreadable one means it could not be read, and both say so. A result older
 * than the fortnightly cadence is marked OVERDUE rather than quietly printed as
 * though it were today's, because the whole point of this digest is that a thing
 * which has stopped running must look different from a thing that is fine.
 */
export const PARITY_STALE_AFTER_HOURS = 15 * 24

export function readParityState(file, nowIso) {
  if (!existsSync(file)) return null
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return { error: `the parity result could not be parsed: ${error.message}` }
  }
  if (!parsed?.at || !parsed?.headline) {
    return { error: 'the parity result is missing its timestamp or its headline' }
  }
  const ageHours = hoursBetween(parsed.at, nowIso)
  return {
    headline: parsed.headline,
    site: parsed.site ?? null,
    ageHours,
    stale: ageHours > PARITY_STALE_AFTER_HOURS,
    // Every failing line, not only the worst. The close-out asks for the worst;
    // a reader deciding what to do next needs the list, and it is never long.
    failures: (parsed.results ?? [])
      .filter((r) => r.state === 'fail')
      .map((r) => ({ line: r.line, observation: r.observation, page: r.page ?? null })),
  }
}

/**
 * THE INDEXING RESULT, READ OFF DISK (close-out SEO2 step 3).
 *
 * `scripts/ops/indexing-check.mjs` runs weekly and writes `.indexing/last-run.json`;
 * this digest runs daily. Same handoff as the parity result above, same rule
 * about absence: a missing file means the check has not run on this machine, an
 * unreadable one says so, and a result older than the weekly cadence is marked
 * OVERDUE rather than printed as though it were today's. A check that has
 * stopped running must look different from a check that found nothing.
 */
export function readIndexingState(file, nowIso) {
  if (!existsSync(file)) return null
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return { error: `the indexing result could not be parsed: ${error.message}` }
  }
  if (!parsed?.at || !parsed?.headline) {
    return { error: 'the indexing result is missing its timestamp or its headline' }
  }
  const ageHours = hoursBetween(parsed.at, nowIso)
  return {
    headline: parsed.headline,
    site: parsed.site ?? null,
    ageHours,
    stale: ageHours > INDEXING_STALE_AFTER_HOURS,
    faults: parsed.faults ?? [],
    searchConsole: parsed.searchConsole ?? null,
  }
}

const DEFAULT_READERS = {
  main: ({ token, repo }) => collectMain(token, repo),
  landed: ({ token, repo, since }) => collectLanded(token, repo, since),
  pullRequests: ({ token, repo, nowIso }) => collectPullRequests(token, repo, nowIso),
  lastPush: ({ token, repo }) => collectLastPush(token, repo),
  failingBranches: ({ token, repo, since }) => collectFailingBranches(token, repo, since),
  production: () => collectProduction(),
  business: () => collectBusiness(),
}

/**
 * Everything the report is made of, and NEVER a null.
 *
 * THE DEFECT THIS SHAPE EXISTS TO CLOSE, 13 September 2026. This function used
 * to give up in two ways, and both produced the one outcome UX4.1 forbids: no
 * message at all. With no GitHub token it printed a line and returned null, and
 * `main` returned without sending. With any collector throwing - a timeout, a
 * 5xx, a parse - the top-level catch exited 2, again with nothing sent. So a
 * reporter that was itself broken produced exactly the signal the owner has been
 * told means the build machine is dead: silence.
 *
 * Now every read is wrapped. A failure becomes a NAMED BLIND SPOT on the report
 * rather than the end of it, the report is always composed, and the caller
 * always sends it. What could not be read leads the message and the headline can
 * no longer say ALL GREEN about a day nobody could see.
 */
/**
 * The injectable reads, declared rather than inferred.
 *
 * WHY IT IS WRITTEN DOWN. Without this, `readers`'s type was whatever
 * TypeScript happened to infer from DEFAULT_READERS, which made the EXACT
 * return shape of every real collector part of the contract a test stub had to
 * satisfy. `tests/unit/ops/state-report-collect.test.ts` injects stubs that
 * return the subset each assertion needs, which is the correct thing for a stub
 * to do, and adding thirty unrelated lines to this file was enough to change
 * the inference and turn all of them red.
 *
 * A stub's job is to answer the question under test. The shape it answers with
 * belongs to the assertions, not to the parameter, so the parameter says so.
 *
 * @typedef {Record<string, (ctx?: any) => Promise<any>>} StateReaders
 */

/** @param {{ nowIso: string, fromWatchdog?: boolean, alertedBand?: number|null, checkPeriodHours?: number, readers?: StateReaders, env?: Record<string, string|undefined>, resolveToken?: Function }} options */
async function collect({
  nowIso,
  fromWatchdog,
  alertedBand,
  checkPeriodHours,
  readers = DEFAULT_READERS,
  env = process.env,
  // Injectable for the same reason the readers are: the no-token path is one
  // of the two ways this function used to end the report, and proving it now
  // produces a message must not depend on whether the machine running the
  // proof happens to have a gh CLI login.
  resolveToken = resolveGithubToken,
}) {
  const repo = repoName(env)
  const resolved = resolveToken(env)
  const since = new Date(Date.parse(nowIso) - 24 * 3_600_000).toISOString()
  const unreadable = []

  /** Run one read. A failure is recorded and answered with a stated fallback. */
  const safely = async (what, read, fallback) => {
    if (!resolved.token && what !== 'production' && what !== 'the platform counts') {
      unreadable.push({ what, why: resolved.reason })
      return fallback(resolved.reason)
    }
    try {
      return await read({ token: resolved.token, repo, since, nowIso })
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      unreadable.push({ what, why })
      return fallback(why)
    }
  }

  console.log(
    resolved.token
      ? `${TAG} reading ${repo} with ${resolved.source}`
      : `${TAG} ${resolved.reason}: the GitHub half of this report cannot be read, and the report will say so`,
  )

  const [main, landed, openPullRequests, lastPush, failingBranches, production, business] = await Promise.all([
    safely('main', readers.main, (why) => ({ conclusion: 'unknown', reason: why })),
    safely('what landed in 24 hours', readers.landed, () => []),
    safely('the open pull requests', readers.pullRequests, () => []),
    safely('the last push', readers.lastPush, (why) => ({ when: null, unreadable: why, reason: why })),
    safely('the branches that went red', readers.failingBranches, () => []),
    safely('production', readers.production, (why) => ({ readyState: null, reason: why })),
    safely('the platform counts', readers.business, (why) => ({ error: why })),
  ])

  const stall = judgeStall({
    lastPushIso: lastPush?.when ?? null,
    nowIso,
    alreadyAlertedBand: alertedBand,
    checkPeriodHours,
    unreadable: lastPush?.unreadable ?? null,
  })

  /*
   * The parity read is NOT in the `safely` group above: it touches no network
   * and cannot hang, and `readParityState` already answers with a stated reason
   * rather than throwing. Wrapping it would add a blind-spot line for a file
   * read that has no way to be slow.
   */
  const parity = readParityState(PARITY_STATE_FILE, nowIso)
  /* Same shape, same reasoning, same absence rule. See readIndexingState. */
  const indexing = readIndexingState(INDEXING_STATE_FILE, nowIso)

  return {
    generatedAt: nowIso,
    repo,
    main,
    parity,
    indexing,
    production,
    landed,
    openPullRequests,
    lastPush,
    failingBranches,
    business,
    stall,
    unreadable,
    watchdog: watchdogEvidence(fromWatchdog),
  }
}

/** Hand the composed message to the one dispatcher, never to a second one. */
function dispatch({ cls, subject, body, dryRun, drill }) {
  // THE TEMP DIRECTORY, not the repository. A body file written beside the
  // source is a file somebody eventually commits, and the first run of this
  // script duly staged two of them.
  const bodyFile = join(tmpdir(), `eventlinqs-state-report-${cls}.txt`)
  writeFileSync(bodyFile, body, 'utf8')
  const args = [
    join(ROOT, 'scripts', 'ops', 'alert-dispatch.mjs'),
    '--class',
    cls,
    '--subject',
    subject,
    '--body-file',
    bodyFile,
  ]
  // H2.6. A HAND RUN OF AN ALERT IS A DRILL, and it says so, because an alert
  // that cannot be told from a real one trains the reader to panic or to
  // ignore. There is no way to take the marker off a real one.
  if (drill) args.push('--drill')
  if (dryRun) args.push('--dry-run')
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 180_000 })
  return r.status ?? 1
}

/**
 * The last band the WATCHDOG path raised. A two-line JSON file beside the
 * launcher, because that caller runs at irregular intervals and so cannot infer
 * the previous band from a check period the way the hourly cloud run can.
 */
function readAlertedBand(stateFile) {
  if (!stateFile || !existsSync(stateFile)) return null
  try {
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8'))
    return Number.isFinite(parsed?.lastAlertedBand) ? parsed.lastAlertedBand : null
  } catch (err) {
    // Named rather than swallowed: an unreadable state file means the dedupe is
    // gone, and a loud repeat is the right failure mode for an alert.
    console.log(`${TAG} could not read ${stateFile} (${err instanceof Error ? err.message : String(err)}); treating this as never having alerted`)
    return null
  }
}

function writeAlertedBand(stateFile, band, nowIso) {
  if (!stateFile) return
  mkdirSync(dirname(stateFile), { recursive: true })
  writeFileSync(stateFile, `${JSON.stringify({ lastAlertedBand: band, at: nowIso }, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.error) {
    console.error(`${TAG} ${args.error}`)
    process.exit(2)
  }
  const nowIso = args.now ?? new Date().toISOString()
  const alertedBand = args.alertedBand ?? readAlertedBand(args.stateFile)
  const state = await collect({
    nowIso,
    fromWatchdog: args.fromWatchdog,
    alertedBand,
    checkPeriodHours: args.checkPeriodHours,
  })

  const rendered = renderStateReport(state)
  if (args.json) writeFileSync(args.json, JSON.stringify(state, null, 2), 'utf8')
  if (args.html) writeFileSync(args.html, rendered.html, 'utf8')

  console.log('')
  console.log(rendered.text)

  if (args.stall) {
    // UX4.2. The stall path sends ONLY when the silence has crossed into a band
    // nothing has spoken for, so a stall that lasts a day produces four messages
    // rather than twenty four.
    console.log(`${TAG} stall: ${state.stall.reason}; ${state.stall.dedupe}`)
    if (state.stall.blind) {
      // UX4.2 again, from the other side. A stall produces silence, so a stall
      // check that goes quiet when it cannot see is indistinguishable from one
      // that looked and found everything healthy. It speaks.
      console.log(`${TAG} the stall check is BLIND and will say so rather than say nothing`)
    }
    if (!state.stall.shouldAlert) {
      console.log(`${TAG} no stall alert is due on this run.`)
      process.exitCode = 0
      return
    }
    const stallMessage = renderStallAlert(state)
    const status = dispatch({ cls: 'stall', subject: stallMessage.subject, body: stallMessage.text, dryRun: args.dryRun, drill: args.drill })
    if (!args.dryRun) writeAlertedBand(args.stateFile, state.stall.band, nowIso)
    process.exitCode = status
    return
  }

  // A count of what was actually read, so a report that collapsed to nothing
  // says so instead of arriving looking calm. `section` can never be zero, so
  // it is the honest measure that this ran at all; the rest are facts about the
  // day and are legitimately zero on a quiet one.
  declareWork('state-report', {
    did: {
      'section composed': rendered.sections.length,
      'commit landed in 24 hours': state.landed.length,
      'open pull request': state.openPullRequests.length,
    },
    found: { 'branch red in 24 hours': state.failingBranches.length },
    zeroIsFine: {
      'commit landed in 24 hours': 'a quiet day is a real answer, and reporting it is the whole point of a message that arrives anyway',
      'open pull request': 'zero open pull requests is the goal state under the one-at-a-time rule',
      'branch red in 24 hours': 'no branch went red is the goal state',
    },
    exitOnZero: false,
  })

  /*
   * THE MESSAGE GOES FIRST, AND THE RUN GOES RED AFTERWARDS.
   *
   * A partial report is a real fault in the reporter and the run list should
   * show it. What it must never do is replace the message: silence is the one
   * thing UX4.1 forbids, because the owner has been told that an absent daily
   * state means the thing that sends it has stopped. So the email is dispatched,
   * and only then does the exit code carry the fault.
   */
  const sent = dispatch({ cls: 'daily', subject: rendered.subject, body: rendered.text, dryRun: args.dryRun, drill: args.drill })
  if (state.unreadable.length > 0) {
    console.error(`${TAG} the report was sent, and ${state.unreadable.length} part(s) of it could not be read:`)
    for (const u of state.unreadable) console.error(`${TAG}   ${u.what}: ${u.why}`)
  }
  process.exitCode = sent !== 0 ? sent : state.unreadable.length > 0 ? 3 : 0
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('state-report.mjs')) {
  main().catch((err) => {
    console.error(`${TAG} the reporter itself failed`)
    console.error(err)
    process.exit(2)
  })
}

export { collect, resolveGithubToken, repoName, parseArgs, DEFAULT_READERS, STALL_THRESHOLD_HOURS }
