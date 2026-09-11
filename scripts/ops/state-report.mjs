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

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[state-report]'

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
    return { conclusion: 'unknown', reason: `the head of main could not be read (HTTP ${head.status})` }
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
  if (res.status !== 200 || !Array.isArray(res.body)) return []
  return res.body.map((c) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 8),
    subject: String(c.commit?.message ?? '').split('\n')[0],
    when: c.commit?.committer?.date ?? null,
  }))
}

async function collectPullRequests(token, repo, nowIso) {
  const res = await gh(token, `/repos/${repo}/pulls?state=open&per_page=100`)
  if (res.status !== 200 || !Array.isArray(res.body)) return []
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
      return { when: null, reason: `the repository activity could not be read (HTTP ${res.status})` }
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
  if (res.status !== 200 || !Array.isArray(res.body?.workflow_runs)) return []
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
  if (!res.ok) return { readyState: null, reason: `the Vercel deployment list answered ${res.status}` }
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

async function collectBusiness(env = process.env) {
  const secret = env.CRON_SECRET
  const site = env.STATE_REPORT_SITE_URL?.trim() || DEFAULT_SITE
  if (!secret) return { error: 'CRON_SECRET is not set on this runner, so the platform counts could not be read' }
  try {
    const res = await fetch(`${site}/api/ops/state`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return { error: `${site}/api/ops/state answered ${res.status}` }
    const body = await res.json()
    if (!body?.ok) return { error: `${site}/api/ops/state reported ${body?.error ?? 'a fault it did not name'}` }
    return body.counts
  } catch (err) {
    return { error: `${site}/api/ops/state could not be reached: ${err instanceof Error ? err.message : String(err)}` }
  }
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

async function collect({ nowIso, fromWatchdog, alertedBand, checkPeriodHours }) {
  const repo = repoName()
  const resolved = resolveGithubToken()
  if (!resolved.token) {
    console.error(`${TAG} FAIL: ${resolved.reason}. Nothing can be reported without it.`)
    process.exitCode = 2
    return null
  }
  console.log(`${TAG} reading ${repo} with ${resolved.source}`)
  const since = new Date(Date.parse(nowIso) - 24 * 3_600_000).toISOString()

  const [main, landed, openPullRequests, lastPush, failingBranches, production, business] = await Promise.all([
    collectMain(resolved.token, repo),
    collectLanded(resolved.token, repo, since),
    collectPullRequests(resolved.token, repo, nowIso),
    collectLastPush(resolved.token, repo),
    collectFailingBranches(resolved.token, repo, since),
    collectProduction(),
    collectBusiness(),
  ])

  const stall = judgeStall({ lastPushIso: lastPush.when, nowIso, alreadyAlertedBand: alertedBand, checkPeriodHours })

  return {
    generatedAt: nowIso,
    repo,
    main,
    production,
    landed,
    openPullRequests,
    lastPush,
    failingBranches,
    business,
    stall,
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
  if (!state) return

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

  process.exitCode = dispatch({ cls: 'daily', subject: rendered.subject, body: rendered.text, dryRun: args.dryRun, drill: args.drill })
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('state-report.mjs')) {
  main().catch((err) => {
    console.error(`${TAG} the reporter itself failed`)
    console.error(err)
    process.exit(2)
  })
}

export { collect, resolveGithubToken, repoName, parseArgs, STALL_THRESHOLD_HOURS }
